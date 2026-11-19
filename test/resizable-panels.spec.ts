import { test, expect } from "@playwright/test";
import { setupMockEnvironment } from "./helpers";

test.describe("Resizable Panels", () => {
  test("drags and keyboard-resizes left and right panels within bounds on desktop", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await setupMockEnvironment(page, { seedConfig: true });
    await page.goto("/");

    // Create a session so ChatPanel renders its active state too
    await page.getByRole("button", { name: "+ New Session" }).click();

    const leftHandle = page.getByRole("separator", {
      name: "Resize sessions panel",
    });
    const rightHandle = page.getByRole("separator", {
      name: "Resize chat panel",
    });

    await expect(leftHandle).toBeVisible();
    await expect(rightHandle).toBeVisible();

    const leftPanel = leftHandle.locator("xpath=preceding-sibling::div[1]");
    const mainPanel = leftHandle.locator("xpath=following-sibling::div[1]");
    const rightPanel = rightHandle.locator("xpath=following-sibling::div[1]");

    const widthOf = async (loc: typeof leftPanel) =>
      Math.round((await loc.boundingBox())!.width);

    expect(await widthOf(leftPanel)).toBe(320);
    expect(await widthOf(rightPanel)).toBe(384);
    expect(await widthOf(mainPanel)).toBe(576);

    // Drag left handle right by +100px
    const leftBox = (await leftHandle.boundingBox())!;
    await page.mouse.move(
      leftBox.x + leftBox.width / 2,
      leftBox.y + leftBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      leftBox.x + leftBox.width / 2 + 100,
      leftBox.y + leftBox.height / 2,
    );
    await page.mouse.up();

    expect(await widthOf(leftPanel)).toBe(420);
    expect(await widthOf(mainPanel)).toBe(476);

    // Drag left handle far left -> clamps to MIN_LEFT_WIDTH (220)
    const leftBox2 = (await leftHandle.boundingBox())!;
    await page.mouse.move(
      leftBox2.x + leftBox2.width / 2,
      leftBox2.y + leftBox2.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(10, leftBox2.y + leftBox2.height / 2);
    await page.mouse.up();

    expect(await widthOf(leftPanel)).toBe(220);

    // Drag right handle left by 100px -> chat widens to 484
    const rightBox = (await rightHandle.boundingBox())!;
    await page.mouse.move(
      rightBox.x + rightBox.width / 2,
      rightBox.y + rightBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      rightBox.x + rightBox.width / 2 - 100,
      rightBox.y + rightBox.height / 2,
    );
    await page.mouse.up();

    expect(await widthOf(rightPanel)).toBe(484);

    // Drag right handle far left -> center panel preserves MIN_MAIN_WIDTH (320)
    const rightBox2 = (await rightHandle.boundingBox())!;
    await page.mouse.move(
      rightBox2.x + rightBox2.width / 2,
      rightBox2.y + rightBox2.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(10, rightBox2.y + rightBox2.height / 2);
    await page.mouse.up();

    expect(await widthOf(mainPanel)).toBe(320);
    expect(await widthOf(rightPanel)).toBe(1280 - 220 - 320);

    // Keyboard resize on right handle (ArrowRight narrows right panel by 16px)
    const beforeKey = await widthOf(rightPanel);
    await rightHandle.focus();
    await page.keyboard.press("ArrowRight");
    expect(await widthOf(rightPanel)).toBe(beforeKey - 16);
  });

  test("hides resize handles and keeps full-width panels on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupMockEnvironment(page, { seedConfig: true });
    await page.goto("/");

    await expect(
      page.getByRole("separator", { name: "Resize sessions panel" }),
    ).toBeHidden();
    await expect(
      page.getByRole("separator", { name: "Resize chat panel" }),
    ).toBeHidden();

    await page.getByRole("button", { name: "🏠 Home" }).click();
    const sessionsBox = await page
      .getByRole("button", { name: "+ New Session" })
      .locator("xpath=ancestor::div[2]")
      .boundingBox();
    expect(Math.round(sessionsBox!.width)).toBe(375);
  });
});
