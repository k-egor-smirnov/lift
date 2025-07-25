import React, { useCallback, useEffect, useMemo, useState } from "react";
import { TaskCategory } from "../shared/domain/types";
import { Task } from "../shared/domain/entities/Task";
import { TaskList } from "../features/tasks/presentation/components/TaskList";

import { TodayView } from "../features/today/presentation/components/TodayView";
import { TodayMobileView } from "../features/today/presentation/components/TodayMobileView";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import {
  createTaskViewModel,
  TaskViewModelDependencies,
} from "../features/tasks/presentation/view-models/TaskViewModel";
import {
  TodayViewModelDependencies,
  createTodayViewModel,
} from "../features/today/presentation/view-models/TodayViewModel";
import { useKeyboardShortcuts } from "../shared/infrastructure/services/useKeyboardShortcuts";
import { DailyModalContainer } from "../features/onboarding";
import { useOnboardingViewModel } from "../features/onboarding/presentation/view-models/OnboardingViewModel";
import { LogEntry } from "../shared/application/use-cases/GetTaskLogsUseCase";
import { DevDayTransition } from "./components/DevDayTransition";

// Import DI container and tokens
import { getService, tokens } from "../shared/infrastructure/di";
import { TodoDatabase } from "../shared/infrastructure/database/TodoDatabase";
import { TaskRepository } from "../shared/domain/repositories/TaskRepository";
import { CreateTaskUseCase } from "../shared/application/use-cases/CreateTaskUseCase";
import { UpdateTaskUseCase } from "../shared/application/use-cases/UpdateTaskUseCase";
import { ReorderTasksUseCase } from "../shared/application/use-cases/ReorderTasksUseCase";
import { CompleteTaskUseCase } from "../shared/application/use-cases/CompleteTaskUseCase";
import { GetTodayTasksUseCase } from "../shared/application/use-cases/GetTodayTasksUseCase";
import { AddTaskToTodayUseCase } from "../shared/application/use-cases/AddTaskToTodayUseCase";
import { RemoveTaskFromTodayUseCase } from "../shared/application/use-cases/RemoveTaskFromTodayUseCase";
import { LogService } from "../shared/application/services/LogService";
import { toast, Toaster } from "sonner";

