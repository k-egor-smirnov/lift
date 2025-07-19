import React, { useEffect, useState } from 'react';
import { TaskCard } from '../../../tasks/presentation/components/TaskCard';
import { createTodayViewModel, TodayViewModelDependencies } from '../view-models/TodayViewModel';

interface TodayViewProps {
  dependencies: TodayViewModelDependencies;
  onEditTask?: (taskId: string) => void;
  onDeleteTask?: (taskId: string) => void;
}

export const TodayView: React.FC<TodayViewProps> = ({
  dependencies,
  onEditTask,
  onDeleteTask,
}) => {
  const [todayViewModel] = useState(() => createTodayViewModel(dependencies));

  // Subscribe to the view model state
  const {
    loading,
    error,
    currentDate,
    totalCount,
    completedCount,
    activeCount,
    loadTodayTasks,
    removeTaskFromToday,
    completeTask,
    refreshToday,
    clearError,
    getActiveTasks,
    getCompletedTasks,
    isToday,
  } = todayViewModel();

  // Load today's tasks on component mount
  useEffect(() => {
    loadTodayTasks();
  }, [loadTodayTasks]);

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
    await completeTask(taskId);
  };

  const handleRemoveFromToday = async (taskId: string) => {
    await removeTaskFromToday(taskId);
  };

  const handleToggleToday = async (taskId: string) => {
    // Since we're in TodayView, all tasks are already in today's selection
    // So the sun icon should remove them from today
    await removeTaskFromToday(taskId);
  };

  const handleEditTask = (taskId: string) => {
    if (onEditTask) {
      onEditTask(taskId);
    } else {
      alert(`Edit task: ${taskId}`);
    }
  };

  const handleDeleteTask = (taskId: string) => {
    if (onDeleteTask) {
      onDeleteTask(taskId);
    } else {
      if (confirm('Are you sure you want to delete this task?')) {
        // For now, just remove from today - actual deletion should be handled by parent
        handleRemoveFromToday(taskId);
      }
    }
  };

  const activeTasks = getActiveTasks();
  const completedTasks = getCompletedTasks();

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString + 'T00:00:00');
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (dateString === today.toISOString().split('T')[0]) {
      return 'Today';
    } else if (dateString === yesterday.toISOString().split('T')[0]) {
      return 'Yesterday';
    } else if (dateString === tomorrow.toISOString().split('T')[0]) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2 sm:gap-3">
              <span className="text-3xl sm:text-4xl" aria-hidden="true">☀️</span>
              {formatDate(currentDate)}
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600">
              Focus on your selected tasks for the day
            </p>
          </div>
          <div className="mt-4 sm:mt-0">
            <button
              onClick={refreshToday}
              disabled={loading}
              className="inline-flex items-center px-3 sm:px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Refresh today's tasks"
            >
              <svg className="-ml-1 mr-2 h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5" role="region" aria-label="Task statistics">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-4 sm:p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="text-xl sm:text-2xl" aria-hidden="true">📋</div>
                </div>
                <div className="ml-4 sm:ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Tasks</dt>
                    <dd className="text-lg font-medium text-gray-900" aria-label={`${totalCount} total tasks`}>{totalCount}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-4 sm:p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="text-xl sm:text-2xl" aria-hidden="true">⚡</div>
                </div>
                <div className="ml-4 sm:ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Active</dt>
                    <dd className="text-lg font-medium text-gray-900" aria-label={`${activeCount} active tasks`}>{activeCount}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-4 sm:p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="text-xl sm:text-2xl" aria-hidden="true">✅</div>
                </div>
                <div className="ml-4 sm:ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Completed</dt>
                    <dd className="text-lg font-medium text-gray-900" aria-label={`${completedCount} completed tasks`}>{completedCount}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        {totalCount > 0 && (
          <div className="mt-6" role="region" aria-label="Task completion progress">
            <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
              <span>Progress</span>
              <span aria-label={`${Math.round((completedCount / totalCount) * 100)} percent complete`}>
                {Math.round((completedCount / totalCount) * 100)}% complete
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2" role="progressbar" aria-valuenow={Math.round((completedCount / totalCount) * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div
                className="bg-green-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(completedCount / totalCount) * 100}%` }}
                aria-hidden="true"
              />
            </div>
          </div>
        )}
      </header>

      {/* Error Message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
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
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading today's tasks...</p>
        </div>
      )}

      {/* Content */}
      {!loading && (
        <>
          {/* Empty State */}
          {totalCount === 0 && (
            <div className="text-center py-8 sm:py-12" role="region" aria-label="Empty state">
              <div className="text-gray-400 text-4xl sm:text-6xl mb-4" aria-hidden="true">☀️</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Tasks Selected</h3>
              <p className="text-gray-500 mb-6 px-4 sm:px-0">
                Start by adding tasks to your daily selection using the sun icon (☀️) on any task.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
                <p className="text-sm text-blue-800">
                  <strong>Tip:</strong> The daily selection resets each day, so you can focus on what's important today.
                </p>
              </div>
            </div>
          )}

          {/* Active Tasks */}
          {activeTasks.length > 0 && (
            <section className="mb-8" aria-labelledby="active-tasks-heading">
              <h2 id="active-tasks-heading" className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span><span aria-hidden="true">⚡</span> Active Tasks</span>
                <span className="inline-flex items-center px-2 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800" aria-label={`${activeTasks.length} active tasks`}>
                  {activeTasks.length}
                </span>
              </h2>
              <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2" role="list">
                {activeTasks.map((taskInfo) => (
                  <div key={taskInfo.task.id.value} role="listitem">
                    <TaskCard
                      task={taskInfo.task}
                      onComplete={handleCompleteTask}
                      onEdit={handleEditTask}
                      onDelete={handleDeleteTask}
                      onAddToToday={handleToggleToday}
                      showTodayButton={true}
                      isInTodaySelection={true}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Completed Tasks */}
          {completedTasks.length > 0 && (
            <section aria-labelledby="completed-tasks-heading">
              <h2 id="completed-tasks-heading" className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span><span aria-hidden="true">✅</span> Completed Tasks</span>
                <span className="inline-flex items-center px-2 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800" aria-label={`${completedTasks.length} completed tasks`}>
                  {completedTasks.length}
                </span>
              </h2>
              <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2" role="list">
                {completedTasks.map((taskInfo) => (
                  <div key={taskInfo.task.id.value} role="listitem">
                    <TaskCard
                      task={taskInfo.task}
                      onComplete={handleCompleteTask}
                      onEdit={handleEditTask}
                      onDelete={handleDeleteTask}
                      onAddToToday={handleToggleToday}
                      showTodayButton={true}
                      isInTodaySelection={true}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};