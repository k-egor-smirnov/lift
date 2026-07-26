import { WorkspaceId } from "./WorkspaceIdentity";

export type DateOnlyString = string;
export type Dot = string;

export interface ObservedRemoveSet {
  adds: Record<string, Record<Dot, true>>;
  removedDots: Record<Dot, true>;
}

export interface TaskCrdtState {
  id: string;
  title: string;
  note: string;
  category: "INBOX" | "SIMPLE" | "FOCUS";
  position: { key: string; actorId: string };
  created: { deviceId: string; auditTime: string };
  inboxEnteredOn: DateOnlyString | null;
  deferredUntil: DateOnlyString | null;
  originalCategory: "INBOX" | "SIMPLE" | "FOCUS" | null;
  completion: "active" | "completed";
  completionEpoch: number;
  tags: ObservedRemoveSet;
  deletionDots: Record<Dot, true>;
}

export interface RecurrenceTemplateState {
  id: string;
  title: string;
  note: string;
  category: TaskCrdtState["category"];
  rule: {
    frequency: "daily" | "weekly";
    interval: number;
    weekdays: number[];
    startsOn: DateOnlyString;
    endsOn: DateOnlyString | null;
  };
  deletionDots: Record<Dot, true>;
}

export interface CompletionRecordState {
  id: string;
  taskId: string;
  effectiveDate: DateOnlyString;
  kind: "completed" | "reopened";
  fromCompletionEpoch: number;
  completionEpoch: number;
  categoryAtCompletion: TaskCrdtState["category"] | null;
  actorId: string;
  auditTime: string;
}

export interface AuditRecordState {
  id: string;
  kind: string;
  taskId: string | null;
  effectiveDate: DateOnlyString | null;
  actorId: string;
  auditTime: string;
  data: Record<string, string>;
}

export interface WorkspaceState {
  schemaVersion: 1;
  workspaceId: string;
  settings: { timezone: string; startOfDay: string };
  tasks: Record<string, TaskCrdtState>;
  dailySelections: Record<DateOnlyString, ObservedRemoveSet>;
  recurrenceTemplates: Record<string, RecurrenceTemplateState>;
  materializedOccurrences: Record<
    string,
    { templateId: string; occurrenceDate: DateOnlyString; taskId: string }
  >;
  completionRecords: Record<string, CompletionRecordState>;
  auditRecords: Record<string, AuditRecordState>;
}

const START_OF_DAY_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const isValidWorkspaceTimezone = (
  timezone: unknown
): timezone is string => {
  if (typeof timezone !== "string" || timezone.trim().length === 0) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
};

export const isValidWorkspaceStartOfDay = (
  startOfDay: unknown
): startOfDay is string =>
  typeof startOfDay === "string" && START_OF_DAY_PATTERN.test(startOfDay);

/** Creates a fresh version-one document with no wall-clock conflict fields. */
export const createEmptyWorkspace = (
  workspaceId: unknown,
  timezone: unknown,
  startOfDay: unknown
): WorkspaceState => {
  const id = WorkspaceId(workspaceId);

  if (!isValidWorkspaceTimezone(timezone)) {
    throw new Error("Invalid timezone");
  }

  if (!isValidWorkspaceStartOfDay(startOfDay)) {
    throw new Error("Invalid startOfDay");
  }

  return {
    schemaVersion: 1,
    workspaceId: id,
    settings: { timezone, startOfDay },
    tasks: {},
    dailySelections: {},
    recurrenceTemplates: {},
    materializedOccurrences: {},
    completionRecords: {},
    auditRecords: {},
  };
};
