import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateSrtLength,
  formatMsToSrtTime,
  generateSrtContent,
} from "../src/lib/utils/exportUtils";
import { getSessionTitle } from "../src/lib/utils/transcriptUtils";
import {
  AudioCaptureManager,
  downsampleLinear,
  ResamplerState,
} from "../src/lib/services/audioCapture";
import transcriptionReducer, {
  setSessionId,
  updateTranscripts,
} from "../src/lib/store/slices/transcriptionSlice";
import { Transcript } from "../src/lib/services/db";
import { fitToTokenLimit } from "../src/components/ChatPanel";
import { SonioxStreamClient } from "../src/lib/services/soniox";

function makeTranscript(
  id: string,
  overrides: Partial<Transcript> = {},
): Transcript {
  return {
    id,
    sessionId: "sess-1",
    speakerId: "1",
    text: "hello",
    isFinal: true,
    startTimestamp: 0,
    endTimestamp: 500,
    duration: 500,
    language: "en",
    ...overrides,
  };
}

describe("exportUtils", () => {
  test("formatMsToSrtTime rounds fractional ms and clamps negative values", () => {
    assert.equal(formatMsToSrtTime(0), "00:00:00,000");
    assert.equal(formatMsToSrtTime(1121.625), "00:00:01,122");
    assert.equal(formatMsToSrtTime(1000.4), "00:00:01,000");
    assert.equal(formatMsToSrtTime(3661999.9), "01:01:02,000");
    assert.equal(formatMsToSrtTime(-250), "00:00:00,000");
  });

  test("estimateSrtLength matches generateSrtContent length exactly", () => {
    const samples: Transcript[][] = [
      [],
      [makeTranscript("1", { text: "Hello world" })],
      [
        makeTranscript("1", {
          speakerId: "1",
          text: "Good morning",
          translation: "Selamat pagi",
          startTimestamp: 100.5,
          endTimestamp: 950.25,
        }),
        makeTranscript("2", {
          speakerId: "12",
          text: "How are you doing today?",
          startTimestamp: 1200,
          endTimestamp: 2800,
        }),
      ],
    ];
    for (const list of samples) {
      assert.equal(estimateSrtLength(list), generateSrtContent(list).length);
    }
  });
});

describe("downsampleLinear & encodeWav", () => {
  test("downsamples 44.1kHz and 48kHz smoothly across chunk boundaries", () => {
    for (const rate of [44100, 48000]) {
      const state: ResamplerState = { position: 0, lastSample: 0 };
      const totalInput = rate; // 1 full second
      const fullRamp = new Float32Array(totalInput);
      for (let i = 0; i < totalInput; i++) {
        fullRamp[i] = i / totalInput;
      }

      const chunks: Float32Array[] = [];
      for (let offset = 0; offset < totalInput; offset += 4096) {
        const slice = fullRamp.subarray(
          offset,
          Math.min(totalInput, offset + 4096),
        );
        chunks.push(downsampleLinear(slice, rate, 16000, state));
      }

      const totalOut = chunks.reduce((acc, c) => acc + c.length, 0);
      assert.ok(totalOut >= 15998 && totalOut <= 16001);

      // Output ramp must stay strictly non-decreasing across chunk seams
      let prev = -1;
      for (const chunk of chunks) {
        for (let i = 0; i < chunk.length; i++) {
          assert.ok(chunk[i] >= prev);
          prev = chunk[i];
        }
      }
    }
  });

  test("encodeWav encodes multi-chunk PCM arrays with accurate RIFF header and bytes", async () => {
    const a = new Int16Array([100, -200, 300]);
    const b = new Int16Array([400, -500]);
    const blob = AudioCaptureManager.encodeWav([a, b], 16000);
    const buf = await blob.arrayBuffer();
    const view = new DataView(buf);

    assert.equal(buf.byteLength, 44 + 10);
    assert.equal(
      String.fromCharCode(
        view.getUint8(0),
        view.getUint8(1),
        view.getUint8(2),
        view.getUint8(3),
      ),
      "RIFF",
    );
    assert.equal(view.getUint32(4, true), 46);
    assert.equal(view.getUint32(24, true), 16000);
    assert.equal(view.getUint32(40, true), 10);
    assert.deepEqual(Array.from(new Int16Array(buf, 44)), [
      100, -200, 300, 400, -500,
    ]);
  });
});

