import React, { useEffect, useMemo, useState } from 'react';
import { TaskCategory } from '../shared/domain/types';
import { TaskList } from '../features/tasks/presentation/components/TaskList';
import { CreateTaskModal } from './components/CreateTaskModal';
import { CreateLogModal } from './components/CreateLogModal';
import { TodayView } from '../features/today/presentation/components/TodayView';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { createTaskViewModel, TaskViewModelDependencies } from '../features/tasks/presentation/view-models/TaskViewModel';
import { TodayViewModelDependencies } from '../features/today/presentation/view-models/TodayViewModel';
import { useKeyboardShortcuts } from '../shared/infrastructure/services/useKeyboardShortcuts';
import { DailyModalContainer } from '../features/onboarding';
import { LogEntry } from '../shared/application/use-cases/GetTaskLogsUseCase';
import { DevDailyModalSimulator } from './components/DevDailyModalSimulator';
import { DevTimeSimulator } from './components/DevTimeSimulator';

// Import DI container and tokens
import { getService, tokens } from '../shared/infrastructure/di';
import { TodoDatabase } from '../shared/infrastructure/database/TodoDatabase';
import { TaskRepository } from '../shared/domain/repositories/TaskRepository';
import { CreateTaskUseCase } from '../shared/application/use-cases/CreateTaskUseCase';
import { UpdateTaskUseCase } from '../shared/application/use-cases/UpdateTaskUseCase';
import { CompleteTaskUseCase } from '../shared/application/use-cases/CompleteTaskUseCase';
import { GetTodayTasksUseCase } from '../shared/application/use-cases/GetTodayTasksUseCase';
import { AddTaskToTodayUseCase } from '../shared/application/use-cases/AddTaskToTodayUseCase';
import { RemoveTaskFromTodayUseCase } from '../shared/application/use-cases/RemoveTaskFromTodayUseCase';
import { LogService } from '../shared/application/services/LogService';

