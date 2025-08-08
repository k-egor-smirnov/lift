import React from "react";
import { TaskStatus } from "../../../../../shared/domain/types";
import { useTranslation } from "react-i18next";
import {
  Check,
  Undo2,
  MoreHorizontal,
  Clock,
  Trash2,
  StickyNote,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../../../shared/ui/dropdown-menu";

interface TaskActionsProps {
  taskId: string;
  taskTitle: string;
  status: TaskStatus;
  showDeferButton: boolean;
  onComplete: (taskId: string) => void;
  onRevertCompletion?: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onDefer?: () => void;
  onOpenNote?: () => void;
  note?: string | null;
  checklistProgress?: { completed: number; total: number } | null;
}

export const TaskActions: React.FC<TaskActionsProps> = ({
  taskId,
  taskTitle,
  status,
  showDeferButton,
  onComplete,
  onRevertCompletion,
  onDelete,
  onDefer,
  onOpenNote,
  note,
  checklistProgress,
}) => {
  const { t } = useTranslation();
  const isCompleted = status === TaskStatus.COMPLETED;

  return (
    <div
      className="flex items-center gap-1"
      role="toolbar"
      aria-label={t("taskCard.taskActions")}
    >
      {/* Complete/Revert button - always visible */}
      {!isCompleted && (
        <button
          onClick={() => onComplete(taskId)}
          className="p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          title={t("taskCard.completeTask")}
          aria-label={t("taskCard.markTaskAsComplete", {
            title: taskTitle,
          })}
        >
          <Check className="w-4 h-4" />
        </button>
      )}

      {isCompleted && onRevertCompletion && (
        <button
          onClick={() => onRevertCompletion(taskId)}
          className="p-2 text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          title={t("taskCard.revertTask")}
          aria-label={t("taskCard.revertCompletion", {
            title: taskTitle,
          })}
        >
          <Undo2 className="w-4 h-4" />
        </button>
      )}

      {/* Note button */}
      <div className="flex items-center gap-1">
        <button
          onClick={onOpenNote}
          className="p-2 text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          title={t("taskCard.openNote")}
          aria-label={t("taskCard.openNote")}
        >
          <StickyNote
            className={`w-4 h-4 ${note ? "text-yellow-600" : "text-gray-400"}`}
            fill={note ? "currentColor" : "none"}
          />
        </button>
        {checklistProgress && (
          <span className="text-xs text-gray-500">
            {checklistProgress.completed} / {checklistProgress.total}
          </span>
        )}
      </div>

      {/* Dropdown menu for other actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="p-2 text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            title={t("taskCard.moreActions")}
            aria-label={t("taskCard.moreActions")}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {showDeferButton && onDefer && !isCompleted && (
            <DropdownMenuItem
              onClick={onDefer}
              className="flex items-center gap-2"
            >
              <Clock className="w-4 h-4 text-orange-600" />
              {t("taskCard.deferTask")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => onDelete(taskId)}
            className="flex items-center gap-2 text-red-600 focus:text-red-600"
          >
            <Trash2 className="w-4 h-4" />
            {t("taskCard.deleteTask")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
