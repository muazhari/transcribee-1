/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from "@playwright/test";

test("Reload mid-recording does not leave the app stuck in recording state", async ({
  page,
}) => {
  await page.addInitScript(() => {
    // Socket that opens but never closes; audio devices are fake
    class MockWebSocket extends EventTarget {
      static OPEN = 1;
      readyState = 0;
      binaryType = "blob";
      onopen: any = null;
      onmessage: any = null;
      onerror: any = null;
      onclose: any = null;
      constructor() {
        super();
        setTimeout(() => {
          this.readyState = 1;
          this.onopen?.(new Event("open"));
        }, 50);
      }
      send() {}
      close() {
        this.readyState = 3;
      }
    }
    const track = { stop: () => {}, enabled: true };
    const stream = {
      getTracks: () => [track],
      getAudioTracks: () => [track],
      getVideoTracks: () => [track],
    };
    class MockAudioContext {
      state = "running";
      sampleRate = 16000;
      destination = {};
      audioWorklet = { addModule: async () => {} };
      createMediaStreamSource() {
        return { connect() {}, disconnect() {} };
      }
      close() {
        this.state = "closed";
        return Promise.resolve();
      }
    }
    class MockAudioWorkletNode {
      port: any = {};
      connect() {}
      disconnect() {}
    }
    (window as any).WebSocket = MockWebSocket;
    (window as any).AudioContext = MockAudioContext;
    (window as any).AudioWorkletNode = MockAudioWorkletNode;
    (navigator.mediaDevices as any).getUserMedia = async () => stream;
  });

  await page.goto("/", { waitUntil: "load" });

  // Save settings (these must survive the reload)
  await page.click('button[title="Open Settings"]');
  await page.fill('input[placeholder="Enter Soniox API Key"]', "test-key");
  await page.click('button:has-text("Save configurations")');

  await page.click('button:has-text("New Session")');
  await page.click('button:has-text("Start Recording")');
  await expect(page.locator('button:has-text("Stop Recording")')).toBeVisible();

  await page.reload({ waitUntil: "load" });

  // Not stuck: new sessions can be created again, and the saved session is listed
  await expect(page.locator('button:has-text("New Session")')).toBeEnabled();
  await expect(page.locator('button:has-text("Stop Recording")')).toHaveCount(0);
  await expect(page.locator("text=No sessions found")).toHaveCount(0);

  // Settings were kept
  await page.click('button[title="Open Settings"]');
  await expect(
    page.locator('input[placeholder="Enter Soniox API Key"]'),
  ).toHaveValue("test-key");
});
