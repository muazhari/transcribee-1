/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from "@playwright/test";

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
                  text: "Hello",
                  start_ms: 100,
                  duration_ms: 200,
                  is_final: true,
                  speaker: "1",
                  translation_status: "original",
                },
                {
                  text: " world",
                  start_ms: 300,
                  duration_ms: 200,
                  is_final: true,
                  speaker: "1",
                  translation_status: "original",
                },
                {
                  text: "Hola mundo",
                  start_ms: 100,
                  duration_ms: 400,
                  is_final: true,
                  speaker: "1",
                  translation_status: "translation",
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

    // Mock AudioContext
    class MockAudioContext {
      state = "running";
      sampleRate = 16000;
      destination = {};

      createMediaStreamSource() {
        return {
          connect: () => {},
          disconnect: () => {},
        };
      }
      createScriptProcessor() {
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
    (window as any).AudioContext = MockAudioContext;
    (window as any).webkitAudioContext = MockAudioContext;
  });
});

test("Full user journey: settings input, start session, transcribe, audio scrub, QnA", async ({
  page,
}) => {
  // 1. Load application home page
  await page.goto("/", { waitUntil: "networkidle" });
  console.log("HTML CONTENT:", await page.content());
  await page.locator("text=Transcribee").waitFor({ state: "visible", timeout: 15000 });
  await expect(page).toHaveTitle(/Transcribee/);

  // 2. Open Settings and save valid credentials
  await page.click('button[title="Open Settings"]');
  await expect(page.locator("text=System Configurations")).toBeVisible();

  // Fill config fields
  await page.fill('input[placeholder="Enter Soniox API Key"]', "test-soniox-key-xyz");
  await page.fill('input[placeholder="Enter Gemini API Key"]', "test-gemini-key-xyz");
  
  // Submit settings form
  await page.click('button:has-text("Save configurations")');
  await expect(page.locator("text=System Configurations")).not.toBeVisible();

  // 3. Start a new session
  await page.click('button:has-text("New Session")');
  await expect(page.locator('input[placeholder^="Session -"]')).toBeVisible();

  // 4. Trigger transcription recording
  await page.click('button:has-text("Start Recording")');
  await expect(page.locator('button:has-text("Stop Recording")')).toBeVisible();

  // 5. Verify live transcription tokens and translation render correctly
  // Expect speaker header and transcript words to appear
  await expect(page.locator("text=Speaker 1")).toBeVisible();
  await expect(page.locator("text=Hello")).toBeVisible();
  await expect(page.locator("text=world")).toBeVisible();
  // Expect translation text to appear
  await expect(page.locator("text=Hola mundo")).toBeVisible();

  // 6. Test Token-Level Audio Playback scrubbing by clicking a word
  await page.click("text=Hello");

  // 7. Stop recording
  await page.click('button:has-text("Stop Recording")');
  await expect(page.locator('button:has-text("Start Recording")')).toBeVisible();

  // 8. Interact with Gemini QnA chatbot over the transcripts
  await page.fill('input[placeholder="Type your question..."]', "Summarize this meeting");
  await page.click('button:has-text("Send")');

  // Verify that the mock response from Gemini appears
  await expect(page.locator("text=This is a mock response from Gemini")).toBeVisible();
});

test("Mobile viewport: verify header scrollable menu and view switching", async ({
  page,
}) => {
  // Set viewport to mobile size
  await page.setViewportSize({ width: 375, height: 812 });

  // 1. Load application home page
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator('button:has-text("Live Session")').waitFor({ state: "visible", timeout: 15000 });

  // 2. Verify that the mobile header is visible and desktop panels are hidden or shown correctly
  // By default, activeTab is "transcription"
  await expect(page.locator('button:has-text("Live Session")')).toBeVisible();
  await expect(page.locator('button:has-text("Session List")')).toBeVisible();
  await expect(page.locator('button:has-text("Q&A Chatting")')).toBeVisible();

  // The Live Session content is visible by default on mobile
  await expect(page.locator("text=Ready to transcribe")).toBeVisible();

  // SessionPanel (Session list) should be hidden by default on mobile
  await expect(page.locator("text=Meeting Logs")).not.toBeVisible();

  // QnA panel should be hidden by default on mobile
  await expect(page.locator("text=AI Q&A Assistant")).not.toBeVisible();

  // 3. Switch to "Session List" tab
  await page.click('button:has-text("Session List")');
  await expect(page.locator("text=Meeting Logs")).toBeVisible();
  await expect(page.locator("text=Ready to transcribe")).not.toBeVisible();
  await expect(page.locator("text=AI Q&A Assistant")).not.toBeVisible();

  // 4. Switch to "Q&A Chatting" tab
  await page.click('button:has-text("Q&A Chatting")');
  await expect(page.locator("text=AI Q&A Assistant")).toBeVisible();
  await expect(page.locator("text=Meeting Logs")).not.toBeVisible();
  await expect(page.locator("text=Ready to transcribe")).not.toBeVisible();

  // 5. Open settings from Session List tab on mobile
  await page.click('button:has-text("Session List")');
  await page.click('button[title="Open Settings"]');
  await expect(page.locator("text=System Configurations")).toBeVisible();

  // Fill config fields
  await page.fill('input[placeholder="Enter Soniox API Key"]', "test-soniox-key-xyz");
  await page.fill('input[placeholder="Enter Gemini API Key"]', "test-gemini-key-xyz");
  await page.click('button:has-text("Save configurations")');
  await expect(page.locator("text=System Configurations")).not.toBeVisible();

  // 6. Start new session: check that it auto-switches to "Live Session" tab
  await page.click('button:has-text("New Session")');
  // It should automatically switch activeTab to "transcription"
  await expect(page.locator('input[placeholder^="Session -"]')).toBeVisible();
  await expect(page.locator("text=Meeting Logs")).not.toBeVisible();

  // 7. Verify switching to a session in the session list auto-switches to Live Session
  await page.click('button:has-text("Session List")');
  await expect(page.locator("text=Meeting Logs")).toBeVisible();
  // Click the session item in the session panel list (the title text of the session item)
  await page.click('div[class*="cursor-pointer"] >> text=Session -');
  // It should switch to Live Session
  await expect(page.locator("text=Meeting Logs")).not.toBeVisible();
  await expect(page.locator('input[placeholder^="Session -"]')).toBeVisible();
});
