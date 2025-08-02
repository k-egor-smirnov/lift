import React, { useRef, useEffect } from "react";
import { LogEntry } from "../../../../../shared/application/use-cases/GetTaskLogsUseCase";
import { DateOnly } from "../../../../../shared/domain/value-objects/DateOnly";
import { useTranslation } from "react-i18next";
import {
  Settings,
  User,
  AlertTriangle,
  FileText,
  Pen,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../../../shared/ui/dialog";

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
  const { t } = useTranslation();
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
                const LogIcon = getLogTypeIcon(log.type);
                return (
                  <div
                    key={log.id}
                    className="p-3 bg-gray-50 rounded border text-sm"
                    role="listitem"
                  >
                    <div className="flex items-start space-x-2">
                      <LogIcon
                        className={`w-3 h-3 mt-0.5 ${getLogTypeColor(
                          log.type
                        )}`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-900 leading-relaxed whitespace-pre-wrap">
                          {log.message}
                        </p>
                        <div className="flex items-center justify-between mt-1">
                          <span
                            className={`text-xs px-1 py-0.5 rounded font-medium ${
                              log.type === "SYSTEM"
                                ? "bg-blue-100 text-blue-800"
                                : log.type === "USER"
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {log.type}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatLogDate(log.createdAt)}
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