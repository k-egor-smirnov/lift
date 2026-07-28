import { createHmac, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test, type Page } from "@playwright/test";

const homeserver = "http://127.0.0.1:8008";
const registrationSecret = "lift-primary-registration-dev-only";
const execFileAsync = promisify(execFile);
const compose = async (...args: string[]): Promise<string> => {
  const { stdout } = await execFileAsync(
    "docker",
    ["compose", "-f", "infra/matrix/docker-compose.yml", ...args],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }
  );
  return String(stdout);
};
const startPrimaryMatrix = () =>
  compose("up", "-d", "--wait", "primary-db", "primary-synapse");
const stopPrimaryMatrix = () =>
  compose("stop", "primary-synapse", "primary-db");
const matrixIsHealthy = async (): Promise<boolean> => {
  try {
    return (await fetch(`${homeserver}/_matrix/client/versions`)).ok;
  } catch {
    return false;
  }
};

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
  await page.getByLabel("Matrix-пароль", { exact: true }).fill(password);
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
  await page.getByRole("button", { name: "Восстановить", exact: true }).click();
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

const editTaskNote = async (page: Page, title: string, note: string) => {
  const card = page
    .locator('[data-testid="task-card"]')
    .filter({ hasText: title });
  await card.getByRole("toolbar").getByRole("button").last().click();
  await page.getByRole("menuitem").first().click();
  const dialog = page.getByRole("dialog", { name: "Редактирование задачи" });
  await dialog.getByLabel("Заметка").fill(note);
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(dialog).toHaveCount(0);
};

const readTaskNote = async (page: Page, title: string): Promise<string> => {
  const card = page
    .locator('[data-testid="task-card"]')
    .filter({ hasText: title });
  await card.getByRole("toolbar").getByRole("button").last().click();
  await page.getByRole("menuitem").first().click();
  const dialog = page.getByRole("dialog", { name: "Редактирование задачи" });
  const note = await dialog.getByLabel("Заметка").inputValue();
  await dialog.getByRole("button", { name: "Отмена" }).click();
  return note;
};

const activeMatrixRoomId = (page: Page) =>
  page.evaluate(async () => {
    const request = indexedDB.open("LiftSecureDatabase");
    return new Promise<string>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const rows = request.result
          .transaction("syncTargets", "readonly")
          .objectStore("syncTargets")
          .getAll();
        rows.onerror = () => reject(rows.error);
        rows.onsuccess = () => {
          const active = rows.result.find(
            (row) => row.mode === "active" && row.state === "active"
          );
          if (active === undefined)
            reject(new Error("Active Matrix room is missing"));
          else resolve(String(active.roomId));
        };
      };
    });
  });

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

