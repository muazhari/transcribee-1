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
}

export interface QnAPair {
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
      return new Promise((_, reject) =>
        reject(new Error("Cannot access IndexedDB on server side")),
      );
    }
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("sessions")) {
          db.createObjectStore("sessions", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("transcripts")) {
          const transcriptStore = db.createObjectStore("transcripts", {
            keyPath: "id",
          });
          transcriptStore.createIndex("sessionId", "sessionId", {
            unique: false,
          });
          transcriptStore.createIndex(
            "sessionId_startTimestamp",
            ["sessionId", "startTimestamp"],
            { unique: false },
          );
        }
        if (!db.objectStoreNames.contains("qnaPairs")) {
          const qnaStore = db.createObjectStore("qnaPairs", { keyPath: "id" });
          qnaStore.createIndex("sessionId", "sessionId", { unique: false });
        }
        if (!db.objectStoreNames.contains("audioChunks")) {
          const audioStore = db.createObjectStore("audioChunks", {
            keyPath: "id",
            autoIncrement: true,
          });
          audioStore.createIndex("sessionId", "sessionId", { unique: false });
          audioStore.createIndex(
            "sessionId_startTimestamp",
            ["sessionId", "startTimestamp"],
            { unique: false },
          );
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  // --- Sessions ---
  async saveSession(session: Session): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("sessions", "readwrite");
      const store = transaction.objectStore("sessions");
      const request = store.put(session);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSessions(): Promise<Session[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("sessions", "readonly");
      const store = transaction.objectStore("sessions");
      const request = store.getAll();
      request.onsuccess = () => {
        const sorted = (request.result as Session[]).sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        resolve(sorted);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getSession(id: string): Promise<Session | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("sessions", "readonly");
      const store = transaction.objectStore("sessions");
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteSession(id: string): Promise<void> {
    const db = await this.getDB();
    // Cascade delete transcripts, qnaPairs, and audioChunks in a transaction
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        ["sessions", "transcripts", "qnaPairs", "audioChunks"],
        "readwrite",
      );

      // Delete session
      transaction.objectStore("sessions").delete(id);

      // Delete transcripts
      const transcriptStore = transaction.objectStore("transcripts");
      const transcriptIndex = transcriptStore.index("sessionId");
      const transcriptCursorRequest = transcriptIndex.openCursor(
        IDBKeyRange.only(id),
      );
      transcriptCursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>)
          .result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      // Delete QnA pairs
      const qnaStore = transaction.objectStore("qnaPairs");
      const qnaIndex = qnaStore.index("sessionId");
      const qnaCursorRequest = qnaIndex.openCursor(IDBKeyRange.only(id));
      qnaCursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>)
          .result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      // Delete audio chunks
      const audioStore = transaction.objectStore("audioChunks");
      const audioIndex = audioStore.index("sessionId");
      const audioCursorRequest = audioIndex.openCursor(IDBKeyRange.only(id));
      audioCursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>)
          .result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // --- Transcripts ---
  async saveTranscript(transcript: Transcript): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("transcripts", "readwrite");
      const store = transaction.objectStore("transcripts");
      const request = store.put(transcript);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async saveTranscripts(transcripts: Transcript[]): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("transcripts", "readwrite");
      const store = transaction.objectStore("transcripts");
      transcripts.forEach((t) => store.put(t));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getTranscripts(sessionId: string): Promise<Transcript[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("transcripts", "readonly");
      const store = transaction.objectStore("transcripts");
      const index = store.index("sessionId");
      const request = index.getAll(IDBKeyRange.only(sessionId));
      request.onsuccess = () => {
        const sorted = (request.result as Transcript[]).sort(
          (a, b) => a.startTimestamp - b.startTimestamp,
        );
        resolve(sorted);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // --- QnA Pairs ---
  async saveQnAPair(qnaPair: QnAPair): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("qnaPairs", "readwrite");
      const store = transaction.objectStore("qnaPairs");
      const request = store.put(qnaPair);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getQnAPairs(sessionId: string): Promise<QnAPair[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("qnaPairs", "readonly");
      const store = transaction.objectStore("qnaPairs");
      const index = store.index("sessionId");
      const request = index.getAll(IDBKeyRange.only(sessionId));
      request.onsuccess = () => {
        const sorted = (request.result as QnAPair[]).sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
        resolve(sorted);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // --- Audio Chunks ---
  async saveAudioChunk(chunk: AudioChunk): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("audioChunks", "readwrite");
      const store = transaction.objectStore("audioChunks");
      const request = store.put(chunk);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAudioChunksForRange(
    sessionId: string,
    startTimestampMs: number,
    endTimestampMs: number,
  ): Promise<AudioChunk[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("audioChunks", "readonly");
      const store = transaction.objectStore("audioChunks");
      const index = store.index("sessionId");
      const request = index.getAll(IDBKeyRange.only(sessionId));

      request.onsuccess = () => {
        const allChunks = request.result as AudioChunk[];
        // Filter chunks that overlap with our desired range
        const overlapping = allChunks.filter((chunk) => {
          // Assume each chunk is 256ms or similar.
          // Let's compute actual duration of this chunk.
          // Sample rate is 16000Hz (16 samples per ms).
          const chunkDurationMs = chunk.data.length / 16;
          const chunkEndTimestampMs = chunk.startTimestamp + chunkDurationMs;

          // Overlap condition
          return (
            chunk.startTimestamp <= endTimestampMs &&
            chunkEndTimestampMs >= startTimestampMs
          );
        });

        // Sort by startTimestamp
        overlapping.sort((a, b) => a.startTimestamp - b.startTimestamp);
        resolve(overlapping);
      };
      request.onerror = () => reject(request.error);
    });
  }
}

export const db = new TranscribeeDB();
