import { useState } from "react";
import { container } from "tsyringe";
import { ChangeTaskNoteUseCase } from "../../../../../../shared/application/use-cases/ChangeTaskNoteUseCase";

interface UseTaskNoteProps {
  taskId: string;
  initialNote?: string;
}

export const useTaskNote = ({ taskId, initialNote = "" }: UseTaskNoteProps) => {
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const changeTaskNoteUseCase = container.resolve(ChangeTaskNoteUseCase);

  const handleOpenNoteModal = () => {
    setShowNoteModal(true);
  };

  const handleCloseNoteModal = () => {
    setShowNoteModal(false);
  };

  const handleSaveNote = async (content: string) => {
    setIsSaving(true);
    try {
      const result = await changeTaskNoteUseCase.execute(
        taskId,
        content.trim() || undefined
      );

      if (result.isSuccess) {
        setShowNoteModal(false);
        return true;
      } else {
        console.error("Failed to save note:", result.error);
        throw new Error(result.error);
      }
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
