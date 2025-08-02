import React, { useState, useEffect, useRef } from "react";
import { Task } from "../../../../shared/domain/entities/Task";
import { TaskCategory, TaskStatus } from "../../../../shared/domain/types";
import { LogEntry } from "../../../../shared/application/use-cases/GetTaskLogsUseCase";
import { DateOnly } from "../../../../shared/domain/value-objects/DateOnly";
import {
  useTouchGestures,
  isTouchDevice,
} from "../../../../shared/infrastructure/services/useTouchGestures";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
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
  X,
  Pen,
  Clock,
  MoreHorizontal,
} from "lucide-react";

interface TaskCardProps {
  task: Task;
  onComplete: (taskId: string) => void;
  onRevertCompletion?: (taskId: string) => void;
  onEdit: (taskId: string, newTitle: string) => void;
  onDelete: (taskId: string) => void;
  onAddToToday?: (taskId: string) => void;
  onDefer?: (taskId: string, deferDate: Date) => void;
  showTodayButton?: boolean;
  showDeferButton?: boolean;
  isOverdue?: boolean;
  isInTodaySelection?: boolean; // New prop to indicate if task is in today's selection
  lastLog?: LogEntry | null; // Last log for this task
  onLoadTaskLogs?: (taskId: string) => Promise<LogEntry[]>; // Function to load all logs for this task
  onCreateLog?: (taskId: string, message: string) => Promise<boolean>; // Function to create a new log for this task
  isDraggable?: boolean; // Whether this task card is draggable
  currentCategory?: TaskCategory; // Current page category to hide badge if same as task category
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
  onRevertCompletion,
  onEdit,
  onDelete,
  onAddToToday,
  onDefer,
  showTodayButton = false,
  showDeferButton = false,
  isOverdue = false,
  isInTodaySelection = false,
  lastLog = null,
  onLoadTaskLogs,
  onCreateLog,
  isDraggable = false,
  currentCategory,
}) => {
  const { t } = useTranslation();
  const [showLogHistory, setShowLogHistory] = useState(false);
  const [taskLogs, setTaskLogs] = useState<LogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title.value);
  const [newLogText, setNewLogText] = useState("");
  const [showDeferModal, setShowDeferModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  // Removed showNewLogInput state - input is always visible
  const cardRef = useRef<HTMLElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const newLogInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
        // Long press doesn't create log directly, just focus the input
        if (newLogInputRef.current) {
          newLogInputRef.current.focus();
        }
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

  // Focus new log input when log history is shown
  useEffect(() => {
    if (showLogHistory && newLogInputRef.current) {
      newLogInputRef.current.focus();
    }
  }, [showLogHistory]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showDropdown]);

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
      e.preventDefault();
      e.stopPropagation();
      handleSaveEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      handleCancelEdit();
    } else if (e.key === " ") {
      // Prevent space from triggering drag and drop
      e.stopPropagation();
    }
  };

  const handleInputBlur = (e: React.FocusEvent) => {
    // // Проверяем, не кликнул ли пользователь на кнопку отмены
    // const relatedTarget = e.relatedTarget as HTMLElement;
    // if (relatedTarget && relatedTarget.closest("[data-cancel-button]")) {
    //   return; // Не сохраняем, если кликнули на кнопку отмены
    // }
    // handleCancelEdit();
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
    if (showLogHistory) {
      // Clear log text when closing
      setNewLogText("");
    }
  };

  // Handle new log creation
  const handleCreateNewLog = async () => {
    if (newLogText.trim() && onCreateLog) {
      try {
        const success = await onCreateLog(task.id.value, newLogText.trim());
        if (success) {
          setNewLogText("");
          // Reload logs to show the new log
          if (onLoadTaskLogs) {
            const logs = await onLoadTaskLogs(task.id.value);
            setTaskLogs(logs);
          }
        }
      } catch (error) {
        console.error("Failed to create log:", error);
      }
    }
  };

  const handleDeferConfirm = (deferDate: Date) => {
    if (onDefer) {
      onDefer(task.id.value, deferDate);
    }
    setShowDeferModal(false);
  };

  const handleNewLogKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      handleCreateNewLog();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setNewLogText("");
      if (newLogInputRef.current) {
        newLogInputRef.current.blur();
      }
    } else if (e.key === " ") {
      // Prevent space from triggering drag and drop
      e.stopPropagation();
    }
  };

  // Format log date for display
  const formatLogDate = (date: Date): string => {
    const now = DateOnly.getCurrentDate();
    const diffInMs = now.getTime() - date.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInMinutes < 1) {
      return t("taskCard.justNow");
    } else if (diffInMinutes < 60) {
      return t("taskCard.minutesAgo", { count: diffInMinutes });
    } else if (diffInHours < 24) {
      return t("taskCard.hoursAgo", { count: diffInHours });
    } else if (diffInDays < 7) {
      return t("taskCard.daysAgo", { count: diffInDays });
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
          bg-white rounded-lg border shadow-sm px-4 py-2 transition-all duration-200 hover:shadow-md
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
            {t("taskCard.touchHelp")}
          </div>
        )}
        {/* Header with category */}
        <div className="flex items-center gap-2 mb-1">
          {/* Only show category badge if not on the same category page */}
          {currentCategory !== task.category && (
            <span
              className={`
              inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border
              ${categoryColor}
            `}
            >
              <CategoryIcon className="w-3 h-3 mr-1" />
              {t(`categories.${task.category.toLowerCase()}`)}
            </span>
          )}
          {isOverdue && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {t("taskCard.overdue")}
            </span>
          )}
        </div>

        {/* Task title with sun icon and actions */}
        <div className="mb-1">
          {isEditing ? (
            <div
              className="flex items-center gap-2"
              data-testid="task-card-log-input"
            >
              <input
                ref={editInputRef}
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleInputBlur}
                className="flex-1 text-lg font-medium text-gray-900 bg-white border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                maxLength={200}
              />
              <button
                onClick={handleSaveEdit}
                className="p-1 text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors"
                title={t("taskCard.save")}
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={handleCancelEdit}
                data-cancel-button
                className="p-1 text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded transition-colors"
                title={t("taskCard.cancel")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1">
                {/* Sun icon for today tasks */}
                {showTodayButton && onAddToToday && (
                  <button
                    onClick={() => onAddToToday(task.id.value)}
                    className={`p-1 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                      isInTodaySelection
                        ? "text-yellow-500 hover:text-yellow-600 hover:bg-yellow-50 focus:ring-yellow-500"
                        : "text-gray-400 hover:text-gray-500 hover:bg-gray-50 focus:ring-gray-500"
                    }`}
                    title={
                      isInTodaySelection
                        ? t("taskCard.removeFromToday")
                        : t("taskCard.addToToday")
                    }
                    aria-label={
                      isInTodaySelection
                        ? t("taskCard.removeTaskFromToday")
                        : t("taskCard.addTaskToToday")
                    }
                  >
                    <Sun className="w-4 h-4" />
                  </button>
                )}

                {/* Task title */}
                <h3
                  id={`task-title-${task.id.value}`}
                  className={`
                  text-lg font-medium text-gray-900 cursor-pointer hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded px-1 py-1 flex-1
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
                  aria-label={t("taskCard.editTask", {
                    title: task.title.value,
                  })}
                >
                  {task.title.value}
                </h3>
              </div>

              {/* Actions */}
              <div
                className="flex items-center gap-1"
                role="toolbar"
                aria-label={t("taskCard.taskActions")}
              >
                {/* Complete/Revert button - always visible */}
                {!isCompleted && (
                  <button
                    onClick={() => onComplete(task.id.value)}
                    className="p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                    title={t("taskCard.completeTask")}
                    aria-label={t("taskCard.markTaskAsComplete", {
                      title: task.title.value,
                    })}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}

                {isCompleted && onRevertCompletion && (
                  <button
                    onClick={() => onRevertCompletion(task.id.value)}
                    className="p-2 text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                    title={t("taskCard.revertTask")}
                    aria-label={t("taskCard.revertCompletion", {
                      title: task.title.value,
                    })}
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                )}

                {/* Dropdown menu for other actions */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setShowDropdown(!showDropdown)}
                    className="p-2 text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                    title={t("taskCard.moreActions")}
                    aria-label={t("taskCard.moreActions")}
                    aria-expanded={showDropdown}
                    aria-haspopup="true"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>

                  {/* Dropdown menu */}
                  {showDropdown && (
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-10">
                      {showDeferButton && onDefer && !isCompleted && (
                        <button
                          onClick={() => {
                            setShowDeferModal(true);
                            setShowDropdown(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                        >
                          <Clock className="w-4 h-4 text-orange-600" />
                          {t("taskCard.deferTask")}
                        </button>
                      )}

                      <button
                        onClick={() => {
                          onDelete(task.id.value);
                          setShowDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        {t("taskCard.deleteTask")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Logs section - compact */}
        {(lastLog || onCreateLog) && (
          <div className="mb-1">
            {/* Compact log display */}
            <div className="text-xs text-gray-500 mb-1">
              {lastLog ? (
                <div
                  className="cursor-pointer hover:text-gray-700 transition-colors"
                  onClick={handleToggleLogHistory}
                >
                  {t("taskCard.lastLog")} {lastLog.message} (
                  {formatLogDate(lastLog.createdAt)})
                </div>
              ) : (
                <div
                  className="cursor-pointer hover:text-gray-700 transition-colors"
                  onClick={handleToggleLogHistory}
                >
                  {t("taskCard.noLogsYet")}
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
                {t("taskCard.logHistory")}
              </h4>
              <button
                onClick={handleToggleLogHistory}
                className="text-xs text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 rounded px-2 py-1"
                aria-label={t("taskCard.hideLogHistory")}
              >
                <ChevronUp className="w-3 h-3" />
              </button>
            </div>

            {/* New log input - always visible when onCreateLog is available */}
            {onCreateLog && (
              <div className="mb-3 p-2 bg-white rounded border">
                <div className="flex items-center gap-2">
                  <input
                    ref={newLogInputRef}
                    type="text"
                    value={newLogText}
                    onChange={(e) => setNewLogText(e.target.value)}
                    onKeyDown={handleNewLogKeyDown}
                    placeholder={t("taskCard.addNewLogPlaceholder")}
                    className="flex-1 text-sm border-0 focus:outline-none focus:ring-0 p-1"
                  />
                  <button
                    onClick={handleCreateNewLog}
                    disabled={!newLogText.trim()}
                    className="p-1 text-green-600 hover:text-green-700 disabled:text-gray-400 transition-colors"
                    title={t("taskCard.saveLog")}
                  >
                    <Pen className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {loadingLogs ? (
              <div className="text-center py-4">
                <span className="text-sm text-gray-500">
                  {t("taskCard.loadingLogs")}
                </span>
              </div>
            ) : taskLogs.length > 0 ? (
              <div
                className="space-y-2 max-h-60 overflow-y-auto"
                role="log"
                aria-label={t("taskCard.taskLogEntries")}
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
                          className={`w-3 h-3 mt-0.5 ${getLogTypeColor(
                            log.type
                          )}`}
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
                <p className="text-sm text-gray-500">
                  {t("taskCard.noLogsFound")}
                </p>
              </div>
            )}
          </div>
        )}
      </motion.article>

      {/* Defer Date Modal */}
      {showDeferModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-80 max-w-sm mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {t("taskCard.deferTask")}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Выберите дату, на которую отложить задачу:
            </p>
            <div className="space-y-3">
              <button
                onClick={() => {
                  const tomorrow = new Date();
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  handleDeferConfirm(tomorrow);
                }}
                className="w-full p-3 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="font-medium">Завтра</div>
                <div className="text-sm text-gray-500">
                  {new Date(
                    Date.now() + 24 * 60 * 60 * 1000
                  ).toLocaleDateString()}
                </div>
              </button>
              <button
                onClick={() => {
                  const nextWeek = new Date();
                  nextWeek.setDate(nextWeek.getDate() + 7);
                  handleDeferConfirm(nextWeek);
                }}
                className="w-full p-3 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="font-medium">Через неделю</div>
                <div className="text-sm text-gray-500">
                  {new Date(
                    Date.now() + 7 * 24 * 60 * 60 * 1000
                  ).toLocaleDateString()}
                </div>
              </button>
              <button
                onClick={() => {
                  const nextMonth = new Date();
                  nextMonth.setMonth(nextMonth.getMonth() + 1);
                  handleDeferConfirm(nextMonth);
                }}
                className="w-full p-3 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="font-medium">Через месяц</div>
                <div className="text-sm text-gray-500">
                  {new Date(
                    Date.now() + 30 * 24 * 60 * 60 * 1000
                  ).toLocaleDateString()}
                </div>
              </button>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowDeferModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
