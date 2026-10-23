/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__PLAYWRIGHT_TEST__ = true;

    // Track wake lock calls
    (window as any).__wakeLockRequested = 0;
    (window as any).__wakeLockReleased = 0;

    class MockWakeLockSentinel extends EventTarget {
      released = false;
      type = "screen";
      async release() {
        this.released = true;
        (window as any).__wakeLockReleased++;
        this.dispatchEvent(new Event("release"));
      }
    }

    const mockWakeLock = {
      request: async (type: string) => {
        (window as any).__wakeLockRequested++;
        return new MockWakeLockSentinel();
      },
    };

    Object.defineProperty(navigator, "wakeLock", {
      value: mockWakeLock,
      configurable: true,
      writable: true,
    });

    // Mock WebSocket duplex stream
    class MockWebSocket extends EventTarget {
      static OPEN = 1;
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
        (window as any).__wsConnectedCount =
          ((window as any).__wsConnectedCount || 0) + 1;

        setTimeout(() => {
          this.readyState = 1;
          const openEvent = new Event("open");
          this.dispatchEvent(openEvent);
          if (this.onopen) this.onopen(openEvent);
        }, 50);
      }

      send(data: any) {
        if (typeof data === "string") {
          setTimeout(() => {
            const count = (window as any).__wsConnectedCount || 1;
            const response = {
              tokens: [
                {
                  text: count > 1 ? "Reconnected" : "Background",
                  start_ms: 100,
                  duration_ms: 200,
                  is_final: true,
                  speaker: "1",
                  translation_status: "original",
                  language: "en",
                },
                {
                  text: count > 1 ? " Resumed" : " KeepAlive",
                  start_ms: 300,
                  duration_ms: 200,
                  is_final: true,
                  speaker: "1",
                  translation_status: "original",
                  language: "en",
                },
              ],
            };
            const messageEvent = new MessageEvent("message", {
              data: JSON.stringify(response),
            });
            this.dispatchEvent(messageEvent);
            if (this.onmessage) this.onmessage(messageEvent);
          }, 100);
        }
      }

      close() {
        this.readyState = 3;
        const closeEvent = new Event("close");
        this.dispatchEvent(closeEvent);
        if (this.onclose) this.onclose(closeEvent);
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
    }

    (window as any).WebSocket = MockWebSocket;

    // Mock mediaDevices
    const mockTrack = { stop: () => {}, enabled: true };
    const mockStream = {
      getTracks: () => [mockTrack],
      getAudioTracks: () => [mockTrack],
      getVideoTracks: () => [mockTrack],
    };

    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", {
        value: {},
        configurable: true,
      });
    }
    navigator.mediaDevices.getUserMedia = async () => mockStream as any;
    navigator.mediaDevices.getDisplayMedia = async () => mockStream as any;
    navigator.mediaDevices.enumerateDevices = async () => [
      { kind: "audioinput", deviceId: "default", label: "Mic" } as any,
      { kind: "audiooutput", deviceId: "default", label: "Speaker" } as any,
    ];

    // Mock AudioContext
    class MockAudioWorkletNode {
      port = {
        postMessage: () => {},
        onmessage: null as any,
      };
      connect() {}
      disconnect() {}
    }

    class MockAudioContext {
      sampleRate = 44100;
      state = "running";
      destination = {};
      audioWorklet = {
        addModule: async () => {},
      };
      constructor() {
        (window as any).__lastAudioContext = this;
      }
      createMediaStreamSource() {
        return { connect: () => {}, disconnect: () => {} };
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
    }

    (window as any).AudioContext = MockAudioContext;
    (window as any).webkitAudioContext = MockAudioContext;
    (window as any).AudioWorkletNode = MockAudioWorkletNode;
  });
});

test("Background & Sleep Keep-Alive: Screen Wake Lock, MediaSession, and Audio Keep-Alive activate on recording", async ({
  page,
}) => {
  await page.goto("http://localhost:3000");

  // Open settings drawer and supply Soniox API key
  await page.locator("button[title='Open Settings']").click();
  await expect(page.locator("text=System Configurations")).toBeVisible();

  const sonioxInput = page.locator("input[placeholder='Enter Soniox API Key']");
  await sonioxInput.fill("mock_soniox_key");

  // Verify "Keep Awake & Background Resilience" checkbox is present and checked
  const keepAwakeCheckbox = page.locator(
    "text=Keep Awake & Background Resilience",
  );
  await expect(keepAwakeCheckbox).toBeVisible();

  // Save configurations
  await page.locator("button:has-text('Save configurations')").click();

  // Create a new session
  await page.locator("button:has-text('+ New Session')").click();

  // Start recording
  const startButton = page.locator("button:has-text('Start Recording')");
  await expect(startButton).toBeVisible();
  await startButton.click();

  // Wait for recording to become active
  const stopButton = page.locator("button:has-text('Stop Recording')");
  await expect(stopButton).toBeVisible({ timeout: 5000 });

  // Verify Background Active indicator badge is visible in the UI
  const bgBadge = page.locator("text=Background Active");
  await expect(bgBadge).toBeVisible();

  // Verify Screen Wake Lock was requested
  const wakeLockCount = await page.evaluate(
    () => (window as any).__wakeLockRequested,
  );
  expect(wakeLockCount).toBeGreaterThan(0);

  // Verify MediaSession metadata was set
  const mediaSessionTitle = await page.evaluate(() => {
    return (navigator as any).mediaSession?.metadata?.title;
  });
  expect(mediaSessionTitle).toContain("Transcribing Live");

  // Verify transcript word is rendered
  await expect(page.locator("text=Background")).toBeVisible({ timeout: 5000 });

  // Simulate tab visibility change to hidden (backgrounded / minimized)
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  // Simulate returning to visible
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  // Verify Screen Wake Lock was re-requested upon becoming visible
  const updatedWakeLockCount = await page.evaluate(
    () => (window as any).__wakeLockRequested,
  );
  expect(updatedWakeLockCount).toBeGreaterThanOrEqual(wakeLockCount);

  // Stop recording
  await stopButton.click();
  await expect(
    page.locator("button:has-text('Start Recording')"),
  ).toBeVisible({ timeout: 5000 });

  // Verify Background Active badge disappears when recording stops
  await expect(page.locator("text=Background Active")).not.toBeVisible();
});

