import React from 'react';
import { Task } from '../../../../shared/domain/entities/Task';
import { TaskCategory, TaskStatus } from '../../../../shared/domain/types';

interface TaskCardProps {
  task: Task;
  onComplete: (taskId: string) => void;
  onEdit: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onAddToToday?: (taskId: string) => void;
  showTodayButton?: boolean;
  isOverdue?: boolean;
  isInTodaySelection?: boolean; // New prop to indicate if task is in today's selection
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
}) => {
  const categoryColor = getCategoryColor(task.category);
  const categoryIcon = getCategoryIcon(task.category);
  const isCompleted = task.status === TaskStatus.COMPLETED;

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