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
  aiThinkingLevel?: string;
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
  reconnectTokens?: MockToken[];
  sampleRate?: number;
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
    reconnectTokens,
    sampleRate = 16000,
    audioSamplesPerRecording = 32000, // 2.0s at 16kHz -> auto-flushes to IndexedDB
    disableDisplayMedia = false,
    displayMediaNoAudio = false,
  } = options;

  await page.addInitScript(
    ({
      seedCfg,
      autoEmit,
      tokens,
      reconnTokens,
      ctxSampleRate,
      sampleCount,
      noDisplayMedia,
      noDisplayAudio,
    }) => {
      (window as any).__sentWsConfigs = [];
      (window as any).__playedAudioBuffers = [];
      (window as any).__geminiRequests = [];
      (window as any).__userMediaCalls = 0;
      (window as any).__displayMediaCalls = 0;
      (window as any).__wakeLockRequested = 0;
      (window as any).__wakeLockReleased = 0;
      (window as any).__wsConnectedCount = 0;
      (window as any).__mockSonioxTokens = tokens;

      // Seed localStorage config once per browser context
      if (seedCfg && !window.localStorage.getItem("transcribee:config")) {
        const defaultConfig = {
          sonioxApiKey: "test-soniox-key-xyz",
          googleApiKey: "test-gemini-key-xyz",
          aiModel: "gemini-4-hydrogen",
          aiThinkingLevel: "low",
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
          "transcribee:config",
          JSON.stringify(defaultConfig),
        );
      }

      // Mock Gemini SSE endpoint so real askGeminiStream + LangChain streaming run end-to-end
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;

        if (url.includes("generativelanguage.googleapis.com")) {
          if (init?.body && typeof init.body === "string") {
            try {
              (window as any).__geminiRequests.push(JSON.parse(init.body));
            } catch {
              // ignore unparseable body
            }
          }

          const signal = init?.signal;
          const words =
            "This is a mock response from Gemini based on the transcript.".split(
              " ",
            );
          const encoder = new TextEncoder();

          const stream = new ReadableStream({
            start(controller) {
              let idx = 0;
              let timer: ReturnType<typeof setTimeout> | null = null;
              const onAbort = () => {
                if (timer) clearTimeout(timer);
                controller.error(new DOMException("Aborted", "AbortError"));
              };
              if (signal?.aborted) {
                onAbort();
                return;
              }
              signal?.addEventListener("abort", onAbort, { once: true });

              const pushNext = () => {
                if (signal?.aborted) return;
                if (idx >= words.length) {
                  signal?.removeEventListener("abort", onAbort);
                  controller.close();
                  return;
                }
                const text =
                  idx === words.length - 1 ? words[idx] : words[idx] + " ";
                // Include a thinking + text mixed chunk on the first packet to cover thinkingConfig responses
                const parts =
                  idx === 0
                    ? [
                        { thought: true, text: "Analyzing transcript..." },
                        { text },
                      ]
                    : [{ text }];
                const payload = {
                  candidates: [
                    {
                      content: { role: "model", parts },
                      ...(idx === words.length - 1
                        ? { finishReason: "STOP" }
                        : {}),
                    },
                  ],
                };
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
                );
                idx++;
                timer = setTimeout(pushNext, 45);
              };

              timer = setTimeout(pushNext, 45);
            },
          });

          return new Response(stream, {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          });
        }

        return originalFetch(input, init);
      };

      // Mock WakeLock to avoid console permission warnings
      class MockWakeLockSentinel extends EventTarget {
        released = false;
        type = "screen";
        async release() {
          this.released = true;
          (window as any).__wakeLockReleased++;
          this.dispatchEvent(new Event("release"));
        }
      }
      Object.defineProperty(navigator, "wakeLock", {
        value: {
          request: async () => {
            (window as any).__wakeLockRequested++;
            return new MockWakeLockSentinel();
          },
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
          (window as any).__wsConnectedCount++;
          setTimeout(() => {
            if (this.readyState !== 0) return;
            this.readyState = 1;
            const openEvent = new Event("open");
            this.dispatchEvent(openEvent);
            if (this.onopen) this.onopen(openEvent);
          }, 15);
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
                const count = (window as any).__wsConnectedCount || 1;
                const batch =
                  count > 1 && reconnTokens
                    ? reconnTokens
                    : (window as any).__mockSonioxTokens;
                this.pushTokens(batch);
              }, 20);
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

        simulateDrop() {
          this.readyState = 3;
          const closeEvent = new CloseEvent("close", {
            code: 1006,
            reason: "Connection dropped unexpectedly",
            wasClean: false,
          });
          this.dispatchEvent(closeEvent);
          if (this.onclose) this.onclose(closeEvent);
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
      const createMockTrack = () => ({
        stop: () => {},
        enabled: true,
        onended: null as any,
      });

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
        const track = createMockTrack();
        (window as any).__lastMicTrack = track;
        return {
          getTracks: () => [track],
          getAudioTracks: () => [track],
          getVideoTracks: () => [],
        };
      };
      if (noDisplayMedia) {
        delete (window.navigator.mediaDevices as any).getDisplayMedia;
      } else {
        (window.navigator.mediaDevices as any).getDisplayMedia = async () => {
          (window as any).__displayMediaCalls++;
          const audioTrack = createMockTrack();
          const videoTrack = createMockTrack();
          (window as any).__lastSpeakerTrack = audioTrack;
          return noDisplayAudio
            ? {
                getTracks: () => [videoTrack],
                getAudioTracks: () => [],
                getVideoTracks: () => [videoTrack],
              }
            : {
                getTracks: () => [audioTrack, videoTrack],
                getAudioTracks: () => [audioTrack],
                getVideoTracks: () => [videoTrack],
              };
        };
      }

      // Mock AudioContext & AudioWorklet
      class MockAudioContext {
        state = "running";
        sampleRate = ctxSampleRate;
        destination = {};
        audioWorklet = {
          addModule: async () => Promise.resolve(),
        };

        constructor() {
          (window as any).__lastAudioContext = this;
        }
        createMediaStreamSource() {
          return {
            connect: () => {},
            disconnect: () => {},
          };
        }
        resume() {
          this.state = "running";
          (window as any).__audioContextResumed = true;
          return Promise.resolve();
        }
        close() {
          this.state = "closed";
          return Promise.resolve();
        }
        createBuffer(channels: number, length: number, rate: number) {
          return {
            copyToChannel: () => {},
            duration: length / rate,
            length,
            sampleRate: rate,
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
        constructor() {
          (window as any).__lastWorkletNode = this;
        }
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
      reconnTokens: reconnectTokens ?? null,
      ctxSampleRate: sampleRate,
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
