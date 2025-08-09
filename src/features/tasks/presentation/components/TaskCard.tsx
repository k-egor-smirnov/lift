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
import { NoteModal } from "../../../../shared/ui/components/NoteModal";
import { Check, FileText, ListChecks, ListTodo } from "lucide-react";
import {
  parseChecklistProgress,
  formatChecklistProgress,
} from "../../../../shared/utils/checklistUtils";

// Хуки
import { useTaskEditing } from "./task-card/hooks/useTaskEditing";
import { useTaskLogs } from "./task-card/hooks/useTaskLogs";
import { useTaskDefer } from "./task-card/hooks/useTaskDefer";
import { useTaskNote } from "../hooks/useTaskNote";
import { TaskViewModel } from "../view-models/TaskViewModel";
import { usePointerCapability } from "../../../../shared/infrastructure/services/usePointerCapability";

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

  const {
    isOpen: showNoteModal,
    isSaving,
    openNote: handleOpenNoteModal,
    closeNote: handleCloseNoteModal,
    saveNote: handleSaveNote,
  } = useTaskNote(task.id.value, task.note, taskViewModel!);

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
  const { hasMouseLikePointer } = usePointerCapability();

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
      >
        {/* Bottom-right note/checklist indicator */}
        {(() => {
          const hasNote = !!(task.note && task.note.trim().length > 0);
          const progress = parseChecklistProgress(task.note);
          const hasChecklist = hasNote && progress.total > 0;

          // Show placeholder only for mouse users; on touch-only show indicator only if note exists
          const shouldShow = hasMouseLikePointer || hasNote;
          if (!shouldShow) return null;

          if (hasChecklist) {
            if (hasMouseLikePointer) {
              return (
                <button
                  onClick={handleOpenNoteModal}
                  className="absolute bottom-2.5 right-2.5 flex items-center text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                  aria-label={t("taskCard.checklistProgress")}
                  title={`Заметка: ${formatChecklistProgress(progress)}`}
                >
                  <ListTodo className="w-3.5 h-3.5" />
                  <span className="text-[10px] leading-none rounded px-1 py-[1px]">
                    {formatChecklistProgress(progress)}
                  </span>
                </button>
              );
            }
            // Touch-only: non-interactive indicator
            return (
              <div
                className="absolute bottom-2.5 right-2.5 flex items-center text-gray-400"
                aria-hidden
              >
                <ListTodo className="w-3.5 h-3.5" />
                <span className="text-[10px] leading-none rounded px-1 py-[1px]">
                  {formatChecklistProgress(progress)}
                </span>
              </div>
            );
          } else if (hasNote) {
            if (hasMouseLikePointer) {
              return (
                <button
                  onClick={handleOpenNoteModal}
                  className="absolute bottom-2.5 right-2.5 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                  aria-label={t("taskCard.noteExists")}
                  title="Редактировать заметку"
                >
                  <FileText className="w-3.5 h-3.5" />
                </button>
              );
            }
            // Touch-only: non-interactive indicator
            return (
              <div
                className="absolute bottom-2.5 right-2.5 text-gray-400"
                aria-hidden
              >
                <FileText className="w-3.5 h-3.5" />
              </div>
            );
          } else if (hasMouseLikePointer) {
            // Desktop/mouse placeholder for empty note with hover tooltip
            return (
              <button
                onClick={handleOpenNoteModal}
                className="absolute bottom-2.5 right-2.5 text-gray-300 hover:text-gray-500 transition-colors cursor-pointer opacity-0 hover:opacity-100 group-hover:opacity-100"
                aria-label="Добавить заметку"
                title="Заметка"
              >
                <FileText className="w-3.5 h-3.5" />
              </button>
            );
          }

          return null;
        })()}

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
                note={task.note}
                onNoteClick={handleOpenNoteModal}
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

      <NoteModal
        isOpen={showNoteModal}
        onClose={handleCloseNoteModal}
        onSave={handleSaveNote}
        initialContent={task.note || ""}
        taskTitle={task.title.value}
      />
    </>
  );
};
