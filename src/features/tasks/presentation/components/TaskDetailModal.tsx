import React, { useEffect, useMemo, useState } from "react";
import { Task } from "../../../../shared/domain/entities/Task";
import { TaskStatus } from "../../../../shared/domain/types";
import { LogEntry } from "../../../../shared/application/use-cases/GetTaskLogsUseCase";
import { useTranslation } from "react-i18next";
import { useCurrentTime } from "@/shared/presentation/contexts/CurrentTimeContext";
import { formatTimeAgo } from "@/shared/utils/timeFormat";
import { CheckCircle2, Circle, Loader2, Pen, AlertTriangle, Settings, User, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../../shared/ui/dialog";

interface TaskDetailModalProps {
  isOpen: boolean;
  task: Task | null;
  onClose: () => void;
  onEditTitle: (taskId: string, newTitle: string) => void;
  onEditDescription: (taskId: string, description: string) => Promise<void> | void;
  onChangeStatus?: (taskId: string, status: TaskStatus) => void;
  onLoadTaskLogs?: (taskId: string) => Promise<LogEntry[]>;
  onCreateLog?: (taskId: string, message: string) => Promise<boolean>;
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

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  isOpen,
  task,
  onClose,
  onEditTitle,
  onEditDescription,
  onChangeStatus,
  onLoadTaskLogs,
  onCreateLog,
}) => {
  const { t, i18n } = useTranslation();
  const now = useCurrentTime();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>(TaskStatus.ACTIVE);
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [newLogText, setNewLogText] = useState("");

  const canSaveTitle = useMemo(
    () => task && title.trim() && title.trim() !== task.title.value,
    [task, title]
  );

  const canSaveDescription = useMemo(
    () => task && description.trim() !== (task.note?.trim() || ""),
    [description, task]
  );

  useEffect(() => {
    if (task) {
      setTitle(task.title.value);
      setDescription(task.note || "");
      setStatus(task.status);
    }
    setLogs([]);
    setNewLogText("");
  }, [task?.id.value, isOpen]);

  useEffect(() => {
    const loadLogs = async () => {
      if (!task || !onLoadTaskLogs) return;
      setLoadingLogs(true);
      try {
        const loadedLogs = await onLoadTaskLogs(task.id.value);
        setLogs(loadedLogs);
      } catch (error) {
        console.error("Failed to load task logs:", error);
      } finally {
        setLoadingLogs(false);
      }
    };

    if (isOpen) {
      loadLogs();
    }
  }, [isOpen, onLoadTaskLogs, task]);

  const handleStatusChange = (nextStatus: TaskStatus) => {
    if (!task || !onChangeStatus || nextStatus === status) return;
    setStatus(nextStatus);
    onChangeStatus(task.id.value, nextStatus);
  };

  const handleSaveTitle = () => {
    if (!task || !canSaveTitle) return;
    onEditTitle(task.id.value, title.trim());
  };

  const handleSaveDescription = async () => {
    if (!task || !canSaveDescription) return;
    setIsSavingDescription(true);
    try {
      await onEditDescription(task.id.value, description.trim());
    } finally {
      setIsSavingDescription(false);
    }
  };

  const handleCreateLog = async () => {
    if (!task || !onCreateLog || !newLogText.trim()) return;

    try {
      const success = await onCreateLog(task.id.value, newLogText.trim());
      if (success && onLoadTaskLogs) {
        const refreshedLogs = await onLoadTaskLogs(task.id.value);
        setLogs(refreshedLogs);
      }
      setNewLogText("");
    } catch (error) {
      console.error("Failed to create log:", error);
    }
  };

  if (!task) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{t("taskCard.taskDetails", "Task details")}</span>
            <span
              className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                status === TaskStatus.COMPLETED
                  ? "bg-green-100 text-green-800"
                  : "bg-blue-100 text-blue-800"
              }`}
            >
              {status === TaskStatus.COMPLETED ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <Circle className="w-4 h-4" />
              )}
              {status === TaskStatus.COMPLETED
                ? t("taskCard.completed", "Completed")
                : t("taskCard.active", "Active")}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto pr-1">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700" htmlFor="task-title">
              {t("taskCard.taskTitle", "Title")}
            </label>
            <div className="flex gap-2">
              <input
                id="task-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSaveTitle}
                disabled={!canSaveTitle}
                className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-600"
              >
                {t("taskCard.save", "Save")}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              {t("taskCard.status", "Status")}
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => handleStatusChange(TaskStatus.ACTIVE)}
                className={`flex-1 border rounded px-3 py-2 text-sm transition-colors ${
                  status === TaskStatus.ACTIVE
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300 hover:border-gray-400"
                }`}
              >
                {t("taskCard.active", "Active")}
              </button>
              <button
                onClick={() => handleStatusChange(TaskStatus.COMPLETED)}
                className={`flex-1 border rounded px-3 py-2 text-sm transition-colors ${
                  status === TaskStatus.COMPLETED
                    ? "border-green-500 bg-green-50 text-green-700"
                    : "border-gray-300 hover:border-gray-400"
                }`}
              >
                {t("taskCard.completed", "Completed")}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700" htmlFor="task-description">
              {t("taskCard.description", "Description / Note")}
            </label>
            <textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={t("taskCard.addNote", "Add a note...")}
            />
            <div className="flex justify-end">
              <button
                onClick={handleSaveDescription}
                disabled={!canSaveDescription || isSavingDescription}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-600"
              >
                {isSavingDescription && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("taskCard.save", "Save")}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                {t("taskCard.logHistory", "Log history")}
              </label>
              {onCreateLog && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newLogText}
                    onChange={(e) => setNewLogText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCreateLog();
                      }
                    }}
                    placeholder={t("taskCard.addNewLogPlaceholder", "Add a new log...")}
                    className="rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleCreateLog}
                    disabled={!newLogText.trim()}
                    className="p-2 rounded bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-600"
                    title={t("taskCard.saveLog", "Save log")}
                    aria-label={t("taskCard.saveLog", "Save log")}
                  >
                    <Pen className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto border rounded p-2 bg-gray-50">
              {loadingLogs ? (
                <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("taskCard.loadingLogs", "Loading logs...")}
                </div>
              ) : logs.length > 0 ? (
                logs.map((log) => {
                  const LogIcon = getLogTypeIcon(log.type);
                  return (
                    <div key={log.id} className="bg-white rounded border p-2 text-sm">
                      <div className="flex items-start gap-2">
                        <LogIcon
                          className={`w-4 h-4 mt-0.5 ${getLogTypeColor(log.type)}`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-900 whitespace-pre-wrap leading-relaxed">
                            {log.message}
                          </p>
                          <div className="flex items-center justify-between mt-1">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
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
                              {formatTimeAgo(log.createdAt, now, t, i18n.language)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-gray-500 text-center">
                  {t("taskCard.noLogsFound", "No logs yet")}
                </p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
