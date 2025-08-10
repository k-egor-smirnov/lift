import React from "react";
import { TaskCategory } from "../../shared/domain/types";
import { Task } from "../../shared/domain/entities/Task";
import { TaskId } from "../../shared/domain/value-objects/TaskId";
import { TaskList } from "../../features/tasks/presentation/components/TaskList";
import { TodayView } from "../../features/today/presentation/components/TodayView";
import { AllLogsView } from "../../features/logs/presentation/components";
import { SyncHistoryView } from "../../features/sync/presentation/components/SyncHistoryView";
import { Settings } from "../../features/settings/presentation/components/Settings";
import { TodayViewModelDependencies } from "../../features/today/presentation/view-models/TodayViewModel";
import { LogViewModelDependencies } from "../../features/logs/presentation/view-models/LogViewModel";
import { SyncHistoryViewModelDependencies } from "../../features/sync/presentation/view-models/SyncHistoryViewModel";
import { TaskViewModel } from "../../features/tasks/presentation/view-models/TaskViewModel";
import { LogEntry } from "../../shared/application/use-cases/GetTaskLogsUseCase";
import { ViewContainer } from "./ViewContainer";

interface ContentAreaProps {
  activeView: "today" | "logs" | "sync" | "settings" | TaskCategory;
  loading: boolean;

  // Today view props
  todayDependencies: TodayViewModelDependencies;

  // Logs view props
  logDependencies: LogViewModelDependencies;

  // Sync view props
  syncDependencies: SyncHistoryViewModelDependencies;

  // Task view model
  taskViewModel: TaskViewModel;

  // Task list props
  tasks: Task[];
  currentCategory: TaskCategory | "today" | "logs" | "sync" | "settings";
  todayTaskIds: string[];
  lastLogs: Record<string, LogEntry>;

  // Event handlers
  onCreateTask: (title: string, category: TaskCategory) => Promise<boolean>;
  onCompleteTask: (taskId: string) => Promise<void>;
  onEditTask: (taskId: string, newTitle: string) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onAddToToday: (taskId: string) => Promise<void>;
  onReorderTasks: (reorderedTasks: Task[]) => Promise<void>;
  onLoadTaskLogs: (taskId: string) => Promise<LogEntry[]>;
  onCreateTaskLog: (taskId: string, content: string) => Promise<boolean>;
  onDeferTask: (taskId: string, deferredUntil: Date) => Promise<void>;
  onUndeferTask: (taskId: string) => Promise<void>;
}

export const ContentArea: React.FC<ContentAreaProps> = ({
  activeView,
  loading,
  todayDependencies,
  logDependencies,
  syncDependencies,
  taskViewModel,
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

  // Adapter for onUndeferTask to convert string to TaskId for TodayView
  const handleUndeferForTodayView = async (taskId: TaskId) => {
    await onUndeferTask(taskId.value);
  };

  // Adapter for onCreateTask to match TodayView signature
  const handleCreateTaskForTodayView = async (
    title: string,
    category: TaskCategory
  ): Promise<boolean> => {
    return await onCreateTask(title, category);
  };

  // Adapter for onCreateTask to match TaskList signature
  const handleCreateTaskForTaskList = async (
    title: string,
    category: TaskCategory
  ): Promise<boolean> => {
    return await onCreateTask(title, category);
  };

  // Adapter for onUndefer to convert TaskId to string for TaskList
  const handleUndeferForTaskList = async (taskId: TaskId) => {
    await onUndeferTask(taskId.value);
  };

  // Get proper category for TaskList
  const taskListCategory =
    currentCategory === "today" ||
    currentCategory === "logs" ||
    currentCategory === "sync" ||
    currentCategory === "settings"
      ? undefined
      : currentCategory;

  switch (activeView) {
    case "today":
      return (
        <ViewContainer>
          <TodayView
            dependencies={todayDependencies}
            onEditTask={onEditTask}
            onDeleteTask={onDeleteTask}
            onDefer={onDeferTask}
            onUndefer={handleUndeferForTodayView}
            onLoadTaskLogs={onLoadTaskLogs}
            onCreateTask={handleCreateTaskForTodayView}
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

    case "sync":
      return (
        <ViewContainer>
          <SyncHistoryView dependencies={syncDependencies} />
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
            onCreateTask={handleCreateTaskForTaskList}
            currentCategory={taskListCategory}
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
            onUndefer={handleUndeferForTaskList}
            taskViewModel={taskViewModel}
          />
        </ViewContainer>
      );
  }
};
