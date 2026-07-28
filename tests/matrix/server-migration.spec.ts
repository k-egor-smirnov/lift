import { createHmac, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test, type Page } from "@playwright/test";

const primary = "http://127.0.0.1:8008";
const secondary = "http://127.0.0.1:8009";
const execFileAsync = promisify(execFile);

const register = async (
  baseUrl: string,
  secret: string,
  username: string,
  password: string
) => {
  const nonceResponse = await fetch(`${baseUrl}/_synapse/admin/v1/register`);
  expect(nonceResponse.ok).toBe(true);
  const { nonce } = (await nonceResponse.json()) as { nonce: string };
  const mac = createHmac("sha1", secret)
    .update([nonce, username, password, "notadmin"].join("\0"))
    .digest("hex");
  const response = await fetch(`${baseUrl}/_synapse/admin/v1/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nonce, username, password, admin: false, mac }),
  });
  expect(response.ok, await response.text()).toBe(true);
};

const chooseProfile = (page: Page, profileId: string) =>
  page.getByLabel("Matrix-сервер").selectOption(profileId);

const enterCredentials = async (
  page: Page,
  profileId: string,
  username: string,
  password: string
) => {
  await chooseProfile(page, profileId);
  await page.getByLabel("Matrix-пользователь").fill(username);
  await page.getByLabel("Matrix-пароль", { exact: true }).fill(password);
};

const confirmGeneratedRecoveryKey = async (page: Page): Promise<string> => {
  await expect(
    page.getByRole("region", { name: "Подтверждение ключа восстановления" })
  ).toBeVisible();
  const recoveryKey = (await page.locator("code").textContent())?.trim();
  expect(recoveryKey).toBeTruthy();
  const groupLabel = await page
    .getByLabel("Проверочная группа")
    .evaluate((element) => element.parentElement?.textContent ?? "");
  const groupNumber = Number(groupLabel.match(/№\s*(\d+)/)?.[1]);
  const group = recoveryKey!.split(/\s+/)[groupNumber - 1];
  expect(group).toBeTruthy();
  await page.getByLabel("Проверочная группа").fill(group!);
  await page.getByRole("button", { name: "Ключ сохранён" }).click();
  await expect(
    page.getByText(
      "Matrix E2EE-устройство готово и ключ восстановления подтверждён."
    )
  ).toBeVisible();
  return recoveryKey!;
};

const setupSecuredAccount = async (
  page: Page,
  profileId: string,
  username: string,
  password: string,
  createWorkspace: boolean
) => {
  await page.goto("/");
  await enterCredentials(page, profileId, username, password);
  await page.getByRole("button", { name: "Первое устройство" }).click();
  const recoveryKey = await confirmGeneratedRecoveryKey(page);
  if (createWorkspace) {
    await page
      .getByRole("button", { name: "Создать защищённое пространство" })
      .click();
    await expect(page.getByTestId("sidebar-today")).toBeVisible();
  }
  return recoveryKey;
};

const waitForWorkspace = async (page: Page) => {
  let diagnostic: unknown = null;
  try {
    await expect
      .poll(
        async () => {
          diagnostic = await page.evaluate(async () => {
            const request = indexedDB.open("LiftSecureDatabase");
            return new Promise<{
              active: number;
              inbox: Array<{
                eventId: string;
                state: string;
                error: string | null;
              }>;
            }>((resolve, reject) => {
              request.onerror = () => reject(request.error);
              request.onsuccess = () => {
                const transaction = request.result.transaction(
                  ["syncTargets", "syncInbox"],
                  "readonly"
                );
                const targets = transaction.objectStore("syncTargets").getAll();
                const inbox = transaction.objectStore("syncInbox").getAll();
                transaction.onerror = () => reject(transaction.error);
                transaction.oncomplete = () =>
                  resolve({
                    active: targets.result.filter(
                      (row) => row.mode === "active" && row.state === "active"
                    ).length,
                    inbox: inbox.result.map((row) => ({
                      eventId: String(row.eventId),
                      state: String(row.state),
                      error:
                        row.lastError === null ? null : String(row.lastError),
                    })),
                  });
              };
            });
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

const recoverDevice = async (
  page: Page,
  profileId: string,
  username: string,
  password: string,
  recoveryKey: string
) => {
  await page.goto("/");
  await enterCredentials(page, profileId, username, password);
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
  await waitForWorkspace(page);
  await page.reload();
  await expect(page.getByTestId("sidebar-today")).toBeVisible();
};

const openInbox = async (page: Page) => {
  await page.getByTestId("sidebar-inbox").click();
  await expect(
    page.getByRole("heading", { name: "Входящие", level: 1 })
  ).toBeVisible();
};

const createTask = async (page: Page, title: string) => {
  await openInbox(page);
  const input = page.locator("main input[type='text']");
  await input.fill(title);
  await input.press("Enter");
  await expect(page.getByText(title, { exact: true })).toBeVisible();
};

const targets = (page: Page) =>
  page.evaluate(async () => {
    const request = indexedDB.open("LiftSecureDatabase");
    return new Promise<
      Array<{
        serverProfileId: string;
        mode: string;
        state: string;
      }>
    >((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const rows = request.result
          .transaction("syncTargets", "readonly")
          .objectStore("syncTargets")
          .getAll();
        rows.onerror = () => reject(rows.error);
        rows.onsuccess = () =>
          resolve(
            rows.result.map((row) => ({
              serverProfileId: String(row.serverProfileId),
              mode: String(row.mode),
              state: String(row.state),
            }))
          );
      };
    });
  });

const migrationCertificateHash = (page: Page) =>
  page.evaluate(async () => {
    const request = indexedDB.open("LiftSecureDatabase");
    return new Promise<string>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const rows = request.result
          .transaction("migrationCertificates", "readonly")
          .objectStore("migrationCertificates")
          .getAll();
        rows.onerror = () => reject(rows.error);
        rows.onsuccess = () => {
          const hash = rows.result.at(-1)?.hash;
          if (typeof hash !== "string")
            reject(new Error("Migration certificate is missing"));
          else resolve(hash);
        };
      };
    });
  });

const hasIndexedEventHash = (page: Page, hash: string) =>
  page.evaluate(async (expectedHash) => {
    const request = indexedDB.open("LiftSecureDatabase");
    return new Promise<boolean>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const rows = request.result
          .transaction("matrixEventIndex", "readonly")
          .objectStore("matrixEventIndex")
          .getAll();
        rows.onerror = () => reject(rows.error);
        rows.onsuccess = () =>
          resolve(rows.result.some((row) => row.changeHash === expectedHash));
      };
    });
  }, hash);

const compose = (...args: string[]) =>
  execFileAsync(
    "docker",
    ["compose", "-f", "infra/matrix/docker-compose.yml", ...args],
    { cwd: process.cwd(), encoding: "utf8" }
  );

test("migrates exact encrypted state to secondary and keeps source read-only", async ({
  browser,
}) => {
  const suffix = randomBytes(5).toString("hex");
  const username = `migration_${suffix}`;
  const sourcePassword = `Source-${suffix}-strong`;
  const targetPassword = `Target-${suffix}-strong`;
  const beforeTitle = `before-migration-${suffix}`;
  const afterTitle = `after-migration-${suffix}`;
  await register(
    primary,
    "lift-primary-registration-dev-only",
    username,
    sourcePassword
  );
  await register(
    secondary,
    "lift-secondary-registration-dev-only",
    username,
    targetPassword
  );

  const provisionContext = await browser.newContext();
  const sourceContext = await browser.newContext();
  const secondTargetContext = await browser.newContext();
  const provisionPage = await provisionContext.newPage();
  const sourcePage = await sourceContext.newPage();
  const secondTargetPage = await secondTargetContext.newPage();
  let primaryStopped = false;
  try {
    const targetRecoveryKey = await setupSecuredAccount(
      provisionPage,
      "local-secondary",
      username,
      targetPassword,
      false
    );
    await provisionContext.close();
    await setupSecuredAccount(
      sourcePage,
      "local-primary",
      username,
      sourcePassword,
      true
    );
    await createTask(sourcePage, beforeTitle);
    await sourcePage.getByTestId("sidebar-settings").click();
    const migration = sourcePage.getByRole("region", {
      name: "Миграция Matrix-сервера",
    });
    await migration
      .getByLabel("Целевой Matrix-сервер")
      .selectOption("local-secondary");
    await migration.getByLabel("Пользователь secondary").fill(username);
    await migration.getByLabel("Пароль secondary").fill(targetPassword);
    await migration
      .getByLabel("Ключ восстановления secondary")
      .fill(targetRecoveryKey);
    await migration
      .getByLabel(
        `Matrix ID на новом сервере для @${username}:primary.localhost`
      )
      .fill(`@${username}:secondary.localhost`);
    await migration.getByRole("button", { name: "Мигрировать сервер" }).click();
    await expect(migration.getByText(/Миграция подтверждена:/)).toBeVisible({
      timeout: 120_000,
    });

    await expect
      .poll(async () => await targets(sourcePage))
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            serverProfileId: "local-primary",
            mode: "read-only",
            state: "active",
          }),
          expect.objectContaining({
            serverProfileId: "local-secondary",
            mode: "active",
            state: "active",
          }),
        ])
      );
    await expect(
      sourcePage
        .getByText("Пользователь", { exact: true })
        .locator("..")
        .getByText(`@${username}:secondary.localhost`, { exact: true })
    ).toBeVisible();

    await recoverDevice(
      secondTargetPage,
      "local-secondary",
      username,
      targetPassword,
      targetRecoveryKey
    );
    const certificateHash = await migrationCertificateHash(sourcePage);
    await expect
      .poll(() => hasIndexedEventHash(secondTargetPage, certificateHash))
      .toBe(true);
    await openInbox(secondTargetPage);
    await expect(
      secondTargetPage.getByText(beforeTitle, { exact: true })
    ).toBeVisible();

    await compose("stop", "primary-synapse", "primary-db");
    primaryStopped = true;
    await createTask(sourcePage, afterTitle);
    await openInbox(secondTargetPage);
    await expect(
      secondTargetPage.getByText(afterTitle, { exact: true })
    ).toBeVisible();

    await compose(
      "--profile",
      "migration",
      "up",
      "-d",
      "--wait",
      "primary-db",
      "primary-synapse"
    );
    primaryStopped = false;
    expect(await targets(sourcePage)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          serverProfileId: "local-primary",
          mode: "read-only",
        }),
        expect.objectContaining({
          serverProfileId: "local-secondary",
          mode: "active",
        }),
      ])
    );
  } finally {
    if (primaryStopped) {
      await compose(
        "--profile",
        "migration",
        "up",
        "-d",
        "--wait",
        "primary-db",
        "primary-synapse"
      );
    }
    await sourceContext.close();
    await secondTargetContext.close();
    await provisionContext.close().catch(() => undefined);
  }
});
