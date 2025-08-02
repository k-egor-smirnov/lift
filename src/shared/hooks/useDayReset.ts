import { useState, useCallback, useEffect } from "react";
import { TaskSelection } from "../domain/types";
import {
  DayResetState,
  DayResetActions,
  dayResetActions,
  subscribeToDayResetState,
  getDayResetState,
} from "../infrastructure/stores/DayResetStore";

export interface UseDayResetReturn {
  state: DayResetState;
  actions: {
    checkAndResetDay: () => Promise<void>;
    showStartOfDayModal: () => Promise<void>;
    confirmStartOfDay: (selections: TaskSelection[]) => Promise<void>;
    restoreDay: () => Promise<void>;
    forceDayReset: () => Promise<void>;
    dismissBanner: () => void;
    closeModal: () => void;
    clearError: () => void;
  };
}

// Re-export types from store for backward compatibility
export type { DayResetState, DayResetActions } from "../infrastructure/stores/DayResetStore";

/**
 * Hook for managing day reset functionality
 * Uses global state to share data across components
 */
export function useDayReset(userId: string): UseDayResetReturn {
  const [state, setState] = useState<DayResetState>(getDayResetState());

  useEffect(() => {
    // Подписываемся на изменения глобального состояния
    const unsubscribe = subscribeToDayResetState((newState) => {
      setState(newState);
    });

    // Если состояние уже инициализировано, обновляем локальное состояние
    const currentState = getDayResetState();
    if (currentState.initialized) {
      setState(currentState);
    }

    return unsubscribe;
  }, []);

  // Обертки для глобальных действий с привязкой к userId
  const checkAndResetDay = useCallback(async () => {
    await dayResetActions.checkAndResetDay(userId);
  }, [userId]);

  const showStartOfDayModal = useCallback(async () => {
    await dayResetActions.showStartOfDayModal(userId);
  }, [userId]);

  const confirmStartOfDay = useCallback(
    async (selections: TaskSelection[]) => {
      await dayResetActions.confirmStartOfDay(userId, selections);
    },
    [userId]
  );

  const restoreDay = useCallback(async () => {
    await dayResetActions.restoreDay(userId);
  }, [userId]);

  const forceDayReset = useCallback(async () => {
    await dayResetActions.forceDayReset(userId);
  }, [userId]);

  const dismissBanner = useCallback(() => {
    dayResetActions.dismissBanner();
  }, []);

  const closeModal = useCallback(() => {
    dayResetActions.closeModal();
  }, []);

  const clearError = useCallback(() => {
    dayResetActions.clearError();
  }, []);

  // Автоматическая проверка при фокусе/видимости
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkAndResetDay();
      }
    };

    const handleFocus = () => {
      checkAndResetDay();
    };

    // Проверка при монтировании
    checkAndResetDay();

    // Подписка на события видимости и фокуса
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [checkAndResetDay]);

  return {
    state,
    actions: {
      checkAndResetDay,
      showStartOfDayModal,
      confirmStartOfDay,
      restoreDay,
      forceDayReset,
      dismissBanner,
      closeModal,
      clearError,
    },
  };
}
