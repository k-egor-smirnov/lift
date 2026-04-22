import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { Task } from "../../../../../shared/domain/entities/Task";
import { TaskCategory } from "../../../../../shared/domain/types";
import { TiptapEditor } from "../../../../../shared/ui/components/TiptapEditor";
import { Tag } from "../../../../tags/presentation/view-models/TagViewModel";
import { Button } from "../../../../../shared/ui/button";
import { Input } from "../../../../../shared/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../../../shared/ui/popover";

const TAG_COLORS = [
  "#f43f5e",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

export interface TaskEditFormData {
  title: string;
  category: TaskCategory;
  note: string;
  tagIds: string[];
}

interface TaskEditModalProps {
  isOpen: boolean;
  task: Task;
  onClose: () => void;
  onSave: (data: TaskEditFormData) => Promise<void>;
  tags: Tag[];
  selectedTagIds: string[];
  onCreateTag?: (name: string, color: string) => void;
}

export const TaskEditModal: React.FC<TaskEditModalProps> = ({
  isOpen,
  task,
  onClose,
  onSave,
  tags,
  selectedTagIds,
  onCreateTag,
}) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState(task.title.value);
  const [category, setCategory] = useState<TaskCategory>(task.category);
  const [note, setNote] = useState(task.note || "");
  const [tagIds, setTagIds] = useState<string[]>(selectedTagIds);
  const [isSaving, setIsSaving] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [isCreateTagOpen, setIsCreateTagOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const newTagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(task.title.value);
    setCategory(task.category);
    setNote(task.note || "");
    setTagIds(selectedTagIds);
  }, [isOpen, task, selectedTagIds]);

  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isCreateTagOpen) return;
    requestAnimationFrame(() => {
      newTagInputRef.current?.focus();
    });
  }, [isCreateTagOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        title: title.trim(),
        category,
        note,
        tagIds,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const toggleTag = (tagId: string) => {
    setTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  const handleCreateTag = () => {
    if (!onCreateTag || !newTagName.trim()) return;
    const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
    onCreateTag(newTagName.trim(), color);
    setNewTagName("");
    setIsCreateTagOpen(false);
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">Тэги</p>
              <Popover open={isCreateTagOpen} onOpenChange={setIsCreateTagOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    data-testid="create-tag-button-modal"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-3">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Создать тэг
                    </p>
                    <Input
                      ref={newTagInputRef}
                      value={newTagName}
                      onChange={(event) => setNewTagName(event.target.value)}
                      placeholder="Создать тэг"
                      className="h-8"
                      data-testid="create-tag-input-modal"
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleCreateTag();
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      className="w-full h-8"
                      onClick={handleCreateTag}
                    >
                      Создать
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const isSelected = tagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={`px-2 py-1 text-xs rounded border transition ${
                      isSelected
                        ? "border-current bg-muted"
                        : "border-gray-200 bg-white"
                    }`}
                    style={{ color: tag.color }}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>

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
