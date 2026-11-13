/* eslint-disable @typescript-eslint/no-explicit-any */
import { Page } from "@playwright/test";

export interface MockToken {
  text: string;
  start_ms?: number;
  end_ms?: number;
  duration_ms?: number;
  is_final: boolean;
  speaker: string;
  translation_status?: "original" | "translation";
  language?: string;
}

export interface MockConfigOverrides {
  sonioxApiKey?: string;
  googleApiKey?: string;
  aiModel?: string;
  transcriptionModel?: string;
  languageHints?: string[];
  enableEndpointDetection?: boolean;
  enableLanguageIdentification?: boolean;
  enableTranslation?: boolean;
  translationMode?: "one-way" | "two-way";
  audioRouting?: "mix" | "mic-only" | "speaker-only";
  translationTargetLanguage?: string;
  translationLanguageA?: string;
  translationLanguageB?: string;
  enableKeepAwake?: boolean;
}

export interface SetupMockOptions {
  seedConfig?: boolean | MockConfigOverrides;
  autoEmitTokens?: boolean;
  initialTokens?: MockToken[];
  audioSamplesPerRecording?: number;
  disableDisplayMedia?: boolean;
  displayMediaNoAudio?: boolean;
}

export const DEFAULT_MOCK_TOKENS: MockToken[] = [
  {
    text: "Hello",
    start_ms: 100,
    duration_ms: 200,
    is_final: true,
    speaker: "1",
    translation_status: "original",
    language: "en",
  },
  {
    text: " world",
    start_ms: 300,
    duration_ms: 200,
    is_final: true,
    speaker: "1",
    translation_status: "original",
    language: "en",
  },
  {
    text: "Hola mundo",
    start_ms: 100,
    duration_ms: 400,
    is_final: true,
    speaker: "1",
    translation_status: "translation",
    language: "es",
  },
];