describe("transcriptionSlice archiving & segment splitting", () => {
  test("archives older finalized segments past 64 tokens without dropping text or translations", () => {
    let state = transcriptionReducer(undefined, setSessionId("sess-1"));

    // Emit 4 speakers / 72 finalized tokens (>64 threshold)
    const tokens: Transcript[] = [];
    for (let seg = 0; seg < 4; seg++) {
      for (let w = 0; w < 18; w++) {
        const start = (seg * 20 + w) * 100;
        tokens.push(
          makeTranscript(`tok-${seg}-${w}`, {
            speakerId: String((seg % 2) + 1),
            text: w === 0 ? `seg${seg}w${w}` : ` seg${seg}w${w}`,
            startTimestamp: start,
            endTimestamp: start + 90,
            duration: 90,
          }),
        );
      }
      tokens.push(
        makeTranscript(`end-${seg}`, {
          speakerId: String((seg % 2) + 1),
          text: "<end>",
          startTimestamp: 0,
          endTimestamp: 0,
          duration: 0,
        }),
      );
    }

    state = transcriptionReducer(state, updateTranscripts(tokens));

    assert.equal(state.savedTranscripts.length, 2);
    assert.equal(state.transcripts.length, 4);
    assert.ok(state.finalTranscripts.length < tokens.length);
    assert.ok(state.transcripts[0].text.includes("seg0w0"));
    assert.ok(state.transcripts[3].text.includes("seg3w17"));
  });

  test("splits long single-speaker monologues so finalTranscripts stays bounded", () => {
    let state = transcriptionReducer(undefined, setSessionId("sess-mono"));

    // 250 tokens from the same speaker without <end>, spanning 125 seconds
    for (let i = 0; i < 250; i++) {
      state = transcriptionReducer(
        state,
        updateTranscripts([
          makeTranscript(`m-${i}`, {
            sessionId: "sess-mono",
            speakerId: "1",
            text: i === 0 ? "word0" : ` word${i}`,
            startTimestamp: i * 500,
            endTimestamp: i * 500 + 400,
            duration: 400,
          }),
        ]),
      );
    }

    assert.ok(state.transcripts.length >= 4);
    assert.ok(state.savedTranscripts.length >= 2);
    assert.ok(state.finalTranscripts.length < 150);
  });

  test("drops leading whitespace-only tokens during archiving", () => {
    let state = transcriptionReducer(undefined, setSessionId("sess-ws"));
    const tokens: Transcript[] = [];
    for (let seg = 0; seg < 4; seg++) {
      tokens.push(
        makeTranscript(`ws-${seg}`, { sessionId: "sess-ws", text: "   " }),
      );
      for (let w = 0; w < 18; w++) {
        tokens.push(
          makeTranscript(`w-${seg}-${w}`, {
            sessionId: "sess-ws",
            speakerId: String((seg % 2) + 1),
            text: ` tok${seg}_${w}`,
          }),
        );
      }
      tokens.push(
        makeTranscript(`e-${seg}`, {
          sessionId: "sess-ws",
          speakerId: String((seg % 2) + 1),
          text: "<end>",
        }),
      );
    }
    state = transcriptionReducer(state, updateTranscripts(tokens));
    assert.equal(
      state.finalTranscripts.some((t) => t.id === "ws-0"),
      false,
    );
  });
});

