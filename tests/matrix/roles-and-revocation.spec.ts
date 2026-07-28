import { createHmac, randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const homeserver = "http://127.0.0.1:8008";
const serverName = "primary.localhost";
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
  await page.getByLabel("Matrix-пароль", { exact: true }).fill(password);
};

const setupAccount = async (
  page: Page,
  username: string,
  password: string,
  createWorkspace: boolean
) => {
  await page.goto("/");
  await enterCredentials(page, username, password);
  await page.getByRole("button", { name: "Первое устройство" }).click();
  const confirmation = page.getByRole("region", {
    name: "Подтверждение ключа восстановления",
  });
  await expect(confirmation).toBeVisible();
  const recoveryKey = (
    await confirmation.locator("code").textContent()
  )?.trim();
  expect(recoveryKey).toBeTruthy();
  const groupLabel = await confirmation
    .getByLabel("Проверочная группа")
    .evaluate((element) => element.parentElement?.textContent ?? "");
  const groupNumber = Number(groupLabel.match(/№\s*(\d+)/)?.[1]);
  const group = recoveryKey!.split(/\s+/)[groupNumber - 1];
  expect(group).toBeTruthy();
  await confirmation.getByLabel("Проверочная группа").fill(group!);
  await confirmation.getByRole("button", { name: "Ключ сохранён" }).click();
  await expect(
    page.getByText(
      "Matrix E2EE-устройство готово и ключ восстановления подтверждён."
    )
  ).toBeVisible();
  if (createWorkspace) {
    await page
      .getByRole("button", { name: "Создать защищённое пространство" })
      .click();
    await expect(page.getByTestId("sidebar-today")).toBeVisible();
  } else {
    await expect(
      page.getByRole("button", { name: "Создать защищённое пространство" })
    ).toBeVisible();
  }
  return recoveryKey!;
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

const inviteMember = async (
  owner: Page,
  matrixUserId: string,
  role: "EDITOR" | "VIEWER"
) => {
  await owner.getByTestId("sidebar-settings").click();
  const input = owner.getByLabel("Matrix ID нового участника");
  await input.fill(matrixUserId);
  await input.locator("..").locator("select").selectOption(role);
  await owner.getByRole("button", { name: "Пригласить" }).click();
  await expect(
    owner.getByText("Права обновлены, ACL и Matrix power levels согласованы")
  ).toBeVisible();
};

const workspaceChangeCount = (page: Page) =>
  page.evaluate(async () => {
    const request = indexedDB.open("LiftSecureDatabase");
    return new Promise<number>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const count = request.result
          .transaction("workspaceChanges", "readonly")
          .objectStore("workspaceChanges")
          .count();
        count.onerror = () => reject(count.error);
        count.onsuccess = () => resolve(count.result);
      };
    });
  });

const workspaceTargetAccess = (page: Page) =>
  page.evaluate(async () => {
    const request = indexedDB.open("LiftSecureDatabase");
    return new Promise<string>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const all = request.result
          .transaction("syncTargets", "readonly")
          .objectStore("syncTargets")
          .getAll();
        all.onerror = () => reject(all.error);
        all.onsuccess = () => {
          const target = all.result[0];
          resolve(
            target === undefined ? "missing" : `${target.mode}:${target.state}`
          );
        };
      };
    });
  });

const workspaceBootstrapDiagnostic = (page: Page) =>
  page.evaluate(async () => {
    const request = indexedDB.open("LiftSecureDatabase");
    return new Promise<unknown>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transaction = request.result.transaction(
          ["syncInbox", "syncTargets", "aclCheckpoints", "workspaceSnapshots"],
          "readonly"
        );
        const inbox = transaction.objectStore("syncInbox").getAll();
        const targets = transaction.objectStore("syncTargets").getAll();
        const acl = transaction.objectStore("aclCheckpoints").getAll();
        const snapshots = transaction
          .objectStore("workspaceSnapshots")
          .getAll();
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () =>
          resolve({
            inbox: inbox.result.map((row) => ({
              eventId: row.eventId,
              state: row.state,
              error: row.lastError,
            })),
            targets: targets.result.map((row) => ({
              roomId: row.roomId,
              mode: row.mode,
              state: row.state,
            })),
            acl: acl.result.map((row) => ({
              epoch: row.authEpoch,
              hash: row.hash,
            })),
            snapshots: snapshots.result.map((row) => ({
              workspaceId: row.workspaceId,
              heads: row.heads,
            })),
          });
      };
    });
  });

