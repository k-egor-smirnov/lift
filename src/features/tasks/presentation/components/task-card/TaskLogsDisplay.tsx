import React from "react";
import { LogEntry } from "../../../../../shared/application/use-cases/GetTaskLogsUseCase";
import { useTranslation } from "react-i18next";
import { useCurrentTime } from "@/shared/presentation/contexts/CurrentTimeContext";
import { formatTimeAgo } from "@/shared/utils/timeFormat";

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
  const { t, i18n } = useTranslation();
  const now = useCurrentTime();

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
            {formatTimeAgo(lastLog.createdAt, now, t, i18n.language)})
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
