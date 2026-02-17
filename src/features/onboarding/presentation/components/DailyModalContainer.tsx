import React, { useEffect } from "react";
import { DailyModal } from "./DailyModal";
import { useDailyModal } from "../hooks/useDailyModal";
import { useOnboardingViewModel } from "../view-models/OnboardingViewModel";

interface DailyModalContainerProps {
  overdueDays?: number;
}

/**
 * Container component that manages the daily modal lifecycle
 * This should be included in the main app component
 */
export const DailyModalContainer: React.FC<DailyModalContainerProps> = () => {
  const { dailyModalData, isModalVisible, isLoading, error, hideDailyModal } =
    useDailyModal();

  const { toggleTaskToday, todayTaskIds, loadTodayTaskIds } =
    useOnboardingViewModel();

  // Load today's task IDs when component mounts
  useEffect(() => {
    loadTodayTaskIds();
  }, [loadTodayTaskIds]);

  // Don't render anything if modal is hidden and data is not ready yet
  if (!isModalVisible && !dailyModalData) {
    return null;
  }

  // Show loading state only while we don't have any data yet
  if (isLoading && !dailyModalData) {
    return null; // Could show a loading spinner if desired
  }

  const safeDailyModalData = dailyModalData ?? {
    previousDayTasks: [],
    overdueInboxTasks: [],
    dueDeferredTasks: [],
    regularInboxTasks: [],
    motivationalMessage: error ?? "",
    date: new Date().toISOString().split("T")[0],
  };

  return (
    <DailyModal
      isVisible={isModalVisible}
      previousDayTasks={safeDailyModalData.previousDayTasks}
      overdueInboxTasks={safeDailyModalData.overdueInboxTasks}
      dueDeferredTasks={safeDailyModalData.dueDeferredTasks}
      regularInboxTasks={safeDailyModalData.regularInboxTasks}
      motivationalMessage={safeDailyModalData.motivationalMessage}
      date={safeDailyModalData.date}
      onClose={hideDailyModal}
      onReturnTaskToToday={toggleTaskToday}
      todayTaskIds={todayTaskIds}
    />
  );
};
