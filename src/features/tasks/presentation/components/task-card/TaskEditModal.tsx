import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Task } from "../../../../../shared/domain/entities/Task";
import { TaskCategory } from "../../../../../shared/domain/types";
import { TiptapEditor } from "../../../../../shared/ui/components/TiptapEditor";

type DeferOption = "none" | "tomorrow" | "week" | "custom";

export interface TaskEditFormData {
  title: string;
  category: TaskCategory;
  note: string;
  deferDate?: Date;
}

interface TaskEditModalProps {
  isOpen: boolean;
  task: Task;
  onClose: () => void;
  onSave: (data: TaskEditFormData) => Promise<void>;
}

const getDeferDateByOption = (
  option: DeferOption,
  customDate: string
): Date | undefined => {
  const baseDate = new Date();
  baseDate.setHours(0, 0, 0, 0);

  if (option === "tomorrow") {
    baseDate.setDate(baseDate.getDate() + 1);
    return baseDate;
  }

  if (option === "week") {
    baseDate.setDate(baseDate.getDate() + 7);
    return baseDate;
  }

  if (option === "custom" && customDate) {
    const [year, month, day] = customDate.split("-").map(Number);
    if (year && month && day) {
      return new Date(year, month - 1, day);
    }
  }

  return undefined;
};

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
  const [deferOption, setDeferOption] = useState<DeferOption>("none");
  const [customDeferDate, setCustomDeferDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const minDate = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.toISOString().split("T")[0];
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(task.title.value);
    setCategory(task.category);
    setNote(task.note || "");
    setDeferOption("none");
    setCustomDeferDate("");
  }, [isOpen, task]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        title: title.trim(),
        category,
        note,
        deferDate: getDeferDateByOption(deferOption, customDeferDate),
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

          <fieldset>
            <legend className="text-sm font-medium text-gray-700 mb-2">
              {t("taskCard.deferTask")}
            </legend>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`defer-${task.id.value}`}
                  checked={deferOption === "none"}
                  onChange={() => setDeferOption("none")}
                />
                Не менять
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`defer-${task.id.value}`}
                  checked={deferOption === "tomorrow"}
                  onChange={() => setDeferOption("tomorrow")}
                />
                Завтра
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`defer-${task.id.value}`}
                  checked={deferOption === "week"}
                  onChange={() => setDeferOption("week")}
                />
                Через неделю
              </label>
              <div className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`defer-${task.id.value}`}
                  checked={deferOption === "custom"}
                  onChange={() => setDeferOption("custom")}
                />
                <span>Своя дата:</span>
                <input
                  type="date"
                  value={customDeferDate}
                  min={minDate}
                  onChange={(event) => {
                    setCustomDeferDate(event.target.value);
                    setDeferOption("custom");
                  }}
                  className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                />
              </div>
            </div>
          </fieldset>

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
