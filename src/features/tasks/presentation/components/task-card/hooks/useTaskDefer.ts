import { useState } from "react";

interface UseTaskDeferProps {
  taskId: string;
  onDefer?: (taskId: string, deferDate: Date) => void;
}

export const useTaskDefer = ({ taskId, onDefer }: UseTaskDeferProps) => {
  const [showDeferModal, setShowDeferModal] = useState(false);

  const handleOpenDeferModal = () => {
    setShowDeferModal(true);
  };

  const handleCloseDeferModal = () => {
    setShowDeferModal(false);
  };

  const handleDeferConfirm = (deferDate: Date) => {
    if (onDefer) {
      onDefer(taskId, deferDate);
    }
    setShowDeferModal(false);
  };

  return {
    showDeferModal,
    handleOpenDeferModal,
    handleCloseDeferModal,
    handleDeferConfirm,
  };
};
