import { describe, expect, it } from "vitest";
import { WorkspaceRole } from "../../../domain/WorkspaceRole";
import type { WorkspaceAclCheckpoint } from "../../../domain/WorkspaceAcl";
import { AclChainValidator } from "../AclChainValidator";
import { CanonicalAclCodec } from "../CanonicalAclCodec";

const root = (): WorkspaceAclCheckpoint => ({
  workspaceId: "ws_1",
  authEpoch: 1,
  previousHash: null,
  members: { "@owner:test": WorkspaceRole.Owner },
  revokedUsers: [],
  revokedDevices: [],
  acceptedHeads: ["b", "a"],
  sender: {
    userId: "@owner:test",
    deviceId: "DEVICE",
    ed25519Key: "ed25519",
    curve25519Key: "curve25519",
  },
});

describe("canonical ACL chain", () => {
  it("canonicalizes semantic sets and hashes every field", async () => {
    const codec = new CanonicalAclCodec();
    const checkpoint = root();
    expect(codec.encode(checkpoint)).toEqual(
      codec.encode({ ...checkpoint, acceptedHeads: ["a", "b"] })
    );
    const encoded = codec.encode(checkpoint);
    const altered = codec.encode({
      ...checkpoint,
      authEpoch: checkpoint.authEpoch + 1,
    });
    expect(await codec.hash(encoded)).not.toBe(await codec.hash(altered));
  });

  it("rejects a tampered previous hash", async () => {
    const codec = new CanonicalAclCodec();
    const validator = new AclChainValidator(codec);
    const initial = await validator.accept(root());
    await expect(
      validator.accept({
        ...root(),
        authEpoch: 2,
        previousHash: "00".repeat(32),
        acceptedHeads: ["a", "b", "c"],
      })
    ).rejects.toThrow("previous ACL hash");
    expect(initial.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("round-trips only a structurally valid checkpoint", () => {
    const codec = new CanonicalAclCodec();
    const decoded = codec.decode(codec.encode(root()));
    expect(decoded).toEqual({ ...root(), acceptedHeads: ["a", "b"] });
    expect(() =>
      codec.decode(new TextEncoder().encode('{"authEpoch":1}'))
    ).toThrow("Invalid ACL");
  });
});
