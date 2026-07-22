import React, { useState } from "react";
import { Calendar, X } from "lucide-react";
import { DateOnly } from "../../shared/domain/value-objects/DateOnly";
import { useOnboardingViewModel } from "../../features/onboarding/presentation/view-models/OnboardingViewModel";
import { getService, tokens } from "../../shared/infrastructure/di";
import { DailySelectionRepository } from "../../shared/domain/repositories/DailySelectionRepository";

/**
 * Dev component for simulating day transition
 * Simulates moving to the next day and triggers the daily modal
 */
export const DevDayTransition: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [overdueDays, setOverdueDays] = useState(3);

  const {
    isModalVisible,
    loadDailyModalData,
    showDailyModal,
    reset: resetOnboardingState,
  } = useOnboardingViewModel();

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

      // Load and show daily modal for the new day
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
    }
  };

  const handleResetToToday = () => {
    try {
      // Remove mocked date
      localStorage.removeItem("__dev_mocked_date__");

      // Reset onboarding state
      resetOnboardingState();

      // Force page reload to apply the reset
      window.location.reload();

      console.log("🧪 Time reset to current date");
    } catch (error) {
      console.error("Failed to reset time:", error);
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
    <div className="fixed bottom-4 right-4 bg-white border border-gray-200 rounded-lg shadow-xl p-4 z-50 w-80">
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
            <span className="text-gray-600">Modal Visible:</span>
            <span
              className={
                isModalVisible ? "text-blue-600 font-medium" : "text-gray-400"
              }
            >
              {isModalVisible ? "Yes" : "No"}
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
            className="w-full px-3 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors font-medium"
          >
            🌅 Simulate Next Day
          </button>

          {isTimeSimulated && (
            <button
              onClick={handleResetToToday}
              className="w-full px-3 py-2 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors"
            >
              Reset to Today
            </button>
          )}
        </div>

        <div className="text-xs text-gray-500 bg-green-50 p-2 rounded">
          <strong>Dev Mode:</strong> Simulates moving to the next day and
          automatically triggers the daily modal for task selection.
        </div>
      </div>
    </div>
  );
};
