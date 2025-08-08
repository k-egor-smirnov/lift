import React from "react";
import { TaskCategory } from "../../shared/domain/types";
import { Task } from "../../shared/domain/entities/Task";
import { TaskList } from "../../features/tasks/presentation/components/TaskList";
import { TodayView } from "../../features/today/presentation/components/TodayView";
import { AllLogsView } from "../../features/logs/presentation/components";
import { Settings } from "../../features/settings/presentation/components/Settings";
import { TodayViewModelDependencies } from "../../features/today/presentation/view-models/TodayViewModel";
import { LogViewModelDependencies } from "../../features/logs/presentation/view-models/LogViewModel";
import { LogEntry } from "../../shared/application/use-cases/GetTaskLogsUseCase";
import { ViewContainer } from "./ViewContainer";

interface ContentAreaProps {
  activeView: "today" | "logs" | "settings" | TaskCategory;
  loading: boolean;

  // Today view props
  todayDependencies: TodayViewModelDependencies;

  // Logs view props
  logDependencies: LogViewModelDependencies;

  // Task list props
  tasks: Task[];
  currentCategory: TaskCategory;
  todayTaskIds: string[];
  lastLogs: Record<string, LogEntry>;

  // Event handlers
  onCreateTask: (
    title: string,
    category: TaskCategory,
    imageFile?: File
  ) => Promise<void>;
  onCompleteTask: (taskId: string) => Promise<void>;
  onEditTask: (taskId: string, newTitle: string) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onAddToToday: (taskId: string) => Promise<void>;
  onReorderTasks: (taskIds: string[]) => Promise<void>;
  onLoadTaskLogs: (taskId: string) => Promise<void>;
  onCreateTaskLog: (taskId: string, content: string) => Promise<void>;
  onDeferTask: (taskId: string, deferredUntil: Date) => Promise<void>;
  onUndeferTask: (taskId: string) => Promise<void>;
}

export const ContentArea: React.FC<ContentAreaProps> = ({
  activeView,
  loading,
  todayDependencies,
  logDependencies,
  tasks,
  currentCategory,
  todayTaskIds,
  lastLogs,
  onCreateTask,
  onCompleteTask,
  onEditTask,
  onDeleteTask,
  onAddToToday,
  onReorderTasks,
  onLoadTaskLogs,
  onCreateTaskLog,
  onDeferTask,
  onUndeferTask,
}) => {
  if (loading) {
    return (
      <ViewContainer className="text-center py-12">
        <div data-testid="loading-state">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="mt-2 text-muted-foreground">Loading tasks...</p>
        </div>
      </ViewContainer>
    );
  }

  switch (activeView) {
    case "today":
      return (
        <ViewContainer>
          <TodayView
            dependencies={todayDependencies}
            onEditTask={onEditTask}
            onDeleteTask={onDeleteTask}
            onDefer={onDeferTask}
            onUndefer={onUndeferTask}
            onLoadTaskLogs={onLoadTaskLogs}
            onCreateTask={onCreateTask}
            onCreateLog={onCreateTaskLog}
            lastLogs={lastLogs}
          />
        </ViewContainer>
      );

    case "logs":
      return (
        <ViewContainer>
          <AllLogsView dependencies={logDependencies} />
        </ViewContainer>
      );

    case "settings":
      return (
        <ViewContainer>
          <Settings />
        </ViewContainer>
      );

    default:
      // Task category view
      return (
        <ViewContainer>
          <TaskList
            tasks={tasks}
            groupByCategory={false}
            showTodayButton={true}
            onCreateTask={onCreateTask}
            currentCategory={currentCategory}
            onComplete={onCompleteTask}
            onEdit={onEditTask}
            onDelete={onDeleteTask}
            onAddToToday={onAddToToday}
            onReorder={onReorderTasks}
            onLoadTaskLogs={onLoadTaskLogs}
            onCreateLog={onCreateTaskLog}
            lastLogs={lastLogs}
            emptyMessage={`No tasks found`}
            todayTaskIds={todayTaskIds}
            showDeferButton={true}
            onDefer={onDeferTask}
            onUndefer={onUndeferTask}
          />
        </ViewContainer>
      );
  }
};
