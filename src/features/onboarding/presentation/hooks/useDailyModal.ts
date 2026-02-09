import { useEffect } from "react";
import { useOnboardingViewModel } from "../view-models/OnboardingViewModel";

/**
 * Hook to manage daily modal lifecycle
 * Should be called in the main app component
 */
export const useDailyModal = () => {
  const {
    dailyModalData,
    isModalVisible,
    isLoading,
    error,
    hideDailyModal,
    checkDayTransition,
  } = useOnboardingViewModel();

  // Handle day transition when app returns from background
  useEffect(() => {
    const handleVisibilityChange = async () => {
      // Only check when app becomes visible
      if (!document.hidden) {
        // Check if day has transitioned
        checkDayTransition();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkDayTransition]);

  return {
    dailyModalData,
    isModalVisible,
    isLoading,
    error,
    hideDailyModal,
  };
};
