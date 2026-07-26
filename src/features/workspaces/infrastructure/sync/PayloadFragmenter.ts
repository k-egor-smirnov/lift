import type { OutboxFragment } from "../../application/ports/SyncOutbox";

export const MAX_INLINE_CHANGE_BYTES = 32_768;

const sha256 = async (bytes: Uint8Array): Promise<string> => {
  const input = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(input).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
};

export class PayloadFragmenter {
  async split(bytes: Uint8Array): Promise<readonly OutboxFragment[]> {
    if (bytes.byteLength <= MAX_INLINE_CHANGE_BYTES) return [];
    const count = Math.ceil(bytes.byteLength / MAX_INLINE_CHANGE_BYTES);
    if (count > 4096) throw new Error("Payload requires too many fragments");
    return Promise.all(
      Array.from({ length: count }, async (_, index) => {
        const fragment = bytes.slice(
          index * MAX_INLINE_CHANGE_BYTES,
          Math.min((index + 1) * MAX_INLINE_CHANGE_BYTES, bytes.byteLength)
        );
        return {
          index,
          count,
          fragmentHash: await sha256(fragment),
          bytes: fragment,
        };
      })
    );
  }
}
