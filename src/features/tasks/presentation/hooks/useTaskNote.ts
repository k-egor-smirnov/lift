import { useState, useCallback } from "react";
import { getService } from "../../../../shared/infrastructure/di";
import { CHANGE_TASK_NOTE_USE_CASE_TOKEN } from "../../../../shared/infrastructure/di/tokens";
import { ChangeTaskNoteUseCase } from "../../../../shared/application/use-cases/ChangeTaskNoteUseCase";
import { TaskId } from "../../../../shared/domain/value-objects/TaskId";
import { ResultUtils } from "../../../../shared/domain/Result";

export interface UseTaskNoteReturn {
  isOpen: boolean;
  isSaving: boolean;
  openNote: () => void;
  closeNote: () => void;
  saveNote: (content: string) => Promise<void>;
}

export function useTaskNote(
  taskId: string,
  initialNote?: string
): UseTaskNoteReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const changeTaskNoteUseCase = getService<ChangeTaskNoteUseCase>(
    CHANGE_TASK_NOTE_USE_CASE_TOKEN
  );

  const openNote = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeNote = useCallback(() => {
    setIsOpen(false);
  }, []);

  const saveNote = useCallback(
    async (content: string) => {
      setIsSaving(true);
      try {
        const result = await changeTaskNoteUseCase.execute({
          taskId: TaskId.create(taskId),
          note: content,
        });

        if (ResultUtils.isFailure(result)) {
          console.error("Failed to save note:", result.error);
          throw result.error;
        }
      } finally {
        setIsSaving(false);
      }
    },
    [taskId, changeTaskNoteUseCase]
  );

  return {
    isOpen,
    isSaving,
    openNote,
    closeNote,
    saveNote,
  };
}
