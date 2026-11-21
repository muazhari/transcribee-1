export interface Session {
  id: string;
  createdAt: Date;
  title: string | null;
}

export interface Transcript {
  id: string;
  sessionId: string;
  speakerId: string;
  text: string;
  isFinal: boolean;
  startTimestamp: number;
  endTimestamp: number;
  duration: number;
  translationStatus?: "original" | "translation";
  translation?: string;
  language: string;
  offsetTimestamp?: number;
}

export interface ChatPair {
  id: string;
  sessionId: string;
  question: string;
  answer: string;
  timestamp: Date;
}

export interface AudioChunk {
  id?: number;
  sessionId: string;
  startTimestamp: number; // offset from session start in ms
  data: Int16Array;
}

const DB_NAME = "TranscribeeDB";
const DB_VERSION = 1;
// Audio is stored in ~1s records; range queries look back this far.
export const MAX_AUDIO_CHUNK_MS = 2000;

class TranscribeeDB {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private savedTranscriptsBySession = new Map<string, Transcript[]>();

  private getDB(): Promise<IDBDatabase> {
    if (typeof window === "undefined") {
      return Promise.reject(new Error("Cannot access IndexedDB on server side"));
    }
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("sessions")) {
          db.createObjectStore("sessions", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("transcripts")) {
          const transcriptStore = db.createObjectStore("transcripts", { keyPath: "id" });
          transcriptStore.createIndex("sessionId", "sessionId", { unique: false });
          transcriptStore.createIndex("sessionId_startTimestamp", ["sessionId", "startTimestamp"], { unique: false });
        }
        if (!db.objectStoreNames.contains("chatPairs")) {
          const chatStore = db.createObjectStore("chatPairs", { keyPath: "id" });
          chatStore.createIndex("sessionId", "sessionId", { unique: false });
        }
        if (!db.objectStoreNames.contains("audioChunks")) {
          const audioStore = db.createObjectStore("audioChunks", { keyPath: "id", autoIncrement: true });
          audioStore.createIndex("sessionId", "sessionId", { unique: false });
          audioStore.createIndex("sessionId_startTimestamp", ["sessionId", "startTimestamp"], { unique: false });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onclose = () => {
          this.dbPromise = null;
        };
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error);
      };
      request.onblocked = () => {
        this.dbPromise = null;
        reject(new Error("IndexedDB open was blocked by another tab"));
      };
    });

    return this.dbPromise;
  }

  private req<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async getStore(name: string, mode: IDBTransactionMode = "readonly") {
    const db = await this.getDB();
    return db.transaction(name, mode).objectStore(name);
  }

  private async getByIndex<T>(storeName: string, indexName: string, query: IDBValidKey): Promise<T[]> {
    const store = await this.getStore(storeName);
    return this.req(store.index(indexName).getAll(query));
  }

  private deleteByIndex(store: IDBObjectStore, indexName: string, key: IDBValidKey) {
    const req = store.index(indexName).openCursor(IDBKeyRange.only(key));
    req.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
  }

  // --- Sessions ---
  async saveSession(session: Session): Promise<void> {
    const store = await this.getStore("sessions", "readwrite");
    await this.req(store.put(session));
  }

  async getSessions(): Promise<Session[]> {
    const store = await this.getStore("sessions");
    const list = await this.req<Session[]>(store.getAll());
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async deleteSession(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["sessions", "transcripts", "chatPairs", "audioChunks"], "readwrite");
      tx.objectStore("sessions").delete(id);
      this.deleteByIndex(tx.objectStore("transcripts"), "sessionId", id);
      this.deleteByIndex(tx.objectStore("chatPairs"), "sessionId", id);
      this.deleteByIndex(tx.objectStore("audioChunks"), "sessionId", id);
      tx.oncomplete = () => {
        this.savedTranscriptsBySession.delete(id);
        resolve();
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("Delete session transaction aborted"));
    });
  }

  // --- Transcripts ---
  async saveTranscripts(transcripts: Transcript[]): Promise<void> {
    if (transcripts.length === 0) return;
    const sessionId = transcripts[0].sessionId;
    const prev = this.savedTranscriptsBySession.get(sessionId);
    const nextIds = new Set(transcripts.map((t) => t.id));

    if (prev) {
      const prevById = new Map(prev.map((t) => [t.id, t]));
      const toPut = transcripts.filter((t) => prevById.get(t.id) !== t);
      const toDelete = prev.filter((p) => !nextIds.has(p.id)).map((p) => p.id);
      if (toPut.length === 0 && toDelete.length === 0) return;

      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("transcripts", "readwrite");
        const store = tx.objectStore("transcripts");
        for (const id of toDelete) store.delete(id);
        for (const t of toPut) store.put(t);
        tx.oncomplete = () => {
          this.savedTranscriptsBySession.set(sessionId, transcripts);
          resolve();
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("Save transcripts transaction aborted"));
      });
    }

    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("transcripts", "readwrite");
      const store = tx.objectStore("transcripts");
      const keysReq = store.index("sessionId").getAllKeys(IDBKeyRange.only(sessionId));
      keysReq.onsuccess = () => {
        for (const key of keysReq.result) {
          if (!nextIds.has(String(key))) store.delete(key);
        }
        for (const t of transcripts) store.put(t);
      };
      tx.oncomplete = () => {
        this.savedTranscriptsBySession.set(sessionId, transcripts);
        resolve();
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("Save transcripts transaction aborted"));
    });
  }

  async getTranscripts(sessionId: string): Promise<Transcript[]> {
    const list = await this.getByIndex<Transcript>("transcripts", "sessionId", sessionId);
    return list.sort((a, b) => a.startTimestamp - b.startTimestamp);
  }

  // --- Chat Pairs ---
  async saveChatPair(chatPair: ChatPair): Promise<void> {
    const store = await this.getStore("chatPairs", "readwrite");
    await this.req(store.put(chatPair));
  }

  async getChatPairs(sessionId: string): Promise<ChatPair[]> {
    const list = await this.getByIndex<ChatPair>("chatPairs", "sessionId", sessionId);
    return list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  async clearChatPairs(sessionId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("chatPairs", "readwrite");
      this.deleteByIndex(tx.objectStore("chatPairs"), "sessionId", sessionId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("Clear chat pairs transaction aborted"));
    });
  }

  // --- Audio Chunks ---
  async saveAudioChunk(chunk: AudioChunk): Promise<void> {
    const store = await this.getStore("audioChunks", "readwrite");
    await this.req(store.put(chunk));
  }

  async getSessionAudioChunks(sessionId: string): Promise<AudioChunk[]> {
    const chunks = await this.getByIndex<AudioChunk>("audioChunks", "sessionId", sessionId);
    return chunks.sort((a, b) => a.startTimestamp - b.startTimestamp);
  }

  async getLastAudioChunk(sessionId: string): Promise<AudioChunk | null> {
    const store = await this.getStore("audioChunks");
    const range = IDBKeyRange.bound([sessionId, -Infinity], [sessionId, Infinity]);
    const cursor = await this.req(
      store.index("sessionId_startTimestamp").openCursor(range, "prev"),
    );
    return cursor ? (cursor.value as AudioChunk) : null;
  }

  async getAudioChunksForRange(
    sessionId: string,
    startTimestampMs: number,
    endTimestampMs: number,
  ): Promise<AudioChunk[]> {
    const store = await this.getStore("audioChunks");
    // Look back by one max chunk length so a chunk that starts before the range but overlaps it is included.
    const range = IDBKeyRange.bound(
      [sessionId, startTimestampMs - MAX_AUDIO_CHUNK_MS],
      [sessionId, endTimestampMs],
    );
    const chunks = await this.req<AudioChunk[]>(
      store.index("sessionId_startTimestamp").getAll(range),
    );
    return chunks.filter(
      (chunk) => chunk.startTimestamp + chunk.data.length / 16 >= startTimestampMs,
    );
  }
}

export const db = new TranscribeeDB();