test("Owner invitations bootstrap independent Editor and Viewer devices while Viewer remains read-only", async ({
  browser,
}) => {
  const suffix = randomBytes(5).toString("hex");
  const ownerName = `owner_${suffix}`;
  const editorName = `editor_${suffix}`;
  const viewerName = `viewer_${suffix}`;
  const ownerPassword = `Lift-owner-${suffix}-strong`;
  const editorPassword = `Lift-editor-${suffix}-strong`;
  const viewerPassword = `Lift-viewer-${suffix}-strong`;
  await Promise.all([
    registerUser(ownerName, ownerPassword),
    registerUser(editorName, editorPassword),
    registerUser(viewerName, viewerPassword),
  ]);

  const ownerContext = await browser.newContext();
  const editorContext = await browser.newContext();
  const viewerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const editor = await editorContext.newPage();
  const viewer = await viewerContext.newPage();
  try {
    await setupAccount(owner, ownerName, ownerPassword, true);
    await setupAccount(editor, editorName, editorPassword, false);
    await setupAccount(viewer, viewerName, viewerPassword, false);
    await expect(
      owner.getByRole("dialog", { name: "Подтверждение Matrix-устройства" })
    ).toHaveCount(0);
    await openInbox(owner);
    const seed = `role-seed-${suffix}`;
    await createInboxTask(owner, seed);

    await inviteMember(owner, `@${editorName}:${serverName}`, "EDITOR");
    try {
      await expect(editor.getByTestId("sidebar-inbox")).toBeVisible();
    } catch (error) {
      throw new Error(
        `Editor bootstrap failed: ${JSON.stringify(await workspaceBootstrapDiagnostic(editor))}`,
        { cause: error }
      );
    }
    await openInbox(editor);
    try {
      await expect(editor.getByText(seed, { exact: true })).toBeVisible();
    } catch (error) {
      throw new Error(
        `Editor history restore failed: ${JSON.stringify(await workspaceBootstrapDiagnostic(editor))}`,
        { cause: error }
      );
    }
    const editorTask = `editor-write-${suffix}`;
    await createInboxTask(editor, editorTask);
    await openInbox(owner);
    await expect(owner.getByText(editorTask, { exact: true })).toBeVisible();

    await inviteMember(owner, `@${viewerName}:${serverName}`, "VIEWER");
    await expect(viewer.getByTestId("sidebar-inbox")).toBeVisible();
    await openInbox(viewer);
    try {
      await expect(viewer.getByText(seed, { exact: true })).toBeVisible();
    } catch (error) {
      throw new Error(
        `Viewer history restore failed: ${JSON.stringify(await workspaceBootstrapDiagnostic(viewer))}`,
        { cause: error }
      );
    }
    await expect(viewer.getByText(editorTask, { exact: true })).toBeVisible();
    const changesBefore = await workspaceChangeCount(viewer);
    const forbidden = `viewer-write-${suffix}`;
    const input = viewer.locator("main input[type='text']");
    await input.fill(forbidden);
    await input.press("Enter");
    await expect(
      viewer.getByText("Workspace is read-only for this Matrix identity")
    ).toBeVisible();
    await expect(viewer.getByText(forbidden, { exact: true })).toHaveCount(0);
    await expect.poll(() => workspaceChangeCount(viewer)).toBe(changesBefore);
    await openInbox(owner);
    await expect(owner.getByText(forbidden, { exact: true })).toHaveCount(0);

    await editor.getByTestId("sidebar-settings").click();
    await expect(editor.getByLabel("Matrix ID нового участника")).toHaveCount(
      0
    );
    await owner.getByTestId("sidebar-settings").click();
    await expect(
      owner.getByRole("button", { name: "Подтвердить другое устройство" })
    ).toHaveCount(0);
    const editorUserId = `@${editorName}:${serverName}`;
    await owner
      .getByText(editorUserId, { exact: true })
      .locator("..")
      .getByRole("button", { name: "Удалить" })
      .click();
    await expect(
      owner.getByText("Права обновлены, ACL и Matrix power levels согласованы")
    ).toBeVisible();
    await expect
      .poll(() => workspaceTargetAccess(editor))
      .toBe("read-only:paused");

    await openInbox(editor);
    const revokedWrite = `revoked-editor-write-${suffix}`;
    await editor.locator("main input[type='text']").fill(revokedWrite);
    await editor.locator("main input[type='text']").press("Enter");
    await expect(
      editor.getByText("Matrix workspace membership is revoked")
    ).toBeVisible();
    await expect(editor.getByText(revokedWrite, { exact: true })).toHaveCount(
      0
    );
  } finally {
    await ownerContext.close();
    await editorContext.close();
    await viewerContext.close();
  }
});
