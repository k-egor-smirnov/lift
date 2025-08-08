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
import {
  TaskImageService,
  thumbhashToDataUrl,
} from "../../../../shared/infrastructure/services/TaskImageService";
import { ImageViewer } from "../../../../shared/ui/components/ImageViewer";
import { container } from "tsyringe";
import { TaskImageRecord } from "../../../../shared/infrastructure/database/TodoDatabase";

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
  const taskImageService = container.resolve(TaskImageService);
  const [images, setImages] = useState<TaskImageRecord[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [isImageDragOver, setIsImageDragOver] = useState(false);

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

  useEffect(() => {
    taskImageService.getImages(task.id.value).then(setImages);
  }, [task.id.value]);

  const handleImageDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsImageDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/")
    );
    if (files.length) {
      await taskImageService.addImages(task.id.value, files);
      const updated = await taskImageService.getImages(task.id.value);
      setImages(updated);
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
    onTap: () => {
      if (isTouch && !isEditing) {
        handleStartEdit();
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
        onDragOver={(e) => {
          e.preventDefault();
          setIsImageDragOver(true);
        }}
        onDragLeave={() => setIsImageDragOver(false)}
        onDrop={handleImageDrop}
        className={`
          bg-white rounded-lg border shadow-sm px-4 py-2 transition-all duration-200 hover:shadow-md
          ${isOverdue ? "border-red-300 bg-red-50" : "border-gray-200"}
          ${isCompleted ? "opacity-60" : ""}
          ${isTouch ? "touch-manipulation" : ""}
          ${isDraggingState ? "opacity-50" : ""}
          ${isDraggable ? "cursor-grab active:cursor-grabbing" : ""}
          ${isImageDragOver ? "border-blue-400" : ""}
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
              />
            </div>
          )}
        </div>
        {images.length > 0 && (
          <div className="mt-2 flex gap-2 flex-wrap">
            {images.map((img, idx) => (
              <img
                key={img.id}
                src={URL.createObjectURL(img.data)}
                className="w-12 h-12 object-cover rounded cursor-pointer"
                onClick={() => setViewerIndex(idx)}
              />
            ))}
          </div>
        )}

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

      {viewerIndex !== null && (
        <ImageViewer
          images={images.map((img) => URL.createObjectURL(img.data))}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </>
  );
};