const outboxChangeHashes = (page: Page) =>
  page.evaluate(async () => {
    const request = indexedDB.open("LiftSecureDatabase");
    return new Promise<string[]>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const rows = request.result
          .transaction("syncOutbox", "readonly")
          .objectStore("syncOutbox")
          .getAll();
        rows.onerror = () => reject(rows.error);
        rows.onsuccess = () =>
          resolve(rows.result.map((row) => String(row.changeHash)).sort());
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
  const plaintextWorkspaceRequests: string[] = [];
  for (const page of [pageA, pageB]) {
    page.on("request", (request) => {
      if (
        /\/send\/dev\.lift\.(?:crdt|acl)\./.test(
          decodeURIComponent(request.url())
        )
      ) {
        plaintextWorkspaceRequests.push(request.url());
      }
    });
  }

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

  const hashesBeforeLostAck = new Set(await outboxChangeHashes(pageA));
  let droppedAcknowledgement = false;
  await pageA.route(
    "**/_matrix/client/**/send/m.room.encrypted/**",
    async (route) => {
      await route.fetch();
      droppedAcknowledgement = true;
      await route.abort("failed");
    },
    { times: 1 }
  );
  const lostAckTitle = `lost-ack-${suffix}`;
  await createInboxTask(pageA, lostAckTitle);
  await expect.poll(() => droppedAcknowledgement).toBe(true);
  await expect(pageB.getByText(lostAckTitle, { exact: true })).toBeVisible();
  const lostAckHash = (await outboxChangeHashes(pageA)).find(
    (hash) => !hashesBeforeLostAck.has(hash)
  );
  expect(lostAckHash).toBeTruthy();
  await expect
    .poll(() =>
      pageA.evaluate(async (changeHash) => {
        const request = indexedDB.open("LiftSecureDatabase");
        return new Promise<unknown>((resolve, reject) => {
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const rows = request.result
              .transaction("syncOutbox", "readonly")
              .objectStore("syncOutbox")
              .index("changeHash")
              .getAll(changeHash);
            rows.onerror = () => reject(rows.error);
            rows.onsuccess = () =>
              resolve(
                rows.result.map((row) => ({
                  state: row.state,
                  eventIds: row.matrixEventIds,
                }))
              );
          };
        });
      }, lostAckHash!)
    )
    .toEqual([{ state: "acknowledged", eventIds: expect.any(Array) }]);
  await expect
    .poll(() =>
      pageB.evaluate(
        async ({ changeHash, title }) => {
          const request = indexedDB.open("LiftSecureDatabase");
          return new Promise<{ events: number; tasks: number }>(
            (resolve, reject) => {
              request.onerror = () => reject(request.error);
              request.onsuccess = () => {
                const transaction = request.result.transaction(
                  ["matrixEventIndex", "taskProjections"],
                  "readonly"
                );
                const events = transaction
                  .objectStore("matrixEventIndex")
                  .index("[workspaceId+changeHash]")
                  .openCursor();
                const tasks = transaction
                  .objectStore("taskProjections")
                  .getAll();
                let matchingEvents = 0;
                events.onerror = () => reject(events.error);
                events.onsuccess = () => {
                  const cursor = events.result;
                  if (cursor === null) return;
                  if (cursor.value.changeHash === changeHash)
                    matchingEvents += 1;
                  cursor.continue();
                };
                transaction.onerror = () => reject(transaction.error);
                transaction.oncomplete = () =>
                  resolve({
                    events: matchingEvents,
                    tasks: tasks.result.filter((row) => row.title === title)
                      .length,
                  });
              };
            }
          );
        },
        { changeHash: lostAckHash!, title: lostAckTitle }
      )
    )
    .toEqual({ events: 1, tasks: 1 });

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
    lostAckTitle,
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
  expect(plaintextWorkspaceRequests).toEqual([]);

  await contextA.close();
  await contextB.close();
});

