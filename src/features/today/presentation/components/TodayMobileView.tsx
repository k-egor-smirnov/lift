import React, { useEffect, useState, useRef } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TaskList } from "../../../tasks/presentation/components/TaskList";
import { LogEntry } from "../../../../shared/application/use-cases/GetTaskLogsUseCase";
import { TodayViewModelDependencies } from "../view-models/TodayViewModel";
import { useTodayViewModelStore } from "../view-models/TodayViewModelStore";
import { Task } from "../../../../shared/domain/entities/Task";
import { toast } from "sonner";
import { getService, tokens } from "../../../../shared/infrastructure/di";
import { ResultUtils } from "../../../../shared/domain/Result";
import { RevertTaskCompletionUseCase } from "../../../../shared/application/use-cases/RevertTaskCompletionUseCase";
import { TaskId } from "../../../../shared/domain/value-objects/TaskId";

interface TodayMobileViewProps {
  dependencies: TodayViewModelDependencies;
  onEditTask?: (taskId: string, newTitle: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onDefer?: (taskId: string, deferDate: Date) => void;
  onUndefer?: (taskId: TaskId) => Promise<void>;
  onReorderTasks?: (tasks: Task[]) => void;
  onLoadTaskLogs?: (taskId: string) => Promise<LogEntry[]>;
  onCreateLog?: (taskId: string, message: string) => Promise<boolean>;
  lastLogs?: Record<string, LogEntry>;
  onCreateTask?: (title: string) => Promise<void>;
}

export const TodayMobileView: React.FC<TodayMobileViewProps> = ({
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
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Use global store
  const {
    tasks,
    loading,
    refreshing,
    error,
    initialize,
    loadTodayTasks,
    removeTaskFromToday,
    completeTask,
    refreshToday,
    clearError,
    getActiveTasks,
    getCompletedTasks,
    getTodayTaskIds,
  } = useTodayViewModelStore();

  // Initialize store with dependencies
  useEffect(() => {
    initialize(dependencies);
  }, [dependencies, initialize]);

  // Load today's tasks on component mount
  useEffect(() => {
    loadTodayTasks();
  }, [loadTodayTasks]);

  const handleCompleteTask = async (taskId: string) => {
    try {
      // Find task to get its title for the notification
      const taskInfo = [...getActiveTasks(), ...getCompletedTasks()].find(
        (t) => t.task.id.value === taskId
      );
      const taskTitle = taskInfo?.task.title.value || "Задача";

      await completeTask(taskId);

      // Show success toast with undo option
      toast.success(`${taskTitle} выполнена`, {
        action: {
          label: "Отменить",
          onClick: async () => {
            await handleRevertCompletion(taskId);
          },
        },
        duration: 5000, // 5 seconds to allow undo
      });
    } catch (error) {
      console.error("Error completing task:", error);
      toast.error("Не удалось выполнить задачу");
    }
  };

  const handleRevertCompletion = async (taskId: string) => {
    try {
      const revertUseCase = getService<RevertTaskCompletionUseCase>(
        tokens.REVERT_TASK_COMPLETION_USE_CASE_TOKEN
      );
      const result = await revertUseCase.execute({ taskId });

      if (ResultUtils.isSuccess(result)) {
        toast.success("Выполнение задачи отменено");
        // Reload today's tasks to reflect changes (silent refresh)
        await loadTodayTasks(undefined, true);
      } else {
        toast.error("Не удалось отменить выполнение задачи");
      }
    } catch (error) {
      console.error("Error reverting task completion:", error);
      toast.error("Произошла ошибка при отмене");
    }
  };

  const handleRemoveFromToday = async (taskId: string) => {
    await removeTaskFromToday(taskId);
  };

  const handleToggleToday = async (taskId: string) => {
    await removeTaskFromToday(taskId);
  };

  const handleEditTask = (taskId: string, newTitle: string) => {
    if (onEditTask) {
      onEditTask(taskId, newTitle);
    }
  };

  const handleDeleteTask = (taskId: string) => {
    if (onDeleteTask) {
      onDeleteTask(taskId);
    } else {
      console.warn(
        "onDeleteTask prop not provided to TodayMobileView - task deletion not available"
      );
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newTaskTitle.trim() && onCreateTask) {
      await onCreateTask(newTaskTitle.trim());
      setNewTaskTitle("");
      // Scroll back to center after creating task
      if (containerRef.current) {
        containerRef.current.scrollTo({
          top: containerRef.current.clientHeight,
          behavior: "smooth",
        });
      }
    }
  };

  const activeTasks = getActiveTasks();
  const completedTasks = getCompletedTasks();
  const allTasks = [...activeTasks, ...completedTasks];

  return (
    <div className="h-screen w-full overflow-hidden bg-gray-50">
      {/* Scroll container with snap points */}
      <div
        ref={containerRef}
        className="h-full overflow-y-auto"
        style={{
          scrollSnapType: "y mandatory",
          scrollBehavior: "smooth",
        }}
      >
        {/* Empty top section for scroll snap */}
        <div
          className="h-screen flex-shrink-0"
          style={{ scrollSnapAlign: "start" }}
        />

        {/* Center section - Input field */}
        <div
          className="h-screen flex-shrink-0 flex items-center justify-center px-6"
          style={{ scrollSnapAlign: "start" }}
        >
          <div className="w-full max-w-md">
            <form onSubmit={handleCreateTask} className="relative">
              <input
                ref={inputRef}
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder={t("todayView.addNewTask") || "Add a new task..."}
                className="w-full px-6 py-4 text-lg bg-white border-2 border-gray-200 rounded-2xl shadow-lg focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-200"
                autoComplete="off"
              />
              {newTaskTitle.trim() && (
                <button
                  type="submit"
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 p-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors duration-200"
                >
                  <Plus className="w-5 h-5" />
                </button>
              )}
            </form>

            {/* Subtle hint text */}
            <p className="text-center text-gray-400 text-sm mt-4">
              {allTasks.length > 0
                ? "Swipe down to see your tasks"
                : "Start by adding your first task"}
            </p>
          </div>
        </div>

        {/* Bottom section - Task list */}
        <div
          className="min-h-screen flex-shrink-0 bg-white"
          style={{ scrollSnapAlign: "start" }}
        >
          <div className="px-4 py-6">
            {/* Header */}
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 text-center">
                Today's Tasks
              </h2>
              {allTasks.length > 0 && (
                <p className="text-center text-gray-500 mt-2">
                  {activeTasks.length} active, {completedTasks.length} completed
                </p>
              )}

              {/* Refreshing indicator */}
              {refreshing && (
                <div className="flex items-center justify-center mt-3">
                  <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-sm">
                    <div className="w-3 h-3 border border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    Обновление...
                  </div>
                </div>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <p className="text-sm text-red-800">{error}</p>
                  <button
                    onClick={clearError}
                    className="text-red-400 hover:text-red-600 ml-2"
                  >
                    <svg
                      className="h-4 w-4"
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
            )}

            {/* Loading State */}
            {loading && (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-2 text-gray-600">Loading tasks...</p>
              </div>
            )}

            {/* Task List */}
            {/* Show tasks if not loading OR if we have existing tasks (to prevent flickering during refresh) */}
            {(!loading || allTasks.length > 0) && (
              <>
                {allTasks.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-gray-400 mb-4">
                      <svg
                        className="w-16 h-16 mx-auto"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1}
                          d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                        />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      No tasks for today
                    </h3>
                    <p className="text-gray-500">
                      Swipe up to add your first task
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Active Tasks */}
                    {activeTasks.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                          <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                          Active ({activeTasks.length})
                        </h3>
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
                      </div>
                    )}

                    {/* Completed Tasks */}
                    {completedTasks.length > 0 && (
                      <div className={activeTasks.length > 0 ? "mt-8" : ""}>
                        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                          Completed ({completedTasks.length})
                        </h3>
                        <TaskList
                          tasks={completedTasks.map(
                            (taskInfo) => taskInfo.task
                          )}
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
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
