import React, { useState } from "react";
import { Calendar, X } from "lucide-react";

import { useOnboardingViewModel } from "../../features/onboarding/presentation/view-models/OnboardingViewModel";
import { useTodayViewModelStore } from "../../features/today/presentation/view-models/TodayViewModelStore";

export interface DevDayTransitionClock {
  now(): Date;
  set(value: Date): void;
  advanceDays(days: number): void;
}

export interface DevDayTransitionProps {
  /** The same in-memory clock injected into SystemEffectiveDateProvider. */
  clock?: DevDayTransitionClock;
}

/** Development-only, zero-write effective-date simulator. */
export const DevDayTransition: React.FC<DevDayTransitionProps> = ({
  clock,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [overdueDays, setOverdueDays] = useState(3);
  const [revision, setRevision] = useState(0);
  const { isModalVisible, loadDailyModalData, showDailyModal, reset } =
    useOnboardingViewModel();
  const refreshToday = useTodayViewModelStore((state) => state.refreshToday);

  if (!clock) return null;

  const refreshReadModels = async () => {
    reset();
    await Promise.all([refreshToday(), loadDailyModalData(overdueDays)]);
    showDailyModal();
    setRevision((value) => value + 1);
  };

  const handleNextDay = async () => {
    clock.advanceDays(1);
    await refreshReadModels();
    setIsOpen(false);
  };

  const handleResetToSystemTime = async () => {
    clock.set(new Date());
    await refreshReadModels();
  };

  const currentDate = clock.now().toISOString().slice(0, 10);

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
    <div
      className="fixed bottom-4 right-4 bg-white border border-gray-200 rounded-lg shadow-xl p-4 z-50 w-80"
      data-clock-revision={revision}
    >
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
        <div className="text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-600">Clock date:</span>
            <span className="font-medium">{currentDate}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Modal visible:</span>
            <span>{isModalVisible ? "Yes" : "No"}</span>
          </div>
        </div>

        <label className="block text-sm font-medium text-gray-700">
          Overdue days
          <input
            type="number"
            min="1"
            max="30"
            value={overdueDays}
            onChange={(event) =>
              setOverdueDays(Number(event.target.value) || 3)
            }
            className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </label>

        <button
          onClick={handleNextDay}
          className="w-full px-3 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-md"
        >
          Simulate next day
        </button>
        <button
          onClick={handleResetToSystemTime}
          className="w-full px-3 py-2 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded-md"
        >
          Reset clock
        </button>

        <p className="text-xs text-gray-500 bg-green-50 p-2 rounded">
          Changes only the injected in-memory clock and refreshes read models.
        </p>
      </div>
    </div>
  );
};
