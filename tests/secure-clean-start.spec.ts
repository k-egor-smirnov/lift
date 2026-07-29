import { expect, test } from "@playwright/test";
import { openInbox, startOfflineTestApp } from "./helpers/secure-test-app";

test("starts from the secure database and leaves legacy data untouched", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const request = indexedDB.open("TodoDatabase", 1);
    await new Promise<void>((resolve, reject) => {
      request.onupgradeneeded = () =>
        request.result.createObjectStore("tasks", { keyPath: "id" });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transaction = request.result.transaction("tasks", "readwrite");
        transaction
          .objectStore("tasks")
          .put({ id: "legacy", title: "must stay invisible" });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });

  await page.reload();

  await expect(page.getByText("must stay invisible")).toHaveCount(0);
  await expect(page.getByTestId("matrix-setup-wizard")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await indexedDB.databases())
          .map((database) => database.name)
          .filter((name): name is string => name !== undefined)
          .sort()
      )
    )
    .toEqual(["LiftSecureDatabase", "TodoDatabase"]);
});

test("persists immediate local CRUD across a reload", async ({ page }) => {
  await startOfflineTestApp(page);
  await page.evaluate(async () => {
    const request = indexedDB.open("LiftSecureDatabase");
    await new Promise<void>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const read = database
          .transaction("workspaceSnapshots", "readonly")
          .objectStore("workspaceSnapshots")
          .getAll();
        read.onerror = () => reject(read.error);
        read.onsuccess = () => {
          const workspaceId = read.result[0]?.workspaceId;
          if (typeof workspaceId !== "string") {
            reject(new Error("Missing workspace snapshot"));
            return;
          }
          const transaction = database.transaction("syncTargets", "readwrite");
          transaction.objectStore("syncTargets").put({
            id: "offline-test-target",
            workspaceId,
            serverProfileId: "offline-test-profile",
            roomId: "!offline:test.invalid",
            mode: "active",
            state: "active",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        };
      };
    });
  });
  await page.getByTestId("sidebar-inbox").click();
  await page.getByPlaceholder("Добавить задачу...").fill("durable-local-task");
  await page.getByPlaceholder("Добавить задачу...").press("Enter");
  await expect(page.getByText("durable-local-task")).toBeVisible();

  await page.reload();
  await openInbox(page);

  await expect(page.getByText("durable-local-task")).toBeVisible();
  const durableRows = await page.evaluate(async () => {
    const request = indexedDB.open("LiftSecureDatabase");
    return new Promise<{ changes: number; outbox: number }>(
      (resolve, reject) => {
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const transaction = request.result.transaction(
            ["workspaceChanges", "syncOutbox"],
            "readonly"
          );
          const changes = transaction.objectStore("workspaceChanges").count();
          const outbox = transaction.objectStore("syncOutbox").count();
          transaction.oncomplete = () =>
            resolve({ changes: changes.result, outbox: outbox.result });
          transaction.onerror = () => reject(transaction.error);
        };
      }
    );
  });
  expect(durableRows.changes).toBeGreaterThan(0);
  expect(durableRows.outbox).toBeGreaterThan(0);
});

test("accepts local changes while the browser network is offline", async ({
  context,
  page,
}) => {
  await startOfflineTestApp(page);
  await context.setOffline(true);
  await expect(page.getByTestId("connection-state")).toContainText("Оффлайн");

  await page.getByTestId("sidebar-inbox").click();
  await page.getByPlaceholder("Добавить задачу...").fill("made-offline");
  await page.getByPlaceholder("Добавить задачу...").press("Enter");

  await expect(page.getByText("made-offline")).toBeVisible();
});

test("creates a Today task atomically and keeps it selected after reload", async ({
  page,
}) => {
  await startOfflineTestApp(page);
  const input = page.getByPlaceholder("Добавить задачу...");
  await input.fill("atomic-today-task");
  await input.press("Enter");

  await expect(
    page.getByText("atomic-today-task", { exact: true })
  ).toBeVisible();
  await expect(page.getByText(/не добавлена в Сегодня/)).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText("atomic-today-task", { exact: true })
  ).toBeVisible();
});

test("uses the dedicated mobile Today view and mobile task input", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const setup = page.getByTestId("matrix-setup-wizard");
  await expect(setup).toBeVisible();
  await page.getByRole("button", { name: "Начать офлайн" }).click();

  await expect(
    page.getByRole("button", { name: "Открыть меню" })
  ).toBeVisible();
  const input = page.getByPlaceholder("Добавить задачу...");
  await expect(input).toBeVisible();
  await input.fill("mobile-today-task");
  await input.press("Enter");
  await expect(
    page.getByText("mobile-today-task", { exact: true })
  ).toBeVisible();
});
