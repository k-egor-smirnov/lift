import {
  AclHash,
  ChangeHash,
  DeviceId,
  ServerProfileId,
  SyncTargetId,
  WorkspaceId,
} from "../WorkspaceIdentity";
import { createEmptyWorkspace } from "../WorkspaceState";

describe("workspace identities", () => {
  it("constructs each branded wire identity only from a non-empty string", () => {
    expect(WorkspaceId("ws_01")).toBe("ws_01");
    expect(ChangeHash("change-01")).toBe("change-01");
    expect(DeviceId("device-01")).toBe("device-01");
    expect(ServerProfileId("server-01")).toBe("server-01");
    expect(SyncTargetId("target-01")).toBe("target-01");
    expect(AclHash("acl-01")).toBe("acl-01");
  });

  it.each([[undefined], [null], [""], ["   "], [42]])(
    "rejects invalid wire identities at the boundary: %p",
    (value) => {
      const constructors = [
        WorkspaceId,
        ChangeHash,
        DeviceId,
        ServerProfileId,
        SyncTargetId,
        AclHash,
      ];

      for (const construct of constructors) {
        expect(() => construct(value)).toThrow("non-empty string");
      }
    }
  );
});

describe("workspace state", () => {
  it("creates an empty, versioned document without physical-time winners", () => {
    const state = createEmptyWorkspace("ws_01", "Europe/Moscow", "09:00");

    expect(state).toEqual({
      schemaVersion: 1,
      workspaceId: "ws_01",
      settings: { timezone: "Europe/Moscow", startOfDay: "09:00" },
      tasks: {},
      dailySelections: {},
      recurrenceTemplates: {},
      materializedOccurrences: {},
      completionRecords: {},
      auditRecords: {},
    });
    expect(JSON.stringify(state)).not.toContain("updatedAt");
  });

  it.each(["Mars/Olympus", "", "   "])(
    "rejects an invalid timezone: %p",
    (timezone) => {
      expect(() => createEmptyWorkspace("ws_01", timezone, "09:00")).toThrow(
        "timezone"
      );
    }
  );

  it.each(["9:00", "24:00", "12:60", "12:0", "", "09:00 "])(
    "rejects an invalid start of day: %p",
    (startOfDay) => {
      expect(() =>
        createEmptyWorkspace("ws_01", "Europe/Moscow", startOfDay)
      ).toThrow("startOfDay");
    }
  );

  it("returns independent maps for every empty workspace", () => {
    const first = createEmptyWorkspace("ws_01", "Europe/Moscow", "09:00");
    const second = createEmptyWorkspace("ws_02", "Europe/Moscow", "09:00");

    first.tasks["task-1"] = {
      id: "task-1",
      title: "Task",
      note: "",
      category: "INBOX",
      position: { key: "a", actorId: "device-1" },
      created: { deviceId: "device-1", auditTime: "2026-07-22T00:00:00Z" },
      deferredUntil: null,
      originalCategory: null,
      completion: "active",
      tags: { adds: {}, removedDots: {} },
      deletionDots: {},
    };
    first.dailySelections["2026-07-22"] = { adds: {}, removedDots: {} };
    first.recurrenceTemplates["template-1"] = {
      id: "template-1",
      title: "Template",
      note: "",
      category: "SIMPLE",
      rule: {
        frequency: "daily",
        interval: 1,
        weekdays: [],
        startsOn: "2026-07-22",
        endsOn: null,
      },
      deletionDots: {},
    };
    first.materializedOccurrences["occurrence-1"] = {
      templateId: "template-1",
      occurrenceDate: "2026-07-22",
      taskId: "task-1",
    };
    first.completionRecords["completion-1"] = {
      id: "completion-1",
      taskId: "task-1",
      effectiveDate: "2026-07-22",
      kind: "completed",
      actorId: "device-1",
      auditTime: "2026-07-22T00:00:00Z",
    };
    first.auditRecords["audit-1"] = {
      id: "audit-1",
      kind: "task-created",
      actorId: "device-1",
      auditTime: "2026-07-22T00:00:00Z",
      data: {},
    };

    expect(second).toEqual({
      schemaVersion: 1,
      workspaceId: "ws_02",
      settings: { timezone: "Europe/Moscow", startOfDay: "09:00" },
      tasks: {},
      dailySelections: {},
      recurrenceTemplates: {},
      materializedOccurrences: {},
      completionRecords: {},
      auditRecords: {},
    });
  });
});
