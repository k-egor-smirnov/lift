import { createHmac, randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const homeserver = "http://127.0.0.1:8008";
const registrationSecret = "lift-primary-registration-dev-only";

const registerUser = async (username: string, password: string) => {
  const nonceResponse = await fetch(`${homeserver}/_synapse/admin/v1/register`);
  expect(nonceResponse.ok).toBe(true);
  const { nonce } = (await nonceResponse.json()) as { nonce: string };
  const mac = createHmac("sha1", registrationSecret)
    .update([nonce, username, password, "notadmin"].join("\0"))
    .digest("hex");
  const response = await fetch(`${homeserver}/_synapse/admin/v1/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nonce, username, password, admin: false, mac }),
  });
  expect(response.ok, await response.text()).toBe(true);
};

const enterCredentials = async (
  page: Page,
  username: string,
  password: string
) => {
  await page.getByLabel("Matrix-пользователь").fill(username);
  await page.getByLabel("Matrix-пароль").fill(password);
};

const setupFirstDevice = async (
  page: Page,
  username: string,
  password: string
) => {
  await page.goto("/");
  await enterCredentials(page, username, password);
  await page.getByRole("button", { name: "Первое устройство" }).click();
  await expect(
    page.getByRole("region", { name: "Подтверждение ключа восстановления" })
  ).toBeVisible();
  const recoveryKey = (await page.locator("code").textContent())?.trim();
  expect(recoveryKey).toBeTruthy();
  const groupLabel = await page
    .getByLabel("Проверочная группа")
    .evaluate((element) => element.parentElement?.textContent ?? "");
  const groupNumber = Number(groupLabel.match(/№\s*(\d+)/)?.[1]);
  expect(groupNumber).toBeGreaterThan(0);
  const group = recoveryKey!.split(/\s+/)[groupNumber - 1];
  expect(group).toBeTruthy();
  await page.getByLabel("Проверочная группа").fill(group!);
  await page.getByRole("button", { name: "Ключ сохранён" }).click();
  await expect(
    page.getByText(
      "Matrix E2EE-устройство готово и ключ восстановления подтверждён."
    )
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Создать защищённое пространство" })
    .click();
  await expect(page.getByTestId("sidebar-today")).toBeVisible();
  return recoveryKey!;
};

const waitForBootstrappedWorkspace = async (page: Page) => {
  let diagnostic: unknown = null;
  try {
    await expect
      .poll(
        async () => {
          diagnostic = await page.evaluate(async () => {
            const request = indexedDB.open("LiftSecureDatabase");
            return new Promise<{ active: number; inbox: unknown[] }>(
              (resolve, reject) => {
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                  const transaction = request.result.transaction(
                    ["syncTargets", "syncInbox"],
                    "readonly"
                  );
                  const targets = transaction
                    .objectStore("syncTargets")
                    .getAll();
                  const inbox = transaction.objectStore("syncInbox").getAll();
                  transaction.onerror = () => reject(transaction.error);
                  transaction.oncomplete = () =>
                    resolve({
                      active: targets.result.filter(
                        (row) => row.mode === "active" && row.state === "active"
                      ).length,
                      inbox: inbox.result.map((row) => ({
                        state: row.state,
                        error: row.lastError,
                      })),
                    });
                };
              }
            );
          });
          return (diagnostic as { active: number }).active;
        },
        { timeout: 90_000 }
      )
      .toBeGreaterThan(0);
  } catch (error) {
    throw new Error(
      `Workspace bootstrap failed: ${JSON.stringify(diagnostic)}`,
      { cause: error }
    );
  }
};

const recoverSecondDevice = async (
  page: Page,
  username: string,
  password: string,
  recoveryKey: string
) => {
  await page.goto("/");
  await enterCredentials(page, username, password);
  await page.getByRole("button", { name: "Восстановить устройство" }).click();
  await expect(
    page.getByRole("region", { name: "Восстановление Matrix-устройства" })
  ).toBeVisible();
  await page.getByLabel("Ключ восстановления").fill(recoveryKey);
  await page.getByRole("button", { name: "Восстановить ключи" }).click();
  await expect(
    page.getByText(
      "Matrix E2EE-устройство готово и ключ восстановления подтверждён."
    )
  ).toBeVisible();
  await waitForBootstrappedWorkspace(page);
  await page.reload();
  await expect(page.getByTestId("sidebar-today")).toBeVisible();
};

const openInbox = async (page: Page) => {
  await page.getByTestId("sidebar-inbox").click();
  await expect(
    page.getByRole("heading", { name: "Входящие", level: 1 })
  ).toBeVisible();
};

const createInboxTask = async (page: Page, title: string) => {
  const input = page.locator("main input[type='text']");
  await expect(input).toHaveCount(1);
  await input.fill(title);
  await input.press("Enter");
  await expect(page.getByText(title, { exact: true })).toBeVisible();
};

const syncDiagnostic = (page: Page) =>
  page.evaluate(async () => {
    const request = indexedDB.open("LiftSecureDatabase");
    return new Promise<unknown>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transaction = request.result.transaction(
          [
            "syncOutbox",
            "syncInbox",
            "taskProjections",
            "workspaceChanges",
            "matrixEventIndex",
            "workspaceSnapshots",
          ],
          "readonly"
        );
        const outbox = transaction.objectStore("syncOutbox").getAll();
        const inbox = transaction.objectStore("syncInbox").getAll();
        const tasks = transaction.objectStore("taskProjections").getAll();
        const changes = transaction.objectStore("workspaceChanges").getAll();
        const events = transaction.objectStore("matrixEventIndex").getAll();
        const snapshots = transaction
          .objectStore("workspaceSnapshots")
          .getAll();
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () =>
          resolve({
            outbox: outbox.result.map((row) => ({
              state: row.state,
              error: row.lastError,
              attempts: row.attemptCount,
            })),
            inbox: inbox.result.map((row) => ({
              state: row.state,
              error: row.lastError,
            })),
            tasks: tasks.result.map((row) => row.title).sort(),
            changes: changes.result.map((row) => ({
              hash: row.changeHash,
              deps: row.dependencies,
              origin: row.origin,
            })),
            events: events.result.map((row) => ({
              eventId: row.eventId,
              hash: row.changeHash,
            })),
            heads: snapshots.result.map((row) => row.heads),
          });
      };
    });
  });

test("two independent E2EE devices converge after realtime, offline writes and restart", async ({
  browser,
}) => {
  const suffix = randomBytes(5).toString("hex");
  const username = `e2e_${suffix}`;
  const password = `Lift-e2e-${suffix}-strong`;
  await registerUser(username, password);

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const recoveryKey = await setupFirstDevice(pageA, username, password);
  await openInbox(pageA);
  await createInboxTask(pageA, `seed-${suffix}`);
  await recoverSecondDevice(pageB, username, password, recoveryKey);
  await openInbox(pageB);
  await expect(
    pageB.getByText(`seed-${suffix}`, { exact: true })
  ).toBeVisible();

  await createInboxTask(pageA, `realtime-a-${suffix}`);
  await expect(
    pageB.getByText(`realtime-a-${suffix}`, { exact: true })
  ).toBeVisible();
  await createInboxTask(pageB, `realtime-b-${suffix}`);
  await expect(
    pageA.getByText(`realtime-b-${suffix}`, { exact: true })
  ).toBeVisible();

  await contextA.setOffline(true);
  await contextB.setOffline(true);
  await expect(pageA.getByTestId("connection-state")).toContainText("Оффлайн");
  await expect(pageB.getByTestId("connection-state")).toContainText("Оффлайн");
  await createInboxTask(pageA, `offline-a-${suffix}`);
  await createInboxTask(pageB, `offline-b-${suffix}`);

  const offlineDurability = await pageA.evaluate(async () => {
    const request = indexedDB.open("LiftSecureDatabase");
    return new Promise<{ snapshots: number; pendingOutbox: number }>(
      (resolve, reject) => {
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const transaction = request.result.transaction(
            ["workspaceSnapshots", "syncOutbox"],
            "readonly"
          );
          const snapshots = transaction
            .objectStore("workspaceSnapshots")
            .count();
          const outbox = transaction.objectStore("syncOutbox").getAll();
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () =>
            resolve({
              snapshots: snapshots.result,
              pendingOutbox: outbox.result.filter(
                (row) => row.state !== "acknowledged"
              ).length,
            });
        };
      }
    );
  });
  expect(offlineDurability.snapshots).toBeGreaterThan(0);
  expect(offlineDurability.pendingOutbox).toBeGreaterThan(0);

  await contextA.setOffline(false);
  await pageA.reload();
  await openInbox(pageA);
  await expect(
    pageA.getByText(`offline-a-${suffix}`, { exact: true })
  ).toBeVisible();
  await contextB.setOffline(false);

  try {
    await expect(
      pageA.getByText(`offline-b-${suffix}`, { exact: true })
    ).toBeVisible();
    await expect(
      pageB.getByText(`offline-a-${suffix}`, { exact: true })
    ).toBeVisible();
  } catch (error) {
    throw new Error(
      `Offline convergence failed: ${JSON.stringify({ a: await syncDiagnostic(pageA), b: await syncDiagnostic(pageB) })}`,
      { cause: error }
    );
  }

  const expectedTitles = [
    `seed-${suffix}`,
    `realtime-a-${suffix}`,
    `realtime-b-${suffix}`,
    `offline-a-${suffix}`,
    `offline-b-${suffix}`,
  ].sort();
  const readTitles = (page: Page) =>
    page
      .locator("[data-testid='task-list'] h3")
      .allTextContents()
      .then((values) => values.sort());
  await expect.poll(() => readTitles(pageA)).toEqual(expectedTitles);
  await expect.poll(() => readTitles(pageB)).toEqual(expectedTitles);

  await expect
    .poll(() =>
      pageA.evaluate(async () => {
        const request = indexedDB.open("LiftSecureDatabase");
        return new Promise<number>((resolve, reject) => {
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const transaction = request.result.transaction(
              "syncOutbox",
              "readonly"
            );
            const rows = transaction.objectStore("syncOutbox").getAll();
            rows.onerror = () => reject(rows.error);
            rows.onsuccess = () =>
              resolve(
                rows.result.filter((row) => row.state !== "acknowledged").length
              );
          };
        });
      })
    )
    .toBe(0);

  await contextA.close();
  await contextB.close();
});
