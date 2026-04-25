import React from "react";
import { Clock, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Task } from "../../../../shared/domain/entities/Task";
import { TaskId } from "../../../../shared/domain/value-objects/TaskId";

interface DeferredTaskCardProps {
  task: Task;
  onUndefer: (taskId: TaskId) => Promise<void>;
  animationDirection?: -1 | 1;
  isListDragActive?: boolean;
}

export const DeferredTaskCard: React.FC<DeferredTaskCardProps> = ({
  task,
  onUndefer,
  animationDirection = 1,
  isListDragActive = false,
}) => {
  const { t } = useTranslation();

  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date);
  };

  const isOverdue = task.isDeferredAndDue;

  const handleUndefer = async () => {
    try {
      await onUndefer(task.id);
    } catch (error) {
      console.error("Failed to undefer task:", error);
    }
  };

  return (
    <motion.div
      layout={isListDragActive ? false : "position"}
      className={`
      p-4 bg-white rounded-lg border-2 transition-shadow duration-150 hover:shadow-md
      ${isOverdue ? "border-orange-200 bg-orange-50" : "border-gray-200"}
    `}
      role="article"
      id={`task-${task.id.value}`}
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
            {task.title.value}
          </h3>

          <div className="flex items-center text-sm text-gray-600 mb-3">
            <Clock className="w-4 h-4 mr-1" />
            <span>
              {t("taskCard.deferredUntil")}:{" "}
              {task.deferredUntil
                ? formatDate(task.deferredUntil)
                : t("taskCard.notSpecified")}
            </span>
          </div>

          {isOverdue && (
            <div className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200 mb-2">
              <Clock className="w-3 h-3 mr-1" />
              {t("taskCard.deadlineExpired")}
            </div>
          )}

          <div className="text-xs text-gray-500">
            {t("taskCard.originalCategory")}:{" "}
            {task.originalCategory
              ? t(`categories.${task.originalCategory.toLowerCase()}`)
              : t("taskCard.notSpecifiedFemale")}
          </div>
        </div>

        <button
          onClick={handleUndefer}
          className="ml-4 p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
          title={t("taskCard.restoreTask")}
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
};
