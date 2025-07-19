import React, { useEffect, useState } from 'react';
import { useUserSettingsViewModel } from '../view-models/UserSettingsViewModel';

interface UserSettingsModalProps {
  isVisible: boolean;
  onClose: () => void;
}

/**
 * Modal component for managing user settings
 */
export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
  isVisible,
  onClose
}) => {
  const {
    settings,
    isLoading,
    error,
    loadSettings,
    setInboxOverdueDays,
    setKeyboardShortcutsEnabled,
    resetToDefaults,
    clearError
  } = useUserSettingsViewModel();

  const [localInboxDays, setLocalInboxDays] = useState<number>(3);
  const [localKeyboardShortcuts, setLocalKeyboardShortcuts] = useState<boolean>(true);

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

  const handleResetToDefaults = async () => {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
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
            <h2 className="text-xl font-semibold text-gray-900">
              Settings ⚙️
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close settings"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-gray-600">Loading settings...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-red-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
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
                  Inbox Overdue Days
                </label>
                <p className="text-sm text-gray-600 mb-3">
                  Tasks in the inbox are considered overdue after this many days
                </p>
                <div className="flex items-center space-x-3">
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={localInboxDays}
                    onChange={(e) => handleInboxDaysChange(parseInt(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex items-center justify-center w-12 h-8 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                    {localInboxDays}
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1 day</span>
                  <span>30 days</span>
                </div>
              </div>

              {/* Keyboard Shortcuts Setting */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Keyboard Shortcuts
                </label>
                <p className="text-sm text-gray-600 mb-3">
                  Enable keyboard shortcuts for faster navigation and task management
                </p>
                <div className="flex items-center">
                  <button
                    onClick={() => handleKeyboardShortcutsChange(!localKeyboardShortcuts)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      localKeyboardShortcuts ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        localKeyboardShortcuts ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className="ml-3 text-sm text-gray-700">
                    {localKeyboardShortcuts ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                {localKeyboardShortcuts && (
                  <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800 font-medium mb-2">Available shortcuts:</p>
                    <ul className="text-xs text-blue-700 space-y-1">
                      <li><kbd className="px-1 py-0.5 bg-blue-200 rounded">N</kbd> - New task</li>
                      <li><kbd className="px-1 py-0.5 bg-blue-200 rounded">T</kbd> - Today view</li>
                      <li><kbd className="px-1 py-0.5 bg-blue-200 rounded">I</kbd> - Inbox view</li>
                      <li><kbd className="px-1 py-0.5 bg-blue-200 rounded">S</kbd> - Simple tasks</li>
                      <li><kbd className="px-1 py-0.5 bg-blue-200 rounded">F</kbd> - Focus tasks</li>
                    </ul>
                  </div>
                )}
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
            Reset to Defaults
          </button>
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};