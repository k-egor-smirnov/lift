import type {
  AuditLogCursor,
  AuditLogEntry,
  AuditLogPage,
  AuditLogQuery,
  AuditLogRepository,
} from "../../application/ports/AuditLogRepository";
import type { LiftSecureDatabase } from "./LiftSecureDatabase";
import type { AuditProjectionRecord } from "./records";

const requireNonEmpty = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
};

const compareCursor = (
  left: Readonly<AuditLogCursor>,
  right: Readonly<AuditLogCursor>
): number => {
  if (left.auditTime !== right.auditTime) {
    return left.auditTime < right.auditTime ? -1 : 1;
  }
  if (left.source !== right.source) return left.source < right.source ? -1 : 1;
  return left.recordId < right.recordId
    ? -1
    : left.recordId > right.recordId
      ? 1
      : 0;
};

const toEntry = (record: AuditProjectionRecord): AuditLogEntry => ({
  workspaceId: record.workspaceId,
  source: record.source,
  recordId: record.recordId,
  taskId: record.taskId,
  effectiveDate: record.effectiveDate,
  kind: record.kind,
  actorId: record.actorId,
  auditTime: record.auditTime,
  data: { ...record.data },
});

export class DexieAuditLogRepository implements AuditLogRepository {
  constructor(private readonly database: LiftSecureDatabase) {}

  async query(request: AuditLogQuery): Promise<AuditLogPage> {
    const workspaceId = requireNonEmpty(request.workspaceId, "workspaceId");
    if (
      !Number.isSafeInteger(request.limit) ||
      request.limit < 1 ||
      request.limit > 100
    ) {
      throw new Error("Invalid audit query limit");
    }
    const records = await this.database.auditProjections
      .filter((record) => record.workspaceId === workspaceId)
      .toArray();
    const entries = records
      .map(toEntry)
      .filter(
        (entry) =>
          (request.taskId === undefined || entry.taskId === request.taskId) &&
          (request.kind === undefined || entry.kind === request.kind) &&
          (request.cursor === undefined ||
            compareCursor(entry, request.cursor) < 0)
      )
      .sort((left, right) => compareCursor(right, left));
    const pageEntries = entries.slice(0, request.limit);
    const last = pageEntries.at(-1);
    return {
      entries: pageEntries.map((entry) => ({
        ...entry,
        data: { ...entry.data },
      })),
      nextCursor:
        entries.length > pageEntries.length && last !== undefined
          ? {
              auditTime: last.auditTime,
              source: last.source,
              recordId: last.recordId,
            }
          : null,
    };
  }
}
