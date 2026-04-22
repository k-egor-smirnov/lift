import React, { useEffect, useRef, useState } from "react";
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
import { TaskEditFormData, TaskEditModal } from "./task-card/TaskEditModal";

// Хуки
import { useTaskEditing } from "./task-card/hooks/useTaskEditing";
import { useTaskLogs } from "./task-card/hooks/useTaskLogs";
import { useTaskDefer } from "./task-card/hooks/useTaskDefer";
import { useTaskNote } from "../hooks/useTaskNote";
import { TaskViewModel } from "../view-models/TaskViewModel";

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
  taskViewModel?: TaskViewModel;
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
  taskViewModel,
}) => {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLElement>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const pointerDownCoordsRef = useRef<{ x: number; y: number } | null>(null);
  const draggedBetweenDownAndClickRef = useRef(false);

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

  const { saveNote: handleSaveNote } = useTaskNote(
    task.id.value,
    task.note,
    taskViewModel!
  );

  const handleSaveTaskChanges = async (data: TaskEditFormData) => {
    if (data.title !== task.title.value) {
      onEdit(task.id.value, data.title);
    }

    if (taskViewModel && data.category !== task.category) {
      await taskViewModel.getState().updateTask({
        taskId: task.id.value,
        category: data.category,
      });
    }

    if ((task.note || "") !== data.note) {
      await handleSaveNote(data.note);
    }
  };

  const handleCardClick = (event: React.MouseEvent<HTMLElement>) => {
    if (isEditing || isDraggingState || draggedBetweenDownAndClickRef.current) {
      draggedBetweenDownAndClickRef.current = false;
      return;
    }

    const target = event.target as HTMLElement;
    if (
      target.closest(
        "[data-no-card-edit],button,a,input,textarea,select,[role='button'],[contenteditable='true']"
      )
    ) {
      return;
    }

    setShowEditModal(true);
  };

  const handlePointerDownCapture = (event: React.PointerEvent<HTMLElement>) => {
    pointerDownCoordsRef.current = { x: event.clientX, y: event.clientY };
    draggedBetweenDownAndClickRef.current = false;
  };

  const handlePointerMoveCapture = (event: React.PointerEvent<HTMLElement>) => {
    const start = pointerDownCoordsRef.current;
    if (!start) return;

    const distance =
      Math.abs(event.clientX - start.x) + Math.abs(event.clientY - start.y);
    if (distance > 6) {
      draggedBetweenDownAndClickRef.current = true;
    }
  };

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
          relative group
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
        onClick={handleCardClick}
        onPointerDownCapture={handlePointerDownCapture}
        onPointerMoveCapture={handlePointerMoveCapture}
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
                onEdit={() => setShowEditModal(true)}
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

      <TaskEditModal
        isOpen={showEditModal}
        task={task}
        onClose={() => setShowEditModal(false)}
        onSave={handleSaveTaskChanges}
      />
    </>
  );
};
