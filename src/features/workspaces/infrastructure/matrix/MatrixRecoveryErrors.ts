export class MatrixRecoveryKeyMismatchError extends Error {
  constructor() {
    super("Recovery key does not match Matrix secret storage");
    this.name = "MatrixRecoveryKeyMismatchError";
  }
}
