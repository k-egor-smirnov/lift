import React, { useEffect, useState } from "react";
import { Settings, X, AlertCircle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUserSettingsViewModel } from "../view-models/UserSettingsViewModel";

interface UserSettingsModalProps {
  isVisible: boolean;
  onClose: () => void;
}

/**
 * Modal component for managing user settings
 */
export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
  isVisible,
  onClose,
}) => {
  const { t } = useTranslation();
  const {
    settings,
    isLoading,
    error,
    loadSettings,
    setInboxOverdueDays,
    setKeyboardShortcutsEnabled,
    setStartOfDayTime,
    resetToDefaults,
    clearError,
  } = useUserSettingsViewModel();

  const [localInboxDays, setLocalInboxDays] = useState<number>(3);
  const [localKeyboardShortcuts, setLocalKeyboardShortcuts] =
    useState<boolean>(true);
  const [localStartOfDayTime, setLocalStartOfDayTime] =
    useState<string>("09:00");

  // Load settings when modal opens
  useEffect(() => {
    if (isVisible && !settings) {
      loadSettings();
    }
  }, [isVisible, settings, loadSettings]);

  // Update local state when settings change
  useEffect(() => {
    if (settings) {
      setLocalInboxDays(settings.inboxOverdueDays);
      setLocalKeyboardShortcuts(settings.keyboardShortcutsEnabled);
      setLocalStartOfDayTime(settings.startOfDayTime);
    }
  }, [settings]);

  const handleInboxDaysChange = async (days: number) => {
    setLocalInboxDays(days);
    await setInboxOverdueDays(days);
  };

  const handleKeyboardShortcutsChange = async (enabled: boolean) => {
    setLocalKeyboardShortcuts(enabled);
    await setKeyboardShortcutsEnabled(enabled);
  };

  const handleStartOfDayTimeChange = async (time: string) => {
    setLocalStartOfDayTime(time);
    await setStartOfDayTime(time);
  };

  const handleResetToDefaults = async () => {
    if (confirm(t("settings.confirmReset"))) {
      await resetToDefaults();
    }
  };

  const handleClose = () => {
    clearError();
    onClose();
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Settings className="w-6 h-6 text-gray-600" />
              <h2 className="text-xl font-semibold text-gray-900">
                {t("settings.title")}
              </h2>
            </div>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label={t("common.close")}
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-gray-600">{t("settings.loading")}</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            </div>
          )}

          {/* Settings Form */}
          {settings && !isLoading && (
            <div className="space-y-6">
              {/* Inbox Overdue Days Setting */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t("settings.inboxOverdueDays")}
                </label>
                <p className="text-sm text-gray-600 mb-3">
                  {t("settings.inboxOverdueDaysDesc")}
                </p>
                <div className="flex items-center space-x-3">
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={localInboxDays}
                    onChange={(e) =>
                      handleInboxDaysChange(parseInt(e.target.value))
                    }
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex items-center justify-center w-12 h-8 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                    {localInboxDays}
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>{t("settings.oneDay")}</span>
                  <span>{t("settings.thirtyDays")}</span>
                </div>
              </div>

              {/* Keyboard Shortcuts Setting */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t("settings.keyboardShortcuts")}
                </label>
                <p className="text-sm text-gray-600 mb-3">
                  {t("settings.keyboardShortcutsDesc")}
                </p>
                <div className="flex items-center">
                  <button
                    onClick={() =>
                      handleKeyboardShortcutsChange(!localKeyboardShortcuts)
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      localKeyboardShortcuts ? "bg-blue-600" : "bg-gray-200"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        localKeyboardShortcuts
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                  <span className="ml-3 text-sm text-gray-700">
                    {localKeyboardShortcuts
                      ? t("common.enabled")
                      : t("common.disabled")}
                  </span>
                </div>
                {localKeyboardShortcuts && (
                  <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800 font-medium mb-2">
                      {t("settings.availableShortcuts")}:
                    </p>
                    <ul className="text-xs text-blue-700 space-y-1">
                      <li>
                        <kbd className="px-1 py-0.5 bg-blue-200 rounded">N</kbd>{" "}
                        - {t("shortcuts.newTask")}
                      </li>
                      <li>
                        <kbd className="px-1 py-0.5 bg-blue-200 rounded">T</kbd>{" "}
                        - {t("shortcuts.todayView")}
                      </li>
                      <li>
                        <kbd className="px-1 py-0.5 bg-blue-200 rounded">I</kbd>{" "}
                        - {t("shortcuts.inboxView")}
                      </li>
                      <li>
                        <kbd className="px-1 py-0.5 bg-blue-200 rounded">S</kbd>{" "}
                        - {t("shortcuts.simpleTasks")}
                      </li>
                      <li>
                        <kbd className="px-1 py-0.5 bg-blue-200 rounded">F</kbd>{" "}
                        - {t("shortcuts.focusTasks")}
                      </li>
                    </ul>
                  </div>
                )}
              </div>

              {/* Start of Day Time Setting */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t("settings.app.startOfDayTime")}
                </label>
                <p className="text-sm text-gray-600 mb-3">
                  {t("settings.app.startOfDayTimeDescription")}
                </p>
                <input
                  type="time"
                  value={localStartOfDayTime}
                  onChange={(e) => handleStartOfDayTimeChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-between">
          <button
            onClick={handleResetToDefaults}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("settings.resetToDefaults")}
          </button>
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            {t("common.done")}
          </button>
        </div>
      </div>
    </div>
  );
};