export const MVPApp: React.FC = () => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const [activeView, setActiveView] = useState<"today" | TaskCategory>("today");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDbReady, setIsDbReady] = useState(false);
  const [, setTaskLogs] = useState<Record<string, LogEntry[]>>({});
  const [lastLogs, setLastLogs] = useState<Record<string, LogEntry>>({});
  const [todayTaskIds, setTodayTaskIds] = useState<string[]>([]);

  // Check if device is mobile and in development mode
  const isMobile = () => {
    return (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ) || window.innerWidth <= 768
    );
  };

  const shouldUseMobileView =
    false &&
    process.env.NODE_ENV === "development" &&
    isMobile() &&
    activeView === "today";

  // Get services from DI container
  const database = getService<TodoDatabase>(tokens.DATABASE_TOKEN);
  const taskRepository = getService<TaskRepository>(
    tokens.TASK_REPOSITORY_TOKEN
  );
  const createTaskUseCase = getService<CreateTaskUseCase>(
    tokens.CREATE_TASK_USE_CASE_TOKEN
  );
  const updateTaskUseCase = getService<UpdateTaskUseCase>(
    tokens.UPDATE_TASK_USE_CASE_TOKEN
  );
  const reorderTasksUseCase = getService<ReorderTasksUseCase>(
    tokens.REORDER_TASKS_USE_CASE_TOKEN
  );
  const completeTaskUseCase = getService<CompleteTaskUseCase>(
    tokens.COMPLETE_TASK_USE_CASE_TOKEN
  );
  const getTodayTasksUseCase = getService<GetTodayTasksUseCase>(
    tokens.GET_TODAY_TASKS_USE_CASE_TOKEN
  );
  const addTaskToTodayUseCase = getService<AddTaskToTodayUseCase>(
    tokens.ADD_TASK_TO_TODAY_USE_CASE_TOKEN
  );
  const removeTaskFromTodayUseCase = getService<RemoveTaskFromTodayUseCase>(
    tokens.REMOVE_TASK_FROM_TODAY_USE_CASE_TOKEN
  );
  const logService = getService<LogService>(tokens.LOG_SERVICE_TOKEN);

  // Create dependencies for view models
  const taskDependencies: TaskViewModelDependencies = useMemo(
    () => ({
      taskRepository,
      createTaskUseCase,
      updateTaskUseCase,
      completeTaskUseCase,
      getTodayTasksUseCase,
    }),
    []
  );

  const todayDependencies: TodayViewModelDependencies = useMemo(
    () => ({
      getTodayTasksUseCase,
      addTaskToTodayUseCase,
      removeTaskFromTodayUseCase,
      completeTaskUseCase,
    }),
    []
  );

  // Create the view model instances
  const taskViewModel = useMemo(
    () => createTaskViewModel(taskDependencies),
    []
  );
  const todayViewModel = useMemo(
    () => createTodayViewModel(todayDependencies),
    []
  );

  // Initialize keyboard shortcuts
  const { registerShortcut, unregisterShortcut, isEnabled } =
    useKeyboardShortcuts();

  // Subscribe to the view model state
  const {
    loading,
    error,
    getFilteredTasks,
    getTasksByCategory,
    loadTasks,
    createTask,
    completeTask,
    deleteTask,
    setFilter: setViewModelFilter,
    clearError,
    getTodayTaskIds: getTaskViewModelTodayTaskIds,
  } = taskViewModel();

  // Subscribe to today view model for getting today task IDs
  const { getTodayTaskIds } = todayViewModel();

  // Initialize database and load tasks on component mount
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Ensure database is open
        await database.open();
        setIsDbReady(true);
        // Load tasks after database is ready
        await loadTasks();
      } catch (error) {
        console.error("Failed to initialize database:", error);
      }
    };

    initializeApp();
  }, [database, loadTasks]);

  // Load logs after tasks are loaded
  useEffect(() => {
    if (isDbReady && !loading) {
      loadAllTaskLogs();
      loadTodayTaskIds();
    }
  }, [isDbReady, loading]);

  // Load today task IDs
  const loadTodayTaskIds = async () => {
    try {
      const ids = await getTaskViewModelTodayTaskIds();
      setTodayTaskIds(ids);
    } catch (error) {
      console.error("Error loading today task IDs:", error);
      setTodayTaskIds([]);
    }
  };

  // Register keyboard shortcuts
  useEffect(() => {
    if (!isEnabled) return;

    // Task creation shortcut (Ctrl+N)
    registerShortcut("create-task", {
      key: "n",
      ctrlKey: true,
      handler: (event) => {
        event.preventDefault();
        setIsCreateModalOpen(true);
      },
      description: "Create new task",
      category: "tasks",
    });

    // Custom log shortcut (Ctrl+L)
    registerShortcut("create-log", {
      key: "l",
      ctrlKey: true,
      handler: (event) => {
        event.preventDefault();
        setIsCreateModalOpen(true);
      },
      description: "Create custom log",
      category: "logs",
    });

    // Category navigation shortcuts
    registerShortcut("nav-simple", {
      key: "1",
      handler: (event) => {
        event.preventDefault();
        setActiveView(TaskCategory.SIMPLE);
      },
      description: "Navigate to Simple tasks",
      category: "navigation",
    });

    registerShortcut("nav-focus", {
      key: "2",
      handler: (event) => {
        event.preventDefault();
        setActiveView(TaskCategory.FOCUS);
      },
      description: "Navigate to Focus tasks",
      category: "navigation",
    });

    registerShortcut("nav-inbox", {
      key: "3",
      handler: (event) => {
        event.preventDefault();
        setActiveView(TaskCategory.INBOX);
      },
      description: "Navigate to Inbox tasks",
      category: "navigation",
    });

    // Today view shortcut (T)
    registerShortcut("nav-today", {
      key: "t",
      handler: (event) => {
        event.preventDefault();
        setActiveView("today");
      },
      description: "Navigate to Today view",
      category: "navigation",
    });

    // Cleanup shortcuts on unmount or when disabled
    return () => {
      unregisterShortcut("create-task");
      unregisterShortcut("create-log");
      unregisterShortcut("nav-simple");
      unregisterShortcut("nav-focus");
      unregisterShortcut("nav-inbox");
      unregisterShortcut("nav-today");
    };
  }, [isEnabled, registerShortcut, unregisterShortcut]);

  // Update view model filter when active view changes
  useEffect(() => {
    if (activeView === "today") {
      setViewModelFilter({});
    } else {
      setViewModelFilter({ category: activeView });
    }
  }, [activeView]); // Remove setViewModelFilter from dependencies

  const handleCreateTask = useCallback(async (
    title: string,
    category: TaskCategory
  ): Promise<boolean> => {
    const success = await createTask({ title, category });
    if (success) {
      setIsCreateModalOpen(false);

      // If we're on the Today view, automatically add the newly created task to today
      if (activeView === "today") {
        try {
          // Get the newly created task ID from the task repository
          // Since we just created the task, it should be the most recent one
          const tasks = await taskRepository.findAll();
          const newestTask = tasks.sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
          )[0];

          if (newestTask) {
            const result = await addTaskToTodayUseCase.execute({
              taskId: newestTask.id.value,
            });
            if (result.success) {
              console.log("Task automatically added to today");
              // Note: Don't reload todayTaskIds here - let the event bus handle updates
              // This prevents unnecessary state updates that cause UI flickering
            } else {
              console.error(
                "Failed to automatically add task to today:",
                (result as any).error.message
              );
            }
          }
        } catch (error) {
          console.error("Error automatically adding task to today:", error);
        }
      }
    }
    return success;
  }, [createTask, activeView, taskRepository, addTaskToTodayUseCase]);

  const handleCompleteTask = useCallback(async (taskId: string) => {
    try {
      await completeTask(taskId);

      // Show success toast with undo option
      toast.success("Задача выполнена", {
        action: {
          label: "Отменить",
          onClick: async () => {
            try {
              const revertUseCase = getService<any>(
                tokens.REVERT_TASK_COMPLETION_USE_CASE_TOKEN
              );
              const result = await revertUseCase.execute({ taskId });

              if (result.isSuccess()) {
                toast.success("Выполнение задачи отменено");
                // Reload tasks to reflect changes
                await loadTasks();
                // Note: Event bus will handle today updates automatically
              } else {
                toast.error("Не удалось отменить выполнение задачи");
              }
            } catch (error) {
              console.error("Error reverting task completion:", error);
              toast.error("Произошла ошибка при отмене");
            }
          },
        },
        duration: 5000, // 5 seconds to allow undo
      });
    } catch (error) {
      console.error("Error completing task:", error);
      toast.error("Не удалось выполнить задачу");
    }
  }, [completeTask, loadTasks]);

  const handleEditTask = useCallback(async (taskId: string, newTitle: string) => {
    try {
      const success = await updateTaskUseCase.execute({
        taskId,
        title: newTitle,
      });

      if (success.success) {
        // Reload tasks to reflect changes
        await loadTasks();
      } else {
        console.error(
          "Failed to update task:",
          (success as any).error?.message
        );
      }
    } catch (error) {
      console.error("Error updating task:", error);
    }
  }, [updateTaskUseCase, loadTasks]);

  const handleDeleteTask = useCallback(async (taskId: string) => {
    if (confirm("Are you sure you want to delete this task?")) {
      await deleteTask(taskId);
    }
  }, [deleteTask]);

  const handleAddToToday = useCallback(async (taskId: string) => {
    try {
      // Check if task is already in today's selection
      const isInToday = todayTaskIds.includes(taskId);

      if (isInToday) {
        // Remove from today
        const result = await removeTaskFromTodayUseCase.execute({ taskId });
        if (result.success) {
          console.log("Task removed from today successfully");
          // Note: Event bus will handle UI updates automatically
        } else {
          console.error(
            "Failed to remove task from today:",
            (result as any).error.message
          );
        }
      } else {
        // Add to today
        const result = await addTaskToTodayUseCase.execute({ taskId });
        if (result.success) {
          console.log("Task added to today successfully");
          // Note: Event bus will handle UI updates automatically
        } else {
          console.error(
            "Failed to add task to today:",
            (result as any).error.message
          );
        }
      }
    } catch (error) {
      console.error("Error toggling task in today:", error);
    }
  }, [todayTaskIds, removeTaskFromTodayUseCase, addTaskToTodayUseCase]);

  const handleReturnTaskToToday = useCallback(async (taskId: string) => {
    try {
      const result = await addTaskToTodayUseCase.execute({ taskId });
      if (result.success) {
        console.log("Task returned to today successfully");

        // Refresh the daily modal data to remove the task from modal lists
        const { loadDailyModalData } = useOnboardingViewModel.getState();
        await loadDailyModalData();

        // Note: TodayView will auto-refresh via event bus when task is returned
      } else {
        console.error(
          "Failed to return task to today:",
          (result as any).error.message
        );
      }
    } catch (error) {
      console.error("Error returning task to today:", error);
    }
  }, [addTaskToTodayUseCase]);

  const handleViewChange = useCallback((view: "today" | TaskCategory) => {
    setActiveView(view);
  }, []);

  const loadTaskLogs = useCallback(async (taskId: string): Promise<LogEntry[]> => {
    try {
      const logs = await logService.loadTaskLogs(taskId);
      setTaskLogs((prev) => ({ ...prev, [taskId]: logs }));

      // Update last log for this task
      if (logs.length > 0) {
        setLastLogs((prev) => ({ ...prev, [taskId]: logs[0] }));
      }

      return logs;
    } catch (error) {
      console.error("Error loading logs:", error);
      return [];
    }
  }, [logService]);

  const handleCreateTaskLog = useCallback(async (
    taskId: string,
    message: string
  ): Promise<boolean> => {
    try {
      const success = await logService.createLog(taskId, message);
      if (success) {
        // Reload logs for this task
        await loadTaskLogs(taskId);
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error("Error creating log:", error);
      return false;
    }
  }, [logService, loadTaskLogs]);

  const loadAllTaskLogs = useCallback(async () => {
    try {
      const tasks = getFilteredTasks();
      if (tasks.length > 0) {
        const taskIds = tasks.map((task) => task.id.value);
        const lastLogsMap = await logService.loadLastLogsForTasks(taskIds);
        setLastLogs(lastLogsMap);
      }
    } catch (error) {
      console.error("Error loading all task logs:", error);
    }
  }, [getFilteredTasks, logService]);

  const handleMobileMenuClose = useCallback(() => {
    setIsMobileMenuOpen(false);
  }, []);

  const handleMobileMenuToggle = useCallback(() => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  }, [isMobileMenuOpen]);

  const handleReorderTasks = useCallback(async (reorderedTasks: Task[]) => {
    try {
      // Create task orders array with new order values
      const taskOrders = reorderedTasks.map((task, index) => ({
        taskId: task.id.value,
        order: Date.now() + index, // Use timestamp + index to ensure unique ordering
      }));

      // Execute reorder use case
      await reorderTasksUseCase.execute({ taskOrders });

      // Reload tasks to reflect the new order
      await loadTasks();
    } catch (error) {
      console.error("Error reordering tasks:", error);
    }
  }, [reorderTasksUseCase, loadTasks]);

  // Note: Removed handleTodayRefresh as it's replaced by event bus auto-refresh

  const handleMobileCreateTask = useCallback(async (title: string): Promise<void> => {
    try {
      const success = await createTask({ title, category: TaskCategory.INBOX });
      if (success) {
        // Get the newly created task and add it to today
        const tasks = await taskRepository.findAll();
        const newestTask = tasks.sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        )[0];

        if (newestTask) {
          const result = await addTaskToTodayUseCase.execute({
            taskId: newestTask.id.value,
          });
          if (result.success) {
            // Note: Event bus will handle UI updates automatically
          }
        }
      }
    } catch (error) {
      console.error("Error creating task from mobile view:", error);
    }
  }, [createTask, taskRepository, addTaskToTodayUseCase]);

  const tasksByCategory = getTasksByCategory();
  const taskCounts: Record<TaskCategory, number> = useMemo(() => ({
    [TaskCategory.INBOX]: tasksByCategory[TaskCategory.INBOX]?.length || 0,
    [TaskCategory.SIMPLE]: tasksByCategory[TaskCategory.SIMPLE]?.length || 0,
    [TaskCategory.FOCUS]: tasksByCategory[TaskCategory.FOCUS]?.length || 0,
  }), [tasksByCategory]);

  // Show loading state while database is initializing
  if (!isDbReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
          <p className="text-muted-foreground">Initializing database...</p>
        </div>
      </div>
    );
  }

  // Get the current category for modal
  const currentCategory =
    activeView === "today" ? TaskCategory.INBOX : activeView;
  const hideCategorySelection = activeView !== "today";

  // If mobile view should be used, render it directly without sidebar/header
  if (shouldUseMobileView) {
    return (
      <TodayMobileView
        dependencies={todayDependencies}
        onEditTask={handleEditTask}
        onDeleteTask={handleDeleteTask}
        onReorderTasks={handleReorderTasks}
        onLoadTaskLogs={loadTaskLogs}
        onCreateLog={handleCreateTaskLog}
        lastLogs={lastLogs}
        onCreateTask={handleMobileCreateTask}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <Sidebar
        activeView={activeView}
        onViewChange={handleViewChange}
        taskCounts={taskCounts}
        isMobileMenuOpen={isMobileMenuOpen}
        onMobileMenuClose={handleMobileMenuClose}
      />

      {/* Main Content */}
      <div className="md:ml-64">
        {/* Header */}
        <Header
          activeView={activeView}
          onMobileMenuToggle={handleMobileMenuToggle}
        />

        {/* Content */}
        <main className="p-6 px-4 md:px-6 pt-32 md:pt-6">
          {/* Error Message */}
          {error && (
            <div
              className="mb-6 bg-destructive/10 border border-destructive/20 rounded-md p-4"
              data-testid="error-message"
            >
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-destructive"
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
                  <p className="text-sm text-destructive">{error}</p>
                </div>
                <div className="ml-auto pl-3">
                  <button
                    onClick={clearError}
                    className="text-destructive/60 hover:text-destructive"
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
            <div className="text-center py-12" data-testid="loading-state">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="mt-2 text-muted-foreground">Loading tasks...</p>
            </div>
          )}

          {/* Content based on active view */}
          {!loading && (
            <>
              {activeView === "today" ? (
                <TodayView
                  dependencies={todayDependencies}
                  onEditTask={handleEditTask}
                  onDeleteTask={handleDeleteTask}
                  onLoadTaskLogs={loadTaskLogs}
                  onCreateTask={handleCreateTask}
                  onCreateLog={handleCreateTaskLog}
                  lastLogs={lastLogs}
                />
              ) : (
                <TaskList
                  tasks={getFilteredTasks()}
                  groupByCategory={false}
                  showTodayButton={true}
                  onCreateTask={handleCreateTask}
                  currentCategory={currentCategory}
                  onComplete={handleCompleteTask}
                  onEdit={handleEditTask}
                  onDelete={handleDeleteTask}
                  onAddToToday={handleAddToToday}
                  onReorder={handleReorderTasks}
                  onLoadTaskLogs={loadTaskLogs}
                  onCreateLog={handleCreateTaskLog}
                  lastLogs={lastLogs}
                  emptyMessage={`No ${activeView.toLowerCase()} tasks found`}
                  todayTaskIds={todayTaskIds}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Daily Modal for onboarding */}
      <DailyModalContainer onReturnTaskToToday={handleReturnTaskToToday} />

      {/* Dev Day Transition - only show in development */}
      {process.env.NODE_ENV === "development" && <DevDayTransition />}

      {/* Toast notifications */}
      <Toaster position="top-right" richColors />
    </div>
  );
};
