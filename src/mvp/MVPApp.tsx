import React, { useEffect, useState } from 'react';
import { TaskCategory } from '../shared/domain/types';
import { TaskList } from '../features/tasks/presentation/components/TaskList';
import { CreateTaskModal } from '../features/tasks/presentation/components/CreateTaskModal';
import { TodayView } from '../features/today/presentation/components/TodayView';
import { createTaskViewModel, TaskViewModelDependencies } from '../features/tasks/presentation/view-models/TaskViewModel';
import { TodayViewModelDependencies } from '../features/today/presentation/view-models/TodayViewModel';

// Import real implementations
import { TodoDatabase } from '../shared/infrastructure/database/TodoDatabase';
import { TaskRepositoryImpl } from '../shared/infrastructure/repositories/TaskRepositoryImpl';
import { DailySelectionRepositoryImpl } from '../shared/infrastructure/repositories/DailySelectionRepositoryImpl';
import { CreateTaskUseCase } from '../shared/application/use-cases/CreateTaskUseCase';
import { UpdateTaskUseCase } from '../shared/application/use-cases/UpdateTaskUseCase';
import { CompleteTaskUseCase } from '../shared/application/use-cases/CompleteTaskUseCase';
import { GetTodayTasksUseCase } from '../shared/application/use-cases/GetTodayTasksUseCase';
import { AddTaskToTodayUseCase } from '../shared/application/use-cases/AddTaskToTodayUseCase';
import { RemoveTaskFromTodayUseCase } from '../shared/application/use-cases/RemoveTaskFromTodayUseCase';
import { PersistentEventBusImpl } from '../shared/domain/events/EventBus';

// Initialize database and repositories
const database = new TodoDatabase();
const eventBus = new PersistentEventBusImpl(database);
const taskRepository = new TaskRepositoryImpl(database, eventBus);
const dailySelectionRepository = new DailySelectionRepositoryImpl(database);

// Initialize use cases
const createTaskUseCase = new CreateTaskUseCase(taskRepository, eventBus, database);
const updateTaskUseCase = new UpdateTaskUseCase(taskRepository, eventBus, database);
const completeTaskUseCase = new CompleteTaskUseCase(taskRepository, eventBus, database);
const getTodayTasksUseCase = new GetTodayTasksUseCase(dailySelectionRepository, taskRepository);
const addTaskToTodayUseCase = new AddTaskToTodayUseCase(dailySelectionRepository, taskRepository);
const removeTaskFromTodayUseCase = new RemoveTaskFromTodayUseCase(dailySelectionRepository);

// Create dependencies
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
const taskViewModel = createTaskViewModel(taskDependencies);

export const MVPApp: React.FC = () => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [filter, setFilter] = useState<{ category?: TaskCategory }>({});
  const [activeTab, setActiveTab] = useState<'tasks' | 'today'>('tasks');
  const [isDbReady, setIsDbReady] = useState(false);

  // Subscribe to the view model state
  const {
    tasks,
    loading,
    error,
    getFilteredTasks,
    getTasksByCategory,
    getOverdueCount,
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
  }, [loadTasks]);

  // Update view model filter when local filter changes
  useEffect(() => {
    setViewModelFilter(filter);
  }, [filter, setViewModelFilter]);

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

  const handleEditTask = async (taskId: string) => {
    // For MVP, just show an alert - can be enhanced later
    alert(`Edit task: ${taskId}`);
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

  const filteredTasks = getFilteredTasks();
  const tasksByCategory = getTasksByCategory();
  const overdueCount = getOverdueCount();

  // Show loading state while database is initializing
  if (!isDbReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Initializing database...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Daily Todo PWA - MVP</h1>
            <p className="mt-2 text-gray-600">
              Manage your tasks and daily selections
            </p>
          </div>
          <div className="mt-4 sm:mt-0">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              data-testid="new-task-button"
            >
              <svg className="-ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Task
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-6">
          <nav className="flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('tasks')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'tasks'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              data-testid="all-tasks-tab"
            >
              📝 All Tasks
            </button>
            <button
              onClick={() => setActiveTab('today')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'today'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              data-testid="today-tab"
            >
              ☀️ Today
            </button>
          </nav>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="text-2xl">📝</div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Tasks</dt>
                    <dd className="text-lg font-medium text-gray-900" data-testid="total-tasks-count">{tasks.length}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="text-2xl">📥</div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Inbox</dt>
                    <dd className="text-lg font-medium text-gray-900">{tasksByCategory[TaskCategory.INBOX]?.length || 0}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="text-2xl">🎯</div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Focus</dt>
                    <dd className="text-lg font-medium text-gray-900">{tasksByCategory[TaskCategory.FOCUS]?.length || 0}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="text-2xl">⚠️</div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Overdue</dt>
                    <dd className="text-lg font-medium text-gray-900">{overdueCount}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Conditional Content */}
      {activeTab === 'today' ? (
        <TodayView 
          dependencies={todayDependencies}
          onEditTask={handleEditTask}
          onDeleteTask={handleDeleteTask}
        />
      ) : (
        <>
          {/* Filters */}
          <div className="mb-6">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilter({})}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  !filter.category
                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                    : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                }`}
                data-testid="filter-all"
              >
                All Tasks
              </button>
              {Object.values(TaskCategory).map((category) => (
                <button
                  key={category}
                  onClick={() => setFilter({ category })}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    filter.category === category
                      ? 'bg-blue-100 text-blue-800 border border-blue-200'
                      : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                  }`}
                  data-testid={`filter-${category.toLowerCase()}`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4" data-testid="error-message">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
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
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Loading tasks...</p>
            </div>
          )}

          {/* Task List */}
          {!loading && (
            <TaskList
              tasks={filteredTasks}
              groupByCategory={!filter.category}
              showTodayButton={true}
              onComplete={handleCompleteTask}
              onEdit={handleEditTask}
              onDelete={handleDeleteTask}
              onAddToToday={handleAddToToday}
              emptyMessage={filter.category ? `No ${filter.category.toLowerCase()} tasks found` : 'No tasks found'}
            />
          )}
        </>
      )}

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateTask}
      />
    </div>
  );
};