export const MVPApp: React.FC = () => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreateLogModalOpen, setIsCreateLogModalOpen] = useState(false);
  const [selectedTaskForLog, setSelectedTaskForLog] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'today' | TaskCategory>('today');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDbReady, setIsDbReady] = useState(false);
  const [, setTaskLogs] = useState<Record<string, LogEntry[]>>({});
  const [lastLogs, setLastLogs] = useState<Record<string, LogEntry>>({});

  // Get services from DI container
  const database = getService<TodoDatabase>(tokens.DATABASE_TOKEN);
  const taskRepository = getService<TaskRepository>(tokens.TASK_REPOSITORY_TOKEN);
  const createTaskUseCase = getService<CreateTaskUseCase>(tokens.CREATE_TASK_USE_CASE_TOKEN);
  const updateTaskUseCase = getService<UpdateTaskUseCase>(tokens.UPDATE_TASK_USE_CASE_TOKEN);
  const completeTaskUseCase = getService<CompleteTaskUseCase>(tokens.COMPLETE_TASK_USE_CASE_TOKEN);
  const getTodayTasksUseCase = getService<GetTodayTasksUseCase>(tokens.GET_TODAY_TASKS_USE_CASE_TOKEN);
  const addTaskToTodayUseCase = getService<AddTaskToTodayUseCase>(tokens.ADD_TASK_TO_TODAY_USE_CASE_TOKEN);
  const removeTaskFromTodayUseCase = getService<RemoveTaskFromTodayUseCase>(tokens.REMOVE_TASK_FROM_TODAY_USE_CASE_TOKEN);
  const logService = getService<LogService>(tokens.LOG_SERVICE_TOKEN);

  // Create dependencies for view models
  const taskDependencies: TaskViewModelDependencies = {
    taskRepository,
    createTaskUseCase,
    updateTaskUseCase,
    completeTaskUseCase,
  };

  const todayDependencies: TodayViewModelDependencies = {
    getTodayTasksUseCase,
    addTaskToTodayUseCase,
    removeTaskFromTodayUseCase,
    completeTaskUseCase,
  };

  // Create the view model instance
  const taskViewModel = useMemo(() => createTaskViewModel(taskDependencies), []);

  // Initialize keyboard shortcuts
  const { registerShortcut, unregisterShortcut, isEnabled } = useKeyboardShortcuts();

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
  } = taskViewModel();

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
        console.error('Failed to initialize database:', error);
      }
    };

    initializeApp();
  }, [database, loadTasks]);

  // Load logs after tasks are loaded
  useEffect(() => {
    if (isDbReady && !loading) {
      loadAllTaskLogs();
    }
  }, [isDbReady, loading]);

  // Register keyboard shortcuts
  useEffect(() => {
    if (!isEnabled) return;

    // Task creation shortcut (Ctrl+N)
    registerShortcut('create-task', {
      key: 'n',
      ctrlKey: true,
      handler: (event) => {
        event.preventDefault();
        setIsCreateModalOpen(true);
      },
      description: 'Create new task',
      category: 'tasks'
    });

    // Custom log shortcut (Ctrl+L)
    registerShortcut('create-log', {
      key: 'l',
      ctrlKey: true,
      handler: (event) => {
        event.preventDefault();
        setIsCreateLogModalOpen(true);
      },
      description: 'Create custom log',
      category: 'logs'
    });

    // Category navigation shortcuts
    registerShortcut('nav-simple', {
      key: '1',
      handler: (event) => {
        event.preventDefault();
        setActiveView(TaskCategory.SIMPLE);
      },
      description: 'Navigate to Simple tasks',
      category: 'navigation'
    });

    registerShortcut('nav-focus', {
      key: '2',
      handler: (event) => {
        event.preventDefault();
        setActiveView(TaskCategory.FOCUS);
      },
      description: 'Navigate to Focus tasks',
      category: 'navigation'
    });

    registerShortcut('nav-inbox', {
      key: '3',
      handler: (event) => {
        event.preventDefault();
        setActiveView(TaskCategory.INBOX);
      },
      description: 'Navigate to Inbox tasks',
      category: 'navigation'
    });

    // Today view shortcut (T)
    registerShortcut('nav-today', {
      key: 't',
      handler: (event) => {
        event.preventDefault();
        setActiveView('today');
      },
      description: 'Navigate to Today view',
      category: 'navigation'
    });

    // Cleanup shortcuts on unmount or when disabled
    return () => {
      unregisterShortcut('create-task');
      unregisterShortcut('create-log');
      unregisterShortcut('nav-simple');
      unregisterShortcut('nav-focus');
      unregisterShortcut('nav-inbox');
      unregisterShortcut('nav-today');
    };
  }, [isEnabled, registerShortcut, unregisterShortcut]);

  // Update view model filter when active view changes
  useEffect(() => {
    if (activeView === 'today') {
      setViewModelFilter({});
    } else {
      setViewModelFilter({ category: activeView });
    }
  }, [activeView]); // Remove setViewModelFilter from dependencies

  const handleCreateTask = async (title: string, category: TaskCategory): Promise<boolean> => {
    const success = await createTask({ title, category });
    if (success) {
      setIsCreateModalOpen(false);
    }
    return success;
  };

  const handleCompleteTask = async (taskId: string) => {
    await completeTask(taskId);
  };

  const handleEditTask = async (taskId: string, newTitle: string) => {
    try {
      const success = await updateTaskUseCase.execute({
        taskId,
        title: newTitle
      });
      
      if (success.success) {
        // Reload tasks to reflect changes
        await loadTasks();
      } else {
        console.error('Failed to update task:', (success as any).error?.message);
      }
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (confirm('Are you sure you want to delete this task?')) {
      await deleteTask(taskId);
    }
  };

  const handleAddToToday = async (taskId: string) => {
    try {
      const result = await addTaskToTodayUseCase.execute({ taskId });
      if (result.success) {
        console.log('Task added to today successfully');
      } else {
        console.error('Failed to add task to today:', (result as any).error.message);
      }
    } catch (error) {
      console.error('Error adding task to today:', error);
    }
  };

  const handleViewChange = (view: 'today' | TaskCategory) => {
    setActiveView(view);
  };

  const handleNewTask = () => {
    setIsCreateModalOpen(true);
  };

  const handleCreateLog = async (message: string): Promise<boolean> => {
    if (!selectedTaskForLog) {
      console.error('No task selected for log creation');
      return false;
    }

    try {
      const success = await logService.createLog(selectedTaskForLog, message);
      if (success) {
        // Reload logs for this task
        await loadTaskLogs(selectedTaskForLog);
        setSelectedTaskForLog(null);
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error('Error creating log:', error);
      return false;
    }
  };

  const handleCreateTaskLog = (taskId: string) => {
    setSelectedTaskForLog(taskId);
    setIsCreateLogModalOpen(true);
  };

  const loadTaskLogs = async (taskId: string): Promise<LogEntry[]> => {
    try {
      const logs = await logService.loadTaskLogs(taskId);
      setTaskLogs(prev => ({ ...prev, [taskId]: logs }));
      
      // Update last log for this task
      if (logs.length > 0) {
        setLastLogs(prev => ({ ...prev, [taskId]: logs[0] }));
      }
      
      return logs;
    } catch (error) {
      console.error('Error loading logs:', error);
      return [];
    }
  };

  const loadAllTaskLogs = async () => {
    try {
      const tasks = getFilteredTasks();
      if (tasks.length > 0) {
        const taskIds = tasks.map(task => task.id.value);
        const lastLogsMap = await logService.loadLastLogsForTasks(taskIds);
        setLastLogs(lastLogsMap);
      }
    } catch (error) {
      console.error('Error loading all task logs:', error);
    }
  };

  const handleMobileMenuClose = () => {
    setIsMobileMenuOpen(false);
  };

  const handleMobileMenuToggle = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };



  const tasksByCategory = getTasksByCategory();
  const taskCounts: Record<TaskCategory, number> = {
    [TaskCategory.INBOX]: tasksByCategory[TaskCategory.INBOX]?.length || 0,
    [TaskCategory.SIMPLE]: tasksByCategory[TaskCategory.SIMPLE]?.length || 0,
    [TaskCategory.FOCUS]: tasksByCategory[TaskCategory.FOCUS]?.length || 0,
  };

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
  const currentCategory = activeView === 'today' ? TaskCategory.INBOX : activeView;
  const hideCategorySelection = activeView !== 'today';

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
          onNewTask={handleNewTask}
          onMobileMenuToggle={handleMobileMenuToggle}
        />

        {/* Content */}
        <main className="p-6">
          {/* Error Message */}
          {error && (
            <div className="mb-6 bg-destructive/10 border border-destructive/20 rounded-md p-4" data-testid="error-message">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-destructive" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
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
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
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
              {activeView === 'today' ? (
                <TodayView 
                  dependencies={todayDependencies}
                  onEditTask={handleEditTask}
                  onDeleteTask={handleDeleteTask}
                  onLoadTaskLogs={loadTaskLogs}
                  onCreateLog={handleCreateTaskLog}
                  lastLogs={lastLogs}
                />
              ) : (
                <TaskList
                  tasks={getFilteredTasks()}
                  groupByCategory={false}
                  showTodayButton={true}
                  onComplete={handleCompleteTask}
                  onEdit={handleEditTask}
                  onDelete={handleDeleteTask}
                  onAddToToday={handleAddToToday}
                  onLoadTaskLogs={loadTaskLogs}
                  onCreateLog={handleCreateTaskLog}
                  lastLogs={lastLogs}
                  emptyMessage={`No ${activeView.toLowerCase()} tasks found`}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateTask}
        initialCategory={currentCategory}
        hideCategorySelection={hideCategorySelection}
      />

      {/* Create Log Modal */}
      <CreateLogModal
        isOpen={isCreateLogModalOpen}
        onClose={() => {
          setIsCreateLogModalOpen(false);
          setSelectedTaskForLog(null);
        }}
        onSubmit={handleCreateLog}
      />

      {/* Daily Modal for onboarding */}
      <DailyModalContainer />

      {/* Dev Daily Modal Simulator - only show in development */}
      {process.env.NODE_ENV === 'development' && (
        <DevDailyModalSimulator />
      )}

      {/* Dev Time Simulator - only show in development */}
      {process.env.NODE_ENV === 'development' && (
        <DevTimeSimulator />
      )}
    </div>
  );
};