export async function setupMockEnvironment(
  page: Page,
  options: SetupMockOptions = {},
) {
  const {
    seedConfig = false,
    autoEmitTokens = true,
    initialTokens = DEFAULT_MOCK_TOKENS,
    audioSamplesPerRecording = 32000, // 2.0s at 16kHz -> auto-flushes to IndexedDB
    disableDisplayMedia = false,
    displayMediaNoAudio = false,
  } = options;

  await page.addInitScript(
    ({
      seedCfg,
      autoEmit,
      tokens,
      sampleCount,
      noDisplayMedia,
      noDisplayAudio,
    }) => {
      (window as any).__PLAYWRIGHT_TEST__ = true;
      (window as any).__sentWsConfigs = [];
      (window as any).__playedAudioBuffers = [];
      (window as any).__userMediaCalls = 0;
      (window as any).__displayMediaCalls = 0;
      (window as any).__mockSonioxTokens = tokens;

      // Seed redux-persist config once per browser context
      if (seedCfg && !window.localStorage.getItem("persist:root")) {
        const defaultConfig = {
          sonioxApiKey: "test-soniox-key-xyz",
          googleApiKey: "test-gemini-key-xyz",
          aiModel: "gemini-4-hydrogen",
          transcriptionModel: "stt-rt-v6",
          languageHints: ["en", "id"],
          enableEndpointDetection: true,
          enableLanguageIdentification: true,
          enableTranslation: false,
          translationMode: "two-way",
          audioRouting: "mic-only",
          translationTargetLanguage: "id",
          translationLanguageA: "en",
          translationLanguageB: "id",
          enableKeepAwake: true,
          ...(typeof seedCfg === "object" ? seedCfg : {}),
        };
        window.localStorage.setItem(
          "persist:root",
          JSON.stringify({
            config: JSON.stringify(defaultConfig),
            _persist: JSON.stringify({ version: -1, rehydrated: true }),
          }),
        );
      }

      // Mock WakeLock to avoid console permission warnings
      class MockWakeLockSentinel extends EventTarget {
        released = false;
        type = "screen";
        async release() {
          this.released = true;
          this.dispatchEvent(new Event("release"));
        }
      }
      Object.defineProperty(navigator, "wakeLock", {
        value: {
          request: async () => new MockWakeLockSentinel(),
        },
        configurable: true,
        writable: true,
      });

      // Mock WebSocket duplex stream
      class MockWebSocket extends EventTarget {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;

        readyState = 0;
        binaryType = "blob";
        url = "";
        onopen: any = null;
        onmessage: any = null;
        onerror: any = null;
        onclose: any = null;

        constructor(url: string) {
          super();
          this.url = url;
          (window as any).__lastWs = this;
          setTimeout(() => {
            if (this.readyState !== 0) return;
            this.readyState = 1;
            const openEvent = new Event("open");
            this.dispatchEvent(openEvent);
            if (this.onopen) this.onopen(openEvent);
          }, 10);
        }

        send(data: any) {
          if (typeof data === "string") {
            try {
              (window as any).__sentWsConfigs.push(JSON.parse(data));
            } catch {
              // ignore non-JSON
            }
            if (autoEmit) {
              setTimeout(() => {
                if (this.readyState !== 1) return;
                this.pushTokens((window as any).__mockSonioxTokens);
              }, 15);
            }
          }
        }

        pushTokens(tokenBatch: any[]) {
          const messageEvent = new MessageEvent("message", {
            data: JSON.stringify({ tokens: tokenBatch }),
          });
          this.dispatchEvent(messageEvent);
          if (this.onmessage) this.onmessage(messageEvent);
        }

        pushError(code: number, message: string) {
          const messageEvent = new MessageEvent("message", {
            data: JSON.stringify({
              error_code: code,
              error_message: message,
            }),
          });
          this.dispatchEvent(messageEvent);
          if (this.onmessage) this.onmessage(messageEvent);
        }

        close() {
          this.readyState = 3;
          const closeEvent = new Event("close");
          this.dispatchEvent(closeEvent);
          if (this.onclose) this.onclose(closeEvent);
        }
      }

      (window as any).WebSocket = MockWebSocket;

      // Mock mediaDevices
      const mockTrack = { stop: () => {}, enabled: true };
      const mockStream = {
        getTracks: () => [mockTrack],
        getAudioTracks: () => [mockTrack],
        getVideoTracks: () => [mockTrack],
      };
      const mockNoAudioStream = {
        getTracks: () => [mockTrack],
        getAudioTracks: () => [],
        getVideoTracks: () => [mockTrack],
      };

      if (!window.navigator.mediaDevices) {
        Object.defineProperty(window.navigator, "mediaDevices", {
          value: {},
          writable: true,
          configurable: true,
        });
      }
      (window.navigator.mediaDevices as any).enumerateDevices = async () => [
        { kind: "audioinput", deviceId: "default", label: "Mock Mic" },
        { kind: "audiooutput", deviceId: "default", label: "Mock Speaker" },
      ];
      (window.navigator.mediaDevices as any).getUserMedia = async () => {
        (window as any).__userMediaCalls++;
        return mockStream;
      };
      if (noDisplayMedia) {
        delete (window.navigator.mediaDevices as any).getDisplayMedia;
      } else {
        (window.navigator.mediaDevices as any).getDisplayMedia = async () => {
          (window as any).__displayMediaCalls++;
          return noDisplayAudio ? mockNoAudioStream : mockStream;
        };
      }

      // Mock AudioContext & AudioWorklet
      class MockAudioContext {
        state = "running";
        sampleRate = 16000;
        destination = {};
        audioWorklet = {
          addModule: async () => Promise.resolve(),
        };

        createMediaStreamSource() {
          return {
            connect: () => {},
            disconnect: () => {},
          };
        }
        resume() {
          this.state = "running";
          return Promise.resolve();
        }
        close() {
          this.state = "closed";
          return Promise.resolve();
        }
        createBuffer(channels: number, length: number, sampleRate: number) {
          return {
            copyToChannel: () => {},
            duration: length / sampleRate,
            length,
            sampleRate,
            numberOfChannels: channels,
          };
        }
        createBufferSource() {
          const source: any = {
            buffer: null,
            onended: null,
            connect: () => {},
            start: () => {
              (window as any).__playedAudioBuffers.push({
                length: source.buffer?.length ?? 0,
                sampleRate: source.buffer?.sampleRate ?? 16000,
                duration: source.buffer?.duration ?? 0,
              });
              setTimeout(() => {
                if (source.onended) source.onended();
              }, 5);
            },
          };
          return source;
        }
      }

      class MockAudioWorkletNode {
        port: any = {
          _onmessage: null,
          postMessage: () => {},
          set onmessage(val: any) {
            this._onmessage = val;
            if (val && sampleCount > 0) {
              setTimeout(() => {
                if (this._onmessage) {
                  const samples = new Float32Array(sampleCount);
                  samples.fill(0.25);
                  this._onmessage({ data: samples });
                }
              }, 10);
            }
          },
          get onmessage() {
            return this._onmessage;
          },
        };
        connect() {}
        disconnect() {}
      }

      (window as any).AudioContext = MockAudioContext;
      (window as any).webkitAudioContext = MockAudioContext;
      (window as any).AudioWorkletNode = MockAudioWorkletNode;
    },
    {
      seedCfg: seedConfig,
      autoEmit: autoEmitTokens,
      tokens: initialTokens,
      sampleCount: audioSamplesPerRecording,
      noDisplayMedia: disableDisplayMedia,
      noDisplayAudio: displayMediaNoAudio,
    },
  );
}

