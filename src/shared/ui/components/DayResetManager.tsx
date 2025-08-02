import React from "react";
import { useDayReset } from "../../hooks/useDayReset";
import { NewDayBanner } from "./NewDayBanner";
import { StartOfDayModal } from "./StartOfDayModal";

interface DayResetManagerProps {
  /** Current user ID */
  userId: string;
  /** Custom CSS classes */
  className?: string;
  /** Callback when error occurs (optional) */
  onError?: (error: string) => void;
}

/**
 * Main container component for day reset functionality
 * Manages the banner and modal for start of day workflow
 */
export const DayResetManager: React.FC<DayResetManagerProps> = ({
  userId,
  className = "",
  onError,
}) => {
  const dayResetData = useDayReset(userId);
  const {
    shouldShowBanner,
    shouldShowModal,
    isRestoreAvailable,
    currentDate,
    candidates,
    isLoading,
    isRestoring,
    isConfirming,
    error,
  } = dayResetData.state;

  console.log(shouldShowModal);

  const {
    showStartOfDayModal,
    confirmStartOfDay,
    restoreDay,
    dismissBanner,
    closeModal,
    clearError,
  } = dayResetData.actions;

  // Handle error reporting
  React.useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  // Auto-clear error after 5 seconds
  React.useEffect(() => {
    if (error) {
      const timer = setTimeout(clearError, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  return (
    <div className={`relative ${className}`}>
      {/* New Day Banner */}
      <NewDayBanner
        isVisible={shouldShowBanner}
        onStartDay={showStartOfDayModal}
        onRestore={isRestoreAvailable ? restoreDay : undefined}
        isRestoreAvailable={isRestoreAvailable}
        onDismiss={dismissBanner}
      />

      {/* Start of Day Modal */}
      <StartOfDayModal
        isOpen={shouldShowModal}
        onClose={closeModal}
        date={currentDate}
        candidates={candidates}
        isRestoreAvailable={isRestoreAvailable}
        onConfirm={confirmStartOfDay}
        onRestore={isRestoreAvailable ? restoreDay : undefined}
        onLater={closeModal}
        isLoading={isConfirming || isRestoring}
      />

      {/* Error Display */}
      {error && (
        <div className="fixed top-5 right-5 z-50 max-w-sm animate-slide-in-right">
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 shadow-lg">
            <span className="text-base flex-shrink-0">⚠️</span>
            <span className="text-red-600 text-sm font-medium flex-1">
              {error}
            </span>
            <button
              className="bg-transparent border-none text-red-600 cursor-pointer p-1 rounded hover:bg-red-100 text-sm flex-shrink-0"
              onClick={clearError}
              aria-label="Закрыть ошибку"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {(isLoading || isRestoring || isConfirming) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-4 bg-white p-8 rounded-xl shadow-2xl">
            <div className="w-8 h-8 border-3 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
            <span className="text-gray-700 font-medium text-base">
              {isRestoring && "Восстановление дня..."}
              {isConfirming && 'Формирование "Сегодня"...'}
              {isLoading && "Загрузка..."}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default DayResetManager;
