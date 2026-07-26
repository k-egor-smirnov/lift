export interface SecretStorageCallbacks {
  readonly getSecretStorageKey: (
    options: { readonly keys: Readonly<Record<string, unknown>> },
    name: string
  ) => Promise<[string, Uint8Array<ArrayBuffer>] | null>;
  readonly cacheSecretStorageKey: (
    keyId: string,
    keyInfo: unknown,
    key: Uint8Array<ArrayBuffer>
  ) => void;
}

const ownedBytes = (value: Uint8Array): Uint8Array<ArrayBuffer> => {
  const copy = new Uint8Array(new ArrayBuffer(value.byteLength));
  copy.set(value);
  return copy;
};

/** In-memory only cache used by Matrix secret-storage callbacks. */
export class SecretStorageKeyCache {
  private readonly keys = new Map<string, Uint8Array<ArrayBuffer>>();
  private preferredKeyId: string | null = null;

  readonly callbacks: SecretStorageCallbacks = {
    getSecretStorageKey: async ({ keys }) => {
      const ids =
        this.preferredKeyId === null
          ? Object.keys(keys)
          : [this.preferredKeyId];
      for (const keyId of ids) {
        if (!(keyId in keys)) continue;
        const key = this.keys.get(keyId);
        if (key !== undefined) return [keyId, ownedBytes(key)];
      }
      return null;
    },
    cacheSecretStorageKey: (keyId, _keyInfo, key) => {
      this.set(keyId, key);
    },
  };

  set(keyId: string, key: Uint8Array): void {
    this.keys.set(keyId, ownedBytes(key));
    this.preferredKeyId = keyId;
  }

  clear(): void {
    this.keys.clear();
    this.preferredKeyId = null;
  }
}
