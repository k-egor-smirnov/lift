import React, { useEffect, useRef } from "react";
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
import { useTranslation } from "react-i18next";

// Подкомпоненты
import { TaskCardHeader } from "./task-card/TaskCardHeader";
import { TaskTitleEditor } from "./task-card/TaskTitleEditor";
import { TaskTitleDisplay } from "./task-card/TaskTitleDisplay";
import { TaskActions } from "./task-card/TaskActions";
import { TaskLogsDisplay } from "./task-card/TaskLogsDisplay";
import { TaskLogsModal } from "./task-card/TaskLogsModal";
import { TaskDeferModal } from "./task-card/TaskDeferModal";

// Хуки
import { useTaskEditing } from "./task-card/hooks/useTaskEditing";
import { useTaskLogs } from "./task-card/hooks/useTaskLogs";
import { useTaskDefer } from "./task-card/hooks/useTaskDefer";

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
  isInTodaySelection?: boolean;
  lastLog?: LogEntry | null;
  onLoadTaskLogs?: (taskId: string) => Promise<LogEntry[]>;
  onCreateLog?: (taskId: string, message: string) => Promise<boolean>;
  isDraggable?: boolean;
  currentCategory?: TaskCategory;
}

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
  const cardRef = useRef<HTMLElement>(null);

  // Хуки для управления состоянием
  const {
    isEditing,
    editTitle,
    setEditTitle,
    handleStartEdit,
    handleSaveEdit,
    handleCancelEdit,
  } = useTaskEditing({
    initialTitle: task.title.value,
    onEdit,
    taskId: task.id.value,
  });

  const {
    taskLogs,
    loadingLogs,
    newLogText,
    showLogModal,
    setNewLogText,
    setShowLogModal,
    handleToggleLogHistory,
    handleCreateNewLog,
    handleNewLogKeyDown,
  } = useTaskLogs({
    taskId: task.id.value,
    onLoadTaskLogs,
    onCreateLog,
  });

  const {
    showDeferModal,
    handleOpenDeferModal,
    handleCloseDeferModal,
    handleDeferConfirm,
  } = useTaskDefer({
    taskId: task.id.value,
    onDefer,
  });

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
    onLongPress: () => {
      if (isTouch && onCreateLog) {
        // Long press opens log modal
        handleToggleLogHistory();
      }
    },
  });

  // Attach touch gestures
  useEffect(() => {
    if (isTouch && cardRef.current) {
      return attachGestures(cardRef.current);
    }
  }, [attachGestures, isTouch]);

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

        {/* Header with category and status badges */}
        <TaskCardHeader
          category={task.category}
          currentCategory={currentCategory}
          isOverdue={isOverdue}
        />

        {/* Task title section */}
        <div className="mb-1">
          {isEditing ? (
            <TaskTitleEditor
              title={editTitle}
              onTitleChange={setEditTitle}
              onSave={handleSaveEdit}
              onCancel={handleCancelEdit}
            />
          ) : (
            <div className="flex items-center justify-between gap-2">
              <TaskTitleDisplay
                taskId={task.id.value}
                title={task.title.value}
                status={task.status}
                showTodayButton={showTodayButton}
                isInTodaySelection={isInTodaySelection}
                onEdit={handleStartEdit}
                onAddToToday={onAddToToday}
              />

              <TaskActions
                taskId={task.id.value}
                taskTitle={task.title.value}
                status={task.status}
                showDeferButton={showDeferButton}
                onComplete={onComplete}
                onRevertCompletion={onRevertCompletion}
                onDelete={onDelete}
                onDefer={handleOpenDeferModal}
                onEdit={handleStartEdit}
              />
            </div>
          )}
        </div>

        {/* Logs section */}
        <TaskLogsDisplay
          lastLog={lastLog}
          onToggleLogHistory={handleToggleLogHistory}
          onCreateLog={onCreateLog}
        />
      </motion.article>

      {/* Modals */}
      <TaskLogsModal
        isOpen={showLogModal}
        onClose={() => setShowLogModal(false)}
        taskLogs={taskLogs}
        loadingLogs={loadingLogs}
        newLogText={newLogText}
        onNewLogTextChange={setNewLogText}
        onCreateLog={onCreateLog ? handleCreateNewLog : undefined}
        onNewLogKeyDown={handleNewLogKeyDown}
      />

      <TaskDeferModal
        isOpen={showDeferModal}
        onClose={handleCloseDeferModal}
        onDeferConfirm={handleDeferConfirm}
      />
    </>
  );
};
