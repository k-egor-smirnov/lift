import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

type UserRecord = {
  login: string;
  passwordHash: string;
  passwordSalt: string;
  devices: Array<{
    id: string;
    label: string;
    createdAt: string;
    revokedAt: string | null;
  }>;
  webauthnCredentialIds: string[];
};

type RelayUpdate = {
  id: string;
  userId: string;
  payload: string;
  iv: string;
  authTag: string;
  epoch: number;
  createdAt: string;
};

type RelayStore = {
  users: Record<string, UserRecord>;
  sessions: Record<string, { login: string; expiresAt: string }>;
  updates: RelayUpdate[];
  challenges: Record<string, string>;
};

const STORE_PATH = path.resolve(process.cwd(), "server/relay/data/store.json");

async function ensureStore(): Promise<void> {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  try {
    await fs.access(STORE_PATH);
  } catch {
    const initial: RelayStore = {
      users: {},
      sessions: {},
      updates: [],
      challenges: {},
    };
    await fs.writeFile(STORE_PATH, JSON.stringify(initial, null, 2));
  }
}

async function readStore(): Promise<RelayStore> {
  await ensureStore();
  const raw = await fs.readFile(STORE_PATH, "utf8");
  return JSON.parse(raw) as RelayStore;
}

async function writeStore(store: RelayStore): Promise<void> {
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2));
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

function createToken(): string {
  return randomBytes(32).toString("hex");
}

async function parseJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }

  if (chunks.length === 0) return {};

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function authenticate(
  req: IncomingMessage,
  store: RelayStore
): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const session = store.sessions[token];
  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) return null;
  return session.login;
}

const server = createServer(async (req, res) => {
  try {
    const store = await readStore();

    if (req.method === "POST" && req.url === "/auth/register") {
      const body = await parseJson(req);
      if (!body.login || !body.password) {
        sendJson(res, 400, { error: "login and password are required" });
        return;
      }

      if (store.users[body.login]) {
        sendJson(res, 409, { error: "login already exists" });
        return;
      }

      const salt = randomBytes(16).toString("hex");
      store.users[body.login] = {
        login: body.login,
        passwordSalt: salt,
        passwordHash: hashPassword(body.password, salt),
        devices: [],
        webauthnCredentialIds: [],
      };

      await writeStore(store);
      sendJson(res, 201, { ok: true });
      return;
    }

    if (req.method === "POST" && req.url === "/auth/login") {
      const body = await parseJson(req);
      const user = store.users[body.login];
      if (!user) {
        sendJson(res, 401, { error: "invalid credentials" });
        return;
      }

      const inputHash = hashPassword(body.password, user.passwordSalt);
      const valid = timingSafeEqual(
        Buffer.from(inputHash),
        Buffer.from(user.passwordHash)
      );
      if (!valid) {
        sendJson(res, 401, { error: "invalid credentials" });
        return;
      }

      const token = createToken();
      store.sessions[token] = {
        login: user.login,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
      };
      await writeStore(store);

      sendJson(res, 200, { token, userId: user.login });
      return;
    }

    if (req.method === "POST" && req.url === "/auth/webauthn/register/start") {
      const body = await parseJson(req);
      const challenge = randomBytes(24).toString("base64url");
      store.challenges[`register:${body.login}`] = challenge;
      await writeStore(store);
      sendJson(res, 200, { challenge });
      return;
    }

    if (req.method === "POST" && req.url === "/auth/webauthn/register/finish") {
      const body = await parseJson(req);
      const user = store.users[body.login];
      if (!user || !store.challenges[`register:${body.login}`]) {
        sendJson(res, 400, { error: "registration flow not started" });
        return;
      }

      user.webauthnCredentialIds.push(body.credentialId);
      delete store.challenges[`register:${body.login}`];
      await writeStore(store);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && req.url === "/auth/webauthn/login/start") {
      const body = await parseJson(req);
      const user = store.users[body.login];
      if (!user || user.webauthnCredentialIds.length === 0) {
        sendJson(res, 404, { error: "no registered webauthn credentials" });
        return;
      }

      const challenge = randomBytes(24).toString("base64url");
      store.challenges[`login:${body.login}`] = challenge;
      await writeStore(store);
      sendJson(res, 200, {
        challenge,
        allowCredentials: user.webauthnCredentialIds,
      });
      return;
    }

    if (req.method === "POST" && req.url === "/auth/webauthn/login/finish") {
      const body = await parseJson(req);
      const user = store.users[body.login];
      if (!user || !user.webauthnCredentialIds.includes(body.credentialId)) {
        sendJson(res, 401, { error: "invalid webauthn credential" });
        return;
      }

      const token = createToken();
      store.sessions[token] = {
        login: user.login,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
      };
      delete store.challenges[`login:${body.login}`];
      await writeStore(store);
      sendJson(res, 200, { token, userId: user.login });
      return;
    }

    const login = await authenticate(req, store);
    if (!login) {
      sendJson(res, 401, { error: "unauthorized" });
      return;
    }

    if (req.method === "GET" && req.url === "/devices") {
      sendJson(res, 200, { devices: store.users[login].devices });
      return;
    }

    if (req.method === "POST" && req.url === "/devices") {
      const body = await parseJson(req);
      const device = {
        id: body.id ?? randomBytes(12).toString("hex"),
        label: body.label ?? "New device",
        createdAt: new Date().toISOString(),
        revokedAt: null,
      };
      store.users[login].devices.push(device);
      await writeStore(store);
      sendJson(res, 201, { device });
      return;
    }

    if (req.method === "DELETE" && req.url?.startsWith("/devices/")) {
      const id = req.url.split("/").pop() ?? "";
      const target = store.users[login].devices.find(
        (device) => device.id === id
      );
      if (!target) {
        sendJson(res, 404, { error: "device not found" });
        return;
      }

      target.revokedAt = new Date().toISOString();
      await writeStore(store);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && req.url === "/updates") {
      const body = await parseJson(req);
      const update: RelayUpdate = {
        id: body.id ?? randomBytes(12).toString("hex"),
        userId: login,
        payload: body.payload,
        iv: body.iv,
        authTag: body.authTag,
        epoch: body.epoch,
        createdAt: new Date().toISOString(),
      };
      store.updates.push(update);
      await writeStore(store);
      sendJson(res, 201, { updateId: update.id });
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/updates")) {
      const url = new URL(req.url, "http://localhost");
      const since = url.searchParams.get("since");
      const filtered = store.updates.filter((update) => {
        if (update.userId !== login) return false;
        if (!since) return true;
        return update.createdAt > since;
      });

      sendJson(res, 200, { updates: filtered });
      return;
    }

    sendJson(res, 404, { error: "not found" });
  } catch (error) {
    sendJson(res, 500, { error: "relay server error", details: String(error) });
  }
});

const port = Number(process.env.RELAY_PORT ?? 8787);
server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Relay server listening on http://localhost:${port}`);
});
