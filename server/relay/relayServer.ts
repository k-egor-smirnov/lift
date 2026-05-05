import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const MAX_BODY_BYTES = 1024 * 1024;
const WEBAUTHN_ENABLED = process.env.RELAY_ENABLE_WEBAUTHN === "true";

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
  groupId: string;
  sourceDeviceId: string;
  encryptedPayload: string;
  iv: string;
  epoch: number;
  createdAt: string;
};

type RelayStore = {
  users: Record<string, UserRecord>;
  sessions: Record<string, { login: string; expiresAt: string }>;
  updates: RelayUpdate[];
  challenges: Record<string, string>;
};

class OversizeError extends Error {
  constructor() {
    super("Request body too large");
    this.name = "OversizeError";
  }
}

class ValidationError extends Error {
  constructor(message = "Invalid request payload") {
    super(message);
    this.name = "ValidationError";
  }
}

const STORE_PATH = path.resolve(process.cwd(), "server/relay/data/store.json");

let storeQueue: Promise<void> = Promise.resolve();

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
    await writeStoreAtomic(initial);
  }
}

async function readStore(): Promise<RelayStore> {
  await ensureStore();
  const raw = await fs.readFile(STORE_PATH, "utf8");
  return JSON.parse(raw) as RelayStore;
}

async function writeStoreAtomic(store: RelayStore): Promise<void> {
  const tempPath = `${STORE_PATH}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(store, null, 2));
  await fs.rename(tempPath, STORE_PATH);
}

async function updateStore<T>(
  mutator: (store: RelayStore) => Promise<T> | T
): Promise<T> {
  let result!: T;

  storeQueue = storeQueue.then(async () => {
    const store = await readStore();
    result = await mutator(store);
    await writeStoreAtomic(store);
  });

  await storeQueue;
  return result;
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

function createToken(): string {
  return randomBytes(32).toString("hex");
}

async function parseJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;

    if (totalBytes > MAX_BODY_BYTES) {
      throw new OversizeError();
    }

    chunks.push(buffer);
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ValidationError();
  }
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function authenticate(req: IncomingMessage): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;

  const token = auth.slice(7);
  const store = await readStore();
  const session = store.sessions[token];

  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) return null;

  return session.login;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${field} is required`);
  }

  return value;
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/auth/register") {
      const body = await parseJson(req);
      const login = requireString(body.login, "login");
      const password = requireString(body.password, "password");

      const created = await updateStore((store) => {
        if (store.users[login]) {
          return false;
        }

        const salt = randomBytes(16).toString("hex");
        store.users[login] = {
          login,
          passwordSalt: salt,
          passwordHash: hashPassword(password, salt),
          devices: [],
          webauthnCredentialIds: [],
        };
        return true;
      });

      if (!created) {
        sendJson(res, 409, { error: "login already exists", code: "CONFLICT" });
        return;
      }

      sendJson(res, 201, { ok: true });
      return;
    }

    if (req.method === "POST" && req.url === "/auth/login") {
      const body = await parseJson(req);
      const login = requireString(body.login, "login");
      const password = requireString(body.password, "password");

      const store = await readStore();
      const user = store.users[login];
      if (!user) {
        sendJson(res, 401, {
          error: "invalid credentials",
          code: "UNAUTHORIZED",
        });
        return;
      }

      const inputHash = hashPassword(password, user.passwordSalt);
      const valid = timingSafeEqual(
        Buffer.from(inputHash),
        Buffer.from(user.passwordHash)
      );

      if (!valid) {
        sendJson(res, 401, {
          error: "invalid credentials",
          code: "UNAUTHORIZED",
        });
        return;
      }

      const token = createToken();
      await updateStore((draft) => {
        draft.sessions[token] = {
          login: user.login,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
        };
      });

      sendJson(res, 200, { token, userId: user.login });
      return;
    }

    if (req.method === "POST" && req.url === "/auth/webauthn/register/start") {
      if (!WEBAUTHN_ENABLED) {
        sendJson(res, 501, {
          error: "webauthn not implemented",
          code: "NOT_IMPLEMENTED",
        });
        return;
      }

      const body = await parseJson(req);
      const login = requireString(body.login, "login");
      const challenge = randomBytes(24).toString("base64url");
      await updateStore((store) => {
        store.challenges[`register:${login}`] = challenge;
      });
      sendJson(res, 200, { challenge });
      return;
    }

    if (req.method === "POST" && req.url === "/auth/webauthn/register/finish") {
      sendJson(res, 501, {
        error: "webauthn not implemented",
        code: "NOT_IMPLEMENTED",
      });
      return;
    }

    if (req.method === "POST" && req.url === "/auth/webauthn/login/start") {
      if (!WEBAUTHN_ENABLED) {
        sendJson(res, 501, {
          error: "webauthn not implemented",
          code: "NOT_IMPLEMENTED",
        });
        return;
      }

      const body = await parseJson(req);
      const login = requireString(body.login, "login");
      const store = await readStore();
      const user = store.users[login];

      if (!user || user.webauthnCredentialIds.length === 0) {
        sendJson(res, 404, {
          error: "no registered webauthn credentials",
          code: "NOT_FOUND",
        });
        return;
      }

      const challenge = randomBytes(24).toString("base64url");
      await updateStore((draft) => {
        draft.challenges[`login:${login}`] = challenge;
      });

      sendJson(res, 200, {
        challenge,
        allowCredentials: user.webauthnCredentialIds,
      });
      return;
    }

    if (req.method === "POST" && req.url === "/auth/webauthn/login/finish") {
      sendJson(res, 501, {
        error: "webauthn not implemented",
        code: "NOT_IMPLEMENTED",
      });
      return;
    }

    const login = await authenticate(req);
    if (!login) {
      sendJson(res, 401, { error: "unauthorized", code: "UNAUTHORIZED" });
      return;
    }

    if (req.method === "GET" && req.url === "/devices") {
      const store = await readStore();
      sendJson(res, 200, { devices: store.users[login]?.devices ?? [] });
      return;
    }

    if (req.method === "POST" && req.url === "/devices") {
      const body = await parseJson(req);
      const device = {
        id:
          typeof body.id === "string"
            ? body.id
            : randomBytes(12).toString("hex"),
        label: typeof body.label === "string" ? body.label : "New device",
        createdAt: new Date().toISOString(),
        revokedAt: null,
      };

      await updateStore((store) => {
        if (!store.users[login]) {
          throw new ValidationError("user not found");
        }
        store.users[login].devices.push(device);
      });

      sendJson(res, 201, { device });
      return;
    }

    if (req.method === "DELETE" && req.url?.startsWith("/devices/")) {
      const id = req.url.split("/").pop() ?? "";
      const revoked = await updateStore((store) => {
        const target = store.users[login]?.devices.find(
          (device) => device.id === id
        );
        if (!target) return false;
        target.revokedAt = new Date().toISOString();
        return true;
      });

      if (!revoked) {
        sendJson(res, 404, { error: "device not found", code: "NOT_FOUND" });
        return;
      }

      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && req.url === "/updates") {
      const body = await parseJson(req);
      const update: RelayUpdate = {
        id:
          typeof body.id === "string"
            ? body.id
            : randomBytes(12).toString("hex"),
        userId: login,
        groupId: requireString(body.groupId, "groupId"),
        sourceDeviceId: requireString(body.sourceDeviceId, "sourceDeviceId"),
        encryptedPayload: requireString(
          body.encryptedPayload,
          "encryptedPayload"
        ),
        iv: requireString(body.iv, "iv"),
        epoch: Number(body.epoch),
        createdAt: new Date().toISOString(),
      };

      if (Number.isNaN(update.epoch)) {
        throw new ValidationError("epoch must be a number");
      }

      await updateStore((store) => {
        store.updates.push(update);
      });

      sendJson(res, 201, { updateId: update.id });
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/updates")) {
      const url = new URL(req.url, "http://localhost");
      const since = url.searchParams.get("since");
      const store = await readStore();
      const filtered = store.updates.filter((update) => {
        if (update.userId !== login) return false;
        if (!since) return true;
        return update.createdAt > since;
      });

      sendJson(res, 200, { updates: filtered });
      return;
    }

    sendJson(res, 404, { error: "not found", code: "NOT_FOUND" });
  } catch (error) {
    if (error instanceof OversizeError) {
      sendJson(res, 413, {
        error: "request body too large",
        code: "PAYLOAD_TOO_LARGE",
      });
      return;
    }

    if (error instanceof ValidationError) {
      sendJson(res, 400, {
        error: "invalid request payload",
        code: "BAD_REQUEST",
      });
      return;
    }

    sendJson(res, 500, { error: "relay server error", code: "INTERNAL_ERROR" });
  }
});

const port = Number(process.env.RELAY_PORT ?? 8787);
server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Relay server listening on http://localhost:${port}`);
});
