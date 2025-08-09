import { useState } from "react";
import { TaskViewModel } from "../../../view-models/TaskViewModel";

interface UseTaskNoteProps {
  taskId: string;
  initialNote?: string;
  taskViewModel: TaskViewModel;
}

export const useTaskNote = ({
  taskId,
  initialNote = "",
  taskViewModel,
}: UseTaskNoteProps) => {
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { changeTaskNote } = taskViewModel();

  const handleOpenNoteModal = () => {
    setShowNoteModal(true);
  };

  const handleCloseNoteModal = () => {
    setShowNoteModal(false);
  };

  const handleSaveNote = async (content: string) => {
    setIsSaving(true);
    try {
      if (!taskId) {
        throw new Error("Task ID is required");
      }

      const success = await changeTaskNote(taskId, content);

      if (!success) {
        throw new Error("Failed to save note");
      }

      setShowNoteModal(false);
    } catch (error) {
      console.error("Error saving note:", error);
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    showNoteModal,
    isSaving,
    handleOpenNoteModal,
    handleCloseNoteModal,
    handleSaveNote,
  };
};
