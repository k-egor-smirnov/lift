import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { TaskCategory } from "../../../../../shared/domain/types";
import { Tag } from "../../../../tags/presentation/view-models/TagViewModel";
import { Button } from "../../../../../shared/ui/button";
import { Input } from "../../../../../shared/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../../../shared/ui/popover";
import type { CollaborativeTextViewModel } from "../../view-models/CollaborativeTextViewModel";
import {
  CollaborativeTextEditor,
  type CollaborativeTextEditorHandle,
} from "../CollaborativeTextEditor";

const TAG_COLORS = [
  "#f43f5e",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

const SAVE_ERROR_MESSAGE = "Не удалось сохранить изменения. Повторите попытку.";

export interface TaskEditFormData {
  category: TaskCategory;
  tagIds: string[];
}

interface TaskEditModalProps {
  isOpen: boolean;
  titleViewModel: CollaborativeTextViewModel;
  noteViewModel: CollaborativeTextViewModel;
  initialCategory: TaskCategory;
  onClose: () => void;
  onSave: (data: TaskEditFormData) => Promise<void>;
  tags: Tag[];
  selectedTagIds: string[];
  onCreateTag?: (name: string, color: string) => void;
}

export const TaskEditModal: React.FC<TaskEditModalProps> = ({
  isOpen,
  titleViewModel,
  noteViewModel,
  initialCategory,
  onClose,
  onSave,
  tags,
  selectedTagIds,
  onCreateTag,
}) => {
  const { t } = useTranslation();
  const [category, setCategory] = useState<TaskCategory>(initialCategory);
  const [tagIds, setTagIds] = useState<string[]>(selectedTagIds);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [isCreateTagOpen, setIsCreateTagOpen] = useState(false);
  const titleEditorRef = useRef<CollaborativeTextEditorHandle>(null);
  const noteEditorRef = useRef<CollaborativeTextEditorHandle>(null);
  const newTagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCategory(initialCategory);
    setTagIds(selectedTagIds);
    setSaveError(null);
  }, [initialCategory, isOpen, selectedTagIds]);

  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      titleEditorRef.current?.focus();
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
    setSaveError(null);
    try {
      await Promise.all([
        titleEditorRef.current?.flush(),
        noteEditorRef.current?.flush(),
      ]);
      try {
        await onSave({
          category,
          tagIds,
        });
      } catch {
        setSaveError(SAVE_ERROR_MESSAGE);
        return;
      }
      onClose();
    } catch {
      // Each text ViewModel exposes its retryable error beside the editor.
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = async () => {
    setIsSaving(true);
    try {
      await Promise.all([
        titleEditorRef.current?.flush(),
        noteEditorRef.current?.flush(),
      ]);
      onClose();
    } catch {
      // Each text ViewModel exposes its retryable error beside the editor.
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
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => void handleClose()}
      />

      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            {t("taskCard.editTask")}
          </h2>
          <button
            type="button"
            onClick={() => void handleClose()}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            disabled={isSaving}
            aria-label={t("common.close")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-auto space-y-4">
          <CollaborativeTextEditor
            ref={titleEditorRef}
            viewModel={titleViewModel}
            label="Название"
            controlClassName="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            labelClassName="text-sm font-medium text-gray-700"
          />

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
            <CollaborativeTextEditor
              ref={noteEditorRef}
              viewModel={noteViewModel}
              label={t("taskCard.note")}
              placeholder={t("ui.addNotePlaceholder")}
              labelClassName="text-sm font-medium text-gray-700 mb-2 block"
              controlClassName="min-h-[140px] w-full resize-y rounded-md border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 p-4 border-t bg-gray-50">
          {saveError && (
            <p role="alert" className="mr-auto text-sm text-red-600">
              {saveError}
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleClose()}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            disabled={isSaving}
          >
            {t("common.close")}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isSaving}
          >
            {isSaving ? t("toasts.saving") : t("toasts.save")}
          </button>
        </div>
      </div>
    </div>
  );
};
