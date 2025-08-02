import { useState } from "react";

interface UseTaskEditingProps {
  initialTitle: string;
  onEdit: (taskId: string, newTitle: string) => void;
  taskId: string;
}

export const useTaskEditing = ({
  initialTitle,
  onEdit,
  taskId,
}: UseTaskEditingProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(initialTitle);

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditTitle(initialTitle);
  };

  const handleSaveEdit = () => {
    const trimmedTitle = editTitle.trim();
    if (trimmedTitle && trimmedTitle !== initialTitle) {
      onEdit(taskId, trimmedTitle);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditTitle(initialTitle);
  };

  return {
    isEditing,
    editTitle,
    setEditTitle,
    handleStartEdit,
    handleSaveEdit,
    handleCancelEdit,
  };
};