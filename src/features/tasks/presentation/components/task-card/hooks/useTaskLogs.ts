import { useState } from "react";
import { LogEntry } from "../../../../../../shared/application/use-cases/GetTaskLogsUseCase";

interface UseTaskLogsProps {
  taskId: string;
  onLoadTaskLogs?: (taskId: string) => Promise<LogEntry[]>;
  onCreateLog?: (taskId: string, message: string) => Promise<boolean>;
}

export const useTaskLogs = ({
  taskId,
  onLoadTaskLogs,
  onCreateLog,
}: UseTaskLogsProps) => {
  const [taskLogs, setTaskLogs] = useState<LogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [newLogText, setNewLogText] = useState("");
  const [showLogModal, setShowLogModal] = useState(false);

  // Load task logs when opening log modal
  const handleToggleLogHistory = async () => {
    if (!showLogModal && onLoadTaskLogs && taskLogs.length === 0) {
      setLoadingLogs(true);
      try {
        const logs = await onLoadTaskLogs(taskId);
        setTaskLogs(logs);
      } catch (error) {
        console.error("Failed to load task logs:", error);
      } finally {
        setLoadingLogs(false);
      }
    }
    setShowLogModal(!showLogModal);
    if (!showLogModal) {
      // Clear log text when closing
      setNewLogText("");
    }
  };

  // Handle new log creation
  const handleCreateNewLog = async () => {
    if (newLogText.trim() && onCreateLog) {
      try {
        const success = await onCreateLog(taskId, newLogText.trim());
        if (success) {
          setNewLogText("");
          // Reload logs to show the new log
          if (onLoadTaskLogs) {
            const logs = await onLoadTaskLogs(taskId);
            setTaskLogs(logs);
          }
        }
      } catch (error) {
        console.error("Failed to create log:", error);
      }
    }
  };

  const handleNewLogKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      handleCreateNewLog();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setNewLogText("");
    } else if (e.key === " ") {
      // Prevent space from triggering drag and drop
      e.stopPropagation();
    }
  };

  return {
    taskLogs,
    loadingLogs,
    newLogText,
    showLogModal,
    setNewLogText,
    setShowLogModal,
    handleToggleLogHistory,
    handleCreateNewLog,
    handleNewLogKeyDown,
  };
};
