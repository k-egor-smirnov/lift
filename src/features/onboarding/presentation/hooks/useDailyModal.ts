import { useEffect } from "react";
import { useOnboardingViewModel } from "../view-models/OnboardingViewModel";

/**
 * Hook to manage daily modal lifecycle
 * Should be called in the main app component
 */
export const useDailyModal = (overdueDays?: number) => {
  const {
    dailyModalData,
    isModalVisible,
    isLoading,
    error,
    modalShownToday,
    loadDailyModalData,
    showDailyModal,
    hideDailyModal,
    checkShouldShowModal,
    checkDayTransition,
  } = useOnboardingViewModel();

  // Check and show modal on app startup
  useEffect(() => {
    const initializeDailyModal = async () => {
      // Don't check if already shown today
      if (modalShownToday) {
        return;
      }

      try {
        // Check if modal should be shown
        const shouldShow = await checkShouldShowModal(overdueDays);

        if (shouldShow) {
          // Load data and show modal
          await loadDailyModalData(overdueDays);
          showDailyModal();
        }
      } catch (error) {
        console.error("Error initializing daily modal:", error);
      }
    };

    // Small delay to ensure app is fully loaded
    const timer = setTimeout(initializeDailyModal, 1000);

    return () => clearTimeout(timer);
  }, [
    modalShownToday,
    overdueDays,
    checkShouldShowModal,
    loadDailyModalData,
    showDailyModal,
  ]);

  // Handle day transition when app returns from background
  useEffect(() => {
    const handleVisibilityChange = async () => {
      // Only check when app becomes visible
      if (!document.hidden) {
        // Check if day has transitioned
        const dayChanged = checkDayTransition();

        if (dayChanged) {
          // Day has changed, check if we should show modal
          try {
            const shouldShow = await checkShouldShowModal(overdueDays);

            if (shouldShow) {
              // Load fresh data and show modal
              await loadDailyModalData(overdueDays);
              showDailyModal();
            }
          } catch (error) {
            console.error("Error handling day transition:", error);
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    checkDayTransition,
    checkShouldShowModal,
    loadDailyModalData,
    showDailyModal,
    overdueDays,
  ]);

  return {
    dailyModalData,
    isModalVisible,
    isLoading,
    error,
    hideDailyModal,
  };
};
