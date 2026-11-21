import { test, expect } from "@playwright/test";
import { setupMockEnvironment } from "./helpers";

test("Reload mid-recording does not leave the app stuck in recording state", async ({
  page,
}) => {
  await setupMockEnvironment(page, {
    autoEmitTokens: false,
    audioSamplesPerRecording: 0,
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
