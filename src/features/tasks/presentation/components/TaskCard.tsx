import React, { useState, useEffect, useRef } from "react";
import { Task } from "../../../../shared/domain/entities/Task";
import { TaskCategory, TaskStatus } from "../../../../shared/domain/types";
import { LogEntry } from "../../../../shared/application/use-cases/GetTaskLogsUseCase";
import {
  useTouchGestures,
  isTouchDevice,
} from "../../../../shared/infrastructure/services/useTouchGestures";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { useTranslation } from 'react-i18next';
import { 
  Zap, 
  Target, 
  Inbox, 
  FileText, 
  Sun, 
  Trash2, 
  Check, 
  Undo2, 
  Plus, 
  ChevronDown, 
  ChevronUp,
  Settings,
  User,
  AlertTriangle,
  X
} from 'lucide-react';


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
  onCreateLog?: (taskId: string, message: string) => Promise<boolean>; // Function to create a new log for this task
  isDraggable?: boolean; // Whether this task card is draggable

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

const getCategoryIcon = (category: TaskCategory) => {
  switch (category) {
    case TaskCategory.SIMPLE:
      return Zap;
    case TaskCategory.FOCUS:
      return Target;
    case TaskCategory.INBOX:
      return Inbox;
    default:
      return FileText;
  }
};

