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
}