export interface SeedDBPayload {
  sessions?: Array<{
    id: string;
    createdAt: string | Date;
    title: string | null;
    audioBlobPath?: string;
  }>;
  transcripts?: Array<{
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
  }>;
  chatPairs?: Array<{
    id: string;
    sessionId: string;
    question: string;
    answer: string;
    timestamp: string | Date;
  }>;
  audioChunks?: Array<{
    sessionId: string;
    startTimestamp: number;
    sampleLength: number;
  }>;
}

export async function seedDatabase(page: Page, payload: SeedDBPayload) {
  await page.evaluate(async (data) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("TranscribeeDB", 1);
      req.onupgradeneeded = () => {
        const res = req.result;
        if (!res.objectStoreNames.contains("sessions")) {
          res.createObjectStore("sessions", { keyPath: "id" });
        }
        if (!res.objectStoreNames.contains("transcripts")) {
          const ts = res.createObjectStore("transcripts", { keyPath: "id" });
          ts.createIndex("sessionId", "sessionId", { unique: false });
          ts.createIndex(
            "sessionId_startTimestamp",
            ["sessionId", "startTimestamp"],
            { unique: false },
          );
        }
        if (!res.objectStoreNames.contains("chatPairs")) {
          const cs = res.createObjectStore("chatPairs", { keyPath: "id" });
          cs.createIndex("sessionId", "sessionId", { unique: false });
        }
        if (!res.objectStoreNames.contains("audioChunks")) {
          const as = res.createObjectStore("audioChunks", {
            keyPath: "id",
            autoIncrement: true,
          });
          as.createIndex("sessionId", "sessionId", { unique: false });
          as.createIndex(
            "sessionId_startTimestamp",
            ["sessionId", "startTimestamp"],
            { unique: false },
          );
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        ["sessions", "transcripts", "chatPairs", "audioChunks"],
        "readwrite",
      );
      for (const s of data.sessions ?? []) {
        tx.objectStore("sessions").put({
          ...s,
          createdAt: new Date(s.createdAt),
          audioBlobPath: s.audioBlobPath ?? "",
        });
      }
      for (const t of data.transcripts ?? []) {
        tx.objectStore("transcripts").put(t);
      }
      for (const c of data.chatPairs ?? []) {
        tx.objectStore("chatPairs").put({
          ...c,
          timestamp: new Date(c.timestamp),
        });
      }
      for (const a of data.audioChunks ?? []) {
        const samples = new Int16Array(a.sampleLength);
        samples.fill(4096);
        tx.objectStore("audioChunks").put({
          sessionId: a.sessionId,
          startTimestamp: a.startTimestamp,
          data: samples,
        });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, payload);
}
