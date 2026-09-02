export interface Session {
  id: string;
  createdAt: Date;
  title: string | null;
  audioBlobPath: string;
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

class TranscribeeDB {
  private dbPromise: Promise<IDBDatabase> | null = null;

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

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
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

  async getSession(id: string): Promise<Session | null> {
    const store = await this.getStore("sessions");
    return (await this.req<Session | undefined>(store.get(id))) || null;
  }

  async deleteSession(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["sessions", "transcripts", "chatPairs", "audioChunks"], "readwrite");
      tx.objectStore("sessions").delete(id);
      this.deleteByIndex(tx.objectStore("transcripts"), "sessionId", id);
      this.deleteByIndex(tx.objectStore("chatPairs"), "sessionId", id);
      this.deleteByIndex(tx.objectStore("audioChunks"), "sessionId", id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Transcripts ---
  async saveTranscript(transcript: Transcript): Promise<void> {
    const store = await this.getStore("transcripts", "readwrite");
    await this.req(store.put(transcript));
  }

  async saveTranscripts(transcripts: Transcript[]): Promise<void> {
    if (transcripts.length === 0) return;
    const sessionId = transcripts[0].sessionId;
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("transcripts", "readwrite");
      const store = tx.objectStore("transcripts");
      const req = store.index("sessionId").openCursor(IDBKeyRange.only(sessionId));
      req.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          transcripts.forEach((t) => store.put(t));
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
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

  // --- Audio Chunks ---
  async saveAudioChunk(chunk: AudioChunk): Promise<void> {
    const store = await this.getStore("audioChunks", "readwrite");
    await this.req(store.put(chunk));
  }

  async getSessionAudioChunks(sessionId: string): Promise<AudioChunk[]> {
    const chunks = await this.getByIndex<AudioChunk>("audioChunks", "sessionId", sessionId);
    return chunks.sort((a, b) => a.startTimestamp - b.startTimestamp);
  }

  async getAudioChunksForRange(
    sessionId: string,
    startTimestampMs: number,
    endTimestampMs: number,
  ): Promise<AudioChunk[]> {
    const chunks = await this.getSessionAudioChunks(sessionId);
    return chunks.filter((chunk) => {
      const chunkDurationMs = chunk.data.length / 16;
      return (
        chunk.startTimestamp <= endTimestampMs &&
        chunk.startTimestamp + chunkDurationMs >= startTimestampMs
      );
    });
  }
}

export const db = new TranscribeeDB();
