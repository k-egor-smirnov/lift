import React, { useState, useRef } from "react";
import { Plus, Zap, Target, Inbox, ChevronDown } from "lucide-react";
import { TaskCategory } from "../../domain/types";

interface MobileTaskInputProps {
  onCreateTask: (title: string, category: TaskCategory) => Promise<void>;
  defaultCategory?: TaskCategory;
}

const categoryConfig = {
  [TaskCategory.INBOX]: {
    icon: Inbox,
    label: "Inbox",
    color: "text-gray-600",
    bgColor: "bg-gray-100",
  },
  [TaskCategory.SIMPLE]: {
    icon: Zap,
    label: "Simple",
    color: "text-yellow-600",
    bgColor: "bg-yellow-100",
  },
  [TaskCategory.FOCUS]: {
    icon: Target,
    label: "Focus",
    color: "text-blue-600",
    bgColor: "bg-blue-100",
  },
};

export const MobileTaskInput: React.FC<MobileTaskInputProps> = ({
  onCreateTask,
  defaultCategory = TaskCategory.INBOX,
}) => {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TaskCategory>(defaultCategory);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onCreateTask(trimmedTitle, category);
      setTitle("");
    } catch (error) {
      console.error("Failed to create task:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const currentCategory = categoryConfig[category];
  const CategoryIcon = currentCategory.icon;

  return (
    <div className="fixed bottom-0 left-0 right-0 md:hidden z-50 bg-white border-t border-gray-200 safe-area-bottom">
      {/* Category picker dropdown */}
      {showCategoryPicker && (
        <div className="absolute bottom-full left-0 right-0 bg-white border-t border-gray-200 shadow-lg animate-in slide-in-from-bottom">
          <div className="p-2 grid grid-cols-3 gap-2">
            {Object.entries(categoryConfig).map(([cat, config]) => {
              const Icon = config.icon;
              const isSelected = cat === category;
              return (
                <button
                  key={cat}
                  onClick={() => {
                    setCategory(cat as TaskCategory);
                    setShowCategoryPicker(false);
                    inputRef.current?.focus();
                  }}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg transition-all ${
                    isSelected
                      ? `${config.bgColor} ${config.color} ring-2 ring-offset-1`
                      : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-medium">{config.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main input area */}
      <div className="flex items-center gap-2 p-3">
        {/* Category selector button */}
        <button
          onClick={() => setShowCategoryPicker(!showCategoryPicker)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg ${currentCategory.bgColor} ${currentCategory.color} transition-all active:scale-95`}
        >
          <CategoryIcon className="w-4 h-4" />
          <ChevronDown className="w-3 h-3" />
        </button>

        {/* Text input */}
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Добавить задачу..."
            disabled={isSubmitting}
            className="w-full px-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            autoComplete="off"
          />
        </div>

        {/* Submit button */}
        {title.trim() && (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="p-2.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 active:scale-95 transition-all disabled:opacity-50"
          >
            <Plus className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
};
