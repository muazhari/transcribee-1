/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from "@playwright/test";
import { setupMockEnvironment } from "./helpers";

test.describe("AI Chat Assistant & Context Token Guardrails Suite", () => {
  test("alerts when Google API key is missing upon sending a chat query", async ({
    page,
  }) => {
    await setupMockEnvironment(page, {
      seedConfig: { sonioxApiKey: "test-soniox", googleApiKey: "" },
    });
    await page.goto("/");

    await page.getByRole("button", { name: "+ New Session" }).click();

    let alertMessage = "";
    page.once("dialog", async (dialog) => {
      alertMessage = dialog.message();
      await dialog.accept();
    });

    await page.getByPlaceholder("Type your question...").fill("Hello AI");
    await page.getByRole("button", { name: "Send" }).click();

    expect(alertMessage).toBe(
      "Please configure your Google AI API Key in Settings first.",
    );
  });

  test("executes suggestion prompt, copies assistant response, and clears chat history", async ({
    page,
  }) => {
    await setupMockEnvironment(page, { seedConfig: true });
    await page.goto("/");

    await page.getByRole("button", { name: "+ New Session" }).click();

    // Click suggestion chip -> triggers handleAsk("Summarize this transcript")
    await page
      .getByRole("button", { name: "Summarize this transcript" })
      .click();

    await expect(
      page.getByText("This is a mock response from Gemini", { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();

    // Copy assistant response
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: async () => Promise.resolve() },
        configurable: true,
      });
    });
    const copyBtn = page.getByRole("button", { name: "📋" }).last();
    await copyBtn.click();
    await expect(page.getByRole("button", { name: "✔️" })).toBeVisible();

    // Clear chat history and verify it is removed from IndexedDB as well
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(
      page.getByText("Ask questions about this transcript"),
    ).toBeVisible();

    const remainingChats = await page.evaluate(async () => {
      const req = indexedDB.open("TranscribeeDB", 1);
      const db = await new Promise<IDBDatabase>((res) => {
        req.onsuccess = () => res(req.result);
      });
      const tx = db.transaction("chatPairs", "readonly");
      const count = await new Promise<number>((res) => {
        const r = tx.objectStore("chatPairs").count();
        r.onsuccess = () => res(r.result);
      });
      db.close();
      return count;
    });
    expect(remainingChats).toBe(0);
  });

  test("displays 85% token threshold warning banner when transcript approaches context capacity", async ({
    page,
  }) => {
    await setupMockEnvironment(page, { seedConfig: true });
    await page.goto("/");

    // 3,500,000 chars -> ~875,000 tokens (87.5% of 1,000,000 token limit for gemini-3.8-flash)
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("TranscribeeDB", 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["sessions", "transcripts"], "readwrite");
        tx.objectStore("sessions").put({
          id: "sess-85",
          createdAt: new Date("2026-01-01T10:00:00.000Z"),
          title: "85 Percent Capacity Session",
          audioBlobPath: "",
        });
        tx.objectStore("transcripts").put({
          id: "t-85",
          sessionId: "sess-85",
          speakerId: "1",
          text: "A".repeat(3_500_000),
          isFinal: true,
          startTimestamp: 0,
          endTimestamp: 1000,
          duration: 1000,
          language: "en",
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    });
    await page.reload();

    await page.getByText("85 Percent Capacity Session").click();

    await expect(
      page.getByText(
        /Active token volume has passed 85% threshold constraints/i,
      ),
    ).toBeVisible();
  });

  test("displays 100% capacity banner and executes smart FIFO truncation during chat", async ({
    page,
  }) => {
    await setupMockEnvironment(page, { seedConfig: true });
    await page.goto("/");

    // Two turns totaling 4,200,000 chars -> ~1,050,000 tokens (105% of 1,000,000 limit)
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("TranscribeeDB", 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["sessions", "transcripts"], "readwrite");
        tx.objectStore("sessions").put({
          id: "sess-100",
          createdAt: new Date("2026-01-01T10:00:00.000Z"),
          title: "100 Percent Capacity Session",
          audioBlobPath: "",
        });
        tx.objectStore("transcripts").put({
          id: "t-100-1",
          sessionId: "sess-100",
          speakerId: "1",
          text: "A".repeat(2_100_000),
          isFinal: true,
          startTimestamp: 0,
          endTimestamp: 1000,
          duration: 1000,
          language: "en",
        });
        tx.objectStore("transcripts").put({
          id: "t-100-2",
          sessionId: "sess-100",
          speakerId: "2",
          text: "B".repeat(2_100_000),
          isFinal: true,
          startTimestamp: 1000,
          endTimestamp: 2000,
          duration: 1000,
          language: "en",
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    });
    await page.reload();

    await page.getByText("100 Percent Capacity Session").click();

    await expect(page.getByText(/Context Window Full:/i)).toBeVisible();
    await expect(
      page.getByText(
        /Exceeded 100% capacity\. The oldest speaker turns are left out of the AI context/i,
      ),
    ).toBeVisible();

    // Verify chat still works with FIFO truncation active
    await page
      .getByPlaceholder("Type your question...")
      .fill("What did Speaker 2 say?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(
      page.getByText("This is a mock response from Gemini", { exact: false }),
    ).toBeVisible();
  });
});
