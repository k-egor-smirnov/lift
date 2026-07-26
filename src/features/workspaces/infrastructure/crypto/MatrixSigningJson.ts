const encoder = new TextEncoder();

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => key !== "signatures" && key !== "unsigned")
      .sort()
      .map((key) => [key, canonical(Reflect.get(value, key))])
  );
};

const decodeBase64 = (value: string): Uint8Array => {
  const padded = value.padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const buffer = (bytes: Uint8Array): ArrayBuffer => {
  const result = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(result).set(bytes);
  return result;
};

export const signingJsonBytes = (value: unknown): Uint8Array =>
  encoder.encode(JSON.stringify(canonical(value)));

export const stripMatrixSignatures = (
  value: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => key !== "signatures" && key !== "unsigned"
    )
  );

export const verifyMatrixDeviceSignature = async (input: {
  readonly value: Readonly<Record<string, unknown>>;
  readonly userId: string;
  readonly deviceId: string;
  readonly ed25519Key: string;
}): Promise<boolean> => {
  const signatures = input.value.signatures;
  if (typeof signatures !== "object" || signatures === null) return false;
  const user = Reflect.get(signatures, input.userId);
  if (typeof user !== "object" || user === null) return false;
  const signature = Reflect.get(user, `ed25519:${input.deviceId}`);
  if (typeof signature !== "string") return false;
  try {
    const publicKey = await crypto.subtle.importKey(
      "raw",
      buffer(decodeBase64(input.ed25519Key)),
      { name: "Ed25519" },
      false,
      ["verify"]
    );
    return crypto.subtle.verify(
      { name: "Ed25519" },
      publicKey,
      buffer(decodeBase64(signature)),
      buffer(signingJsonBytes(input.value))
    );
  } catch {
    return false;
  }
};
