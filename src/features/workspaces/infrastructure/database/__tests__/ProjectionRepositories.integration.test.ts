import { afterEach, describe, expect, it } from "vitest";

import { DexieAuditLogRepository } from "../DexieAuditLogRepository";
import { LiftSecureDatabase } from "../LiftSecureDatabase";
import { DexieStatisticsRepository } from "../DexieStatisticsRepository";
import type { AuditProjectionRecord } from "../records";

let database: LiftSecureDatabase | undefined;

const audit = (recordId: string, auditTime: string): AuditProjectionRecord => ({
  workspaceId: "workspace-1",
  source: "audit",
  recordId,
  taskId: "task-1",
  effectiveDate: "2026-07-22",
  kind: "manual.v1",
  actorId: "11".repeat(16),
  auditTime,
  data: { message: recordId },
});

describe("projection repositories", () => {
  afterEach(async () => {
    if (database !== undefined) {
      database.close();
      await database.delete();
      database = undefined;
    }
  });

  it("keeps cursor pagination stable when a newer remote audit row arrives", async () => {
    database = new LiftSecureDatabase(
      `LiftSecureDatabase-projection-repositories-${crypto.randomUUID()}`
    );
    await database.open();
    await database.auditProjections.bulkAdd([
      audit("old", "2026-07-22T08:00:00.000Z"),
      audit("middle", "2026-07-22T09:00:00.000Z"),
      audit("new", "2026-07-22T10:00:00.000Z"),
    ]);
    const repository = new DexieAuditLogRepository(database);

    const first = await repository.query({
      workspaceId: "workspace-1",
      limit: 2,
    });
    expect(first.entries.map(({ recordId }) => recordId)).toEqual([
      "new",
      "middle",
    ]);
    expect(first.nextCursor).not.toBeNull();

    await database.auditProjections.add(
      audit("arrived-later", "2026-07-22T11:00:00.000Z")
    );
    const second = await repository.query({
      workspaceId: "workspace-1",
      cursor: first.nextCursor ?? undefined,
      limit: 2,
    });
    expect(second.entries.map(({ recordId }) => recordId)).toEqual(["old"]);
  });

  it("returns only persisted date-only statistic rows inside an inclusive range", async () => {
    database = new LiftSecureDatabase(
      `LiftSecureDatabase-statistics-repository-${crypto.randomUUID()}`
    );
    await database.open();
    await database.dailyStatisticsProjections.bulkAdd([
      {
        workspaceId: "workspace-1",
        date: "2026-07-20",
        simpleCompleted: 1,
        focusCompleted: 0,
        inboxReviewed: 0,
      },
      {
        workspaceId: "workspace-1",
        date: "2026-07-22",
        simpleCompleted: 0,
        focusCompleted: 2,
        inboxReviewed: 1,
      },
    ]);

    await expect(
      new DexieStatisticsRepository(database).getRange(
        "workspace-1",
        "2026-07-21",
        "2026-07-23"
      )
    ).resolves.toEqual([
      {
        workspaceId: "workspace-1",
        date: "2026-07-22",
        simpleCompleted: 0,
        focusCompleted: 2,
        inboxReviewed: 1,
      },
    ]);
  });
});
