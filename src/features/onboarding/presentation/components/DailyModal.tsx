import React from "react";
import {
  Zap,
  Target,
  Inbox,
  FileText,
  Sunrise,
  Clock,
  AlertTriangle,
  PartyPopper,
  X,
  Sun,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Task } from "../../../../shared/domain/entities/Task";
import { TaskCategory } from "../../../../shared/domain/types";

interface DailyModalProps {
  isVisible: boolean;
  previousDayTasks: Task[];
  overdueInboxTasks: Task[];
  dueDeferredTasks: Task[];
  regularInboxTasks: Task[];
  motivationalMessage: string;
  date: string;
  onClose: () => void;
  onReturnTaskToToday?: (taskId: string) => void;
  todayTaskIds?: string[]; // IDs of tasks currently selected for today
}

/**
 * Daily modal component showing task overview and motivation
 */
export const DailyModal: React.FC<DailyModalProps> = ({
  isVisible,
  previousDayTasks,
  overdueInboxTasks,
  dueDeferredTasks,
  regularInboxTasks,
  motivationalMessage,
  date,
  onClose,
  onReturnTaskToToday,
  todayTaskIds = [],
}) => {
  const { t } = useTranslation();
  if (!isVisible) return null;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getCategoryIcon = (category: TaskCategory) => {
    switch (category) {
      case TaskCategory.SIMPLE:
        return Zap;
      case TaskCategory.FOCUS:
        return Target;
      case TaskCategory.INBOX:
        return Inbox;
      default:
        return FileText;
    }
  };

  const getCategoryColor = (category: TaskCategory) => {
    switch (category) {
      case TaskCategory.SIMPLE:
        return "text-green-600";
      case TaskCategory.FOCUS:
        return "text-blue-600";
      case TaskCategory.INBOX:
        return "text-orange-600";
      default:
        return "text-gray-600";
    }
  };

  const hasContent =
    previousDayTasks.length > 0 ||
    overdueInboxTasks.length > 0 ||
    dueDeferredTasks.length > 0 ||
    regularInboxTasks.length > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                <Sunrise className="w-6 h-6 mr-2 text-orange-500" />
                {t("dailyModal.goodMorning")}
              </h2>
              <p className="text-sm text-gray-600 mt-1">{formatDate(date)}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label={t("dailyModal.closeModal")}
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Motivational Message */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-400">
            <p className="text-blue-800 font-medium">{motivationalMessage}</p>
          </div>

          {/* Yesterday's Today tasks */}
          {previousDayTasks.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
                <Clock className="w-5 h-5 mr-2 text-yellow-600" />
                {t("dailyModal.previousDayTasks")}
              </h3>
              <div className="space-y-2">
                {previousDayTasks.map((task) => (
                  <div
                    key={task.id.value}
                    className="flex items-center p-3 bg-yellow-50 rounded-lg border border-yellow-200"
                  >
                    {onReturnTaskToToday && (
                      <button
                        onClick={() => onReturnTaskToToday(task.id.value)}
                        className={`mr-3 p-1 rounded transition-colors ${
                          todayTaskIds.includes(task.id.value)
                            ? "text-yellow-500"
                            : "text-gray-400 hover:text-yellow-500 hover:bg-yellow-100"
                        }`}
                        title={t("dailyModal.returnToToday")}
                      >
                        <Sun className="w-5 h-5" />
                      </button>
                    )}
                    <div className="flex-1">
                      <p className="text-gray-900 font-medium">
                        {task.title.value}
                      </p>
                      <p className="text-xs text-gray-500">
                        {t(`categories.${task.category.toLowerCase()}`)}
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
                <AlertTriangle className="w-5 h-5 mr-2 text-red-600" />
                {t("dailyModal.overdueInboxTasks")}
              </h3>
              <div className="space-y-2">
                {overdueInboxTasks.map((task) => (
                  <div
                    key={task.id.value}
                    className="flex items-center p-3 bg-red-50 rounded-lg border border-red-200"
                  >
                    {onReturnTaskToToday && (
                      <button
                        onClick={() => onReturnTaskToToday(task.id.value)}
                        className={`mr-3 p-1 rounded transition-colors ${
                          todayTaskIds.includes(task.id.value)
                            ? "text-yellow-500"
                            : "text-gray-400 hover:text-yellow-500 hover:bg-yellow-100"
                        }`}
                        title={t("dailyModal.returnToToday")}
                      >
                        <Sun className="w-5 h-5" />
                      </button>
                    )}
                    <div className="flex-1">
                      <p className="text-gray-900 font-medium">
                        {task.title.value}
                      </p>
                      <p className="text-xs text-red-600">
                        {t("dailyModal.needsReview")} -{" "}
                        {t("dailyModal.inInboxFor")}{" "}
                        {task.inboxEnteredAt
                          ? Math.ceil(
                              (Date.now() - task.inboxEnteredAt.getTime()) /
                                (1000 * 60 * 60 * 24)
                            )
                          : "?"}{" "}
                        {t("dailyModal.days")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deferred tasks due today */}
          {dueDeferredTasks.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
                <Sun className="w-5 h-5 mr-2 text-green-600" />
                {t("dailyModal.deferredDueToday")}
              </h3>
              <div className="space-y-2">
                {dueDeferredTasks.map((task) => (
                  <div
                    key={task.id.value}
                    className="flex items-center p-3 bg-green-50 rounded-lg border border-green-200"
                  >
                    {onReturnTaskToToday && (
                      <button
                        onClick={() => onReturnTaskToToday(task.id.value)}
                        className={`mr-3 p-1 rounded transition-colors ${
                          todayTaskIds.includes(task.id.value)
                            ? "text-green-500"
                            : "text-gray-400 hover:text-green-500 hover:bg-green-100"
                        }`}
                        title={t("dailyModal.returnToToday")}
                      >
                        <Sun className="w-5 h-5" />
                      </button>
                    )}
                    <div className="flex-1">
                      <p className="text-gray-900 font-medium">
                        {task.title.value}
                      </p>
                      <p className="text-xs text-green-700">
                        {t(`categories.${task.category.toLowerCase()}`)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Regular Inbox Tasks */}
          {regularInboxTasks.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
                <Inbox className="w-5 h-5 mr-2 text-orange-600" />
                {t("dailyModal.inboxTasks")}
              </h3>
              <div className="space-y-2">
                {regularInboxTasks.map((task) => (
                  <div
                    key={task.id.value}
                    className="flex items-center p-3 bg-orange-50 rounded-lg border border-orange-200"
                  >
                    {onReturnTaskToToday && (
                      <button
                        onClick={() => onReturnTaskToToday(task.id.value)}
                        className={`mr-3 p-1 rounded transition-colors ${
                          todayTaskIds.includes(task.id.value)
                            ? "text-yellow-500"
                            : "text-gray-400 hover:text-yellow-500 hover:bg-yellow-100"
                        }`}
                        title={t("dailyModal.returnToToday")}
                      >
                        <Sun className="w-5 h-5" />
                      </button>
                    )}
                    <div className="flex-1">
                      <p className="text-gray-900 font-medium">
                        {task.title.value}
                      </p>
                      <p className="text-xs text-orange-600">
                        {t("dailyModal.inInboxFor")}{" "}
                        {task.inboxEnteredAt
                          ? Math.ceil(
                              (Date.now() - task.inboxEnteredAt.getTime()) /
                                (1000 * 60 * 60 * 24)
                            )
                          : "?"}{" "}
                        {t("dailyModal.days")}
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
              <div className="mb-4 flex justify-center">
                <PartyPopper className="w-16 h-16 text-green-500" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {t("dailyModal.allCaughtUp")}
              </h3>
              <p className="text-gray-600">{t("dailyModal.readyToStart")}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            {t("dailyModal.letsGetStarted")}
          </button>
        </div>
      </div>
    </div>
  );
};
