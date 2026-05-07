import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskLogsModal } from "../TaskLogsModal";
import { DomainEventType } from "../../../../../../shared/domain/types";

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  loadingLogs: false,
  newLogText: "",
  onNewLogTextChange: vi.fn(),
  onNewLogKeyDown: vi.fn(),
};

describe("TaskLogsModal", () => {
  it("shows action icons for key task history events", () => {
    render(
      <TaskLogsModal
        {...baseProps}
        taskLogs={[
          {
            id: 1,
            taskId: "task-1",
            type: "SYSTEM",
            message: "Task completed in SIMPLE category",
            metadata: { eventType: DomainEventType.TASK_COMPLETED },
            createdAt: new Date("2026-04-25T12:00:00Z"),
          },
          {
            id: 2,
            taskId: "task-1",
            type: "SYSTEM",
            message: "Task deferred until 2026-04-30",
            metadata: { eventType: DomainEventType.TASK_DEFERRED },
            createdAt: new Date("2026-04-25T12:10:00Z"),
          },
          {
            id: 3,
            taskId: "task-1",
            type: "SYSTEM",
            message: "Task returned from deferred",
            metadata: { eventType: DomainEventType.TASK_UNDEFERRED },
            createdAt: new Date("2026-04-25T12:15:00Z"),
          },
          {
            id: 4,
            taskId: "task-1",
            type: "SYSTEM",
            message: 'Task title changed from "A" to "B"',
            metadata: { eventType: DomainEventType.TASK_TITLE_CHANGED },
            createdAt: new Date("2026-04-25T12:20:00Z"),
          },
        ]}
      />
    );

    expect(screen.getByTestId("log-action-icon-completed")).toBeInTheDocument();
    expect(screen.getByTestId("log-action-icon-deferred")).toBeInTheDocument();
    expect(
      screen.getByTestId("log-action-icon-undeferred")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("log-action-icon-title_changed")
    ).toBeInTheDocument();
  });

  it("hides explicit log type labels", () => {
    render(
      <TaskLogsModal
        {...baseProps}
        taskLogs={[
          {
            id: 5,
            taskId: "task-1",
            type: "SYSTEM",
            message: "Task completed in FOCUS category",
            metadata: { eventType: DomainEventType.TASK_COMPLETED },
            createdAt: new Date("2026-04-25T12:00:00Z"),
          },
        ]}
      />
    );

    expect(screen.queryByText("SYSTEM")).not.toBeInTheDocument();
    expect(screen.queryByText("USER")).not.toBeInTheDocument();
    expect(screen.queryByText("CONFLICT")).not.toBeInTheDocument();
  });
});
