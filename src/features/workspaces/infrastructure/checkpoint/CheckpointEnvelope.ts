import { z } from "zod";

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const bytes = z.string().regex(/^[A-Za-z0-9_-]+$/);

export const checkpointEnvelopeV1 = z.strictObject({
  type: z.literal("dev.lift.checkpoint.v1"),
  schemaVersion: z.literal(1),
  compression: z.literal("gzip"),
  workspaceId: z.string().min(1),
  authEpoch: z.number().int().positive(),
  checkpointHash: hash,
  heads: z.array(hash).min(1),
  coveredChangeHashes: z.array(hash).min(1),
  payload: z.discriminatedUnion("mode", [
    z.strictObject({ mode: z.literal("inline"), bytes }),
    z.strictObject({
      mode: z.literal("fragment"),
      transferId: hash,
      index: z.number().int().nonnegative(),
      count: z.number().int().positive().max(4096),
      fragmentHash: hash,
      bytes,
    }),
  ]),
});

export type CheckpointEnvelopeV1 = z.infer<typeof checkpointEnvelopeV1>;