const getLogTypeIcon = (type: "SYSTEM" | "USER" | "CONFLICT") => {
  switch (type) {
    case "SYSTEM":
      return Settings;
    case "USER":
      return User;
    case "CONFLICT":
      return AlertTriangle;
    default:
      return FileText;
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
  isDraggable = false,

}) => {
  const { t } = useTranslation();
  const [showLogHistory, setShowLogHistory] = useState(false);
  const [taskLogs, setTaskLogs] = useState<LogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title.value);
  const [newLogText, setNewLogText] = useState('');
  const [showNewLogInput, setShowNewLogInput] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const newLogInputRef = useRef<HTMLInputElement>(null);

  // Drag and drop functionality
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: task.id.value,
    disabled: !isDraggable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isDraggingState = isDragging;

  const categoryColor = getCategoryColor(task.category);
  const CategoryIcon = getCategoryIcon(task.category);
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

  // Focus new log input when it appears
  useEffect(() => {
    if (showNewLogInput && newLogInputRef.current) {
      newLogInputRef.current.focus();
    }
  }, [showNewLogInput]);

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
    if (!showLogHistory) {
      setShowNewLogInput(true);
    } else {
      setShowNewLogInput(false);
      setNewLogText('');
    }
  };

  // Handle new log creation
  const handleCreateNewLog = async () => {
    if (newLogText.trim() && onCreateLog) {
      try {
        const success = await onCreateLog(task.id.value, newLogText.trim());
        if (success) {
          setNewLogText('');
          setShowNewLogInput(false);
          // Reload logs to show the new log
          if (onLoadTaskLogs) {
            const logs = await onLoadTaskLogs(task.id.value);
            setTaskLogs(logs);
          }
        }
      } catch (error) {
        console.error('Failed to create log:', error);
      }
    }
  };

  const handleNewLogKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateNewLog();
    } else if (e.key === 'Escape') {
      setShowNewLogInput(false);
      setNewLogText('');
    }
  };

  // Format log date for display
  const formatLogDate = (date: Date): string => {
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInMinutes < 1) {
      return t('taskCard.justNow');
    } else if (diffInMinutes < 60) {
      return t('taskCard.minutesAgo', { count: diffInMinutes });
    } else if (diffInHours < 24) {
      return t('taskCard.hoursAgo', { count: diffInHours });
    } else if (diffInDays < 7) {
      return t('taskCard.daysAgo', { count: diffInDays });
    } else {
      return date.toLocaleDateString();
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
    <>
      {/* Blue line indicator for drop location */}
      {isOver && <div className="h-0.5 bg-blue-500 mx-4 mb-2 rounded-full" />}
      <motion.article
        ref={(node) => {
          setNodeRef(node);
          if (cardRef.current !== node) {
            // @ts-ignore
            cardRef.current = node;
          }
        }}
        style={style}
        {...(isDraggable ? attributes : {})}
        {...(isDraggable ? listeners : {})}
        className={`
          bg-white rounded-lg border shadow-sm p-4 transition-all duration-200 hover:shadow-md
          ${isOverdue ? "border-red-300 bg-red-50" : "border-gray-200"}
          ${isCompleted ? "opacity-60" : ""}
          ${isTouch ? "touch-manipulation" : ""}
          ${isDraggingState ? "opacity-50" : ""}
          ${isDraggable ? "cursor-grab active:cursor-grabbing" : ""}
        `}
        role="article"
        id={`task-${task.id.value}`}
        aria-labelledby={`task-title-${task.id.value}`}
        aria-describedby={`task-meta-${task.id.value} ${
          isTouch ? `touch-help-${task.id.value}` : ""
        }`}
        data-testid="task-card"
        animate={{
          scale: isDraggingState ? 1.02 : 1,
          boxShadow: isDraggingState
            ? "0 10px 25px rgba(0, 0, 0, 0.15)"
            : "0 1px 3px rgba(0, 0, 0, 0.1)",
        }}
        transition={{ duration: 0.2 }}
      >
        {/* Touch gesture help for mobile */}
        {isTouch && (
          <div id={`touch-help-${task.id.value}`} className="sr-only">
            {t('taskCard.touchHelp')}
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
              <CategoryIcon className="w-3 h-3 mr-1" />
              {t(`categories.${task.category.toLowerCase()}`)}
            </span>
            {isOverdue && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {t('taskCard.overdue')}
              </span>
            )}
          </div>

          <div
            className="flex items-center gap-1"
            role="toolbar"
            aria-label={t('taskCard.taskActions')}
          >
            {!isCompleted && (
              <button
                onClick={() => onComplete(task.id.value)}
                className="p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                title={t('taskCard.completeTask')}
                aria-label={t('taskCard.markTaskAsComplete', { title: task.title.value })}
              >
                <Check className="w-4 h-4" />
              </button>
            )}
            
            {isCompleted && (
              <button
                onClick={() => onComplete(task.id.value)}
                className="p-2 text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                title={t('taskCard.revertTask')}
                aria-label={t('taskCard.revertCompletion', { title: task.title.value })}
              >
                <Undo2 className="w-4 h-4" />
              </button>
            )}

            {showTodayButton && onAddToToday && (
              <button
                onClick={() => onAddToToday(task.id.value)}
                className={`p-2 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  isInTodaySelection
                    ? "text-yellow-500 hover:text-yellow-600 hover:bg-yellow-50 focus:ring-yellow-500"
                    : "text-gray-400 hover:text-gray-500 hover:bg-gray-50 focus:ring-gray-500"
                }`}
                title={
                  isInTodaySelection ? t('taskCard.removeFromToday') : t('taskCard.addToToday')
                }
                aria-label={
                  isInTodaySelection
                    ? t('taskCard.removeTaskFromToday')
                    : t('taskCard.addTaskToToday')
                }
              >
                <Sun className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={() => onDelete(task.id.value)}
              className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              title={t('taskCard.deleteTask')}
              aria-label={t('taskCard.deleteTaskWithTitle', { title: task.title.value })}
            >
              <Trash2 className="w-4 h-4" />
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
                title={t('taskCard.save')}
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={handleCancelEdit}
                className="p-1 text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded transition-colors"
                title={t('taskCard.cancel')}
              >
                <X className="w-4 h-4" />
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
              aria-label={t('taskCard.editTask', { title: task.title.value })}
            >
              {task.title.value}
            </h3>
          )}
        </div>



        {/* Logs section - compact */}
        {(lastLog || onCreateLog) && (
          <div className="mb-3">
            {/* Compact log display */}
            <div className="text-xs text-gray-500 mb-1">
              {lastLog ? (
                <div 
                  className="cursor-pointer hover:text-gray-700 transition-colors"
                  onClick={handleToggleLogHistory}
                >
                  {t('taskCard.lastLog')}: {lastLog.message} ({formatLogDate(lastLog.createdAt)})
                </div>
              ) : (
                <div 
                  className="cursor-pointer hover:text-gray-700 transition-colors"
                  onClick={handleToggleLogHistory}
                >
                  {t('taskCard.noLogsYet')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Expandable log history with inline editing */}
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
                {t('taskCard.logHistory')}
              </h4>
              <button
                onClick={handleToggleLogHistory}
                className="text-xs text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 rounded px-2 py-1"
                aria-label={t('taskCard.hideLogHistory')}
              >
                <ChevronUp className="w-3 h-3" />
              </button>
            </div>

            {/* New log input */}
            {showNewLogInput && (
              <div className="mb-3 p-2 bg-white rounded border">
                <div className="flex items-center gap-2">
                  <input
                    ref={newLogInputRef}
                    type="text"
                    value={newLogText}
                    onChange={(e) => setNewLogText(e.target.value)}
                    onKeyDown={handleNewLogKeyDown}
                    placeholder={t('taskCard.addNewLogPlaceholder')}
                    className="flex-1 text-sm border-0 focus:outline-none focus:ring-0 p-1"
                  />
                  <button
                    onClick={handleCreateNewLog}
                    disabled={!newLogText.trim()}
                    className="p-1 text-green-600 hover:text-green-700 disabled:text-gray-400 transition-colors"
                    title={t('taskCard.saveLog')}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setShowNewLogInput(false);
                      setNewLogText('');
                    }}
                    className="p-1 text-gray-600 hover:text-gray-700 transition-colors"
                    title={t('taskCard.cancel')}
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {!showNewLogInput && onCreateLog && (
              <button
                onClick={() => setShowNewLogInput(true)}
                className="mb-3 w-full p-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded border border-dashed border-gray-300 transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {t('taskCard.addNewLog')}
              </button>
            )}

            {loadingLogs ? (
              <div className="text-center py-4">
                <span className="text-sm text-gray-500">{t('taskCard.loadingLogs')}</span>
              </div>
            ) : taskLogs.length > 0 ? (
              <div
                className="space-y-2 max-h-60 overflow-y-auto"
                role="log"
                aria-label={t('taskCard.taskLogEntries')}
              >
                {taskLogs.map((log) => {
                  const LogIcon = getLogTypeIcon(log.type);
                  return (
                    <div
                      key={log.id}
                      className="p-2 bg-white rounded border text-sm"
                      role="listitem"
                    >
                      <div className="flex items-start space-x-2">
                        <LogIcon
                          className={`w-3 h-3 mt-0.5 ${getLogTypeColor(log.type)}`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-900 leading-relaxed whitespace-pre-wrap">
                            {log.message}
                          </p>
                          <div className="flex items-center justify-between mt-1">
                            <span
                              className={`text-xs px-1 py-0.5 rounded font-medium ${
                                log.type === "SYSTEM"
                                  ? "bg-blue-100 text-blue-800"
                                  : log.type === "USER"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {log.type}
                            </span>
                            <span className="text-xs text-gray-500">
                              {formatLogDate(log.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500">{t('taskCard.noLogsFound')}</p>
              </div>
            )}
          </div>
        )}


      </motion.article>
    </>
  );
};