test("an existing TODO workspace survives Settings logout, blocks destructive first-device login and recovers", async ({
  browser,
}) => {
  const suffix = randomBytes(5).toString("hex");
  const username = `auth_${suffix}`;
  const password = `Lift-auth-${suffix}-strong`;
  const seedTitle = `auth-seed-${suffix}`;
  const whileSignedOutTitle = `while-signed-out-${suffix}`;
  const afterReloginTitle = `after-relogin-${suffix}`;
  await registerUser(username, password);

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const recoveryKey = await setupFirstDevice(pageA, username, password);
  await openInbox(pageA);
  await createInboxTask(pageA, seedTitle);
  await recoverSecondDevice(pageB, username, password, recoveryKey);
  await openInbox(pageB);
  await expect(pageB.getByText(seedTitle, { exact: true })).toBeVisible();

  await pageA.getByTestId("sidebar-settings").click();
  await expect(
    pageA.getByRole("heading", { name: "Сквозное шифрование" })
  ).toBeVisible();
  await pageA.getByRole("button", { name: "Выйти из Matrix" }).click();
  await expect(pageA.getByLabel("Настройка Matrix")).toBeVisible();
  await expect(pageA.getByText("signed-out", { exact: true })).toBeVisible();

  await openInbox(pageA);
  await expect(pageA.getByText(seedTitle, { exact: true })).toBeVisible();
  await createInboxTask(pageB, whileSignedOutTitle);

  await pageA.getByTestId("sidebar-settings").click();
  await enterCredentials(pageA, username, `${password}-wrong`);
  await pageA
    .getByRole("button", { name: "Восстановить", exact: true })
    .click();
  await expect(
    pageA.locator('[role="alert"][data-error-code="MATRIX_LOGIN_FAILED"]')
  ).toContainText("Не удалось войти");

  await enterCredentials(pageA, username, password);
  await pageA.getByRole("button", { name: "Первое устройство" }).click();
  await expect(
    pageA.locator(
      '[role="alert"][data-error-code="MATRIX_ACCOUNT_RECOVERY_REQUIRED"]'
    )
  ).toContainText("Этот аккаунт уже защищён");
  await expect(
    pageA.getByRole("region", { name: "Подтверждение ключа восстановления" })
  ).toHaveCount(0);

  await enterCredentials(pageA, username, password);
  await pageA
    .getByRole("button", { name: "Восстановить", exact: true })
    .click();
  await expect(
    pageA.getByRole("region", { name: "Восстановление Matrix-устройства" })
  ).toBeVisible();
  await pageA
    .getByLabel("Ключ восстановления")
    .fill("EsTc invalid recovery key");
  await pageA.getByRole("button", { name: "Восстановить ключи" }).click();
  await expect(pageA.getByRole("alert")).toContainText(
    "Ключ восстановления не подошёл"
  );
  await pageA.getByLabel("Ключ восстановления").fill(recoveryKey);
  await pageA.getByRole("button", { name: "Восстановить ключи" }).click();
  await expect(
    pageA.getByRole("button", { name: "Выйти из Matrix" })
  ).toBeVisible();
  await expect(pageA.getByText("ready", { exact: true })).toBeVisible();

  await openInbox(pageA);
  await expect(
    pageA.getByText(whileSignedOutTitle, { exact: true })
  ).toBeVisible();
  await createInboxTask(pageA, afterReloginTitle);
  await expect(
    pageB.getByText(afterReloginTitle, { exact: true })
  ).toBeVisible();

  await contextA.close();
  await contextB.close();
});

