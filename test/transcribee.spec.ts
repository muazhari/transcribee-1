/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from "@playwright/test";
import { setupMockEnvironment } from "./helpers";

test.describe("Transcribee Core E2E Suite", () => {
  test("configures API keys, models, and routing in Settings Drawer and persists to localStorage", async ({
    page,
  }) => {
    await setupMockEnvironment(page, { seedConfig: false });
    await page.goto("/");

    await page.locator('button[title="Open Settings"]').click();
    await expect(
      page.getByRole("heading", { name: "System Configurations" }),
    ).toBeVisible();

    await page
      .getByPlaceholder("Enter Soniox API Key")
      .fill("test-soniox-key-xyz");
    await page
      .getByPlaceholder("Enter Google AI API Key")
      .fill("test-gemini-key-xyz");

    await expect(page.locator('select[name="aiModel"]')).toHaveValue(
      "gemini-3.8-flash",
    );
    await expect(page.locator('select[name="transcriptionModel"]')).toHaveValue(
      "stt-rt-v5",
    );

    await page.locator('select[name="audioRouting"]').selectOption("mic-only");
    await page.getByRole("button", { name: "Save configurations" }).click();

    await expect(
      page.getByRole("heading", { name: "System Configurations" }),
    ).toBeHidden();

    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const root = JSON.parse(localStorage.getItem("persist:root") || "{}");
          return JSON.parse(root.config || "{}");
        });
      })
      .toMatchObject({
        sonioxApiKey: "test-soniox-key-xyz",
        googleApiKey: "test-gemini-key-xyz",
        audioRouting: "mic-only",
      });
  });

  test("creates a session, streams live transcription with translation, and saves to IndexedDB", async ({
    page,
  }) => {
    await setupMockEnvironment(page, {
      seedConfig: { enableTranslation: true },
    });
    await page.goto("/");

    await page.getByRole("button", { name: "+ New Session" }).click();
    await expect(page.getByText(/Session - \d+\/\d+\/\d+/)).toBeVisible();

    await page.getByRole("button", { name: /🎙️ Start Recording/i }).click();
    await expect(page.getByText("Health: GOOD")).toBeVisible();

    await expect(page.getByText("Hello")).toBeVisible();
    await expect(page.getByText("world")).toBeVisible();
    await expect(page.getByText("Speaker 1")).toBeVisible();
    await expect(page.getByText("Hola mundo")).toBeVisible();

    await page.getByRole("button", { name: /⏹️ Stop Recording/i }).click();
    await expect(
      page.getByRole("button", { name: /🎙️ Start Recording/i }),
    ).toBeVisible();

    const storedTranscripts = await page.evaluate(async () => {
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
      return all;
    });
    expect(storedTranscripts.length).toBeGreaterThanOrEqual(1);
    expect(storedTranscripts[0].text).toContain("Hello world");
    expect(storedTranscripts[0].translation).toContain("Hola mundo");
  });

  test("scrubs audio on word token click and segment timestamp click with verified audio buffers", async ({
    page,
  }) => {
    await setupMockEnvironment(page, { seedConfig: true });
    await page.goto("/");

    await page.getByRole("button", { name: "+ New Session" }).click();
    await page.getByRole("button", { name: /🎙️ Start Recording/i }).click();
    await expect(page.getByText("Hello")).toBeVisible();
    await page.getByRole("button", { name: /⏹️ Stop Recording/i }).click();

    // Click individual finalized word token ("Hello")
    const helloToken = page.locator("span", { hasText: "Hello" }).first();
    await expect(helloToken).toHaveAttribute("title", /Play word/);
    await helloToken.click();

    await expect
      .poll(async () =>
        page.evaluate(() => (window as any).__playedAudioBuffers.length),
      )
      .toBe(1);

    // Click header timestamp range ("0:00 - 0:00") to play entire segment
    await page.getByText("0:00 - 0:00").click();

    await expect
      .poll(async () =>
        page.evaluate(() => (window as any).__playedAudioBuffers.length),
      )
      .toBe(2);

    const playedBuffers = await page.evaluate(
      () => (window as any).__playedAudioBuffers,
    );
    expect(playedBuffers[0].length).toBeGreaterThan(0);
    expect(playedBuffers[1].length).toBeGreaterThan(playedBuffers[0].length);
  });

  test("offsets timestamps accurately across consecutive recordings in the same session", async ({
    page,
  }) => {
    await setupMockEnvironment(page, {
      seedConfig: true,
      audioSamplesPerRecording: 32000, // 2000ms at 16kHz
    });
    await page.goto("/");

    await page.getByRole("button", { name: "+ New Session" }).click();

    // First recording (0ms .. 2000ms)
    await page.getByRole("button", { name: /🎙️ Start Recording/i }).click();
    await expect(page.getByText("Hello")).toBeVisible();
    await page.getByRole("button", { name: /⏹️ Stop Recording/i }).click();

    // Update mock tokens for second recording
    await page.evaluate(() => {
      (window as any).__mockSonioxTokens = [
        {
          text: "Second",
          start_ms: 100,
          duration_ms: 200,
          is_final: true,
          speaker: "2",
          translation_status: "original",
          language: "en",
        },
        {
          text: " segment",
          start_ms: 300,
          duration_ms: 300,
          is_final: true,
          speaker: "2",
          translation_status: "original",
          language: "en",
        },
      ];
    });

    // Second recording in same session -> starts at offset 2000ms (00:02)
    await page.getByRole("button", { name: /🎙️ Start Recording/i }).click();
    await expect(page.getByText("Second")).toBeVisible();
    await expect(page.getByText("Speaker 2")).toBeVisible();
    await page.getByRole("button", { name: /⏹️ Stop Recording/i }).click();

    // Verify 0:02 - 0:02 timestamp range on the second segment
    await expect(page.getByText("0:02 - 0:02")).toBeVisible();

    // Verify offsetTimestamp in IndexedDB
    const secondSeg = await page.evaluate(async () => {
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
      return all.find((t) => t.speakerId === "2");
    });

    expect(secondSeg).toBeDefined();
    expect(secondSeg.offsetTimestamp).toBe(2000);
    expect(secondSeg.startTimestamp).toBe(2100);
    expect(secondSeg.endTimestamp).toBe(2600);
  });

  test("streams AI chat response and supports mid-generation cancellation", async ({
    page,
  }) => {
    await setupMockEnvironment(page, { seedConfig: true });
    await page.goto("/");

    await page.getByRole("button", { name: "+ New Session" }).click();

    const chatInput = page.getByPlaceholder("Type your question...");
    await chatInput.fill("Summarize this transcript.");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Summarize this transcript.")).toBeVisible();
    await expect(
      page.getByText("This is a mock response from Gemini", { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();

    // Now test mid-stream cancellation
    await chatInput.fill("Give me a detailed breakdown.");
    await page.getByRole("button", { name: "Send" }).click();

    const cancelButton = page.getByRole("button", { name: "Cancel" });
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    await expect(
      page.getByText("(Chat cancelled)", { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  });
});
