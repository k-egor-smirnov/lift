import React from "react";
import { LogEntry } from "../../../../../shared/application/use-cases/GetTaskLogsUseCase";
import { DateOnly } from "../../../../../shared/domain/value-objects/DateOnly";
import { useTranslation } from "react-i18next";

interface TaskLogsDisplayProps {
  lastLog?: LogEntry | null;
  onToggleLogHistory: () => void;
  onCreateLog?: (taskId: string, message: string) => Promise<boolean>;
}

export const TaskLogsDisplay: React.FC<TaskLogsDisplayProps> = ({
  lastLog,
  onToggleLogHistory,
  onCreateLog,
}) => {
  const { t } = useTranslation();

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

  if (!lastLog && !onCreateLog) {
    return null;
  }

  return (
    <div className="mb-1">
      {/* Compact log display */}
      <div className="text-xs text-gray-500 mb-1">
        {lastLog ? (
          <div
            className="cursor-pointer hover:text-gray-700 transition-colors"
            onClick={onToggleLogHistory}
          >
            {t("taskCard.lastLog")} {lastLog.message} (
            {formatLogDate(lastLog.createdAt)})
          </div>
        ) : (
          <div
            className="cursor-pointer hover:text-gray-700 transition-colors"
            onClick={onToggleLogHistory}
          >
            {t("taskCard.noLogsYet")}
          </div>
        )}
      </div>
    </div>
  );
};
