import { useState, useCallback } from "react";
import { getService } from "../../../../shared/infrastructure/di";
import { CHANGE_TASK_NOTE_USE_CASE_TOKEN } from "../../../../shared/infrastructure/di/tokens";
import { ChangeTaskNoteUseCase } from "../../../../shared/application/use-cases/ChangeTaskNoteUseCase";
import { TaskId } from "../../../../shared/domain/value-objects/TaskId";
import { ResultUtils } from "../../../../shared/domain/Result";
import { TaskViewModel } from "../view-models/TaskViewModel";

export interface UseTaskNoteReturn {
  isOpen: boolean;
  isSaving: boolean;
  openNote: () => void;
  closeNote: () => void;
  saveNote: (content: string) => Promise<void>;
}

export function useTaskNote(
  taskId: string,
  initialNote?: string,
  taskViewModel?: TaskViewModel
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
        if (!taskId) {
          throw new Error("Task ID is required");
        }

        // Если передан TaskViewModel, получаем действие из стора
        if (taskViewModel) {
          const getState = taskViewModel.getState;

          if (typeof getState !== "function") {
            throw new Error("Failed to save note via TaskViewModel");
          }

          const { changeTaskNote } = getState();

          if (typeof changeTaskNote !== "function") {
            throw new Error("Failed to save note via TaskViewModel");
          }

          const success = await changeTaskNote(taskId, content);
          if (!success) {
            throw new Error("Failed to save note via TaskViewModel");
          }
        } else {
          // Fallback к использованию use case напрямую
          let taskIdObj: TaskId;
          try {
            taskIdObj = TaskId.fromString(taskId);
          } catch (error) {
            console.error("Invalid task ID format:", taskId, error);
            throw new Error(`Invalid task ID format: ${taskId}`);
          }

          const result = await changeTaskNoteUseCase.execute({
            taskId: taskIdObj,
            note: content,
          });

          if (ResultUtils.isFailure(result)) {
            console.error("Failed to save note:", result.error);
            throw result.error;
          }
        }
      } catch (error) {
        console.error("Error saving note:", error);
        throw error; // Не создаем новую ошибку, а пробрасываем оригинальную
      } finally {
        setIsSaving(false);
      }
    },
    [taskId, changeTaskNoteUseCase, taskViewModel]
  );

  return {
    isOpen,
    isSaving,
    openNote,
    closeNote,
    saveNote,
  };
}
