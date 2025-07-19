import React, { useState, useEffect, useRef } from "react";
import { Task } from "../../../../shared/domain/entities/Task";
import { TaskCategory, TaskStatus } from "../../../../shared/domain/types";
import { LogEntry } from "../../../../shared/application/use-cases/GetTaskLogsUseCase";
import {
  useTouchGestures,
  isTouchDevice,
} from "../../../../shared/infrastructure/services/useTouchGestures";

interface TaskCardProps {
  task: Task;
  onComplete: (taskId: string) => void;
  onEdit: (taskId: string, newTitle: string) => void;
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
      return "bg-green-100 text-green-800 border-green-200";
    case TaskCategory.FOCUS:
      return "bg-blue-100 text-blue-800 border-blue-200";
    case TaskCategory.INBOX:
      return "bg-gray-100 text-gray-800 border-gray-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
};

const getCategoryIcon = (category: TaskCategory): string => {
  switch (category) {
    case TaskCategory.SIMPLE:
      return "⚡"; // Lightning for quick tasks
    case TaskCategory.FOCUS:
      return "🎯"; // Target for focus tasks
    case TaskCategory.INBOX:
      return "📥"; // Inbox for inbox tasks
    default:
      return "📝";
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
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title.value);
  const cardRef = useRef<HTMLElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const categoryColor = getCategoryColor(task.category);
  const categoryIcon = getCategoryIcon(task.category);
  const isCompleted = task.status === TaskStatus.COMPLETED;
  const isTouch = isTouchDevice();

  // Touch gesture handlers
  const { attachGestures } = useTouchGestures({
    onSwipeRight: () => {
      if (isTouch && !isCompleted) {
        onComplete(task.id.value);
      }
    },
    onSwipeLeft: () => {
      if (isTouch && showTodayButton && onAddToToday) {
        onAddToToday(task.id.value);
      }
    },
    onTap: () => {
      if (isTouch && !isEditing) {
        handleStartEdit();
      }
    },
    onLongPress: () => {
      if (isTouch && onCreateLog) {
        onCreateLog(task.id.value);
      }
    },
  });

  // Attach touch gestures
  useEffect(() => {
    if (isTouch && cardRef.current) {
      return attachGestures(cardRef.current);
    }
  }, [attachGestures, isTouch]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditing]);

  // Handle edit mode
  const handleStartEdit = () => {
    setIsEditing(true);
    setEditTitle(task.title.value);
  };

  const handleSaveEdit = () => {
    const trimmedTitle = editTitle.trim();
    if (trimmedTitle && trimmedTitle !== task.title.value) {
      onEdit(task.id.value, trimmedTitle);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditTitle(task.title.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveEdit();
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  // Load task logs when expanding log history
  const handleToggleLogHistory = async () => {
    if (!showLogHistory && onLoadTaskLogs && taskLogs.length === 0) {
      setLoadingLogs(true);
      try {
        const logs = await onLoadTaskLogs(task.id.value);
        setTaskLogs(logs);
      } catch (error) {
        console.error("Failed to load task logs:", error);
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
      return "Just now";
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
  const getLogTypeIcon = (type: "SYSTEM" | "USER" | "CONFLICT"): string => {
    switch (type) {
      case "SYSTEM":
        return "⚙️";
      case "USER":
        return "👤";
      case "CONFLICT":
        return "⚠️";
      default:
        return "📝";
    }
  };

  // Get log type color
  const getLogTypeColor = (type: "SYSTEM" | "USER" | "CONFLICT"): string => {
    switch (type) {
      case "SYSTEM":
        return "text-blue-600";
      case "USER":
        return "text-green-600";
      case "CONFLICT":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  return (
    <article
      ref={cardRef}
      className={`
        bg-white rounded-lg border shadow-sm p-4 transition-all duration-200 hover:shadow-md
        ${isOverdue ? "border-red-300 bg-red-50" : "border-gray-200"}
        ${isCompleted ? "opacity-60" : ""}
        ${isTouch ? "touch-manipulation" : ""}
      `}
      role="article"
      aria-labelledby={`task-title-${task.id.value}`}
      aria-describedby={`task-meta-${task.id.value} ${
        isTouch ? `touch-help-${task.id.value}` : ""
      }`}
    >
      {/* Touch gesture help for mobile */}
      {isTouch && (
        <div id={`touch-help-${task.id.value}`} className="sr-only">
          Swipe right to complete, swipe left to add to today, tap to edit, long
          press to add log
        </div>
      )}
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

        <div
          className="flex items-center gap-1"
          role="toolbar"
          aria-label="Task actions"
        >
          {showTodayButton && onAddToToday && (
            <button
              onClick={() => onAddToToday(task.id.value)}
              className={`p-2 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                isInTodaySelection
                  ? "text-yellow-500 hover:text-yellow-600 hover:bg-yellow-50 focus:ring-yellow-500"
                  : "text-gray-400 hover:text-gray-500 hover:bg-gray-50 focus:ring-gray-500"
              }`}
              title={isInTodaySelection ? "Remove from Today" : "Add to Today"}
              aria-label={
                isInTodaySelection
                  ? "Remove task from today's selection"
                  : "Add task to today's selection"
              }
            >
              <span aria-hidden="true">☀️</span>
            </button>
          )}
          <button
            onClick={() => onDelete(task.id.value)}
            className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            title="Delete Task"
            aria-label={`Delete task: ${task.title.value}`}
          >
            <span aria-hidden="true">🗑️</span>
          </button>
        </div>
      </div>

      {/* Task title */}
      <div className="mb-3">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              ref={editInputRef}
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSaveEdit}
              className="flex-1 text-lg font-medium text-gray-900 bg-white border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              maxLength={200}
            />
            <button
              onClick={handleSaveEdit}
              className="p-1 text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors"
              title="Save"
            >
              ✓
            </button>
            <button
              onClick={handleCancelEdit}
              className="p-1 text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded transition-colors"
              title="Cancel"
            >
              ✕
            </button>
          </div>
        ) : (
          <h3
            id={`task-title-${task.id.value}`}
            className={`
              text-lg font-medium text-gray-900 cursor-pointer hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded px-1 py-1
              ${isCompleted ? "line-through" : ""}
            `}
            onClick={handleStartEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleStartEdit();
              }
            }}
            tabIndex={0}
            role="button"
            aria-label={`Edit task: ${task.title.value}`}
          >
            {task.title.value}
          </h3>
        )}
      </div>

      {/* Task metadata */}
      <div
        id={`task-meta-${task.id.value}`}
        className="flex items-center justify-between text-sm text-gray-500 mb-3"
      >
        <div className="flex items-center gap-4">
          <time dateTime={task.createdAt.toISOString()}>
            Created: {task.createdAt.toLocaleDateString()}
          </time>
          {task.updatedAt.getTime() !== task.createdAt.getTime() && (
            <time dateTime={task.updatedAt.toISOString()}>
              Updated: {task.updatedAt.toLocaleDateString()}
            </time>
          )}
        </div>
        {task.category === TaskCategory.INBOX && task.inboxEnteredAt && (
          <span
            className="text-xs"
            aria-label={`Task has been in inbox for ${Math.floor(
              (Date.now() - task.inboxEnteredAt.getTime()) /
                (1000 * 60 * 60 * 24)
            )} days`}
          >
            In inbox for{" "}
            {Math.floor(
              (Date.now() - task.inboxEnteredAt.getTime()) /
                (1000 * 60 * 60 * 24)
            )}{" "}
            days
          </span>
        )}
      </div>

      {/* Logs section */}
      {(lastLog || onCreateLog) && (
        <div className="mb-3">
          {/* Log preview - single line */}
          <div
            className="p-2 bg-gray-50 rounded-md border cursor-pointer hover:bg-gray-100 transition-colors"
            onClick={handleToggleLogHistory}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 flex-1 min-w-0">
                {lastLog ? (
                  <>
                    <span
                      className={`text-xs ${getLogTypeColor(lastLog.type)}`}
                    >
                      {getLogTypeIcon(lastLog.type)}
                    </span>
                    <p className="text-sm text-gray-900 truncate flex-1">
                      {lastLog.message}
                    </p>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {formatLogDate(lastLog.createdAt)}
                    </span>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">No logs yet</p>
                )}
              </div>
              <div className="flex items-center space-x-1 ml-2">
                {onCreateLog && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateLog(task.id.value);
                    }}
                    className="p-1 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    title="Add Log"
                    aria-label={`Add log to task: ${task.title.value}`}
                  >
                    <span aria-hidden="true">➕</span>
                  </button>
                )}
                {onLoadTaskLogs && (
                  <span className="text-gray-400" aria-hidden="true">
                    {showLogHistory ? "🔼" : "🔽"}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expandable log history */}
      {showLogHistory && (
        <div
          id={`log-history-${task.id.value}`}
          className="mb-3 bg-gray-50 rounded-md border p-3"
          role="region"
          aria-labelledby={`log-history-title-${task.id.value}`}
        >
          <div className="flex items-center justify-between mb-3">
            <h4
              id={`log-history-title-${task.id.value}`}
              className="text-sm font-medium text-gray-900"
            >
              Log History
            </h4>
            <button
              onClick={handleToggleLogHistory}
              className="text-xs text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 rounded px-2 py-1"
              aria-label="Hide log history"
            >
              Hide
            </button>
          </div>

          {loadingLogs ? (
            <div className="text-center py-4">
              <span className="text-sm text-gray-500">Loading logs...</span>
            </div>
          ) : taskLogs.length > 0 ? (
            <div
              className="space-y-3 max-h-80 overflow-y-auto"
              role="log"
              aria-label="Task log entries"
            >
              {taskLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 bg-white rounded border shadow-sm"
                  role="listitem"
                >
                  <div className="flex items-start space-x-3">
                    <span
                      className={`text-sm ${getLogTypeColor(log.type)} mt-0.5`}
                      aria-hidden="true"
                    >
                      {getLogTypeIcon(log.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">
                        {log.message}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <span
                          className={`text-xs px-2 py-1 rounded-full font-medium ${
                            log.type === "SYSTEM"
                              ? "bg-blue-100 text-blue-800"
                              : log.type === "USER"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                          aria-label={`Log type: ${log.type}`}
                        >
                          {log.type}
                        </span>
                        <div className="text-xs text-gray-500">
                          <time
                            dateTime={log.createdAt.toISOString()}
                            title={log.createdAt.toLocaleString()}
                          >
                            {log.createdAt.toLocaleDateString()}{" "}
                            {log.createdAt.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500">No logs found</p>
              {onCreateLog && (
                <button
                  onClick={() => onCreateLog(task.id.value)}
                  className="mt-2 px-3 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                >
                  Add First Log
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onComplete(task.id.value)}
          className={`
            px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2
            ${
              isCompleted
                ? "bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-500"
                : "bg-green-600 text-white hover:bg-green-700 focus:ring-green-500"
            }
          `}
          aria-label={
            isCompleted
              ? `Revert completion of task: ${task.title.value}`
              : `Mark task as complete: ${task.title.value}`
          }
        >
          <span aria-hidden="true">{isCompleted ? "↩️" : "✅"}</span>
          <span className="ml-1">{isCompleted ? "Revert" : "Complete"}</span>
        </button>

        <div
          className="text-xs text-gray-400"
          aria-label={`Task ID: ${task.id.value.slice(-8)}`}
        >
          ID: {task.id.value.slice(-8)}
        </div>
      </div>
    </article>
  );
};
