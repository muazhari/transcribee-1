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
});
