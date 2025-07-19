import React, { useState, useEffect } from 'react';
import { Task } from '../../../../shared/domain/entities/Task';
import { TaskCategory, TaskStatus } from '../../../../shared/domain/types';
import { LogEntry } from '../../../../shared/application/use-cases/GetTaskLogsUseCase';

interface TaskCardProps {
  task: Task;
  onComplete: (taskId: string) => void;
  onEdit: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onAddToToday?: (taskId: string) => void;
  showTodayButton?: boolean;
  isOverdue?: boolean;
  isInTodaySelection?: boolean; // New prop to indicate if task is in today's selection
  lastLog?: LogEntry | null; // Last log for this task
  onLoadTaskLogs?: (taskId: string) => Promise<LogEntry[]>; // Function to load all logs for this task
  onCreateLog?: (taskId: string) => void; // Function to create a new log for this task
}

const getCategoryColor = (category: TaskCategory): string => {
  switch (category) {
    case TaskCategory.SIMPLE:
      return 'bg-green-100 text-green-800 border-green-200';
    case TaskCategory.FOCUS:
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case TaskCategory.INBOX:
      return 'bg-gray-100 text-gray-800 border-gray-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

const getCategoryIcon = (category: TaskCategory): string => {
  switch (category) {
    case TaskCategory.SIMPLE:
      return '⚡'; // Lightning for quick tasks
    case TaskCategory.FOCUS:
      return '🎯'; // Target for focus tasks
    case TaskCategory.INBOX:
      return '📥'; // Inbox for inbox tasks
    default:
      return '📝';
  }
};

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onComplete,
  onEdit,
  onDelete,
  onAddToToday,
  showTodayButton = false,
  isOverdue = false,
  isInTodaySelection = false,
  lastLog = null,
  onLoadTaskLogs,
  onCreateLog,
}) => {
  const [showLogHistory, setShowLogHistory] = useState(false);
  const [taskLogs, setTaskLogs] = useState<LogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const categoryColor = getCategoryColor(task.category);
  const categoryIcon = getCategoryIcon(task.category);
  const isCompleted = task.status === TaskStatus.COMPLETED;

  // Load task logs when expanding log history
  const handleToggleLogHistory = async () => {
    if (!showLogHistory && onLoadTaskLogs && taskLogs.length === 0) {
      setLoadingLogs(true);
      try {
        const logs = await onLoadTaskLogs(task.id.value);
        setTaskLogs(logs);
      } catch (error) {
        console.error('Failed to load task logs:', error);
      } finally {
        setLoadingLogs(false);
      }
    }
    setShowLogHistory(!showLogHistory);
  };

  // Format log date for display
  const formatLogDate = (date: Date): string => {
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInMinutes < 1) {
      return 'Just now';
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`;
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else if (diffInDays < 7) {
      return `${diffInDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  // Get log type icon
  const getLogTypeIcon = (type: 'SYSTEM' | 'USER' | 'CONFLICT'): string => {
    switch (type) {
      case 'SYSTEM':
        return '⚙️';
      case 'USER':
        return '👤';
      case 'CONFLICT':
        return '⚠️';
      default:
        return '📝';
    }
  };

  // Get log type color
  const getLogTypeColor = (type: 'SYSTEM' | 'USER' | 'CONFLICT'): string => {
    switch (type) {
      case 'SYSTEM':
        return 'text-blue-600';
      case 'USER':
        return 'text-green-600';
      case 'CONFLICT':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div
      className={`
        bg-white rounded-lg border shadow-sm p-4 transition-all duration-200 hover:shadow-md
        ${isOverdue ? 'border-red-300 bg-red-50' : 'border-gray-200'}
        ${isCompleted ? 'opacity-60' : ''}
      `}
    >
      {/* Header with category and actions */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className={`
              inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border
              ${categoryColor}
            `}
          >
            <span className="mr-1">{categoryIcon}</span>
            {task.category}
          </span>
          {isOverdue && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
              ⚠️ Overdue
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-1">
          {showTodayButton && onAddToToday && (
            <button
              onClick={() => onAddToToday(task.id.value)}
              className={`p-1 rounded transition-colors ${
                isInTodaySelection
                  ? 'text-orange-600 hover:text-orange-700 hover:bg-orange-50'
                  : 'text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50'
              }`}
              title={isInTodaySelection ? "Remove from Today" : "Add to Today"}
            >
              {isInTodaySelection ? '🌅' : '☀️'}
            </button>
          )}
          <button
            onClick={() => onEdit(task.id.value)}
            className="p-1 text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded transition-colors"
            title="Edit Task"
          >
            ✏️
          </button>
          <button
            onClick={() => onDelete(task.id.value)}
            className="p-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
            title="Delete Task"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* Task title */}
      <div className="mb-3">
        <h3
          className={`
            text-lg font-medium text-gray-900 cursor-pointer hover:text-gray-700
            ${isCompleted ? 'line-through' : ''}
          `}
          onClick={() => onEdit(task.id.value)}
        >
          {task.title.value}
        </h3>
      </div>

      {/* Task metadata */}
      <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
        <div className="flex items-center gap-4">
          <span>Created: {task.createdAt.toLocaleDateString()}</span>
          {task.updatedAt.getTime() !== task.createdAt.getTime() && (
            <span>Updated: {task.updatedAt.toLocaleDateString()}</span>
          )}
        </div>
        {task.category === TaskCategory.INBOX && task.inboxEnteredAt && (
          <span className="text-xs">
            In inbox for {Math.floor((Date.now() - task.inboxEnteredAt.getTime()) / (1000 * 60 * 60 * 24))} days
          </span>
        )}
      </div>

      {/* Last log preview */}
      {lastLog && (
        <div className="mb-3 p-3 bg-gray-50 rounded-md border">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-2 flex-1">
              <span className={`text-sm ${getLogTypeColor(lastLog.type)}`}>
                {getLogTypeIcon(lastLog.type)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 overflow-hidden" style={{ 
                  display: '-webkit-box', 
                  WebkitLineClamp: 2, 
                  WebkitBoxOrient: 'vertical' 
                }}>
                  {lastLog.message}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {formatLogDate(lastLog.createdAt)}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-1 ml-2">
              {onCreateLog && (
                <button
                  onClick={() => onCreateLog(task.id.value)}
                  className="p-1 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="Add Log"
                >
                  ➕
                </button>
              )}
              {onLoadTaskLogs && (
                <button
                  onClick={handleToggleLogHistory}
                  className="p-1 text-gray-600 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                  title={showLogHistory ? "Hide Log History" : "Show Log History"}
                >
                  {showLogHistory ? '🔼' : '🔽'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* No logs state */}
      {!lastLog && onCreateLog && (
        <div className="mb-3 p-3 bg-gray-50 rounded-md border border-dashed">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">No logs yet</p>
            <button
              onClick={() => onCreateLog(task.id.value)}
              className="px-3 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
            >
              Add First Log
            </button>
          </div>
        </div>
      )}

      {/* Expandable log history */}
      {showLogHistory && (
        <div className="mb-3 border-t pt-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-900">Log History</h4>
            <button
              onClick={handleToggleLogHistory}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Hide
            </button>
          </div>
          
          {loadingLogs ? (
            <div className="text-center py-4">
              <span className="text-sm text-gray-500">Loading logs...</span>
            </div>
          ) : taskLogs.length > 0 ? (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {taskLogs.map((log) => (
                <div key={log.id} className="p-2 bg-white rounded border">
                  <div className="flex items-start space-x-2">
                    <span className={`text-sm ${getLogTypeColor(log.type)}`}>
                      {getLogTypeIcon(log.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">{log.message}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          log.type === 'SYSTEM' ? 'bg-blue-100 text-blue-800' :
                          log.type === 'USER' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {log.type}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatLogDate(log.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500">No logs found</p>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onComplete(task.id.value)}
          className={`
            px-4 py-2 rounded-md text-sm font-medium transition-colors
            ${isCompleted
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              : 'bg-green-600 text-white hover:bg-green-700'
            }
          `}
        >
          {isCompleted ? '↩️ Revert' : '✅ Complete'}
        </button>

        <div className="text-xs text-gray-400">
          ID: {task.id.value.slice(-8)}
        </div>
      </div>
    </div>
  );
};