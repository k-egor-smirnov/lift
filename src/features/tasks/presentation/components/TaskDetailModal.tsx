import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Task } from "@/shared/domain/entities/Task";
import { LogEntry } from "@/shared/application/use-cases/GetTaskLogsUseCase";
import { TaskStatus } from "@/shared/domain/types";
import { TaskViewModel } from "../view-models/TaskViewModel";
import { useTaskNote } from "../hooks/useTaskNote";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { CheckCircle2, Circle, Loader2, NotebookPen, Pen, Plus } from "lucide-react";

interface TaskDetailModalProps {
  isOpen: boolean;
  task: Task | null;
  onClose: () => void;
  onEditTitle: (taskId: string, newTitle: string) => void;
  onUpdateStatus?: (taskId: string, status: TaskStatus) => void;
  onUpdateDescription?: (taskId: string, description: string) => Promise<void>;
  onCreateLog?: (taskId: string, message: string) => Promise<boolean>;
  onLoadTaskLogs?: (taskId: string) => Promise<LogEntry[]>;
  taskViewModel?: TaskViewModel;
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  isOpen,
  task,
  onClose,
  onEditTitle,
  onUpdateStatus,
  onUpdateDescription,
  onCreateLog,
  onLoadTaskLogs,
  taskViewModel,
}) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<TaskStatus>(TaskStatus.ACTIVE);
  const [taskLogs, setTaskLogs] = useState<LogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [newLogText, setNewLogText] = useState("");
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const { saveNote, isSaving: isSavingNote } = useTaskNote(
    task?.id.value || "",
    task?.note,
    taskViewModel
  );

  const statusOptions = useMemo(
    () => [
      { value: TaskStatus.ACTIVE, label: t("taskCard.active", "Active") },
      { value: TaskStatus.COMPLETED, label: t("taskCard.completed", "Completed") },
    ],
    [t]
  );

  const loadLogs = async () => {
    if (!task || !onLoadTaskLogs) {
      return;
    }
    setLoadingLogs(true);
    try {
      const logs = await onLoadTaskLogs(task.id.value);
      setTaskLogs(logs);
    } catch (error) {
      console.error("Failed to load task logs:", error);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (task) {
      setTitle(task.title.value);
      setNote(task.note || "");
      setStatus(task.status);
      setTaskLogs([]);
      if (isOpen) {
        loadLogs();
      }
    }
  }, [task, isOpen, onLoadTaskLogs]);

  const handleSaveTitle = () => {
    if (task && title.trim()) {
      onEditTitle(task.id.value, title.trim());
    }
  };

  const handleStatusChange = (newStatus: TaskStatus) => {
    if (!task) return;
    if (status === newStatus) return;
    setStatus(newStatus);
    onUpdateStatus?.(task.id.value, newStatus);
  };

  const handleSaveDescription = async () => {
    if (!task) return;
    try {
      setIsSavingDescription(true);
      if (onUpdateDescription) {
        await onUpdateDescription(task.id.value, note);
      } else {
        await saveNote(note);
      }
    } catch (error) {
      console.error("Failed to save task description:", error);
    } finally {
      setIsSavingDescription(false);
    }
  };

  const handleCreateLog = async () => {
    if (!task || !onCreateLog || !newLogText.trim()) return;
    try {
      const success = await onCreateLog(task.id.value, newLogText.trim());
      if (success) {
        setNewLogText("");
        await loadLogs();
      }
    } catch (error) {
      console.error("Failed to create task log:", error);
    }
  };

  const renderStatusBadge = () => {
    const isCompleted = status === TaskStatus.COMPLETED;
    return (
      <Badge variant={isCompleted ? "secondary" : "outline"} className="flex items-center gap-2">
        {isCompleted ? (
          <CheckCircle2 className="w-4 h-4 text-green-600" />
        ) : (
          <Circle className="w-4 h-4 text-gray-500" />
        )}
        {statusOptions.find((option) => option.value === status)?.label}
      </Badge>
    );
  };

  return (
    <Dialog
      open={isOpen && !!task}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <NotebookPen className="w-5 h-5" />
            {t("taskCard.taskDetails", "Task details")}
          </DialogTitle>
        </DialogHeader>

        {task && (
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4 overflow-y-auto pr-1">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  {t("taskCard.title", "Title")}
                </label>
                <div className="flex gap-2">
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={handleSaveTitle}
                    placeholder={t("taskCard.title", "Title")}
                  />
                  <Button variant="outline" onClick={handleSaveTitle} disabled={!title.trim()}>
                    <Pen className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  {t("taskCard.status", "Status")}
                </label>
                <div className="flex gap-2 items-center flex-wrap">
                  {statusOptions.map((option) => (
                    <Button
                      key={option.value}
                      variant={status === option.value ? "default" : "outline"}
                      onClick={() => handleStatusChange(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                  {renderStatusBadge()}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  {t("taskCard.note", "Description / Note")}
                </label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={6}
                  placeholder={t("taskCard.notePlaceholder", "Add a note or description")}
                />
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleSaveDescription}
                    disabled={isSavingNote || isSavingDescription}
                  >
                    {isSavingNote || isSavingDescription ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    <span className="ml-2">{t("taskCard.saveNote", "Save")}</span>
                  </Button>
                  {(isSavingNote || isSavingDescription) && (
                    <span className="text-xs text-gray-500">
                      {t("taskCard.saving", "Saving...")}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">
                  {t("taskCard.logHistory", "Log history")}
                </h3>
                <div className="flex items-center gap-2">
                  <Input
                    value={newLogText}
                    onChange={(e) => setNewLogText(e.target.value)}
                    placeholder={t("taskCard.addNewLogPlaceholder", "Add a new log")}
                  />
                  <Button
                    variant="outline"
                    onClick={handleCreateLog}
                    disabled={!newLogText.trim() || !onCreateLog}
                    title={t("taskCard.saveLog", "Save log")}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="border rounded-md p-3 h-[320px] overflow-y-auto bg-gray-50 space-y-2">
                {loadingLogs ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("taskCard.loadingLogs", "Loading logs...")}
                  </div>
                ) : taskLogs.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    {t("taskCard.noLogsFound", "No logs yet")}
                  </p>
                ) : (
                  taskLogs.map((log) => (
                    <div key={log.id} className="p-2 bg-white rounded border text-sm">
                      <div className="flex items-start gap-2">
                        <Badge variant="outline">{log.type}</Badge>
                        <p className="text-gray-800 whitespace-pre-wrap flex-1">{log.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