describe("fitToTokenLimit", () => {
  test("drops oldest speaker turns first and keeps chat history starting on a user turn", () => {
    const t1 = makeTranscript("t1", { speakerId: "1", text: "A".repeat(400) });
    const t2 = makeTranscript("t2", { speakerId: "2", text: "B".repeat(120) });

    // Limit allows t2 but not t1 + t2
    const trimmedTranscripts = fitToTokenLimit([t1, t2], [], "question?", 120);
    assert.deepEqual(
      trimmedTranscripts.transcripts.map((t) => t.id),
      ["t2"],
    );

    // Limit forces trimming chatHistory partway through pair 1 -> must not start on assistant
    const history: { role: "user" | "assistant"; content: string }[] = [
      { role: "user", content: "U1 ".repeat(60) },
      { role: "assistant", content: "A1 ".repeat(60) },
      { role: "user", content: "U2" },
      { role: "assistant", content: "A2" },
    ];
    const trimmedHistory = fitToTokenLimit([], history, "next?", 95);
    assert.deepEqual(trimmedHistory.chatHistory, [
      { role: "user", content: "U2" },
      { role: "assistant", content: "A2" },
    ]);
  });
});

describe("SonioxStreamClient", () => {
  test("keeps the most recent 300 buffered chunks and does not retry on 401 errors", () => {
    const createdSockets: FakeWs[] = [];
    class FakeWs {
      static OPEN = 1;
      readyState = 0;
      binaryType = "blob";
      sent: unknown[] = [];
      onopen: (() => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onclose: ((e: unknown) => void) | null = null;
      constructor() {
        createdSockets.push(this);
      }
      send(data: unknown) {
        this.sent.push(data);
      }
      close() {
        this.readyState = 3;
      }
    }

    const prevWindow = globalThis.window;
    const prevWebSocket = globalThis.WebSocket;
    (globalThis as unknown as { window: unknown }).window = {};
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWs;

    try {
      const client = new SonioxStreamClient();
      const errors: string[] = [];
      let reconnectingCalls = 0;
      let closedCalls = 0;

      client.connect(
        {
          apiKey: "bad-key",
          model: "stt-rt-v6",
          languageHints: ["en"],
          enableEndpointDetection: true,
          enableLanguageIdentification: true,
          enableTranslation: false,
          translationMode: "two-way",
        },
        {
          onTokens: () => {},
          onError: (e) => errors.push(String(e)),
          onReconnecting: () => reconnectingCalls++,
          onClose: () => closedCalls++,
        },
      );

      // Push 305 chunks while socket is still connecting -> oldest 5 dropped, latest 300 kept
      for (let i = 0; i < 305; i++) {
        client.sendAudio(new Int16Array([i]));
      }

      const ws = createdSockets[0];
      ws.readyState = FakeWs.OPEN;
      ws.onopen?.();

      // sent[0] is config JSON, sent[1..300] are the buffered Int16Arrays (values 5..304)
      assert.equal(ws.sent.length, 301);
      assert.equal((ws.sent[1] as Int16Array)[0], 5);
      assert.equal((ws.sent[300] as Int16Array)[0], 304);

      // Server returns 401 and closes -> must NOT schedule reconnects
      ws.onmessage?.({
        data: JSON.stringify({ error_code: 401, error_message: "Unauthorized" }),
      });
      ws.onclose?.({ code: 1008 });

      assert.ok(errors.includes("401: Unauthorized"));
      assert.equal(reconnectingCalls, 0);
      assert.equal(closedCalls, 1);
    } finally {
      (globalThis as unknown as { window: unknown }).window = prevWindow;
      (globalThis as unknown as { WebSocket: unknown }).WebSocket = prevWebSocket;
    }
  });
});

describe("getSessionTitle", () => {
  test("formats named and unnamed sessions consistently", () => {
    const createdAt = new Date("2026-01-01T10:00:00.000Z");
    assert.equal(getSessionTitle({ title: "Standup", createdAt }), "Standup");
    assert.ok(getSessionTitle({ title: "", createdAt }).startsWith("Session - "));
    assert.ok(
      getSessionTitle({ title: null, createdAt }).startsWith("Session - "),
    );
  });
});
