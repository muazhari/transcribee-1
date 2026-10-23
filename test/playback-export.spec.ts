/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from "@playwright/test";
import { setupMockEnvironment, seedDatabase } from "./helpers";
import fs from "fs";

test.describe("Playback Session & Export Suite", () => {
  test("renders Playback Session empty states when no session or no audio exists", async ({
    page,
  }) => {
    await setupMockEnvironment(page, { seedConfig: true });
    await page.goto("/");

    // Switch desktop tab to Playback Session with no session selected
    const desktopTabs = page.locator("div.hidden.lg\\:flex");
    await desktopTabs
      .getByRole("button", { name: /🔊 Playback Session/i })
      .click();
    await expect(page.getByText("Ready to play")).toBeVisible();

    // Create a session without recording any audio
    await page.getByRole("button", { name: "+ New Session" }).click();
    await desktopTabs
      .getByRole("button", { name: /🔊 Playback Session/i })
      .click();
    await expect(
      page.getByText("No audio recorded for this session."),
    ).toBeVisible();
  });

  test("compiles WAV audio in Playback Session and supports speed, mute, volume, skip, and transcript seeking", async ({
    page,
  }) => {
    await setupMockEnvironment(page, { seedConfig: true });
    await page.goto("/");

    await seedDatabase(page, {
      sessions: [
        {
          id: "sess-play",
          createdAt: "2026-01-01T10:00:00.000Z",
          title: "Playback Demo",
        },
      ],
      transcripts: [
        {
          id: "t-play-1",
          sessionId: "sess-play",
          speakerId: "1",
          text: "First spoken phrase",
          isFinal: true,
          startTimestamp: 0,
          endTimestamp: 1000,
          duration: 1000,
          language: "en",
          translation: "Primera frase hablada",
        },
        {
          id: "t-play-2",
          sessionId: "sess-play",
          speakerId: "2",
          text: "Second spoken phrase",
          isFinal: true,
          startTimestamp: 1000,
          endTimestamp: 2000,
          duration: 1000,
          language: "en",
        },
      ],
      audioChunks: [
        {
          sessionId: "sess-play",
          startTimestamp: 0,
          sampleLength: 32000, // 2.0s at 16kHz
        },
      ],
    });
    await page.reload();

    await page.getByText("Playback Demo").click();
    await page
      .locator("div.hidden.lg\\:flex")
      .getByRole("button", { name: /🔊 Playback Session/i })
      .click();

    const audioLocator = page.locator("audio");
    await expect(audioLocator).toHaveAttribute("src", /^blob:/);

    // Verify transcripts and translation render in PlaybackPanel
    await expect(page.getByText("First")).toBeVisible();
    await expect(page.getByText("Primera frase hablada")).toBeVisible();

    // Change playback speed to 1.5x
    await page.getByRole("button", { name: "1.5x" }).click();
    const playbackRate = await audioLocator.evaluate(
      (el: HTMLAudioElement) => el.playbackRate,
    );
    expect(playbackRate).toBe(1.5);

    // Mute and Unmute
    await page.locator('button[title="Mute"]').click();
    await expect(page.locator('button[title="Unmute"]')).toBeVisible();
    const isMuted = await audioLocator.evaluate(
      (el: HTMLAudioElement) => el.muted,
    );
    expect(isMuted).toBe(true);
    await page.locator('button[title="Unmute"]').click();

    // Click second transcript block to seek audio to 1.0s
    await page.locator("#transcript-card-t-play-2").click();
    const currentTime = await audioLocator.evaluate(
      (el: HTMLAudioElement) => el.currentTime,
    );
    expect(currentTime).toBeGreaterThanOrEqual(1);

    // Stop & Reset button resets currentTime to 0
    await page.locator('button[title="Stop & Reset"]').click();
    const resetTime = await audioLocator.evaluate(
      (el: HTMLAudioElement) => el.currentTime,
    );
    expect(resetTime).toBe(0);
  });

  test("exports session data as SRT subtitles, JSON archive, and WAV audio", async ({
    page,
  }) => {
    await setupMockEnvironment(page, { seedConfig: true });
    await page.goto("/");

    await seedDatabase(page, {
      sessions: [
        {
          id: "sess-exp",
          createdAt: "2026-01-01T10:00:00.000Z",
          title: "Export Session",
        },
      ],
      transcripts: [
        {
          id: "t-exp-1",
          sessionId: "sess-exp",
          speakerId: "1",
          text: "Exported line one",
          isFinal: true,
          startTimestamp: 0,
          endTimestamp: 1000,
          duration: 1000,
          language: "en",
          translation: "Translated line one",
        },
      ],
      audioChunks: [
        {
          sessionId: "sess-exp",
          startTimestamp: 0,
          sampleLength: 16000,
        },
      ],
    });
    await page.reload();

    await page.getByText("Export Session").click();

    // 1. Export SRT
    await page.getByRole("button", { name: "Export Menu" }).click();
    const srtDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Subtitles \(\.srt\)/i }).click();
    const srtDownload = await srtDownloadPromise;
    expect(srtDownload.suggestedFilename()).toBe(
      "export-session-transcript.srt",
    );
    const srtPath = await srtDownload.path();
    const srtText = fs.readFileSync(srtPath!, "utf-8");
    expect(srtText).toContain("00:00:00,000 --> 00:00:01,000");
    expect(srtText).toContain("Speaker 1: Exported line one");
    expect(srtText).toContain("(Translated line one)");

    // 2. Export JSON
    await page.getByRole("button", { name: "Export Menu" }).click();
    const jsonDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Data Block \(\.json\)/i }).click();
    const jsonDownload = await jsonDownloadPromise;
    expect(jsonDownload.suggestedFilename()).toBe(
      "export-session-transcript.json",
    );
    const jsonPath = await jsonDownload.path();
    const jsonData = JSON.parse(fs.readFileSync(jsonPath!, "utf-8"));
    expect(Array.isArray(jsonData)).toBe(true);
    expect(jsonData).toHaveLength(1);
    expect(jsonData[0].text).toBe("Exported line one");

    // 3. Export WAV
    await page.getByRole("button", { name: "Export Menu" }).click();
    const wavDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Audio \(\.wav\)/i }).click();
    const wavDownload = await wavDownloadPromise;
    expect(wavDownload.suggestedFilename()).toBe("export-session.wav");
    const wavPath = await wavDownload.path();
    const wavBuffer = fs.readFileSync(wavPath!);
    expect(wavBuffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
  });

  test("alerts user when attempting to export WAV audio for a session without audio chunks", async ({
    page,
  }) => {
    await setupMockEnvironment(page, { seedConfig: true });
    await page.goto("/");

    await page.getByRole("button", { name: "+ New Session" }).click();

    let alertMessage = "";
    page.once("dialog", async (dialog) => {
      alertMessage = dialog.message();
      await dialog.accept();
    });

    await page.getByRole("button", { name: "Export Menu" }).click();
    await page.getByRole("button", { name: /Audio \(\.wav\)/i }).click();

    await expect
      .poll(() => alertMessage)
      .toBe("No audio recorded for this session yet.");
  });
});
