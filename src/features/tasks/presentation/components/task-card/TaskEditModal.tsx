import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Task } from "../../../../../shared/domain/entities/Task";
import { TaskCategory } from "../../../../../shared/domain/types";
import { TiptapEditor } from "../../../../../shared/ui/components/TiptapEditor";

export interface TaskEditFormData {
  title: string;
  category: TaskCategory;
  note: string;
}

interface TaskEditModalProps {
  isOpen: boolean;
  task: Task;
  onClose: () => void;
  onSave: (data: TaskEditFormData) => Promise<void>;
}

export const TaskEditModal: React.FC<TaskEditModalProps> = ({
  isOpen,
  task,
  onClose,
  onSave,
}) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState(task.title.value);
  const [category, setCategory] = useState<TaskCategory>(task.category);
  const [note, setNote] = useState(task.note || "");
  const [isSaving, setIsSaving] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(task.title.value);
    setCategory(task.category);
    setNote(task.note || "");
  }, [isOpen, task]);

  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        title: title.trim(),
        category,
        note,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            {t("taskCard.editTask")}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            disabled={isSaving}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-auto space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Название</span>
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Категория</span>
            <select
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as TaskCategory)
              }
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={TaskCategory.INBOX}>
                {t("categories.inbox")}
              </option>
              <option value={TaskCategory.SIMPLE}>
                {t("categories.simple")}
              </option>
              <option value={TaskCategory.FOCUS}>
                {t("categories.focus")}
              </option>
            </select>
          </label>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">
              {t("taskCard.note")}
            </p>
            <TiptapEditor
              content={note}
              onChange={setNote}
              placeholder={t("ui.addNotePlaceholder")}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            disabled={isSaving}
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isSaving || title.trim().length === 0}
          >
            {isSaving ? t("toasts.saving") : t("toasts.save")}
          </button>
        </div>
      </div>
    </div>
  );
};
