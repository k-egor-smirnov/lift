import React, { useEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

import type { LogEntry } from "../../../../shared/application/use-cases/GetTaskLogsUseCase";
import { TaskStatus } from "../../../../shared/domain/types";
import {
  isTouchDevice,
  useTouchGestures,
} from "../../../../shared/infrastructure/services/useTouchGestures";
import { Badge } from "../../../../shared/ui/badge";
import type { Tag } from "../../../tags/presentation/view-models/TagViewModel";
import type { TaskListItem } from "../models/TaskListItem";
import { TaskActions } from "./task-card/TaskActions";
import { TaskCardHeader } from "./task-card/TaskCardHeader";
import { TaskDeferModal } from "./task-card/TaskDeferModal";
import { TaskLogsDisplay } from "./task-card/TaskLogsDisplay";
import { TaskLogsModal } from "./task-card/TaskLogsModal";
import { TaskTitleDisplay } from "./task-card/TaskTitleDisplay";
import { useTaskDefer } from "./task-card/hooks/useTaskDefer";
import { useTaskLogs } from "./task-card/hooks/useTaskLogs";

interface TaskCardProps {
  task: TaskListItem;
  onComplete: (taskId: string) => void;
  onRevertCompletion?: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onEdit?: () => void;
  onAddToToday?: (taskId: string) => void;
  onDefer?: (taskId: string, deferDate: string) => void;
  showTodayButton?: boolean;
  showDeferButton?: boolean;
  isInTodaySelection?: boolean;
  lastLog?: LogEntry | null;
  onLoadTaskLogs?: (taskId: string) => Promise<LogEntry[]>;
  onCreateLog?: (taskId: string, message: string) => Promise<boolean>;
  isDraggable?: boolean;
  currentCategory?: TaskListItem["category"];
  tags?: readonly Tag[];
  selectedTagIds?: readonly string[];
  animationDirection?: -1 | 1;
  isListDragActive?: boolean;
  isActiveDragItem?: boolean;
  suppressDropIndicator?: boolean;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onComplete,
  onRevertCompletion,
  onDelete,
  onEdit,
  onAddToToday,
  onDefer,
  showTodayButton = false,
  showDeferButton = false,
  isInTodaySelection = false,
  lastLog = null,
  onLoadTaskLogs,
  onCreateLog,
  isDraggable = false,
  currentCategory,
  tags = [],
  selectedTagIds = [],
  animationDirection = 1,
  isListDragActive = false,
  isActiveDragItem = false,
  suppressDropIndicator = false,
}) => {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLElement | null>(null);

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
    taskId: task.taskId,
    onLoadTaskLogs,
    onCreateLog,
  });

  const {
    showDeferModal,
    handleOpenDeferModal,
    handleCloseDeferModal,
    handleDeferConfirm,
  } = useTaskDefer({ taskId: task.taskId, onDefer });

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: task.taskId, disabled: !isDraggable });

  const isCompleted = task.completion === "completed";
  const status = isCompleted ? TaskStatus.COMPLETED : TaskStatus.ACTIVE;
  const isTouch = isTouchDevice();
  const isDraggingState = isDragging || isActiveDragItem;

  const { attachGestures } = useTouchGestures({
    onSwipeRight: () => {
      if (isTouch && !isCompleted) onComplete(task.taskId);
    },
    onSwipeLeft: () => {
      if (isTouch && showTodayButton) onAddToToday?.(task.taskId);
    },
    onLongPress: () => {
      if (isTouch && onCreateLog) handleToggleLogHistory();
    },
  });

  useEffect(() => {
    if (isTouch && cardRef.current) return attachGestures(cardRef.current);
  }, [attachGestures, isTouch]);

  return (
    <>
      {isOver && !suppressDropIndicator && (
        <div
          className="h-0.5 bg-blue-500 mx-4 mb-2 rounded-full"
          data-testid="task-drop-indicator"
        />
      )}

      <motion.article
        layout={isListDragActive ? false : "position"}
        ref={(node) => {
          setNodeRef(node);
          cardRef.current = node;
        }}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
        }}
        {...(isDraggable ? attributes : {})}
        {...(isDraggable ? listeners : {})}
        className={`
          bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-2
          transition-shadow duration-150 hover:shadow-md
          ${isTouch ? "touch-manipulation" : ""}
          ${isDraggable ? "cursor-grab active:cursor-grabbing" : ""}
          relative group
        `}
        role="article"
        id={`task-${task.taskId}`}
        aria-labelledby={`task-title-${task.taskId}`}
        data-testid="task-card"
        data-animation-direction={animationDirection === -1 ? "up" : "down"}
        initial={{ opacity: 0, y: animationDirection * 12, scale: 0.98 }}
        animate={{
          opacity: isActiveDragItem ? 0.5 : isCompleted ? 0.62 : 1,
          y: 0,
          scale: isDraggingState ? 1.02 : 1,
          boxShadow: isDraggingState
            ? "0 10px 25px rgba(0, 0, 0, 0.15)"
            : "0 1px 3px rgba(0, 0, 0, 0.1)",
        }}
        exit={{
          opacity: 0,
          y: animationDirection * -8,
          scale: 0.98,
          transition: { duration: 0.14, ease: "easeIn" },
        }}
        transition={{
          duration: 0.16,
          ease: "easeOut",
          layout: { duration: 0.18, ease: [0.2, 0, 0, 1] },
        }}
      >
        {isTouch && <div className="sr-only">{t("taskCard.touchHelp")}</div>}

        <TaskCardHeader
          category={task.category}
          currentCategory={currentCategory}
        />

        <div className="mb-1 flex items-center justify-between gap-2">
          <TaskTitleDisplay
            taskId={task.taskId}
            title={task.title}
            status={status}
            showTodayButton={showTodayButton}
            isInTodaySelection={isInTodaySelection}
            onAddToToday={onAddToToday}
          />

          <TaskActions
            taskId={task.taskId}
            taskTitle={task.title}
            status={status}
            showDeferButton={showDeferButton}
            onComplete={onComplete}
            onRevertCompletion={onRevertCompletion}
            onDelete={onDelete}
            onEdit={onEdit}
            onDefer={handleOpenDeferModal}
          />
        </div>

        {selectedTagIds.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {tags
              .filter((tag) => selectedTagIds.includes(tag.id))
              .map((tag) => (
                <Badge
                  key={tag.id}
                  variant="secondary"
                  className="text-[10px] px-2 py-0.5"
                  style={{ borderColor: tag.color, color: tag.color }}
                >
                  {tag.name}
                </Badge>
              ))}
          </div>
        )}

        <TaskLogsDisplay
          lastLog={lastLog}
          onToggleLogHistory={handleToggleLogHistory}
          onCreateLog={onCreateLog}
        />
      </motion.article>

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
