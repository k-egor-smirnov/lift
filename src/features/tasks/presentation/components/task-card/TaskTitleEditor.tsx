import React, { useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";

interface TaskTitleEditorProps {
  title: string;
  onTitleChange: (title: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export const TaskTitleEditor: React.FC<TaskTitleEditorProps> = ({
  title,
  onTitleChange,
  onSave,
  onCancel,
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      onSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    } else if (e.key === " ") {
      // Prevent space from triggering drag and drop
      e.stopPropagation();
    }
  };

  return (
    <div
      className="flex items-center gap-2"
      data-testid="task-card-title-editor"
    >
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="flex-1 text-lg font-medium text-gray-900 bg-white border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        maxLength={200}
      />
      <button
        onClick={onSave}
        className="p-1 text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors"
        title={t("taskCard.save")}
      >
        <Check className="w-4 h-4" />
      </button>
      <button
        onClick={onCancel}
        data-cancel-button
        className="p-1 text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded transition-colors"
        title={t("taskCard.cancel")}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
