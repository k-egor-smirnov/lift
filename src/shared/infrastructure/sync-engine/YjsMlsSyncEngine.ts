import * as Y from "yjs";
import { MlsGroupSessionManager } from "./MlsGroupSessionManager";
import {
  ConnectedDevice,
  EncryptedSyncUpdate,
  MlsCornerCaseCode,
  MlsCornerCaseError,
} from "./types";

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function deriveEpochKey(
  exporterSecret: Uint8Array,
  groupId: string,
  epoch: number
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const info = encoder.encode(`lift-sync:${groupId}:${epoch}`);
  const salt = encoder.encode(`lift-sync-salt:${groupId}`);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    exporterSecret,
    "HKDF",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info,
    },
    keyMaterial,
    256
  );

  return crypto.subtle.importKey("raw", derivedBits, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export class YjsMlsSyncEngine {
  readonly doc: Y.Doc;

  constructor(
    readonly sessionManager: MlsGroupSessionManager,
    readonly userId: string,
    readonly currentDevice: ConnectedDevice,
    private readonly exporterSecret: Uint8Array
  ) {
    this.doc = new Y.Doc();
  }

  createSharedMap(name = "tasks"): Y.Map<unknown> {
    return this.doc.getMap(name);
  }

  async buildEncryptedUpdate(): Promise<EncryptedSyncUpdate> {
    const update = Y.encodeStateAsUpdate(this.doc);
    const snapshot = this.sessionManager.getSnapshot();
    const key = await deriveEpochKey(
      this.exporterSecret,
      snapshot.groupId,
      snapshot.epoch
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const cipherBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      update
    );

    const encryptedPayload = new Uint8Array(cipherBuffer);

    return {
      id: crypto.randomUUID(),
      userId: this.userId,
      groupId: snapshot.groupId,
      sourceDeviceId: this.currentDevice.id,
      encryptedPayload: toBase64(encryptedPayload),
      iv: toBase64(iv),
      epoch: snapshot.epoch,
      createdAt: new Date().toISOString(),
    };
  }

  async applyEncryptedUpdate(update: EncryptedSyncUpdate): Promise<void> {
    const snapshot = this.sessionManager.getSnapshot();

    if (update.epoch < snapshot.epoch) {
      throw new MlsCornerCaseError(
        MlsCornerCaseCode.STALE_EPOCH,
        `Received stale update epoch ${update.epoch} for current epoch ${snapshot.epoch}`
      );
    }

    const key = await deriveEpochKey(
      this.exporterSecret,
      update.groupId,
      update.epoch
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(update.iv) },
      key,
      fromBase64(update.encryptedPayload)
    );

    Y.applyUpdate(this.doc, new Uint8Array(decrypted));

    if (update.epoch > snapshot.epoch) {
      this.sessionManager.markExternalCommitPending();
      this.sessionManager.applyCommit(update.epoch);
    }
  }
}
