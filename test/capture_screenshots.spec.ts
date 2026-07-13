/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

test.beforeEach(async ({ page }) => {
  page.on("console", (msg) => console.log(`PAGE LOG: [${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => console.error("PAGE ERROR:", err.message));

  // Set up mock window variables and functions
  await page.addInitScript(() => {
    (window as any).__PLAYWRIGHT_TEST__ = true;

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
        setTimeout(() => {
          this.readyState = 1;
          const openEvent = new Event("open");
          this.dispatchEvent(openEvent);
          if (this.onopen) this.onopen(openEvent);
        }, 50);
      }

      send(data: any) {
        if (typeof data === "string") {
          // It's the config message
          setTimeout(() => {
            // Push mock tokens
            const response = {
              tokens: [
                {
                  text: "Welcome",
                  start_ms: 100,
                  duration_ms: 200,
                  is_final: true,
                  speaker: "1",
                  translation_status: "original",
                  language: "en",
                },
                {
                  text: " to",
                  start_ms: 300,
                  duration_ms: 150,
                  is_final: true,
                  speaker: "1",
                  translation_status: "original",
                  language: "en",
                },
                {
                  text: " the",
                  start_ms: 450,
                  duration_ms: 100,
                  is_final: true,
                  speaker: "1",
                  translation_status: "original",
                  language: "en",
                },
                {
                  text: " live",
                  start_ms: 550,
                  duration_ms: 150,
                  is_final: true,
                  speaker: "1",
                  translation_status: "original",
                  language: "en",
                },
                {
                  text: " demonstration",
                  start_ms: 700,
                  duration_ms: 400,
                  is_final: true,
                  speaker: "1",
                  translation_status: "original",
                  language: "en",
                },
                {
                  text: " of",
                  start_ms: 1100,
                  duration_ms: 100,
                  is_final: true,
                  speaker: "1",
                  translation_status: "original",
                  language: "en",
                },
                {
                  text: " Transcribee",
                  start_ms: 1200,
                  duration_ms: 300,
                  is_final: true,
                  speaker: "1",
                  translation_status: "original",
                  language: "en",
                },
                {
                  text: " translation",
                  start_ms: 1500,
                  duration_ms: 350,
                  is_final: true,
                  speaker: "1",
                  translation_status: "original",
                  language: "en",
                },
                {
                  text: " capabilities.",
                  start_ms: 1850,
                  duration_ms: 400,
                  is_final: true,
                  speaker: "1",
                  translation_status: "original",
                  language: "en",
                },
                {
                  text: "Bienvenidos a la demostración en vivo de las capacidades de traducción de Transcribee.",
                  start_ms: 100,
                  duration_ms: 2150,
                  is_final: true,
                  speaker: "1",
                  translation_status: "translation",
                  language: "es",
                },
                {
                  text: " We",
                  start_ms: 2500,
                  duration_ms: 200,
                  is_final: false,
                  speaker: "2",
                  translation_status: "original",
                  language: "en",
                },
                {
                  text: " are",
                  start_ms: 2700,
                  duration_ms: 150,
                  is_final: false,
                  speaker: "2",
                  translation_status: "original",
                  language: "en",
                },
                {
                  text: " translating",
                  start_ms: 2850,
                  duration_ms: 300,
                  is_final: false,
                  speaker: "2",
                  translation_status: "original",
                  language: "en",
                },
                {
                  text: " real-time",
                  start_ms: 3150,
                  duration_ms: 250,
                  is_final: false,
                  speaker: "2",
                  translation_status: "original",
                  language: "en",
                },
                {
                  text: " audio.",
                  start_ms: 3400,
                  duration_ms: 200,
                  is_final: false,
                  speaker: "2",
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
          }, 150);
        }
      }

      close() {
        this.readyState = 3;
        const closeEvent = new Event("close");
        this.dispatchEvent(closeEvent);
        if (this.onclose) this.onclose(closeEvent);
      }
    }

    (window as any).WebSocket = MockWebSocket;

    // Mock getUserMedia & getDisplayMedia
    const mockTrack = {
      stop: () => {},
      enabled: true,
    };
    const mockStream = {
      getTracks: () => [mockTrack],
      getAudioTracks: () => [mockTrack],
      getVideoTracks: () => [mockTrack],
    };

    if (!window.navigator.mediaDevices) {
      Object.defineProperty(window.navigator, "mediaDevices", {
        value: {},
        writable: true,
        configurable: true,
      });
    }
    (window.navigator.mediaDevices as any).getUserMedia = async () => mockStream;
    (window.navigator.mediaDevices as any).getDisplayMedia = async () => mockStream;

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
      close() {
        this.state = "closed";
        return Promise.resolve();
      }
      createBuffer() {
        return {
          copyToChannel: () => {},
          duration: 1,
          length: 16000,
          sampleRate: 16000,
          numberOfChannels: 1,
        };
      }
      createBufferSource() {
        return {
          connect: () => {},
          start: () => {},
        };
      }
    }
    class MockAudioWorkletNode {
      port = {
        onmessage: null,
      };
      connect() {}
      disconnect() {}
    }
    (window as any).AudioContext = MockAudioContext;
    (window as any).webkitAudioContext = MockAudioContext;
    (window as any).AudioWorkletNode = MockAudioWorkletNode;
  });
});

test("Capture screenshots of Transcribee layout and flows", async ({ page }) => {
  // Ensure the target directory exists
  const screenshotDir = path.join(__dirname, "../public/screenshots");
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  // 1. Load application home page (Desktop 1280x800)
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("text=Transcribee").waitFor({ state: "visible", timeout: 30000 });

  // 2. Open Settings Drawer
  await page.click('button[title="Open Settings"]');
  await expect(page.locator("text=System Configurations")).toBeVisible();
  
  // Fill settings with visible placeholder credentials
  await page.fill('input[placeholder="Enter Soniox API Key"]', "soniox_api_key_demo_value_12345");
  await page.fill('input[placeholder="Enter Gemini API Key"]', "gemini_api_key_demo_value_67890");
  
  // Wait a moment for drawer transition
  await page.waitForTimeout(500);

  // Take Settings Drawer screenshot
  await page.screenshot({
    path: path.join(screenshotDir, "settings.png"),
  });
  console.log("Captured Settings screenshot.");

  // Save configurations
  await page.click('button:has-text("Save configurations")');
  await expect(page.locator("text=System Configurations")).not.toBeVisible();

  // 3. Create a new session
  await page.click('button:has-text("New Session")');
  await expect(page.locator('input[placeholder^="Session -"]')).toBeVisible();

  // Rename session to something professional
  const sessionInput = page.locator('input[placeholder^="Session -"]');
  await sessionInput.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("Q3 Product & Architecture Sync");
  await page.keyboard.press("Enter");

  // 4. Start recording and wait for mock tokens
  await page.click('button:has-text("Start Recording")');
  await expect(page.locator('button:has-text("Stop Recording")')).toBeVisible();

  // Wait for the mock tokens to render
  await expect(page.locator("text=Demostración").first()).toBeVisible({ timeout: 5000 });
  await expect(page.locator("span:has-text('Speaker 1')").first()).toBeVisible();
  await page.waitForTimeout(1000); // Allow text styles/layout to settle

  // Take live transcription screenshot
  await page.screenshot({
    path: path.join(screenshotDir, "transcription.png"),
  });
  console.log("Captured Live Transcription screenshot.");

  // 5. Stop Recording & Open Q&A Panel
  await page.click('button:has-text("Stop Recording")');
  await expect(page.locator('button:has-text("Start Recording")')).toBeVisible();

  // Ask Q&A question
  await page.fill('input[placeholder="Type your question..."]', "Summarize the key points of the demo so far.");
  await page.click('button:has-text("Send")');

  // Wait for mock answer to appear
  await expect(page.locator("text=This is a mock response from Gemini")).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(500);

  // Take main layout showing Q&A assistant along with transcript and session panels
  await page.screenshot({
    path: path.join(screenshotDir, "main_app.png"),
  });
  console.log("Captured Main Application Workspace screenshot.");

  // 6. Capture mobile layout
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator('button:has-text("Live Session")').first().waitFor({ state: "visible", timeout: 30000 });
  
  // Show active mobile tab "Live Session" with the content
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(screenshotDir, "mobile_view.png"),
  });
  console.log("Captured Mobile Viewport layout screenshot.");
});
