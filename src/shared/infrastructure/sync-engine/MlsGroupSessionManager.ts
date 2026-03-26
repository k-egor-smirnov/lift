import {
  ConnectedDevice,
  MlsCornerCaseCode,
  MlsCornerCaseError,
  MlsGroupSnapshot,
} from "./types";

interface SessionState {
  groupId: string;
  epoch: number;
  devices: ConnectedDevice[];
  pendingCommits: number;
  hasExternalCommit: boolean;
}

export class MlsGroupSessionManager {
  private state: SessionState;

  constructor(groupId: string, seedDevices: ConnectedDevice[]) {
    this.state = {
      groupId,
      epoch: 1,
      devices: [...seedDevices],
      pendingCommits: 0,
      hasExternalCommit: false,
    };
  }

  getSnapshot(): MlsGroupSnapshot {
    return {
      groupId: this.state.groupId,
      epoch: this.state.epoch,
      members: this.state.devices.map((device) => ({
        id: device.id,
        identityKey: device.identityKey,
        isRevoked: device.isRevoked,
      })),
      pendingCommits: this.state.pendingCommits,
      hasExternalCommit: this.state.hasExternalCommit,
    };
  }

  stageCommit(): void {
    this.state.pendingCommits += 1;
  }

  applyCommit(epoch: number): void {
    if (epoch <= this.state.epoch) {
      throw new MlsCornerCaseError(
        MlsCornerCaseCode.STALE_EPOCH,
        `MLS commit epoch ${epoch} is stale for current epoch ${this.state.epoch}`,
        { epoch, currentEpoch: this.state.epoch }
      );
    }

    this.state.epoch = epoch;
    this.state.pendingCommits = Math.max(this.state.pendingCommits - 1, 0);
    this.state.hasExternalCommit = false;
  }

  markExternalCommitPending(): void {
    this.state.hasExternalCommit = true;
  }

  addDevice(device: ConnectedDevice): void {
    if (this.state.pendingCommits > 0) {
      throw new MlsCornerCaseError(
        MlsCornerCaseCode.PENDING_COMMIT_REQUIRED,
        "MLS commit queue is not empty. Apply pending commits before adding a new device.",
        { pendingCommits: this.state.pendingCommits }
      );
    }

    if (this.state.devices.some((member) => member.id === device.id)) {
      throw new MlsCornerCaseError(
        MlsCornerCaseCode.DUPLICATE_DEVICE,
        `Device ${device.id} already exists in MLS group`,
        { deviceId: device.id }
      );
    }

    if (!device.identityKey || device.identityKey.length < 24) {
      throw new MlsCornerCaseError(
        MlsCornerCaseCode.KEY_PACKAGE_EXPIRED,
        "Invalid or expired key package for new device",
        { deviceId: device.id }
      );
    }

    this.state.devices.push(device);
    this.state.epoch += 1;
  }

  removeDevice(deviceId: string, currentDeviceId: string): void {
    if (deviceId === currentDeviceId) {
      throw new MlsCornerCaseError(
        MlsCornerCaseCode.SELF_REMOVE_FORBIDDEN,
        "Current device cannot be removed from active MLS session",
        { deviceId }
      );
    }

    const member = this.state.devices.find((device) => device.id === deviceId);

    if (!member) {
      throw new MlsCornerCaseError(
        MlsCornerCaseCode.DEVICE_NOT_FOUND,
        `Device ${deviceId} is not present in MLS group`,
        { deviceId }
      );
    }

    member.isRevoked = true;
    member.lastSeenAt = new Date().toISOString();
    this.state.epoch += 1;
  }
}
