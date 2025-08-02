import React, { useState } from "react";
import { Calendar, X, RefreshCw, Clock, AlertTriangle } from "lucide-react";
import { DateOnly } from "../../shared/domain/value-objects/DateOnly";
import { useOnboardingViewModel } from "../../features/onboarding/presentation/view-models/OnboardingViewModel";
import { useDayReset } from "../../shared/hooks/useDayReset";
import { useAuth } from "../../shared/presentation/hooks/useAuth";
import { getService, tokens } from "../../shared/infrastructure/di";
import { DailySelectionRepository } from "../../shared/domain/repositories/DailySelectionRepository";
import { DayResetUseCase } from "../../shared/application/use-cases/DayResetUseCase";
import { RestoreDayUseCase } from "../../shared/application/use-cases/RestoreDayUseCase";

/**
 * Dev component for simulating day transition
 * Simulates moving to the next day and triggers the daily modal
 */
export const DevDayTransition: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [overdueDays, setOverdueDays] = useState(3);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  const {
    isModalVisible,
    modalShownToday,
    loadDailyModalData,
    showDailyModal,
    reset: resetOnboardingState,
  } = useOnboardingViewModel();

  // Get current user
  const { user } = useAuth();
  const userId = user?.id || "default-user"; // Fallback to default-user if not authenticated

  // Integration with new day reset functionality
  const dayResetState = useDayReset(userId);

  const dayResetUseCase = getService<DayResetUseCase>(
    tokens.DAY_RESET_USE_CASE_TOKEN
  );
  const restoreDayUseCase = getService<RestoreDayUseCase>(
    tokens.RESTORE_DAY_USE_CASE_TOKEN
  );

  const handleNextDay = async () => {
    try {
      // Get tomorrow's date
      const today = DateOnly.today();
      const tomorrow = today.addDays(1);
      const tomorrowDate = new Date(tomorrow.value + "T09:00:00");

      // Mock the system time to tomorrow
      localStorage.setItem("__dev_mocked_date__", tomorrowDate.toISOString());

      // Clear daily modal state for the new day
      const dateKey = tomorrowDate.toISOString().split("T")[0];
      const modalKey = `dailyModal_shown_${dateKey}`;
      localStorage.removeItem(modalKey);

      // Clear today's task selection to simulate fresh day
      try {
        const dailySelectionRepository = getService<DailySelectionRepository>(
          tokens.DAILY_SELECTION_REPOSITORY_TOKEN
        );
        const newToday = DateOnly.today(); // This will use the mocked date
        await dailySelectionRepository.clearDay(newToday);
        console.log("🧪 Cleared daily task selection for:", newToday.value);
      } catch (error) {
        console.error("Failed to clear daily selection:", error);
      }

      // Reset onboarding state
      resetOnboardingState();

      // Trigger new day reset using the new system
      const resetResult = await dayResetUseCase.execute({
        userId: userId,
        date: DateOnly.today(), // This will use the mocked date
      });

      if (resetResult.isSuccess) {
        setDebugInfo({
          type: "day_reset",
          result: resetResult.value,
          timestamp: new Date().toISOString(),
        });
        console.log("🧪 Day reset executed:", resetResult.value);
      } else {
        console.error("🧪 Day reset failed:", resetResult.error);
      }

      // Load and show daily modal for the new day (fallback)
      await loadDailyModalData(overdueDays);
      showDailyModal();

      // Force refresh of TodayView to update with new date
      if ((window as any).__todayViewRefresh) {
        await (window as any).__todayViewRefresh();
      }

      console.log("🧪 Day transition simulated to:", tomorrow.value);
      console.log("🧪 Daily modal triggered for new day");

      // Close the dev panel
      setIsOpen(false);
    } catch (error) {
      console.error("Failed to simulate day transition:", error);
      setDebugInfo({
        type: "error",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
    }
  };

  const handleResetToToday = () => {
    try {
      // Remove mocked date
      localStorage.removeItem("__dev_mocked_date__");

      // Reset onboarding state
      resetOnboardingState();

      // Clear debug info
      setDebugInfo(null);

      // Force page reload to apply the reset
      window.location.reload();

      console.log("🧪 Time reset to current date");
    } catch (error) {
      console.error("Failed to reset time:", error);
    }
  };

  const handleRestoreDay = async () => {
    try {
      const result = await restoreDayUseCase.execute({
        userId: userId,
        date: DateOnly.today(),
      });

      if (result.isSuccess) {
        setDebugInfo({
          type: "day_restore",
          result: result.value,
          timestamp: new Date().toISOString(),
        });
        console.log("🧪 Day restored:", result.value);
      } else {
        console.error("🧪 Day restore failed:", result.error);
        setDebugInfo({
          type: "error",
          error: result.error.message,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("Failed to restore day:", error);
      setDebugInfo({
        type: "error",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
    }
  };

  const handleTriggerDayReset = async () => {
    try {
      console.log("show?");
      await dayResetState.actions.showStartOfDayModal();
      setDebugInfo({
        type: "modal_triggered",
        timestamp: new Date().toISOString(),
      });
      console.log("🧪 Day reset modal triggered manually");
    } catch (error) {
      console.error("Failed to trigger day reset modal:", error);
    }
  };

  const handleForceDayReset = async () => {
    if (!user) return;
    
    try {
      console.log("🧪 Forcing day reset...");
      await dayResetState.actions.forceDayReset();
      setDebugInfo({
        type: "force_reset",
        timestamp: new Date().toISOString(),
        result: "Day reset forced successfully"
      });
      console.log("🧪 Day reset forced successfully");
    } catch (error) {
      console.error("Failed to force day reset:", error);
      setDebugInfo({
        type: "force_reset",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const isTimeSimulated = localStorage.getItem("__dev_mocked_date__") !== null;
  const currentDate = DateOnly.today().value;

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-green-600 hover:bg-green-700 text-white p-3 rounded-full shadow-lg transition-colors z-50"
        title="Simulate Next Day (Dev Mode)"
      >
        <Calendar className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white border border-gray-200 rounded-lg shadow-xl p-4 z-50 w-80 max-h-[80vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          🧪 Day Transition
        </h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        {/* Status */}
        <div className="text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-600">Current Date:</span>
            <span className="font-medium">{currentDate}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Time Simulated:</span>
            <span
              className={
                isTimeSimulated ? "text-green-600 font-medium" : "text-gray-400"
              }
            >
              {isTimeSimulated ? "Yes" : "No"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Legacy Modal:</span>
            <span
              className={
                isModalVisible ? "text-blue-600 font-medium" : "text-gray-400"
              }
            >
              {isModalVisible ? "Yes" : "No"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">New Modal:</span>
            <span
              className={
                dayResetState.state.shouldShowModal
                  ? "text-blue-600 font-medium"
                  : "text-gray-400"
              }
            >
              {dayResetState.state.shouldShowModal ? "Yes" : "No"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Banner:</span>
            <span
              className={
                dayResetState.state.shouldShowBanner
                  ? "text-yellow-600 font-medium"
                  : "text-gray-400"
              }
            >
              {dayResetState.state.shouldShowBanner ? "Yes" : "No"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Restore Available:</span>
            <span
              className={
                dayResetState.state.isRestoreAvailable
                  ? "text-purple-600 font-medium"
                  : "text-gray-400"
              }
            >
              {dayResetState.state.isRestoreAvailable ? "Yes" : "No"}
            </span>
          </div>
        </div>

        {/* Overdue Days Setting */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Overdue Days Threshold:
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="30"
              value={overdueDays}
              onChange={(e) => setOverdueDays(parseInt(e.target.value) || 3)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <span className="text-sm text-gray-500">days</span>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={handleNextDay}
            className="w-full px-3 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors font-medium flex items-center justify-center gap-2"
          >
            <Calendar className="w-4 h-4" />
            🌅 Simulate Next Day
          </button>

          <button
            onClick={handleTriggerDayReset}
            className="w-full px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Trigger Day Reset Modal
          </button>

          <button
            onClick={handleForceDayReset}
            className="w-full px-3 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors flex items-center justify-center gap-2"
          >
            <AlertTriangle className="w-4 h-4" />
            🔄 Force Day Reset
          </button>

          {dayResetState.state.isRestoreAvailable && (
            <button
              onClick={handleRestoreDay}
              className="w-full px-3 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors flex items-center justify-center gap-2"
            >
              <Clock className="w-4 h-4" />
              Restore Previous Day
            </button>
          )}

          {isTimeSimulated && (
            <button
              onClick={handleResetToToday}
              className="w-full px-3 py-2 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors flex items-center justify-center gap-2"
            >
              <X className="w-4 h-4" />
              Reset to Today
            </button>
          )}
        </div>

        {/* Debug Info */}
        {debugInfo && (
          <div className="text-xs bg-gray-50 p-2 rounded border">
            <div className="flex items-center gap-1 mb-1">
              <AlertTriangle className="w-3 h-3" />
              <strong>Debug Info:</strong>
            </div>
            <div className="space-y-1">
              <div>
                Type: <span className="font-mono">{debugInfo.type}</span>
              </div>
              <div>
                Time:{" "}
                <span className="font-mono">
                  {new Date(debugInfo.timestamp).toLocaleTimeString()}
                </span>
              </div>
              {debugInfo.result && (
                <div>
                  Result:{" "}
                  <span className="font-mono text-green-600">Success</span>
                </div>
              )}
              {debugInfo.error && (
                <div>
                  Error:{" "}
                  <span className="font-mono text-red-600">
                    {debugInfo.error}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="text-xs text-gray-500 bg-green-50 p-2 rounded">
          <strong>Dev Mode:</strong> Integrated with new day reset system.
          Simulates day transitions and provides debugging tools for day reset
          functionality.
        </div>
      </div>
    </div>
  );
};
