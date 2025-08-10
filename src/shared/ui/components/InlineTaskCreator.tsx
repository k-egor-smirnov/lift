import React, { useState, useRef } from "react";
import { TaskCategory } from "../../domain/types";
import { Check } from "lucide-react";

interface InlineTaskCreatorProps {
  onCreateTask: (title: string, category: TaskCategory) => Promise<boolean>;
  category: TaskCategory;
  placeholder?: string;
}

export const InlineTaskCreator: React.FC<InlineTaskCreatorProps> = ({
  onCreateTask,
  category,
  placeholder = "Добавить новую задачу...",
}) => {
  const [title, setTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const success = await onCreateTask(trimmedTitle, category);
      if (success) {
        setTitle("");
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }
    } catch (error) {
      console.error("Failed to create task:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      handleSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setTitle("");
      if (inputRef.current) {
        inputRef.current.blur();
      }
    } else if (e.key === " ") {
      // Prevent space from triggering drag and drop
      e.stopPropagation();
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isSubmitting}
          className="flex-1 text-sm border-0 focus:outline-none focus:ring-0 p-1 placeholder-gray-400"
        />
        {title.trim() && (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="p-1 text-green-600 hover:text-green-700 disabled:text-gray-400 transition-colors"
            title="Создать задачу"
          >
            <Check className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
