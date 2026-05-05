export interface RelayUser {
  id: string;
  login: string;
}

const SERVER_URL_KEY = "lift.sync.relay-server-url";
const AUTH_TOKEN_KEY = "lift.sync.relay-auth-token";
const USER_LOGIN_KEY = "lift.sync.relay-user-login";

function getBaseUrl(serverUrl?: string): string {
  const raw = serverUrl || localStorage.getItem(SERVER_URL_KEY) || "";
  return raw.replace(/\/$/, "");
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  serverUrl?: string
): Promise<T> {
  const baseUrl = getBaseUrl(serverUrl);
  if (!baseUrl) {
    throw new Error("Relay server URL is not configured");
  }

  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Relay request failed");
  }

  return payload as T;
}

export class RelaySyncClient {
  getServerUrl(): string {
    return localStorage.getItem(SERVER_URL_KEY) || "";
  }

  setServerUrl(url: string): void {
    localStorage.setItem(SERVER_URL_KEY, url.trim());
  }

  getCurrentUser(): RelayUser | null {
    const login = localStorage.getItem(USER_LOGIN_KEY);
    if (!login) return null;
    return { id: login, login };
  }

  isConnected(): boolean {
    return Boolean(localStorage.getItem(AUTH_TOKEN_KEY) && this.getServerUrl());
  }

  async signUp(login: string, password: string): Promise<void> {
    await request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ login, password }),
    });
  }

  async signIn(login: string, password: string): Promise<RelayUser> {
    const result = await request<{ token: string; userId: string }>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ login, password }),
      }
    );

    localStorage.setItem(AUTH_TOKEN_KEY, result.token);
    localStorage.setItem(USER_LOGIN_KEY, result.userId);

    return { id: result.userId, login: result.userId };
  }

  signOut(): void {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(USER_LOGIN_KEY);
  }

  async probe(): Promise<boolean> {
    try {
      await request<{ devices: unknown[] }>("/devices", { method: "GET" });
      return true;
    } catch {
      return false;
    }
  }
}

export const relaySyncClient = new RelaySyncClient();
