/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from "@playwright/test";
import { setupMockEnvironment, seedDatabase } from "./helpers";

test.describe("Session Management & Persistence Suite", () => {
  test("creates, renames, searches, and filters sessions with IndexedDB persistence", async ({
    page,
  }) => {
    await setupMockEnvironment(page, { seedConfig: true });
    await page.goto("/");

    await seedDatabase(page, {
      sessions: [
        {
          id: "sess-alpha",
          createdAt: "2026-01-01T10:00:00.000Z",
          title: "Alpha Architecture Review",
        },
        {
          id: "sess-beta",
          createdAt: "2026-01-02T10:00:00.000Z",
          title: "Beta Sprint Planning",
        },
      ],
    });
    await page.reload();

    await expect(page.getByText("Alpha Architecture Review")).toBeVisible();
    await expect(page.getByText("Beta Sprint Planning")).toBeVisible();

    // Select "Beta Sprint Planning" and rename via header input in TranscriptPanel
    await page.getByText("Beta Sprint Planning").click();
    const titleInput = page.locator(
      'input[value="Beta Sprint Planning"]',
    );
    await expect(titleInput).toBeVisible();
    await titleInput.fill("Beta Release Sync");

    await expect(page.getByText("Beta Release Sync")).toBeVisible();

    // Filter sessions via search input
    const searchInput = page.getByPlaceholder("Search sessions...");
    await searchInput.fill("Alpha");
    await expect(page.getByText("Alpha Architecture Review")).toBeVisible();
    await expect(page.getByText("Beta Release Sync")).toBeHidden();

    await searchInput.fill("NonExistentQuery");
    await expect(page.getByText("No sessions found")).toBeVisible();

    await searchInput.fill("");
    await expect(page.getByText("Beta Release Sync")).toBeVisible();
  });

  test("switches sessions and loads associated transcripts and chat history", async ({
    page,
  }) => {
    await setupMockEnvironment(page, { seedConfig: true });
    await page.goto("/");

    await seedDatabase(page, {
      sessions: [
        {
          id: "sess-1",
          createdAt: "2026-01-01T10:00:00.000Z",
          title: "First Session",
        },
        {
          id: "sess-2",
          createdAt: "2026-01-02T10:00:00.000Z",
          title: "Second Session",
        },
      ],
      transcripts: [
        {
          id: "t-1",
          sessionId: "sess-1",
          speakerId: "1",
          text: "Transcript from first session",
          isFinal: true,
          startTimestamp: 0,
          endTimestamp: 1000,
          duration: 1000,
          language: "en",
        },
        {
          id: "t-2",
          sessionId: "sess-2",
          speakerId: "2",
          text: "Transcript from second session",
          isFinal: true,
          startTimestamp: 0,
          endTimestamp: 1000,
          duration: 1000,
          language: "en",
        },
      ],
      chatPairs: [
        {
          id: "cp-1",
          sessionId: "sess-1",
          question: "Question for session 1",
          answer: "Answer for session 1",
          timestamp: "2026-01-01T10:05:00.000Z",
        },
        {
          id: "cp-2",
          sessionId: "sess-2",
          question: "Question for session 2",
          answer: "Answer for session 2",
          timestamp: "2026-01-02T10:05:00.000Z",
        },
      ],
    });
    await page.reload();

    // Select Second Session
    await page.getByText("Second Session").click();
    await expect(page.getByText("second", { exact: true })).toBeVisible();
    await expect(page.getByText("Question for session 2")).toBeVisible();

    // Switch to First Session
    await page.getByText("First Session").click();
    await expect(page.getByText("first", { exact: true })).toBeVisible();
    await expect(page.getByText("Question for session 1")).toBeVisible();
    await expect(page.getByText("Question for session 2")).toBeHidden();
  });

  test("deletes a session on confirmation and cascades deletion in IndexedDB", async ({
    page,
  }) => {
    await setupMockEnvironment(page, { seedConfig: true });
    await page.goto("/");

    await seedDatabase(page, {
      sessions: [
        {
          id: "sess-del",
          createdAt: "2026-01-01T10:00:00.000Z",
          title: "Session To Delete",
        },
      ],
      transcripts: [
        {
          id: "t-del",
          sessionId: "sess-del",
          speakerId: "1",
          text: "Doomed transcript",
          isFinal: true,
          startTimestamp: 0,
          endTimestamp: 500,
          duration: 500,
          language: "en",
        },
      ],
      chatPairs: [
        {
          id: "cp-del",
          sessionId: "sess-del",
          question: "Doomed question",
          answer: "Doomed answer",
          timestamp: "2026-01-01T10:01:00.000Z",
        },
      ],
      audioChunks: [
        {
          sessionId: "sess-del",
          startTimestamp: 0,
          sampleLength: 1600,
        },
      ],
    });
    await page.reload();

    await expect(page.getByText("Session To Delete")).toBeVisible();

    // Select the session first so deleting the active session is tested
    await page.getByText("Session To Delete").click();
    await expect(page.getByText("Doomed", { exact: true })).toBeVisible();

    const row = page
      .locator("div.group", { hasText: "Session To Delete" })
      .first();

    // First dismiss confirmation -> session remains
    page.once("dialog", (d) => d.dismiss());
    await row.locator('button[title="Delete session"]').click();
    await expect(page.getByText("Session To Delete")).toBeVisible();

    // Now accept confirmation -> session and related records are deleted
    page.once("dialog", (d) => d.accept());
    await row.locator('button[title="Delete session"]').click();
    await expect(page.getByText("Session To Delete")).toBeHidden();
    await expect(page.getByText("No sessions found")).toBeVisible();

    const counts = await page.evaluate(async () => {
      const req = indexedDB.open("TranscribeeDB", 1);
      const db = await new Promise<IDBDatabase>((res) => {
        req.onsuccess = () => res(req.result);
      });
      const tx = db.transaction(
        ["sessions", "transcripts", "chatPairs", "audioChunks"],
        "readonly",
      );
      const getCount = (store: string) =>
        new Promise<number>((res) => {
          const r = tx.objectStore(store).count();
          r.onsuccess = () => res(r.result);
        });
      const result = {
        sessions: await getCount("sessions"),
        transcripts: await getCount("transcripts"),
        chatPairs: await getCount("chatPairs"),
        audioChunks: await getCount("audioChunks"),
      };
      db.close();
      return result;
    });

    expect(counts).toEqual({
      sessions: 0,
      transcripts: 0,
      chatPairs: 0,
      audioChunks: 0,
    });
  });

  test("blocks creating, switching, or deleting active session while recording is active", async ({
    page,
  }) => {
    await setupMockEnvironment(page, { seedConfig: true });
    await page.goto("/");

    await seedDatabase(page, {
      sessions: [
        {
          id: "sess-1",
          createdAt: "2026-01-01T10:00:00.000Z",
          title: "Other Session",
        },
        {
          id: "sess-2",
          createdAt: "2026-01-02T10:00:00.000Z",
          title: "Active Session",
        },
      ],
    });
    await page.reload();

    await page.getByText("Active Session").click();
    await page.getByRole("button", { name: /🎙️ Start Recording/i }).click();
    await expect(
      page.getByRole("button", { name: /⏹️ Stop Recording/i }),
    ).toBeVisible();

    // 1. "+ New Session" button is disabled while recording
    await expect(
      page.getByRole("button", { name: "+ New Session" }),
    ).toBeDisabled();

    const alerts: string[] = [];
    page.on("dialog", async (dialog) => {
      alerts.push(dialog.message());
      await dialog.accept();
    });

    // 2. Try switching to another session while recording
    await page.getByText("Other Session").click();

    // 3. Try deleting the active session while recording
    const activeRow = page
      .locator("div.group", { hasText: "Active Session" })
      .first();
    await activeRow.locator('button[title="Delete session"]').click();

    expect(alerts).toEqual([
      "Please stop recording before switching sessions.",
      "Cannot delete active session while recording.",
    ]);

    await page.getByRole("button", { name: /⏹️ Stop Recording/i }).click();
  });
});
