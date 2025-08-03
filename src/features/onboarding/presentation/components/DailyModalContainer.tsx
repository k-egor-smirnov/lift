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
export const DailyModalContainer: React.FC<DailyModalContainerProps> = ({
  overdueDays,
}) => {
  const { dailyModalData, isModalVisible, isLoading, error, hideDailyModal } =
    useDailyModal(overdueDays);

  const { toggleTaskToday, todayTaskIds, loadTodayTaskIds } =
    useOnboardingViewModel();

  // Load today's task IDs when component mounts
  useEffect(() => {
    loadTodayTaskIds();
  }, [loadTodayTaskIds]);

  // Don't render anything if there's an error or no data
  if (error || !dailyModalData) {
    return null;
  }

  // Show loading state if needed
  if (isLoading) {
    return null; // Could show a loading spinner if desired
  }

  return (
    <DailyModal
      isVisible={isModalVisible}
      unfinishedTasks={dailyModalData.unfinishedTasks}
      overdueInboxTasks={dailyModalData.overdueInboxTasks}
      regularInboxTasks={dailyModalData.regularInboxTasks}
      motivationalMessage={dailyModalData.motivationalMessage}
      date={dailyModalData.date}
      onClose={hideDailyModal}
      onReturnTaskToToday={toggleTaskToday}
      todayTaskIds={todayTaskIds}
    />
  );
};
