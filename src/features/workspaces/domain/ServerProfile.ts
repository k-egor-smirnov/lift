const IPV4_PART = /^(?:0|[1-9]\d{0,2})$/;

const rawAuthorityHost = (input: string): string => {
  const authority = input.match(/^[a-z]+:\/\/([^/?#]+)/i)?.[1] ?? "";
  if (authority.startsWith("[")) {
    const closing = authority.indexOf("]");
    return closing < 0
      ? authority.toLowerCase()
      : authority.slice(0, closing + 1).toLowerCase();
  }
  return authority.split(":", 1)[0].toLowerCase();
};

const canonicalIpv4 = (
  rawHost: string,
  normalizedHostname: string
): boolean => {
  const octets = rawHost.split(".");
  if (octets.length !== 4 || octets.some((part) => !IPV4_PART.test(part))) {
    return false;
  }
  const numbers = octets.map(Number);
  return (
    numbers.every((value) => value >= 0 && value <= 255) &&
    normalizedHostname === rawHost
  );
};

const isCanonicalLoopbackHttp = (
  input: string,
  url: URL,
  rawHost: string
): boolean => {
  if (url.protocol !== "http:") return false;
  if (input.match(/^http:\/\/([^/?#]+)/i)?.[1]?.includes("@")) return false;
  if (rawHost === "localhost" || rawHost === "[::1]") return true;
  return canonicalIpv4(rawHost, url.hostname) && rawHost.startsWith("127.");
};

const requireText = (value: unknown, field: string): string => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.includes("\0")
  ) {
    throw new Error(`Invalid server profile ${field}`);
  }
  return value.trim();
};

export interface ServerProfileInput {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
}

/** Validated immutable Matrix homeserver endpoint. */
export class ServerProfile {
  private constructor(
    readonly id: string,
    readonly name: string,
    readonly baseUrl: string
  ) {}

  static create(input: ServerProfileInput): ServerProfile {
    const id = requireText(input.id, "id");
    const name = requireText(input.name, "name");
    const source = requireText(input.baseUrl, "baseUrl");
    let url: URL;
    try {
      url = new URL(source);
    } catch {
      throw new Error("Invalid Matrix server URL");
    }

    if (
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.search.length > 0 ||
      url.hash.length > 0 ||
      (url.pathname !== "" && url.pathname !== "/")
    ) {
      throw new Error(
        "Matrix server URL must be an origin without credentials"
      );
    }

    const rawHost = rawAuthorityHost(source);
    const numericAuthority = /^[0-9.]+$/.test(rawHost);
    if (numericAuthority && !canonicalIpv4(rawHost, url.hostname)) {
      throw new Error("Ambiguous numeric Matrix server address");
    }

    const allowed =
      url.protocol === "https:" ||
      isCanonicalLoopbackHttp(source, url, rawHost);
    if (!allowed) {
      throw new Error(
        "Matrix server must use HTTPS or canonical loopback HTTP"
      );
    }

    return new ServerProfile(id, name, url.origin);
  }
}
