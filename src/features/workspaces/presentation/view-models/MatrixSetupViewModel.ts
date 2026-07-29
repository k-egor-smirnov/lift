import type {
  MatrixSession,
  MatrixSessionSnapshot,
} from "../../application/ports/MatrixSession";

export class MatrixSetupViewModel {
  private current: MatrixSessionSnapshot;

  constructor(private readonly session: MatrixSession) {
    this.current = session.snapshot();
  }

  snapshot(): MatrixSessionSnapshot {
    const latest = this.session.snapshot();
    if (
      latest.phase !== this.current.phase ||
      latest.profileId !== this.current.profileId ||
      latest.userId !== this.current.userId ||
      latest.deviceId !== this.current.deviceId ||
      latest.errorCode !== this.current.errorCode ||
      latest.recoveryKeyForDisplay !== this.current.recoveryKeyForDisplay ||
      latest.confirmationGroup !== this.current.confirmationGroup
    ) {
      this.current = latest;
    }
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    return this.session.subscribe((snapshot) => {
      this.current = snapshot;
      listener();
    });
  }

  beginFirstDevice(
    profileId: string,
    username: string,
    password: string
  ): Promise<void> {
    return this.session.beginFirstDevice({ profileId, username, password });
  }

  registerFirstDevice(
    profileId: string,
    username: string,
    password: string
  ): Promise<void> {
    return this.session.registerFirstDevice({ profileId, username, password });
  }

  beginRecovery(
    profileId: string,
    username: string,
    password: string
  ): Promise<void> {
    return this.session.beginRecovery({ profileId, username, password });
  }

  confirmRecoveryGroup(value: string): Promise<void> {
    return this.session.confirmRecoveryGroup(value);
  }

  recoverWithKey(value: string): Promise<void> {
    return this.session.recoverWithKey(value);
  }

  async cancelSetup(): Promise<void> {
    try {
      await this.session.logout();
    } catch {
      await this.session.stop();
    }
  }
}