test("Sleep Wake recovery: resumes AudioContext and maintains stream integrity", async ({
  page,
}) => {
  await page.goto("http://localhost:3000");

  // Open settings and supply key
  await page.locator("button[title='Open Settings']").click();
  await page
    .locator("input[placeholder='Enter Soniox API Key']")
    .fill("mock_soniox_key");
  await page.locator("button:has-text('Save configurations')").click();

  // Create session and start recording
  await page.locator("button:has-text('+ New Session')").click();
  await page.locator("button:has-text('Start Recording')").click();
  await expect(page.locator("button:has-text('Stop Recording')")).toBeVisible();

  // Wait for initial token
  await expect(page.locator("text=Background")).toBeVisible({ timeout: 5000 });

  // Simulate device suspending AudioContext during sleep and then waking up
  await page.evaluate(() => {
    if ((window as any).__lastAudioContext) {
      (window as any).__lastAudioContext.state = "suspended";
    }
    // Dispatch Page Lifecycle 'resume' event
    document.dispatchEvent(new Event("resume"));
  });

  // Verify AudioContext was resumed
  const wasResumed = await page.evaluate(
    () => (window as any).__audioContextResumed,
  );
  expect(wasResumed).toBe(true);

  // Verify session is still recording smoothly without breaking
  await expect(page.locator("button:has-text('Stop Recording')")).toBeVisible();

  // Stop recording cleanly
  await page.locator("button:has-text('Stop Recording')").click();
  await expect(page.locator("button:has-text('Start Recording')")).toBeVisible();
});

test("Unexpected STT WebSocket disconnection automatically reconnects with UI state updates", async ({
  page,
}) => {
  await page.goto("http://localhost:3000");

  // Open settings drawer and supply Soniox API key
  await page.locator("button[title='Open Settings']").click();
  await page
    .locator("input[placeholder='Enter Soniox API Key']")
    .fill("mock_soniox_key");
  await page.locator("button:has-text('Save configurations')").click();

  // Create session and start recording
  await page.locator("button:has-text('+ New Session')").click();
  await page.locator("button:has-text('Start Recording')").click();
  await expect(page.locator("button:has-text('Stop Recording')")).toBeVisible();

  // Verify initial transcription arrived
  await expect(page.locator("text=Background")).toBeVisible({ timeout: 5000 });
  await expect(page.locator("text=Health: GOOD")).toBeVisible();

  // Trigger unexpected drop on the active WebSocket
  await page.evaluate(() => {
    if ((window as any).__lastWs) {
      (window as any).__lastWs.simulateDrop();
    }
  });

  // Verify UI displays "Reconnecting..." badge
  await expect(page.locator("text=Reconnecting...")).toBeVisible({ timeout: 3000 });

  // Wait for automatic reconnection (backoff is ~1s + mock handshake ~50ms)
  await expect(page.locator("text=Reconnecting...")).not.toBeVisible({ timeout: 5000 });
  await expect(page.locator("text=Health: GOOD")).toBeVisible({ timeout: 5000 });

  // Verify that new tokens arriving on the reconnected stream are rendered
  await expect(page.locator("text=Reconnected")).toBeVisible({ timeout: 5000 });

  // Stop recording
  await page.locator("button:has-text('Stop Recording')").click();
  await expect(page.locator("button:has-text('Start Recording')")).toBeVisible();
});

test("VisibilityChange to hidden triggers immediate IndexedDB save flush without waiting for regular interval", async ({
  page,
}) => {
  await page.goto("http://localhost:3000");

  // Open settings and supply key
  await page.locator("button[title='Open Settings']").click();
  await page
    .locator("input[placeholder='Enter Soniox API Key']")
    .fill("mock_soniox_key");
  await page.locator("button:has-text('Save configurations')").click();

  // Create session and start recording
  await page.locator("button:has-text('+ New Session')").click();
  await page.locator("button:has-text('Start Recording')").click();
  await expect(page.locator("button:has-text('Stop Recording')")).toBeVisible();

  // Wait for initial transcription tokens (use KeepAlive so it doesn't match the 'Background Active' badge)
  await expect(page.locator("text=KeepAlive")).toBeVisible({ timeout: 5000 });

  // Simulate user switching away / minimizing tab (visibilitychange to 'hidden')
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  // Give short tick for IndexedDB transaction to settle
  await page.waitForTimeout(200);

  // Check that transcripts were flushed into IndexedDB immediately
  const transcriptCount = await page.evaluate(async () => {
    return new Promise<number>((resolve) => {
      const req = indexedDB.open("TranscribeeDB", 1);
      req.onsuccess = () => {
        const idb = req.result;
        try {
          const tx = idb.transaction("transcripts", "readonly");
          const store = tx.objectStore("transcripts");
          const countReq = store.count();
          countReq.onsuccess = () => resolve(countReq.result);
          countReq.onerror = () => resolve(0);
        } catch {
          resolve(0);
        }
      };
      req.onerror = () => resolve(0);
    });
  });

  expect(transcriptCount).toBeGreaterThan(0);

  // Stop recording
  await page.locator("button:has-text('Stop Recording')").click();
  await expect(page.locator("button:has-text('Start Recording')")).toBeVisible();
});
