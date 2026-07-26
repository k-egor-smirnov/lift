import {
  EncryptedTransportError,
  type EncryptedTransport,
} from "../../application/ports/EncryptedTransport";
import type { MatrixSessionManager } from "./MatrixSessionManager";
import { changeEnvelopeV1 } from "./LiftEnvelope";

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
    readonly innerType: "dev.lift.crdt.change.v1";
    readonly content: Readonly<Record<string, unknown>>;
    readonly transactionId: string;
  }): Promise<{ readonly eventId: string }> {
    const content = changeEnvelopeV1.parse(input.content);
    try {
      const client = this.sessions.requireAuthenticatedClient();
      const signed = await client.signWorkspaceContent(content);
      const eventId = await client.sendEncryptedWorkspaceEvent(
        input.roomId,
        input.innerType,
        signed,
        input.transactionId
      );
      return { eventId };
    } catch (error) {
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
