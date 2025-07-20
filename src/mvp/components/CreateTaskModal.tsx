import React, { useState, useEffect } from 'react';
import { Zap, Target, Inbox, X, AlertCircle, CheckCircle } from 'lucide-react';
import { TaskCategory } from '../../shared/domain/types';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, category: TaskCategory) => Promise<boolean>;
  initialTitle?: string;
  initialCategory?: TaskCategory;
  hideCategorySelection?: boolean;
}

const getCategoryInfo = (category: TaskCategory) => {
  switch (category) {
    case TaskCategory.SIMPLE:
      return {
        icon: Zap,
        name: 'Simple',
        description: 'Quick tasks that can be completed easily',
        color: 'border-green-200 bg-green-50 text-green-800',
      };
    case TaskCategory.FOCUS:
      return {
        icon: Target,
        name: 'Focus',
        description: 'Important tasks requiring focused attention',
        color: 'border-blue-200 bg-blue-50 text-blue-800',
      };
    case TaskCategory.INBOX:
      return {
        icon: Inbox,
        name: 'Inbox',
        description: 'Tasks to be reviewed and categorized later',
        color: 'border-gray-200 bg-gray-50 text-gray-800',
      };
  }
};

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialTitle = '',
  initialCategory = TaskCategory.INBOX,
  hideCategorySelection = false,
}) => {
  const [title, setTitle] = useState(initialTitle);
  const [category, setCategory] = useState(initialCategory);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setTitle(initialTitle);
      setCategory(initialCategory);
      setError(null);
    }
  }, [isOpen, initialTitle, initialCategory]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;

      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        handleSubmit();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, title, category]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Task title is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const success = await onSubmit(title.trim(), category);
      if (success) {
        onClose();
        setTitle('');
        setCategory(TaskCategory.INBOX);
      } else {
        setError('Failed to create task. Please try again.');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 id="modal-title" className="text-lg font-semibold text-gray-900">
              Create New Task
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded"
              aria-label="Close modal"
            >
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6">
            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <AlertCircle className="h-5 w-5 text-red-400" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Task Title */}
            <div>
              <label htmlFor="task-title" className="block text-sm font-medium text-gray-700 mb-2">
                Task Title
              </label>
              <input
                id="task-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter task title..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
                disabled={isSubmitting}
                data-testid="task-title-input"
              />
            </div>

            {/* Category Selection - only show if not hidden */}
            {!hideCategorySelection && (
              <fieldset>
                <legend className="block text-sm font-medium text-gray-700 mb-3">
                  Category
                </legend>
                <div className="space-y-3" role="radiogroup" aria-labelledby="category-legend">
                  {Object.values(TaskCategory).map((cat) => {
                    const info = getCategoryInfo(cat);
                    const isSelected = category === cat;
                    
                    return (
                      <label
                        key={cat}
                        className={`
                          relative flex cursor-pointer rounded-lg border p-4 transition-all
                          ${isSelected 
                            ? `${info.color} border-2` 
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                          }
                        `}
                      >
                        <input
                          type="radio"
                          name="category"
                          value={cat}
                          checked={isSelected}
                          onChange={(e) => setCategory(e.target.value as TaskCategory)}
                          className="sr-only"
                          disabled={isSubmitting}
                          data-testid={`category-${cat.toLowerCase()}`}
                        />
                        <div className="flex items-start">
                          <div className="mr-3">
                            {React.createElement(info.icon, { className: 'w-6 h-6' })}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center">
                              <span className="text-sm font-medium text-gray-900">
                                {info.name}
                              </span>
                              {isSelected && (
                                <CheckCircle className="ml-2 h-5 w-5 text-blue-600" />
                              )}
                            </div>
                            <p className="text-sm text-gray-600 mt-1">
                              {info.description}
                            </p>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {/* Show selected category when category selection is hidden */}
            {hideCategorySelection && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="mr-3">
                    {React.createElement(getCategoryInfo(category).icon, { className: 'w-6 h-6' })}
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-900">
                      Category: {getCategoryInfo(category).name}
                    </span>
                    <p className="text-sm text-gray-600">
                      {getCategoryInfo(category).description}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !title.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              data-testid="create-task-submit"
            >
              {isSubmitting ? 'Creating...' : 'Create Task'}
            </button>
          </div>

          {/* Keyboard shortcuts hint */}
          <div className="px-6 pb-4">
            <p className="text-xs text-gray-500">
              Press <kbd className="px-1 py-0.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded">Esc</kbd> to cancel, 
              <kbd className="px-1 py-0.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded ml-1">Cmd+Enter</kbd> to create
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};