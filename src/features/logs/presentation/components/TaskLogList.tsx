import React from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileText,
  FolderSync,
  Loader2,
  PencilLine,
  Settings,
  Undo2,
  User,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCurrentTime } from "@/shared/presentation/contexts/CurrentTimeContext";
import { formatTimeAgo } from "@/shared/utils/timeFormat";
import { LogEntry } from "../../../../shared/application/use-cases/GetTaskLogsUseCase";
import { DomainEventType } from "../../../../shared/domain/types";

interface TaskLogListProps {
  logs: LogEntry[];
  loading?: boolean;
  error?: string | null;
  onLoadMore?: () => void;
  hasNextPage?: boolean;
  emptyMessage?: string;
  showTaskId?: boolean;
}

const getLogTypeIcon = (type: "SYSTEM" | "USER" | "CONFLICT") => {
  switch (type) {
    case "SYSTEM":
      return Settings;
    case "USER":
      return User;
    case "CONFLICT":
      return AlertTriangle;
    default:
      return FileText;
  }
};

const getLogActionVisual = (
  log: LogEntry
): { Icon: React.ComponentType<{ className?: string }>; className: string } => {
  const eventType = log.metadata?.eventType as DomainEventType | undefined;

  if (eventType === DomainEventType.TASK_COMPLETED) {
    return { Icon: CheckCircle2, className: "text-emerald-600" };
  }
  if (eventType === DomainEventType.TASK_DEFERRED) {
    return { Icon: CalendarClock, className: "text-amber-600" };
  }
  if (eventType === DomainEventType.TASK_UNDEFERRED) {
    return { Icon: Undo2, className: "text-indigo-600" };
  }
  if (eventType === DomainEventType.TASK_TITLE_CHANGED) {
    return { Icon: PencilLine, className: "text-violet-600" };
  }
  if (eventType === DomainEventType.TASK_CATEGORY_CHANGED) {
    return { Icon: FolderSync, className: "text-sky-600" };
  }

  return {
    Icon: getLogTypeIcon(log.type),
    className:
      log.type === "SYSTEM"
        ? "text-blue-600"
        : log.type === "USER"
          ? "text-green-600"
          : "text-red-600",
  };
};

const getLogActionKey = (log: LogEntry): string => {
  const eventType = log.metadata?.eventType as DomainEventType | undefined;

  switch (eventType) {
    case DomainEventType.TASK_COMPLETED:
      return "completed";
    case DomainEventType.TASK_DEFERRED:
      return "deferred";
    case DomainEventType.TASK_UNDEFERRED:
      return "undeferred";
    case DomainEventType.TASK_TITLE_CHANGED:
      return "title_changed";
    case DomainEventType.TASK_CATEGORY_CHANGED:
      return "status_changed";
    default:
      return log.type.toLowerCase();
  }
};

const formatMetadata = (
  metadata?: Record<string, any>,
  t?: any
): string | null => {
  if (!metadata || Object.keys(metadata).length === 0) {
    return null;
  }

  // Handle common metadata patterns
  if (metadata.oldCategory && metadata.newCategory) {
    return t
      ? t("logs.changedCategory", {
          from: metadata.oldCategory,
          to: metadata.newCategory,
        })
      : `Changed from ${metadata.oldCategory} to ${metadata.newCategory}`;
  }

  if (metadata.oldTitle && metadata.newTitle) {
    return t
      ? t("logs.changedTitle", {
          from: metadata.oldTitle,
          to: metadata.newTitle,
        })
      : `Title changed from "${metadata.oldTitle}" to "${metadata.newTitle}"`;
  }

  if (metadata.entityType && metadata.winner) {
    return t
      ? t("logs.conflictResolved", { winner: metadata.winner })
      : `Conflict resolved: ${metadata.winner} version selected`;
  }

  // Generic metadata display
  return Object.entries(metadata)
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");
};

export const TaskLogList: React.FC<TaskLogListProps> = ({
  logs,
  loading = false,
  error = null,
  onLoadMore,
  hasNextPage = false,
  emptyMessage = "No logs found",
  showTaskId = false,
}) => {
  const { t, i18n } = useTranslation();
  const now = useCurrentTime();

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="mb-4 flex justify-center">
          <AlertTriangle className="w-10 h-10 text-red-400" />
        </div>
        <h3 className="text-lg font-medium text-red-900 mb-2">
          {t("logs.errorLoading")}
        </h3>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (loading && logs.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="mb-4 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
        <p className="text-gray-500">{t("logs.loading")}</p>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="mb-4 flex justify-center">
          <FileText className="w-16 h-16 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          {t("logs.noLogs")}
        </h3>
        <p className="text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Log entries */}
      <div className="space-y-3">
        {logs.map((log) => {
          const { Icon, className } = getLogActionVisual(log);
          const actionKey = getLogActionKey(log);
          return (
            <div
              key={log.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1">
                  {/* Action indicator */}
                  <div className="flex-shrink-0">
                    <Icon
                      className={`w-5 h-5 ${className}`}
                      data-testid={`history-action-icon-${actionKey}`}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Header with contextual chips and timestamp */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {showTaskId && log.taskId && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          {t("logs.task")}: {log.taskId.slice(-8)}
                        </span>
                      )}
                      <span className="text-sm text-gray-500">
                        {formatTimeAgo(log.createdAt, now, t, i18n.language)}
                      </span>
                    </div>

                    {/* Log message */}
                    <p className="text-gray-900 text-sm leading-relaxed">
                      {log.message}
                    </p>

                    {/* Metadata */}
                    {log.metadata && (
                      <div className="mt-2">
                        {formatMetadata(log.metadata, t) && (
                          <p className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                            {formatMetadata(log.metadata, t)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Load more button */}
      {hasNextPage && (
        <div className="text-center pt-4">
          <button
            onClick={onLoadMore}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                {t("logs.loading")}
              </>
            ) : (
              t("logs.loadMore")
            )}
          </button>
        </div>
      )}
    </div>
  );
};
