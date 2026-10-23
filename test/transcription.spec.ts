/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from "@playwright/test";
import { setupMockEnvironment, seedDatabase } from "./helpers";

test.describe("Live Transcription, Diarization & Scroll Pinning Suite", () => {
  test("prompts for Soniox API key and opens Settings Drawer when starting unconfigured", async ({
    page,
  }) => {
    await setupMockEnvironment(page, { seedConfig: false });
    await page.goto("/");

    await page.getByRole("button", { name: "+ New Session" }).click();

    let alertMessage = "";
    page.once("dialog", async (dialog) => {
      alertMessage = dialog.message();
      await dialog.accept();
    });

    await page.getByRole("button", { name: /🎙️ Start Recording/i }).click();

    expect(alertMessage).toBe(
      "Please configure your Soniox API Key in Settings first.",
    );
    await expect(
      page.getByRole("heading", { name: "System Configurations" }),
    ).toBeVisible();
  });

  test("renders unfinalized tokens in italic and refines to clickable spans upon finalization and <end>", async ({
    page,
  }) => {
    await setupMockEnvironment(page, {
      seedConfig: true,
      autoEmitTokens: false,
    });
    await page.goto("/");

    await page.getByRole("button", { name: "+ New Session" }).click();
    await page.getByRole("button", { name: /🎙️ Start Recording/i }).click();

    await expect(
      page.getByText(/Listening for transcription/i),
    ).toBeVisible();

    // Emit unfinalized token
    await page.evaluate(() => {
      (window as any).__lastWs.pushTokens([
        {
          text: "Drafting",
          start_ms: 100,
          duration_ms: 200,
          is_final: false,
          speaker: "1",
          translation_status: "original",
          language: "en",
        },
        {
          text: " live...",
          start_ms: 300,
          duration_ms: 200,
          is_final: false,
          speaker: "1",
          translation_status: "original",
          language: "en",
        },
      ]);
    });

    const draftToken = page.locator("span.italic", { hasText: "Drafting" });
    await expect(draftToken).toBeVisible();

    // Now emit finalized replacement + <end> token
    await page.evaluate(() => {
      (window as any).__lastWs.pushTokens([
        {
          text: "Finalized",
          start_ms: 100,
          duration_ms: 200,
          is_final: true,
          speaker: "1",
          translation_status: "original",
          language: "en",
        },
        {
          text: " sentence.",
          start_ms: 300,
          duration_ms: 250,
          is_final: true,
          speaker: "1",
          translation_status: "original",
          language: "en",
        },
        {
          text: "<end>",
          is_final: true,
          speaker: "1",
        },
      ]);
    });

    await expect(page.locator("span.italic")).toHaveCount(0);
    const finalWord = page.locator("span", { hasText: "Finalized" }).first();
    await expect(finalWord).toBeVisible();
    await expect(finalWord).toHaveAttribute("title", /Play word/);
    await expect(page.getByText("<end>")).toHaveCount(0);

    await page.getByRole("button", { name: /⏹️ Stop Recording/i }).click();
  });

  test("splits segments across multiple speakers and languages and attaches translations", async ({
    page,
  }) => {
    await setupMockEnvironment(page, {
      seedConfig: { enableTranslation: true },
      autoEmitTokens: false,
    });
    await page.goto("/");

    await page.getByRole("button", { name: "+ New Session" }).click();
    await page.getByRole("button", { name: /🎙️ Start Recording/i }).click();
    await expect(page.getByText("Health: GOOD")).toBeVisible();

    await page.evaluate(() => {
      (window as any).__lastWs.pushTokens([
        {
          text: "Good morning",
          start_ms: 100,
          duration_ms: 400,
          is_final: true,
          speaker: "1",
          translation_status: "original",
          language: "en",
        },
        {
          text: "Selamat pagi",
          start_ms: 100,
          duration_ms: 400,
          is_final: true,
          speaker: "1",
          translation_status: "translation",
          language: "id",
        },
        {
          text: "Apa kabar",
          start_ms: 600,
          duration_ms: 500,
          is_final: true,
          speaker: "2",
          translation_status: "original",
          language: "id",
        },
        {
          text: "How are you",
          start_ms: 600,
          duration_ms: 500,
          is_final: true,
          speaker: "2",
          translation_status: "translation",
          language: "en",
        },
      ]);
    });

    await expect(page.getByText("Speaker 1")).toBeVisible();
    await expect(page.getByText("Good", { exact: true })).toBeVisible();
    await expect(page.getByText("Selamat pagi")).toBeVisible();

    await expect(page.getByText("Speaker 2")).toBeVisible();
    await expect(page.getByText("Apa", { exact: true })).toBeVisible();
    await expect(page.getByText("How are you")).toBeVisible();

    await page.getByRole("button", { name: /⏹️ Stop Recording/i }).click();
  });

  test("marks stream health as POOR when Soniox emits a WebSocket error", async ({
    page,
  }) => {
    await setupMockEnvironment(page, {
      seedConfig: true,
      autoEmitTokens: false,
    });
    await page.goto("/");

    await page.getByRole("button", { name: "+ New Session" }).click();
    await page.getByRole("button", { name: /🎙️ Start Recording/i }).click();
    await expect(page.getByText("Health: GOOD")).toBeVisible();

    await page.evaluate(() => {
      (window as any).__lastWs.pushError(401, "Invalid Soniox API key");
    });

    await expect(page.getByText("Health: POOR")).toBeVisible();
    await page.getByRole("button", { name: /⏹️ Stop Recording/i }).click();
  });

  test("displays 'Jump to latest' button on manual upward scroll and re-pins on click", async ({
    page,
  }) => {
    await setupMockEnvironment(page, { seedConfig: true });
    await page.goto("/");

    const transcripts = Array.from({ length: 30 }, (_, idx) => ({
      id: `seg-${idx}`,
      sessionId: "sess-scroll",
      speakerId: idx % 2 === 0 ? "1" : "2",
      text: `Transcript segment number ${idx + 1} with enough words to take up vertical space in the feed.`,
      isFinal: true,
      startTimestamp: idx * 1000,
      endTimestamp: (idx + 1) * 1000,
      duration: 1000,
      language: "en",
    }));

    await seedDatabase(page, {
      sessions: [
        {
          id: "sess-scroll",
          createdAt: "2026-01-01T10:00:00.000Z",
          title: "Long Session",
        },
      ],
      transcripts,
    });
    await page.reload();

    await page.getByText("Long Session").click();
    await expect(page.getByText("30", { exact: true })).toBeVisible();

    // Scroll transcript container to top
    await page.evaluate(() => {
      const container = document.querySelector(
        ".overflow-y-auto.p-6.flex.flex-col.gap-6",
      );
      if (container) {
        container.scrollTop = 0;
        container.dispatchEvent(new Event("scroll"));
      }
    });

    const jumpBtn = page.getByRole("button", { name: /↓ Jump to latest/i });
    await expect(jumpBtn).toBeVisible();

    await jumpBtn.click();
    await expect(jumpBtn).toBeHidden();
  });
});
