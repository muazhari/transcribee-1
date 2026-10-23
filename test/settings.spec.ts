/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from "@playwright/test";
import { setupMockEnvironment } from "./helpers";

test.describe("Settings & Audio Routing Suite", () => {
  test("validates required Soniox API key and non-empty Language Hints", async ({
    page,
  }) => {
    await setupMockEnvironment(page, { seedConfig: false });
    await page.goto("/");

    await page.locator('button[title="Open Settings"]').click();

    // Clear all language hints and attempt to save with empty Soniox key
    await page.locator('button[title="Clear all"]').click();
    await page.getByRole("button", { name: "Save configurations" }).click();

    await expect(page.getByText("Soniox API Key is required")).toBeVisible();
    await expect(
      page.getByText("At least one language hint is required"),
    ).toBeVisible();
  });

  test("toggles API key visibility and manages Language Hints chips", async ({
    page,
  }) => {
    await setupMockEnvironment(page, { seedConfig: true });
    await page.goto("/");

    await page.locator('button[title="Open Settings"]').click();

    const googleInput = page.getByPlaceholder("Enter Google AI API Key");
    await expect(googleInput).toHaveAttribute("type", "password");

    const showButtons = page.getByRole("button", { name: "Show" });
    await showButtons.first().click();
    await expect(googleInput).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide" }).first().click();
    await expect(googleInput).toHaveAttribute("type", "password");

    // Search and add Spanish (es)
    const langSearch = page.locator("#lang-search-input");
    await langSearch.fill("Spanish");
    await page.getByRole("button", { name: /Spanish/i }).click();

    await expect(page.getByText("[es] Spanish")).toBeVisible();

    // Remove Indonesian (id) chip
    const idChipRemove = page
      .locator("span", { hasText: "[id] Indonesian" })
      .locator("button");
    await idChipRemove.click();
    await expect(page.getByText("[id] Indonesian")).toBeHidden();

    await page.getByRole("button", { name: "Save configurations" }).click();
    await expect(page.getByText("Engine Preferences")).toBeHidden();

    await expect
      .poll(async () => {
        const persisted = await page.evaluate(() => {
          const root = JSON.parse(localStorage.getItem("persist:root") || "{}");
          return JSON.parse(root.config || "{}");
        });
        return persisted.languageHints;
      })
      .toEqual(["en", "es"]);
  });

  test("discards unsaved changes when closing Settings Drawer via close button", async ({
    page,
  }) => {
    await setupMockEnvironment(page, {
      seedConfig: { sonioxApiKey: "original-key" },
    });
    await page.goto("/");

    await page.locator('button[title="Open Settings"]').click();
    const sonioxInput = page.getByPlaceholder("Enter Soniox API Key");
    await sonioxInput.fill("unsaved-key-modification");

    // Close without saving
    await page.getByRole("button", { name: "Close settings" }).click();
    await expect(
      page.getByRole("heading", { name: "System Configurations" }),
    ).toBeHidden();

    // Reopen and verify original value was restored
    await page.locator('button[title="Open Settings"]').click();
    await expect(sonioxInput).toHaveValue("original-key");
  });

  test("sends one-way and two-way translation payloads to Soniox WebSocket", async ({
    page,
  }) => {
    await setupMockEnvironment(page, { seedConfig: true });
    await page.goto("/");

    await page.getByRole("button", { name: "+ New Session" }).click();

    // Configure One-Way translation to Japanese (ja)
    await page.locator('button[title="Open Settings"]').click();
    await page.locator('input[name="enableTranslation"]').check();
    await page.getByRole("button", { name: "One-way" }).click();
    await page
      .locator('select[name="translationTargetLanguage"]')
      .selectOption("ja");
    await page.getByRole("button", { name: "Save configurations" }).click();

    await page.getByRole("button", { name: /🎙️ Start Recording/i }).click();
    await expect
      .poll(async () =>
        page.evaluate(() => (window as any).__sentWsConfigs.length),
      )
      .toBe(1);
    await page.getByRole("button", { name: /⏹️ Stop Recording/i }).click();

    // Configure Two-Way translation between French (fr) and German (de)
    await page.locator('button[title="Open Settings"]').click();
    await page.getByRole("button", { name: "Two-way" }).click();
    await page
      .locator('select[name="translationLanguageA"]')
      .selectOption("fr");
    await page
      .locator('select[name="translationLanguageB"]')
      .selectOption("de");
    await page.getByRole("button", { name: "Save configurations" }).click();

    await page.getByRole("button", { name: /🎙️ Start Recording/i }).click();
    await expect
      .poll(async () =>
        page.evaluate(() => (window as any).__sentWsConfigs.length),
      )
      .toBe(2);
    await page.getByRole("button", { name: /⏹️ Stop Recording/i }).click();

    const configs = await page.evaluate(() => (window as any).__sentWsConfigs);
    expect(configs[0].translation).toEqual({
      type: "one_way",
      target_language: "ja",
    });
    expect(configs[1].translation).toEqual({
      type: "two_way",
      language_a: "fr",
      language_b: "de",
    });
  });

  test("routes audio properly across mic-only, speaker-only, and mix modes", async ({
    page,
  }) => {
    await setupMockEnvironment(page, {
      seedConfig: { audioRouting: "speaker-only" },
    });
    await page.goto("/");

    await page.getByRole("button", { name: "+ New Session" }).click();

    // 1. speaker-only -> only getDisplayMedia called
    await page.getByRole("button", { name: /🎙️ Start Recording/i }).click();
    await expect(page.getByText("Health: GOOD")).toBeVisible();
    await page.getByRole("button", { name: /⏹️ Stop Recording/i }).click();

    let calls = await page.evaluate(() => ({
      user: (window as any).__userMediaCalls,
      display: (window as any).__displayMediaCalls,
    }));
    expect(calls).toEqual({ user: 0, display: 1 });

    // 2. mix -> both getUserMedia and getDisplayMedia called
    await page.locator('button[title="Open Settings"]').click();
    await page.locator('select[name="audioRouting"]').selectOption("mix");
    await page.getByRole("button", { name: "Save configurations" }).click();

    await page.getByRole("button", { name: /🎙️ Start Recording/i }).click();
    await expect(page.getByText("Health: GOOD")).toBeVisible();
    await page.getByRole("button", { name: /⏹️ Stop Recording/i }).click();

    calls = await page.evaluate(() => ({
      user: (window as any).__userMediaCalls,
      display: (window as any).__displayMediaCalls,
    }));
    expect(calls).toEqual({ user: 1, display: 2 });
  });

  test("handles missing display audio track error when capturing speaker output", async ({
    page,
  }) => {
    await setupMockEnvironment(page, {
      seedConfig: { audioRouting: "speaker-only" },
      displayMediaNoAudio: true,
    });
    await page.goto("/");

    await page.getByRole("button", { name: "+ New Session" }).click();

    let dialogMessage = "";
    page.once("dialog", async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    await page.getByRole("button", { name: /🎙️ Start Recording/i }).click();

    await expect.poll(() => dialogMessage).toContain("No audio track");
    await expect(
      page.getByRole("button", { name: /🎙️ Start Recording/i }),
    ).toBeVisible();
  });
});
