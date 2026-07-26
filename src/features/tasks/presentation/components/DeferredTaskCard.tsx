import React from "react";
import { Clock, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

import { DateOnly } from "../../../../shared/domain/value-objects/DateOnly";
import type { TaskListItem } from "../models/TaskListItem";

interface DeferredTaskCardProps {
  task: TaskListItem;
  onUndefer: (taskId: string) => Promise<void>;
  animationDirection?: -1 | 1;
  isListDragActive?: boolean;
}

const formatDateOnly = (value: string): string =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(DateOnly.fromString(value).toDate());

export const DeferredTaskCard: React.FC<DeferredTaskCardProps> = ({
  task,
  onUndefer,
  animationDirection = 1,
  isListDragActive = false,
}) => {
  const { t } = useTranslation();

  const handleUndefer = async () => {
    try {
      await onUndefer(task.taskId);
    } catch (error) {
      console.error("Failed to undefer task:", error);
    }
  };

  return (
    <motion.div
      layout={isListDragActive ? false : "position"}
      className="p-4 bg-white rounded-lg border-2 border-gray-200 transition-shadow duration-150 hover:shadow-md"
      role="article"
      id={`task-${task.taskId}`}
      data-testid="task-card"
      data-animation-direction={animationDirection === -1 ? "up" : "down"}
      initial={{ opacity: 0, y: animationDirection * 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
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
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm leading-snug font-medium text-gray-900 mb-2">
            {task.title}
          </h3>

          <div className="flex items-center text-sm text-gray-600 mb-3">
            <Clock className="w-4 h-4 mr-1" />
            <span>
              {t("taskCard.deferredUntil")}:{" "}
              {task.deferredUntil
                ? formatDateOnly(task.deferredUntil)
                : t("taskCard.notSpecified")}
            </span>
          </div>
        </div>

        <button
          onClick={() => void handleUndefer()}
          className="ml-4 p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
          title={t("taskCard.restoreTask")}
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
};
