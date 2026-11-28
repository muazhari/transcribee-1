import { test, expect } from "@playwright/test";
import { setupMockEnvironment } from "./helpers";

test.describe("Mobile Responsive Layout Suite", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("navigates across Home, Live Session, Playback Session, and AI Chat tabs on mobile viewport", async ({
    page,
  }) => {
    await setupMockEnvironment(page, { seedConfig: true });
    await page.goto("/");

    // Switch to Home tab to view SessionPanel on mobile
    await page.getByRole("button", { name: "🏠 Home" }).click();
    await expect(
      page.getByRole("button", { name: "+ New Session" }),
    ).toBeVisible();

    // Creating a new session on mobile auto-navigates to Live Session tab
    await page.getByRole("button", { name: "+ New Session" }).click();
    await expect(
      page.getByText(/Listening for transcription/i),
    ).toBeVisible();

    // Switch to Playback Session tab on mobile
    const mobileNav = page.locator("div.lg\\:hidden");
    await mobileNav
      .getByRole("button", { name: "🔊 Playback Session" })
      .click();
    await expect(
      page.getByText("No audio recorded for this session."),
    ).toBeVisible();

    // Switch to AI Chat tab on mobile
    await page.getByRole("button", { name: "🤖 AI Chat" }).click();
    await expect(
      page.getByPlaceholder("Type your question..."),
    ).toBeVisible();
  });

  test("renders recording controls cleanly without overflow or hidden status on mobile", async ({
    page,
  }) => {
    await setupMockEnvironment(page, { seedConfig: true });
    await page.goto("/");

    await page.getByRole("button", { name: "🏠 Home" }).click();
    await page.getByRole("button", { name: "+ New Session" }).click();

    const startBtn = page.getByRole("button", { name: /Start Recording/i });
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    const stopBtn = page.getByRole("button", { name: /Stop Recording/i });
    const healthBadge = page.getByText("GOOD", { exact: true });
    const aliveBadge = page.getByText("🛡️ Alive");

    await expect(stopBtn).toBeVisible();
    await expect(healthBadge).toBeVisible();
    await expect(aliveBadge).toBeVisible();

    const [stopBox, healthBox, aliveBox] = await Promise.all([
      stopBtn.boundingBox(),
      healthBadge.boundingBox(),
      aliveBadge.boundingBox(),
    ]);

    expect(stopBox).not.toBeNull();
    expect(healthBox).not.toBeNull();
    expect(aliveBox).not.toBeNull();

    // Status badges sit in a single row above the stop button, all within the 375px viewport
    expect(Math.abs(healthBox!.y - aliveBox!.y)).toBeLessThan(8);
    expect(healthBox!.y + healthBox!.height).toBeLessThanOrEqual(stopBox!.y + 1);
    expect(stopBox!.x).toBeGreaterThanOrEqual(0);
    expect(stopBox!.x + stopBox!.width).toBeLessThanOrEqual(375);

    await stopBtn.click();
    await expect(startBtn).toBeVisible();
  });
});
