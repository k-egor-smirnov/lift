import type {
  DeviceTrustService,
  VerifiedMatrixDevice,
} from "../../application/ports/DeviceTrustService";
import type { MatrixSession } from "../../application/ports/MatrixSession";

export class MatrixDeviceTrustService implements DeviceTrustService {
  constructor(private readonly session: MatrixSession) {}

  async requireReadyOwnDevice(): Promise<VerifiedMatrixDevice> {
    const current = this.session.snapshot();
    if (
      current.phase !== "ready" ||
      current.userId === null ||
      current.deviceId === null
    ) {
      throw new Error("Matrix device is not ready and recovery-acknowledged");
    }
    return { userId: current.userId, deviceId: current.deviceId };
  }
}
