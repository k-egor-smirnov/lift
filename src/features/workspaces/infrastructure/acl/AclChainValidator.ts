import {
  validateAclRoot,
  validateAclTransition,
} from "../../domain/AclTransitionPolicy";
import type {
  HashedWorkspaceAclCheckpoint,
  WorkspaceAclCheckpoint,
} from "../../domain/WorkspaceAcl";
import { CanonicalAclCodec } from "./CanonicalAclCodec";

export class AclChainValidator {
  private latest: HashedWorkspaceAclCheckpoint | null = null;

  constructor(private readonly codec: CanonicalAclCodec) {}

  current(): HashedWorkspaceAclCheckpoint | null {
    return this.latest;
  }

  async accept(
    checkpoint: WorkspaceAclCheckpoint
  ): Promise<HashedWorkspaceAclCheckpoint> {
    const bytes = this.codec.encode(checkpoint);
    const hash = await this.codec.hash(bytes);
    if (this.latest === null) {
      validateAclRoot(checkpoint);
    } else {
      if (checkpoint.previousHash !== this.latest.hash)
        throw new Error("Invalid previous ACL hash");
      validateAclTransition(this.latest.checkpoint, checkpoint);
    }
    const accepted = { checkpoint, bytes, hash };
    this.latest = accepted;
    return accepted;
  }
}
