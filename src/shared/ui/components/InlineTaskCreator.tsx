import React, { useState, useRef, useEffect } from "react";
import { TaskCategory } from "../../domain/types";
import { Check } from "lucide-react";

interface InlineTaskCreatorProps {
  onCreateTask: (
    title: string,
    category: TaskCategory,
    images?: File[]
  ) => Promise<string | null>;
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
  const [images, setImages] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const taskId = await onCreateTask(trimmedTitle, category, images);
      if (taskId) {
        setTitle("");
        setImages([]);
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

  const handleCancel = () => {
    setTitle("");
    setImages([]);
    if (inputRef.current) {
      inputRef.current.blur();
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (files) {
      setImages((prev) => [...prev, ...Array.from(files)]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      className={`bg-white rounded-lg border p-3 shadow-sm transition-colors ${
        isDragOver ? "border-blue-400" : "border-gray-200"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
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
        <label className="p-1 text-gray-500 hover:text-gray-700 cursor-pointer">
          <input
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />
          📷
        </label>
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
      {images.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {images.map((file, i) => (
            <img
              key={i}
              src={URL.createObjectURL(file)}
              className="w-12 h-12 object-cover rounded"
            />
          ))}
        </div>
      )}
    </div>
  );
};
