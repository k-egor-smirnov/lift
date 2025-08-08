import React, { useState, useRef, useEffect } from "react";
import { TaskCategory } from "../../domain/types";
import { Check } from "lucide-react";

interface InlineTaskCreatorProps {
  onCreateTask: (
    title: string,
    category: TaskCategory,
    images?: File[]
  ) => Promise<boolean>;
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const success = await onCreateTask(trimmedTitle, category, images);
      if (success) {
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
    if (!files) return;
    const imgs = Array.from(files).filter((f) => f.type.startsWith("image/"));
    setImages((prev) => [...prev, ...imgs]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      className={`bg-white rounded-lg border p-3 shadow-sm ${
        isDragOver ? "border-blue-400 bg-blue-50" : "border-gray-200"
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
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-1 text-gray-600 hover:text-gray-700"
          title="Добавить изображения"
          type="button"
        >
          📷
        </button>
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
        <div className="flex gap-2 mt-2">
          {images.map((img, idx) => (
            <img
              key={idx}
              src={URL.createObjectURL(img)}
              alt="preview"
              className="w-12 h-12 object-cover rounded"
            />
          ))}
        </div>
      )}
    </div>
  );
};
