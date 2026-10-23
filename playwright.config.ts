import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT || 3101);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./test",
  testIgnore: ["**/capture-screenshots.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  webServer: {
    command: `node -e "const fs=require('fs'),cp=require('child_process');if(!fs.existsSync('.next/BUILD_ID'))cp.execSync('bun run build',{stdio:'inherit'});" && bun x next start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
  workers: process.env.CI ? 2 : undefined,
  reporter: "line",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
          ],
        },
      },
    },
  ],
});
