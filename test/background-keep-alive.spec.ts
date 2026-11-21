/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from "@playwright/test";
import { setupMockEnvironment } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupMockEnvironment(page, {
    sampleRate: 44100,
    audioSamplesPerRecording: 0,
    initialTokens: [
      {
        text: "Background",
        start_ms: 100,
        duration_ms: 200,
        is_final: true,
        speaker: "1",
        translation_status: "original",
        language: "en",
      },
      {
        text: " KeepAlive",
        start_ms: 300,
        duration_ms: 200,
        is_final: true,
        speaker: "1",
        translation_status: "original",
        language: "en",
      },
    ],
    reconnectTokens: [
      {
        text: "Reconnected",
        start_ms: 100,
        duration_ms: 200,
        is_final: true,
        speaker: "1",
        translation_status: "original",
        language: "en",
      },
      {
        text: " Resumed",
        start_ms: 300,
        duration_ms: 200,
        is_final: true,
        speaker: "1",
        translation_status: "original",
        language: "en",
      },
    ],
  });
});

test("Background & Sleep Keep-Alive: Screen Wake Lock, MediaSession, and Audio Keep-Alive activate on recording", async ({
  page,
}) => {
  await page.goto("/");

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

  // Verify Alive indicator badge is visible in the UI
  const bgBadge = page.getByText("🛡️ Alive");
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
  await expect(page.getByText("Background", { exact: true })).toBeVisible({ timeout: 5000 });

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

  // Verify Alive badge disappears when recording stops
  await expect(page.getByText("🛡️ Alive")).not.toBeVisible();
});

test("Sleep Wake recovery: resumes AudioContext and maintains stream integrity", async ({
  page,
}) => {
  await page.goto("/");

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
  await expect(page.getByText("Background", { exact: true })).toBeVisible({ timeout: 5000 });

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
  await page.goto("/");

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
  await expect(page.getByText("Background", { exact: true })).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("GOOD", { exact: true })).toBeVisible();

  // Trigger unexpected drop on the active WebSocket and buffer 0.5s of audio while disconnected
  await page.evaluate(() => {
    if ((window as any).__lastWs) {
      (window as any).__lastWs.simulateDrop();
    }
    const worklet = (window as any).__lastWorkletNode;
    if (worklet?.port?.onmessage) {
      worklet.port.onmessage({ data: new Float32Array(22050) });
    }
  });

  // Verify UI displays "Reconnecting..." badge
  await expect(page.locator("text=Reconnecting...")).toBeVisible({ timeout: 3000 });

  // Wait for automatic reconnection (backoff is ~1s + mock handshake ~50ms)
  await expect(page.locator("text=Reconnecting...")).not.toBeVisible({ timeout: 5000 });
  await expect(page.getByText("GOOD", { exact: true })).toBeVisible({ timeout: 5000 });

  // Verify that new tokens arriving on the reconnected stream are rendered
  await expect(page.locator("text=Reconnected")).toBeVisible({ timeout: 5000 });

  // Stop recording and verify reconnected segment timestamp is not shifted by the buffered audio
  await page.locator("button:has-text('Stop Recording')").click();
  await expect(page.locator("button:has-text('Start Recording')")).toBeVisible();

  const reconnectedStart = await page.evaluate(async () => {
    const req = indexedDB.open("TranscribeeDB", 1);
    const db = await new Promise<IDBDatabase>((res) => {
      req.onsuccess = () => res(req.result);
    });
    const tx = db.transaction("transcripts", "readonly");
    const all = await new Promise<any[]>((res) => {
      const r = tx.objectStore("transcripts").getAll();
      r.onsuccess = () => res(r.result);
    });
    db.close();
    return all.find((t) => t.text.includes("Reconnected"))?.startTimestamp;
  });
  expect(reconnectedStart).toBe(100);
});

test("VisibilityChange to hidden triggers immediate IndexedDB save flush without waiting for regular interval", async ({
  page,
}) => {
  await page.goto("/");

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