test("registration, recovery-key confirmation errors and session resume are handled in the UI", async ({
  page,
}) => {
  const suffix = randomBytes(5).toString("hex");
  const username = `register_${suffix}`;
  const password = `Lift-register-${suffix}-strong`;

  await page.goto("/");
  await page.getByRole("tab", { name: "Регистрация" }).click();
  await page.getByLabel("Matrix-пользователь").fill(username);
  await page.getByLabel("Matrix-пароль", { exact: true }).fill(password);
  await page.getByLabel("Повторите Matrix-пароль").fill(`${password}-wrong`);
  await expect(
    page.getByRole("button", { name: "Создать защищённый аккаунт" })
  ).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("Пароли не совпадают");
  await page.getByLabel("Повторите Matrix-пароль").fill(password);
  await page
    .getByRole("button", { name: "Создать защищённый аккаунт" })
    .click();

  await expect(
    page.getByRole("region", { name: "Подтверждение ключа восстановления" })
  ).toBeVisible();
  const recoveryKey = (await page.locator("code").textContent())?.trim();
  expect(recoveryKey).toBeTruthy();
  const groupLabel = await page
    .getByLabel("Проверочная группа")
    .evaluate((element) => element.parentElement?.textContent ?? "");
  const groupNumber = Number(groupLabel.match(/№\s*(\d+)/)?.[1]);
  const expectedGroup = recoveryKey!.split(/\s+/)[groupNumber - 1];
  expect(expectedGroup).toBeTruthy();

  await page.getByLabel("Проверочная группа").fill("wrong-group");
  await page.getByRole("button", { name: "Ключ сохранён" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Проверочная группа не совпала"
  );
  await page.getByLabel("Проверочная группа").fill(expectedGroup!);
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
  await page.reload();
  await expect(page.getByTestId("sidebar-today")).toBeVisible();
  await page.getByTestId("sidebar-settings").click();
  await expect(page.getByText("ready", { exact: true })).toBeVisible();
});

test("Synapse and PostgreSQL restart during offline edits without losing convergence", async ({
  browser,
}) => {
  const suffix = randomBytes(5).toString("hex");
  const username = `restart_${suffix}`;
  const password = `Lift-restart-${suffix}-strong`;
  const titleA = `server-down-a-${suffix}`;
  const titleB = `server-down-b-${suffix}`;
  await registerUser(username, password);

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  let stackStopped = false;
  try {
    const recoveryKey = await setupFirstDevice(pageA, username, password);
    await recoverSecondDevice(pageB, username, password, recoveryKey);
    await openInbox(pageA);
    await openInbox(pageB);

    await stopPrimaryMatrix();
    stackStopped = true;
    await expect.poll(matrixIsHealthy).toBe(false);
    await createInboxTask(pageA, titleA);
    await createInboxTask(pageB, titleB);

    await startPrimaryMatrix();
    stackStopped = false;
    await expect.poll(matrixIsHealthy, { timeout: 90_000 }).toBe(true);
    await expect(pageA.getByText(titleB, { exact: true })).toBeVisible();
    await expect(pageB.getByText(titleA, { exact: true })).toBeVisible();
    await expect
      .poll(async () => {
        const [left, right] = (await Promise.all([
          syncDiagnostic(pageA),
          syncDiagnostic(pageB),
        ])) as Array<{ tasks: string[] }>;
        return [left.tasks, right.tasks];
      })
      .toEqual([[titleA, titleB].sort(), [titleA, titleB].sort()]);
  } finally {
    if (stackStopped) await startPrimaryMatrix();
    await contextA.close();
    await contextB.close();
  }
});

test("task and note markers are ciphertext in raw Matrix events and the PostgreSQL dump", async ({
  browser,
}) => {
  const suffix = randomBytes(8).toString("hex");
  const username = `cipher_${suffix}`;
  const password = `Lift-cipher-${suffix}-strong`;
  const title = `TITLE_MARKER_${suffix}`;
  const note = `NOTE_MARKER_${suffix}`;
  await registerUser(username, password);

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  try {
    const recoveryKey = await setupFirstDevice(pageA, username, password);
    await recoverSecondDevice(pageB, username, password, recoveryKey);
    await openInbox(pageA);
    await openInbox(pageB);
    await createInboxTask(pageA, title);
    await editTaskNote(pageA, title, note);
    await expect(pageB.getByText(title, { exact: true })).toBeVisible();
    await expect.poll(() => readTaskNote(pageB, title)).toBe(note);

    const roomId = await activeMatrixRoomId(pageA);
    const quotedRoomId = roomId.replaceAll("'", "''");
    const rawEvents = await compose(
      "exec",
      "-T",
      "primary-db",
      "psql",
      "-U",
      "synapse",
      "-d",
      "synapse",
      "-At",
      "-c",
      `SELECT json FROM event_json WHERE room_id='${quotedRoomId}' ORDER BY event_id`
    );
    expect(rawEvents).toContain('"type":"m.room.encrypted"');
    expect(rawEvents).not.toMatch(/"type":"dev\.lift\.crdt\./);
    expect(rawEvents).not.toContain(title);
    expect(rawEvents).not.toContain(note);

    const postgresDump = await compose(
      "exec",
      "-T",
      "primary-db",
      "pg_dump",
      "-U",
      "synapse",
      "-d",
      "synapse",
      "--data-only",
      "--no-owner"
    );
    expect(postgresDump).not.toContain(title);
    expect(postgresDump).not.toContain(note);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
