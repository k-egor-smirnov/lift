import React from 'react';
import { Task } from '../../../../shared/domain/entities/Task';
import { TaskCategory } from '../../../../shared/domain/types';

interface DailyModalProps {
  isVisible: boolean;
  unfinishedTasks: Task[];
  overdueInboxTasks: Task[];
  motivationalMessage: string;
  date: string;
  onClose: () => void;
}

/**
 * Daily modal component showing task overview and motivation
 */
export const DailyModal: React.FC<DailyModalProps> = ({
  isVisible,
  unfinishedTasks,
  overdueInboxTasks,
  motivationalMessage,
  date,
  onClose
}) => {
  if (!isVisible) return null;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getCategoryIcon = (category: TaskCategory) => {
    switch (category) {
      case TaskCategory.SIMPLE:
        return '⚡';
      case TaskCategory.FOCUS:
        return '🎯';
      case TaskCategory.INBOX:
        return '📥';
      default:
        return '📋';
    }
  };

  const getCategoryColor = (category: TaskCategory) => {
    switch (category) {
      case TaskCategory.SIMPLE:
        return 'text-green-600';
      case TaskCategory.FOCUS:
        return 'text-blue-600';
      case TaskCategory.INBOX:
        return 'text-orange-600';
      default:
        return 'text-gray-600';
    }
  };

  const hasContent = unfinishedTasks.length > 0 || overdueInboxTasks.length > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Good Morning! 🌅
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {formatDate(date)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close modal"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Motivational Message */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-400">
            <p className="text-blue-800 font-medium">
              {motivationalMessage}
            </p>
          </div>

          {/* Unfinished Tasks from Yesterday */}
          {unfinishedTasks.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
                <span className="mr-2">⏰</span>
                Unfinished from Yesterday ({unfinishedTasks.length})
              </h3>
              <div className="space-y-2">
                {unfinishedTasks.map((task) => (
                  <div
                    key={task.id.value}
                    className="flex items-center p-3 bg-yellow-50 rounded-lg border border-yellow-200"
                  >
                    <span className={`mr-3 text-lg ${getCategoryColor(task.category)}`}>
                      {getCategoryIcon(task.category)}
                    </span>
                    <div className="flex-1">
                      <p className="text-gray-900 font-medium">
                        {task.title.value}
                      </p>
                      <p className="text-xs text-gray-500 capitalize">
                        {task.category.toLowerCase()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Overdue Inbox Tasks */}
          {overdueInboxTasks.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
                <span className="mr-2">🚨</span>
                Overdue Inbox Tasks ({overdueInboxTasks.length})
              </h3>
              <div className="space-y-2">
                {overdueInboxTasks.map((task) => (
                  <div
                    key={task.id.value}
                    className="flex items-center p-3 bg-red-50 rounded-lg border border-red-200"
                  >
                    <span className="mr-3 text-lg text-red-600">
                      📥
                    </span>
                    <div className="flex-1">
                      <p className="text-gray-900 font-medium">
                        {task.title.value}
                      </p>
                      <p className="text-xs text-red-600">
                        Needs review - in inbox for {task.inboxEnteredAt ? 
                          Math.ceil((Date.now() - task.inboxEnteredAt.getTime()) / (1000 * 60 * 60 * 24)) 
                          : '?'} days
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No content message */}
          {!hasContent && (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">🎉</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                You're all caught up!
              </h3>
              <p className="text-gray-600">
                No unfinished tasks or overdue items. Ready to start fresh today!
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Let's Get Started! 🚀
          </button>
        </div>
      </div>
    </div>
  );
};