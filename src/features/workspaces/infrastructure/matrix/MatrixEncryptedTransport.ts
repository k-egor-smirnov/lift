import {
  EncryptedTransportError,
  type EncryptedTransport,
} from "../../application/ports/EncryptedTransport";
import { signingJsonBytes } from "../crypto/MatrixSigningJson";
import { checkpointEnvelopeV1 } from "../checkpoint/CheckpointEnvelope";
import type { MatrixSessionManager } from "./MatrixSessionManager";
import { changeEnvelopeV1 } from "./LiftEnvelope";

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength &&
  left.every((value, index) => value === right[index]);

const matrixErrorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "errcode" in error
    ? String((error as { readonly errcode?: unknown }).errcode)
    : undefined;

const statusCode = (error: unknown): number | undefined =>
  typeof error === "object" && error !== null && "httpStatus" in error
    ? Number((error as { readonly httpStatus?: unknown }).httpStatus)
    : undefined;

export class MatrixEncryptedTransport implements EncryptedTransport {
  constructor(
    private readonly sessions: Pick<
      MatrixSessionManager,
      "requireAuthenticatedClient"
    >
  ) {}

  async send(input: {
    readonly roomId: string;
    readonly innerType: "dev.lift.crdt.change.v1" | "dev.lift.checkpoint.v1";
    readonly content: Readonly<Record<string, unknown>>;
    readonly transactionId: string;
  }): Promise<{ readonly eventId: string }> {
    const content =
      input.innerType === "dev.lift.checkpoint.v1"
        ? checkpointEnvelopeV1.parse(input.content)
        : changeEnvelopeV1.parse(input.content);
    try {
      const client = this.sessions.requireAuthenticatedClient();
      const signed = await client.signWorkspaceContent(content);
      const eventId = await client.sendEncryptedWorkspaceEvent(
        input.roomId,
        input.innerType,
        signed,
        input.transactionId
      );
      const readBack = await client.readWorkspaceEvent(input.roomId, eventId);
      if (
        readBack.wireType !== "m.room.encrypted" ||
        readBack.clearType !== input.innerType ||
        typeof readBack.content !== "object" ||
        readBack.content === null ||
        !equalBytes(
          signingJsonBytes(content),
          signingJsonBytes(readBack.content)
        )
      ) {
        throw new EncryptedTransportError("permanent");
      }
      return { eventId };
    } catch (error) {
      if (error instanceof EncryptedTransportError) throw error;
      const code = matrixErrorCode(error);
      const status = statusCode(error);
      if (
        code === "M_UNKNOWN_TOKEN" ||
        code === "M_MISSING_TOKEN" ||
        status === 401
      )
        throw new EncryptedTransportError("authentication");
      if (
        code === "M_FORBIDDEN" ||
        code === "M_BAD_JSON" ||
        code === "M_NOT_FOUND" ||
        status === 400 ||
        status === 403 ||
        status === 404
      )
        throw new EncryptedTransportError("permanent");
      throw new EncryptedTransportError("transient");
    }
  }
}
