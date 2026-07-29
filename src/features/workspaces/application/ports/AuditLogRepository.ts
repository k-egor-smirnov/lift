export type AuditLogSource = "audit" | "completion";

export interface AuditLogCursor {
  readonly auditTime: string;
  readonly source: AuditLogSource;
  readonly recordId: string;
}

export interface AuditLogEntry extends AuditLogCursor {
  readonly workspaceId: string;
  readonly taskId: string | null;
  readonly effectiveDate: string | null;
  readonly kind: string;
  readonly actorId: string;
  readonly data: Readonly<Record<string, string>>;
}

export interface AuditLogQuery {
  readonly workspaceId: string;
  readonly taskId?: string;
  readonly kind?: string;
  readonly cursor?: AuditLogCursor;
  readonly limit: number;
}

export interface AuditLogPage {
  readonly entries: readonly AuditLogEntry[];
  readonly nextCursor: AuditLogCursor | null;
}

export interface AuditLogRepository {
  query(request: AuditLogQuery): Promise<AuditLogPage>;
}
