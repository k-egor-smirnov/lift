import React from "react";
import { TaskStatus } from "../../../../../shared/domain/types";
import { useTranslation } from "react-i18next";
import { Sun } from "lucide-react";

interface TaskTitleDisplayProps {
  taskId: string;
  title: string;
  status: TaskStatus;
  showTodayButton: boolean;
  isInTodaySelection: boolean;
  onEdit: () => void;
  onAddToToday?: (taskId: string) => void;
}

export const TaskTitleDisplay: React.FC<TaskTitleDisplayProps> = ({
  taskId,
  title,
  status,
  showTodayButton,
  isInTodaySelection,
  onEdit,
  onAddToToday,
}) => {
  const { t } = useTranslation();
  const isCompleted = status === TaskStatus.COMPLETED;

  return (
    <div className="flex items-center gap-2 flex-1">
      {/* Sun icon for today tasks */}
      {showTodayButton && onAddToToday && (
        <button
          onClick={() => onAddToToday(taskId)}
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
        id={`task-title-${taskId}`}
        className={`
          text-lg font-medium text-gray-900 cursor-pointer hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded px-1 py-1 flex-1
          ${isCompleted ? "line-through" : ""}
        `}
        onClick={onEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onEdit();
          }
        }}
        tabIndex={0}
        role="button"
        aria-label={t("taskCard.editTask", { title })}
      >
        {title}
      </h3>
    </div>
  );
};
