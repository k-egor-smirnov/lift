import { useState } from "react";

interface UseTaskNoteProps {
  taskId: string;
  initialNote: string;
  onSaveNote?: (taskId: string, note: string) => void;
}

export const useTaskNote = ({
  taskId,
  initialNote,
  onSaveNote,
}: UseTaskNoteProps) => {
  const [noteText, setNoteText] = useState(initialNote);
  const [showNoteModal, setShowNoteModal] = useState(false);

  const handleOpenNote = () => {
    setNoteText(initialNote);
    setShowNoteModal(true);
  };

  const handleCloseNote = () => {
    setShowNoteModal(false);
  };

  const handleSaveNote = () => {
    if (onSaveNote) {
      onSaveNote(taskId, noteText);
    }
    setShowNoteModal(false);
  };

  return {
    noteText,
    setNoteText,
    showNoteModal,
    handleOpenNote,
    handleCloseNote,
    handleSaveNote,
  };
};
