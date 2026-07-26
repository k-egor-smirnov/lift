import type { LiftSecureDatabase } from "../database/LiftSecureDatabase";
import type {
  AesGcmCiphertextRecord,
  LocalWrappingKeyRecord,
} from "../database/records";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

const cryptoSecretId = (profileId: string, userId: string, deviceId: string) =>
  `matrix-crypto:${profileId}:${encodeURIComponent(userId)}:${deviceId}`;
const accessTokenId = (profileId: string, userId: string, deviceId: string) =>
  `matrix-access-token:${profileId}:${encodeURIComponent(userId)}:${deviceId}`;
const refreshTokenId = (profileId: string, userId: string, deviceId: string) =>
  `matrix-refresh-token:${profileId}:${encodeURIComponent(userId)}:${deviceId}`;

const cloneBytes = (value: Uint8Array): Uint8Array => value.slice();
const isConstraintError = (error: unknown): boolean =>
  error instanceof Error && error.name === "ConstraintError";
const cryptoBuffer = (value: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(value.byteLength);
  new Uint8Array(buffer).set(value);
  return buffer;
};

export class LocalKeyVault {
  constructor(
    private readonly database: LiftSecureDatabase,
    private readonly now: () => number = () => Date.now()
  ) {}

  async getOrCreateCryptoStoreKey(
    profileId: string,
    userId: string,
    deviceId: string
  ): Promise<Uint8Array> {
    const id = cryptoSecretId(profileId, userId, deviceId);
    const existing = await this.decrypt(id, profileId);
    if (existing !== undefined) return existing;
    const candidate = crypto.getRandomValues(new Uint8Array(32));
    return this.addOrRead(id, profileId, candidate);
  }

  async storeAccessToken(
    profileId: string,
    userId: string,
    deviceId: string,
    accessToken: string
  ): Promise<void> {
    const id = accessTokenId(profileId, userId, deviceId);
    await this.encryptAndPut(id, profileId, encoder.encode(accessToken));
  }

  async storeSessionTokens(
    profileId: string,
    userId: string,
    deviceId: string,
    tokens: { readonly accessToken: string; readonly refreshToken?: string }
  ): Promise<void> {
    const records = [
      await this.encryptRecord(
        accessTokenId(profileId, userId, deviceId),
        profileId,
        encoder.encode(tokens.accessToken)
      ),
    ];
    if (tokens.refreshToken !== undefined) {
      records.push(
        await this.encryptRecord(
          refreshTokenId(profileId, userId, deviceId),
          profileId,
          encoder.encode(tokens.refreshToken)
        )
      );
    }
    await this.database.transaction("rw", this.database.localSecrets, () =>
      this.database.localSecrets.bulkPut(records)
    );
  }

  async loadAccessToken(
    profileId: string,
    userId: string,
    deviceId: string
  ): Promise<string | undefined> {
    const bytes = await this.decrypt(
      accessTokenId(profileId, userId, deviceId),
      profileId
    );
    return bytes === undefined ? undefined : decoder.decode(bytes);
  }

  async loadRefreshToken(
    profileId: string,
    userId: string,
    deviceId: string
  ): Promise<string | undefined> {
    const bytes = await this.decrypt(
      refreshTokenId(profileId, userId, deviceId),
      profileId
    );
    return bytes === undefined ? undefined : decoder.decode(bytes);
  }

  async clearSessionTokens(
    profileId: string,
    userId: string,
    deviceId: string
  ): Promise<void> {
    await this.database.localSecrets.bulkDelete([
      accessTokenId(profileId, userId, deviceId),
      refreshTokenId(profileId, userId, deviceId),
    ]);
  }

  private async addOrRead(
    id: string,
    profileId: string,
    plaintext: Uint8Array
  ): Promise<Uint8Array> {
    const record = await this.encryptRecord(id, profileId, plaintext);
    try {
      await this.database.localSecrets.add(record);
      return cloneBytes(plaintext);
    } catch (error) {
      if (isConstraintError(error)) {
        const existing = await this.decrypt(id, profileId);
        if (existing !== undefined) return existing;
      }
      throw error;
    }
  }

  private async encryptAndPut(
    id: string,
    profileId: string,
    plaintext: Uint8Array
  ): Promise<void> {
    await this.database.localSecrets.put(
      await this.encryptRecord(id, profileId, plaintext)
    );
  }

  private async encryptRecord(
    id: string,
    profileId: string,
    plaintext: Uint8Array
  ): Promise<AesGcmCiphertextRecord> {
    const wrapping = await this.getOrCreateWrappingKey(profileId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: cryptoBuffer(iv),
        additionalData: cryptoBuffer(this.aad(id, profileId)),
      },
      wrapping.key,
      cryptoBuffer(plaintext)
    );
    const now = this.now();
    return {
      id,
      serverProfileId: profileId,
      schemaVersion: 1,
      kind: "aes-gcm-ciphertext",
      wrappingKeyId: wrapping.id,
      ciphertext: new Uint8Array(ciphertext),
      iv: iv.slice(),
      createdAt: now,
      updatedAt: now,
    };
  }

  private async decrypt(
    id: string,
    profileId: string
  ): Promise<Uint8Array | undefined> {
    const record = await this.database.localSecrets.get(id);
    if (record === undefined) return undefined;
    if (
      record.kind !== "aes-gcm-ciphertext" ||
      record.serverProfileId !== profileId
    ) {
      throw new Error("Local secret binding mismatch");
    }
    const wrapping = await this.database.localSecrets.get(record.wrappingKeyId);
    if (wrapping === undefined || wrapping.kind !== "wrapping-key") {
      throw new Error("Local wrapping key is missing");
    }
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: cryptoBuffer(record.iv),
        additionalData: cryptoBuffer(this.aad(id, profileId)),
      },
      wrapping.key,
      cryptoBuffer(record.ciphertext)
    );
    return new Uint8Array(plaintext);
  }

  private async getOrCreateWrappingKey(
    profileId: string
  ): Promise<LocalWrappingKeyRecord> {
    const id = `matrix-wrapping-key:${profileId}`;
    const existing = await this.database.localSecrets.get(id);
    if (existing !== undefined) {
      if (existing.kind !== "wrapping-key")
        throw new Error("Invalid wrapping key record");
      return existing;
    }
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    const now = this.now();
    const candidate: LocalWrappingKeyRecord = {
      id,
      serverProfileId: profileId,
      schemaVersion: 1,
      kind: "wrapping-key",
      key,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await this.database.localSecrets.add(candidate);
      return candidate;
    } catch (error) {
      if (isConstraintError(error)) {
        const winner = await this.database.localSecrets.get(id);
        if (winner?.kind === "wrapping-key") return winner;
      }
      throw error;
    }
  }

  private aad(id: string, profileId: string): Uint8Array {
    return encoder.encode(`lift-local-secret:v1:${profileId}:${id}`);
  }
}
