import React, { useEffect, useId } from "react";
import { Sun, FileText, Zap, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TaskList } from "../../../tasks/presentation/components/TaskList";
import { LogEntry } from "../../../../shared/application/use-cases/GetTaskLogsUseCase";
import { TodayViewModelDependencies } from "../view-models/TodayViewModel";
import { useTodayViewModelStore } from "../view-models/TodayViewModelStore";
import { Task } from "../../../../shared/domain/entities/Task";
import { TaskCategory } from "../../../../shared/domain/types";
import { DateOnly } from "../../../../shared/domain/value-objects/DateOnly";
import { toast } from "sonner";
import { getService, tokens } from "../../../../shared/infrastructure/di";
import { RevertTaskCompletionUseCase } from "../../../../shared/application/use-cases/RevertTaskCompletionUseCase";
import { ResultUtils } from "../../../../shared/domain/Result";
import { InlineTaskCreator } from "../../../../shared/ui/components/InlineTaskCreator";
import { TaskId } from "../../../../shared/domain/value-objects/TaskId";

interface TodayViewProps {
  dependencies: TodayViewModelDependencies;
  onEditTask?: (taskId: string, newTitle: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onDefer?: (taskId: string, deferDate: Date) => void;
  onUndefer?: (taskId: TaskId) => Promise<void>;
  onReorderTasks?: (tasks: Task[]) => void;
  onLoadTaskLogs?: (taskId: string) => Promise<LogEntry[]>;
  onCreateLog?: (taskId: string, message: string) => Promise<boolean>;
  lastLogs?: Record<string, LogEntry>;
  onCreateTask?: (title: string, category: TaskCategory) => Promise<boolean>;
}

export const TodayView: React.FC<TodayViewProps> = ({
  dependencies,
  onEditTask,
  onDeleteTask,
  onDefer,
  onUndefer,
  onReorderTasks,
  onLoadTaskLogs,
  onCreateLog,
  lastLogs = {},
  onCreateTask,
}) => {
  const { t } = useTranslation();
  
  // Use global store
  const {
    tasks,
    loading,
    refreshing,
    error,
    currentDate,
    totalCount,
    completedCount,
    activeCount,
    initialize,
    loadTodayTasks,
    addTaskToToday,
    removeTaskFromToday,
    completeTask,
    refreshToday,
    clearError,
    getActiveTasks,
    getCompletedTasks,
    getTodayTaskIds,
    isToday,
  } = useTodayViewModelStore();
  const id = useId();

  // Initialize store with dependencies
  useEffect(() => {
    initialize(dependencies);
  }, [dependencies, initialize]);

  // Load today's tasks on component mount
  useEffect(() => {
    loadTodayTasks();
  }, [loadTodayTasks]);

  // Note: Removed __todayViewRefresh as it's replaced by event bus auto-refresh

  // Auto-refresh when it becomes a new day (daily reset handling)
  useEffect(() => {
    const checkForNewDay = () => {
      if (!isToday()) {
        // Daily reset: load today's tasks (which will create new DailySelection if needed)
        loadTodayTasks();
      }
    };

    // Check every minute for day change
    const interval = setInterval(checkForNewDay, 60000);
    return () => clearInterval(interval);
  }, [isToday, loadTodayTasks]);

  const handleCompleteTask = async (taskId: string) => {
    try {
      // Find task to get its title for the notification
      const taskInfo = [...getActiveTasks(), ...getCompletedTasks()].find(
        (t) => t.task.id.value === taskId
      );
      const taskTitle = taskInfo?.task.title.value || "Task";

      const success = await completeTask(taskId);
      if (success) {
        // Show success toast with undo option
        toast.success(`"${taskTitle}" completed!`, {
          action: {
            label: "Undo",
            onClick: async () => {
              await handleRevertCompletion(taskId);
            },
          },
          duration: 5000, // 5 seconds to allow undo
        });
      }
      return success;
    } catch (error) {
      console.error("Error completing task:", error);
      toast.error("Failed to complete task");
      return false;
    }
  };

  const handleRevertCompletion = async (taskId: string) => {
    try {
      const revertUseCase = getService<RevertTaskCompletionUseCase>(
        tokens.REVERT_TASK_COMPLETION_USE_CASE_TOKEN
      );
      const result = await revertUseCase.execute({ taskId });

      if (ResultUtils.isSuccess(result)) {
        // Find task to get its title for the notification
        const taskInfo = [...getActiveTasks(), ...getCompletedTasks()].find(
          (t) => t.task.id.value === taskId
        );
        const taskTitle = taskInfo?.task.title.value || "Task";
        toast.success(`"${taskTitle}" reverted to active!`);
        // Reload today's tasks to reflect changes (silent refresh)
        await loadTodayTasks(undefined, true);
        return true;
      } else {
        toast.error("Failed to revert task completion");
        return false;
      }
    } catch (error) {
      console.error("Error reverting task completion:", error);
      toast.error("Failed to revert task completion");
      return false;
    }
  };

  const handleRemoveFromToday = async (taskId: string) => {
    await removeTaskFromToday(taskId);
  };

  const handleToggleToday = async (taskId: string) => {
    // Since we're in TodayView, all tasks are already in today's selection
    // So the sun icon should remove them from today
    await removeTaskFromToday(taskId);
  };

  const handleEditTask = (taskId: string, newTitle: string) => {
    if (onEditTask) {
      onEditTask(taskId, newTitle);
    } else {
      alert(`Edit task: ${taskId} to "${newTitle}"`);
    }
  };

  const handleDeleteTask = (taskId: string) => {
    if (onDeleteTask) {
      onDeleteTask(taskId);
    } else {
      if (confirm("Are you sure you want to delete this task?")) {
        // For now, just remove from today - actual deletion should be handled by parent
        handleRemoveFromToday(taskId);
      }
    }
  };

  const activeTasks = getActiveTasks();
  const completedTasks = getCompletedTasks();

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString + "T00:00:00");
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (dateString === today.toISOString().split("T")[0]) {
      return "Today";
    } else if (dateString === yesterday.toISOString().split("T")[0]) {
      return "Yesterday";
    } else if (dateString === tomorrow.toISOString().split("T")[0]) {
      return "Tomorrow";
    } else {
      return date.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Stats */}
      <div className="mb-8">
        {/* Progress Bar */}
        {totalCount > 0 && (
          <div
            className="mt-6"
            role="region"
            aria-label="Task completion progress"
          >
            <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
              <span>{t("todayView.progress")}</span>
              <span
                aria-label={`${Math.round(
                  (completedCount / totalCount) * 100
                )} percent complete`}
              >
                {Math.round((completedCount / totalCount) * 100)}%{" "}
                {t("todayView.complete")}
              </span>
            </div>
            <div
              className="w-full bg-gray-200 rounded-full h-2"
              role="progressbar"
              aria-valuenow={Math.round((completedCount / totalCount) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="bg-green-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(completedCount / totalCount) * 100}%` }}
                aria-hidden="true"
              />
            </div>
          </div>
        )}
      </div>

      {/* Inline Task Creator */}
      {onCreateTask && (
        <div className="mb-6">
          <InlineTaskCreator
            onCreateTask={onCreateTask}
            category={TaskCategory.INBOX}
            placeholder="Добавить задачу на сегодня..."
          />
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
            <div className="ml-auto pl-3">
              <button
                onClick={clearError}
                className="text-red-400 hover:text-red-600"
              >
                <span className="sr-only">Dismiss</span>
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading today's tasks...</p>
        </div>
      )}

      {/* Content */}
      {/* Show content if not loading OR if we have existing tasks (to prevent flickering during refresh) */}
      {(!loading || totalCount > 0) && (
        <>
          {/* Empty State */}
          {totalCount === 0 && (
            <div
              className="text-center py-8 sm:py-12"
              role="region"
              aria-label="Empty state"
            >
              <div className="mb-4 flex justify-center">
                <Sun className="w-16 h-16 sm:w-24 sm:h-24 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {t("todayView.noTasksSelected")}
              </h3>
              <p className="text-gray-500 mb-6 px-4 sm:px-0">
                {t("todayView.startByAdding")}
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
                <p className="text-sm text-blue-800">
                  <strong>{t("todayView.tip")}:</strong>{" "}
                  {t("todayView.dailySelectionResets")}
                </p>
              </div>
            </div>
          )}

          {/* Active Tasks */}
          {activeTasks.length > 0 && (
            <section className="mb-8" aria-labelledby="active-tasks-heading">
              <h2
                id="active-tasks-heading"
                className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2"
              >
                <span className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-500" />{" "}
                  {t("todayView.activeTasks")}
                </span>
                <span
                  className="inline-flex items-center px-2 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
                  aria-label={`${activeTasks.length} active tasks`}
                >
                  {activeTasks.length}
                </span>
              </h2>
              <TaskList
                tasks={activeTasks.map((taskInfo) => taskInfo.task)}
                onComplete={handleCompleteTask}
                onRevertCompletion={handleRevertCompletion}
                onEdit={handleEditTask}
                onDelete={handleDeleteTask}
                onAddToToday={handleToggleToday}
                onDefer={onDefer}
                onUndefer={onUndefer}
                onReorder={onReorderTasks}
                showTodayButton={true}
                showDeferButton={true}
                lastLogs={lastLogs}
                onLoadTaskLogs={onLoadTaskLogs}
                onCreateLog={onCreateLog}
                groupByCategory={false}
                todayTaskIds={getTodayTaskIds()}
              />
            </section>
          )}

          {/* Completed Tasks */}
          {completedTasks.length > 0 && (
            <section aria-labelledby="completed-tasks-heading">
              <h2
                id="completed-tasks-heading"
                className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2"
              >
                <span className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-500" />{" "}
                  {t("todayView.completedTasks")}
                </span>
                <span
                  className="inline-flex items-center px-2 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800"
                  aria-label={`${completedTasks.length} completed tasks`}
                >
                  {completedTasks.length}
                </span>
              </h2>
              <TaskList
                tasks={completedTasks.map((taskInfo) => taskInfo.task)}
                onComplete={undefined}
                onRevertCompletion={handleRevertCompletion}
                onEdit={handleEditTask}
                onDelete={handleDeleteTask}
                onAddToToday={handleToggleToday}
                onDefer={onDefer}
                onUndefer={onUndefer}
                onReorder={onReorderTasks}
                showTodayButton={true}
                showDeferButton={false}
                lastLogs={lastLogs}
                onLoadTaskLogs={onLoadTaskLogs}
                onCreateLog={onCreateLog}
                groupByCategory={false}
                todayTaskIds={getTodayTaskIds()}
              />
            </section>
          )}
        </>
      )}
    </div>
  );
};
