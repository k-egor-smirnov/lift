import React, { useRef, useEffect } from "react";
import { LogEntry } from "../../../../../shared/application/use-cases/GetTaskLogsUseCase";
import { useTranslation } from "react-i18next";
import { useCurrentTime } from "@/shared/presentation/contexts/CurrentTimeContext";
import { formatTimeAgo } from "@/shared/utils/timeFormat";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileText,
  Pen,
  PencilLine,
  RotateCcw,
  Settings,
  Undo2,
  User,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../../../shared/ui/dialog";
import { DomainEventType } from "../../../../../shared/domain/types";

interface TaskLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskLogs: LogEntry[];
  loadingLogs: boolean;
  newLogText: string;
  onNewLogTextChange: (text: string) => void;
  onCreateLog?: () => void;
  onNewLogKeyDown: (e: React.KeyboardEvent) => void;
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

const getLogTypeColor = (type: "SYSTEM" | "USER" | "CONFLICT"): string => {
  switch (type) {
    case "SYSTEM":
      return "text-blue-600";
    case "USER":
      return "text-green-600";
    case "CONFLICT":
      return "text-red-600";
    default:
      return "text-gray-600";
  }
};

const getLogEventKey = (log: LogEntry): string => {
  const eventType = log.metadata?.eventType as DomainEventType | undefined;

  if (eventType === DomainEventType.TASK_COMPLETED) {
    return "completed";
  }
  if (eventType === DomainEventType.TASK_DEFERRED) {
    return "deferred";
  }
  if (eventType === DomainEventType.TASK_UNDEFERRED) {
    return "undeferred";
  }
  if (eventType === DomainEventType.TASK_TITLE_CHANGED) {
    return "title_changed";
  }
  if (eventType === DomainEventType.TASK_CATEGORY_CHANGED) {
    return "status_changed";
  }
  if (eventType === DomainEventType.TASK_COMPLETION_REVERTED) {
    return "reverted";
  }

  if (log.type === "USER") {
    return "user";
  }
  if (log.type === "CONFLICT") {
    return "conflict";
  }

  return "system";
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
    return { Icon: RotateCcw, className: "text-sky-600" };
  }

  return {
    Icon: getLogTypeIcon(log.type),
    className: getLogTypeColor(log.type),
  };
};

export const TaskLogsModal: React.FC<TaskLogsModalProps> = ({
  isOpen,
  onClose,
  taskLogs,
  loadingLogs,
  newLogText,
  onNewLogTextChange,
  onCreateLog,
  onNewLogKeyDown,
}) => {
  const { t, i18n } = useTranslation();
  const now = useCurrentTime();
  const newLogInputRef = useRef<HTMLInputElement>(null);

  // Focus new log input when modal is opened
  useEffect(() => {
    if (isOpen && newLogInputRef.current) {
      // Small delay to ensure modal is fully rendered
      setTimeout(() => {
        if (newLogInputRef.current) {
          newLogInputRef.current.focus();
        }
      }, 100);
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("taskCard.logHistory")}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* New log input - always visible when onCreateLog is available */}
          {onCreateLog && (
            <div className="mb-3 p-2 bg-gray-50 rounded border">
              <div className="flex items-center gap-2">
                <input
                  ref={newLogInputRef}
                  type="text"
                  value={newLogText}
                  onChange={(e) => onNewLogTextChange(e.target.value)}
                  onKeyDown={onNewLogKeyDown}
                  placeholder={t("taskCard.addNewLogPlaceholder")}
                  className="flex-1 text-sm border-0 focus:outline-none focus:ring-0 p-1 bg-transparent"
                />
                <button
                  onClick={onCreateLog}
                  disabled={!newLogText.trim()}
                  className="p-1 text-green-600 hover:text-green-700 disabled:text-gray-400 transition-colors"
                  title={t("taskCard.saveLog")}
                >
                  <Pen className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {loadingLogs ? (
            <div className="text-center py-4">
              <span className="text-sm text-gray-500">
                {t("taskCard.loadingLogs")}
              </span>
            </div>
          ) : taskLogs.length > 0 ? (
            <div
              className="space-y-2 overflow-y-auto flex-1"
              role="log"
              aria-label={t("taskCard.taskLogEntries")}
            >
              {taskLogs.map((log) => {
                const { Icon, className } = getLogActionVisual(log);
                const eventKey = getLogEventKey(log);
                return (
                  <div
                    key={log.id}
                    className="p-3 bg-gray-50 rounded border text-sm"
                    role="listitem"
                  >
                    <div className="flex items-start space-x-2">
                      <Icon
                        className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${className}`}
                        data-testid={`log-action-icon-${eventKey}`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-900 leading-relaxed whitespace-pre-wrap">
                          {log.message}
                        </p>
                        <div className="flex items-center justify-end mt-1">
                          <span className="text-xs text-gray-500">
                            {formatTimeAgo(
                              log.createdAt,
                              now,
                              t,
                              i18n.language
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500">
                {t("taskCard.noLogsFound")}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
