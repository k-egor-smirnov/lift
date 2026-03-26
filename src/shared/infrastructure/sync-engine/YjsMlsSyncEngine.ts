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
  groupId: string,
  epoch: number
): Promise<CryptoKey> {
  const source = new TextEncoder().encode(`${groupId}:${epoch}:lift-sync`);
  const digest = await crypto.subtle.digest("SHA-256", source);

  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export class YjsMlsSyncEngine {
  readonly doc: Y.Doc;

  constructor(
    readonly sessionManager: MlsGroupSessionManager,
    readonly userId: string,
    readonly currentDevice: ConnectedDevice
  ) {
    this.doc = new Y.Doc();
  }

  createSharedMap(name = "tasks"): Y.Map<unknown> {
    return this.doc.getMap(name);
  }

  async buildEncryptedUpdate(): Promise<EncryptedSyncUpdate> {
    const update = Y.encodeStateAsUpdate(this.doc);
    const snapshot = this.sessionManager.getSnapshot();
    const key = await deriveEpochKey(snapshot.groupId, snapshot.epoch);
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
      authTag: `epoch-${snapshot.epoch}`,
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

    if (update.epoch > snapshot.epoch) {
      this.sessionManager.markExternalCommitPending();
      this.sessionManager.applyCommit(update.epoch);
    }

    const key = await deriveEpochKey(update.groupId, update.epoch);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(update.iv) },
      key,
      fromBase64(update.encryptedPayload)
    );

    Y.applyUpdate(this.doc, new Uint8Array(decrypted));
  }
}
