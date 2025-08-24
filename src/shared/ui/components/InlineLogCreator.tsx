import React, { useState, useRef } from "react";
import { Check } from "lucide-react";

interface InlineLogCreatorProps {
  onCreateLog: (message: string) => Promise<boolean>;
  placeholder?: string;
}

export const InlineLogCreator: React.FC<InlineLogCreatorProps> = ({
  onCreateLog,
  placeholder = "Добавить заметку...",
}) => {
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const success = await onCreateLog(trimmedMessage);
      if (success) {
        setMessage("");
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }
    } catch (error) {
      console.error("Failed to create log:", error);
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
      setMessage("");
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
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isSubmitting}
          className="flex-1 text-sm border-0 focus:outline-none focus:ring-0 p-1 placeholder-gray-400"
        />
        {message.trim() && (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="p-1 text-green-600 hover:text-green-700 disabled:text-gray-400 transition-colors"
            title="Создать заметку"
          >
            <Check className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
