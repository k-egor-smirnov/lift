import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TaskLogList } from "../TaskLogList";
import { DomainEventType } from "../../../../../shared/domain/types";
import { LogEntry } from "../../../../../shared/application/use-cases/GetTaskLogsUseCase";

const logs: LogEntry[] = [
  {
    id: 1,
    taskId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    type: "SYSTEM",
    message: "Task completed in SIMPLE category",
    metadata: { eventType: DomainEventType.TASK_COMPLETED },
    createdAt: new Date("2026-04-25T10:00:00Z"),
  },
  {
    id: 2,
    taskId: "01ARZ3NDEKTSV4RRFFQ69G5FBW",
    type: "SYSTEM",
    message: "Task deferred until 2026-04-30",
    metadata: { eventType: DomainEventType.TASK_DEFERRED },
    createdAt: new Date("2026-04-25T10:05:00Z"),
  },
  {
    id: 3,
    taskId: "01ARZ3NDEKTSV4RRFFQ69G5FCX",
    type: "SYSTEM",
    message: "Task returned from deferred",
    metadata: { eventType: DomainEventType.TASK_UNDEFERRED },
    createdAt: new Date("2026-04-25T10:10:00Z"),
  },
  {
    id: 4,
    taskId: "01ARZ3NDEKTSV4RRFFQ69G5FDY",
    type: "SYSTEM",
    message: 'Task title changed from "A" to "B"',
    metadata: { eventType: DomainEventType.TASK_TITLE_CHANGED },
    createdAt: new Date("2026-04-25T10:15:00Z"),
  },
];

describe("TaskLogList", () => {
  it("renders action icons for history events", () => {
    render(<TaskLogList logs={logs} showTaskId={true} />);

    expect(
      screen.getByTestId("history-action-icon-completed")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("history-action-icon-deferred")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("history-action-icon-undeferred")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("history-action-icon-title_changed")
    ).toBeInTheDocument();
  });

  it("does not render technical type labels", () => {
    render(<TaskLogList logs={logs} showTaskId={true} />);

    expect(screen.queryByText("SYSTEM")).not.toBeInTheDocument();
    expect(screen.queryByText("USER")).not.toBeInTheDocument();
    expect(screen.queryByText("CONFLICT")).not.toBeInTheDocument();
  });
});
