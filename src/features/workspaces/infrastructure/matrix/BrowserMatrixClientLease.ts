export interface MatrixClientLease {
  readonly name: string;
  release(): void;
}

export class BrowserMatrixClientLease {
  constructor(private readonly locks: LockManager = navigator.locks) {}

  acquire(cryptoDatabasePrefix: string): Promise<MatrixClientLease | null> {
    const name = `lift:matrix:${cryptoDatabasePrefix}`;
    return new Promise<MatrixClientLease | null>((resolve, reject) => {
      let settled = false;
      const request = this.locks.request(
        name,
        { ifAvailable: true, mode: "exclusive" },
        async (lock) => {
          if (lock === null) {
            settled = true;
            resolve(null);
            return;
          }
          let release!: () => void;
          const held = new Promise<void>((done) => {
            release = done;
          });
          settled = true;
          resolve({ name, release });
          await held;
        }
      );
      void request.catch((error) => {
        if (!settled) reject(error);
      });
    });
  }
}
