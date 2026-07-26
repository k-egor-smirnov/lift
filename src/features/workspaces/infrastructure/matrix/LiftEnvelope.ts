import { z } from "zod";

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const base64Url = z.string().regex(/^[A-Za-z0-9_-]+$/);

export const changeEnvelopeV1 = z.object({
  type: z.literal("dev.lift.crdt.change.v1"),
  schemaVersion: z.literal(1),
  workspaceId: z.string().min(1),
  authEpoch: z.number().int().positive(),
  changeHash: hash,
  dependencies: z.array(hash),
  payload: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("inline"), bytes: base64Url }),
    z.object({
      mode: z.literal("fragment"),
      transferId: hash,
      index: z.number().int().nonnegative(),
      count: z.number().int().positive().max(4096),
      fragmentHash: hash,
      bytes: base64Url,
    }),
  ]),
});

export type ChangeEnvelopeV1 = z.infer<typeof changeEnvelopeV1>;
