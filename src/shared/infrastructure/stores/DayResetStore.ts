import { container } from "../di/container";
import { CheckDayStatusUseCase } from "../../application/use-cases/CheckDayStatusUseCase";
import { DayResetUseCase } from "../../application/use-cases/DayResetUseCase";
import { RestoreDayUseCase } from "../../application/use-cases/RestoreDayUseCase";
import { GetStartOfDayCandidatesUseCase } from "../../application/use-cases/GetStartOfDayCandidatesUseCase";
import { ConfirmStartOfDayUseCase } from "../../application/use-cases/ConfirmStartOfDayUseCase";
import { DateOnly } from "../../domain/value-objects/DateOnly";
import { TaskSelection } from "../../domain/types";
import { TaskEventBus } from "../events/TaskEventBus";
import { TaskEventType } from "../../domain/events/TaskEvent";

export interface DayResetState {
  isResetNeeded: boolean;
  shouldShowBanner: boolean;
  shouldShowModal: boolean;
  isRestoreAvailable: boolean;
  currentDate: string;
  candidates: {
    returning: TaskSelection[];
    missed: TaskSelection[];
    staleInbox: TaskSelection[];
  };
  isLoading: boolean;
  isResetting: boolean;
  isRestoring: boolean;
  isConfirming: boolean;
  error: string | null;
  initialized: boolean;
}

export interface DayResetActions {
  checkAndResetDay: (userId: string) => Promise<void>;
  showStartOfDayModal: (userId: string) => Promise<void>;
  confirmStartOfDay: (userId: string, selections: TaskSelection[]) => Promise<void>;
  restoreDay: (userId: string) => Promise<void>;
  forceDayReset: (userId: string) => Promise<void>;
  dismissBanner: () => void;
  closeModal: () => void;
  clearError: () => void;
}

// Глобальное состояние day reset для кеширования
let globalDayResetState: DayResetState = {
  isResetNeeded: false,
  shouldShowBanner: false,
  shouldShowModal: false,
  isRestoreAvailable: false,
  currentDate: DateOnly.today().value,
  candidates: {
    returning: [],
    missed: [],
    staleInbox: [],
  },
  isLoading: false,
  isResetting: false,
  isRestoring: false,
  isConfirming: false,
  error: null,
  initialized: false,
};

// Подписчики на изменения состояния
const subscribers = new Set<(state: DayResetState) => void>();

// Функция для уведомления всех подписчиков
const notifySubscribers = (newState: DayResetState) => {
  globalDayResetState = newState;
  subscribers.forEach((callback) => callback(newState));
};

// Use cases (инициализируются лениво)
let checkDayStatusUseCase: CheckDayStatusUseCase;
let dayResetUseCase: DayResetUseCase;
let restoreDayUseCase: RestoreDayUseCase;
let getCandidatesUseCase: GetStartOfDayCandidatesUseCase;
let confirmStartOfDayUseCase: ConfirmStartOfDayUseCase;
let eventBus: TaskEventBus;

// Инициализация use cases
const initializeUseCases = () => {
  if (!checkDayStatusUseCase) {
    checkDayStatusUseCase = container.resolve(CheckDayStatusUseCase);
    dayResetUseCase = container.resolve(DayResetUseCase);
    restoreDayUseCase = container.resolve(RestoreDayUseCase);
    getCandidatesUseCase = container.resolve(GetStartOfDayCandidatesUseCase);
    confirmStartOfDayUseCase = container.resolve(ConfirmStartOfDayUseCase);
    eventBus = container.resolve(TaskEventBus);
  }
};

// Инициализация событий (выполняется один раз)
let eventsInitialized = false;
const initializeEvents = () => {
  if (eventsInitialized) return;
  eventsInitialized = true;

  initializeUseCases();

  const handleDayResetEvent = (event: any) => {
    if (event.type === TaskEventType.DAY_RESET_COMPLETED) {
      notifySubscribers({
        ...globalDayResetState,
        shouldShowBanner: true,
        isRestoreAvailable: true,
      });
    } else if (event.type === TaskEventType.DAY_RESTORED) {
      notifySubscribers({
        ...globalDayResetState,
        shouldShowBanner: false,
        shouldShowModal: false,
        isRestoreAvailable: false,
      });
    }
  };

  eventBus.subscribe(TaskEventType.DAY_RESET_COMPLETED, handleDayResetEvent);
  eventBus.subscribe(TaskEventType.DAY_RESTORED, handleDayResetEvent);
};

// Load candidates for start of day modal
const loadCandidates = async (userId: string) => {
  initializeUseCases();

  console.log("loader", userId);

  notifySubscribers({
    ...globalDayResetState,
    isLoading: true,
    error: null,
  });

  try {
    const result = await getCandidatesUseCase.execute({ userId });

    if (result.isError) {
      notifySubscribers({
        ...globalDayResetState,
        error: result.error.message,
        isLoading: false,
      });
      return;
    }

    const { candidates, shouldShowModal, isRestoreAvailable } = result.value;

    notifySubscribers({
      ...globalDayResetState,
      candidates,
      shouldShowModal,
      isRestoreAvailable,
      isLoading: false,
    });
  } catch (error) {
    notifySubscribers({
      ...globalDayResetState,
      error: error instanceof Error ? error.message : "Unknown error occurred",
      isLoading: false,
    });
  }
};

// Глобальные действия
export const dayResetActions: DayResetActions = {
  // Check and reset day
  checkAndResetDay: async (userId: string) => {
    if (globalDayResetState.isResetting) return;

    initializeUseCases();
    initializeEvents();

    notifySubscribers({
      ...globalDayResetState,
      isResetting: true,
      error: null,
    });

    try {
      const result = await checkDayStatusUseCase.execute({ userId });

      if (result.isError) {
        notifySubscribers({
          ...globalDayResetState,
          error: result.error.message,
          isResetting: false,
        });
        return;
      }

      const { wasResetPerformed, shouldShowModal, isRestoreAvailable } =
        result.value;

      notifySubscribers({
        ...globalDayResetState,
        isResetNeeded: false,
        shouldShowBanner: wasResetPerformed,
        shouldShowModal,
        isRestoreAvailable,
        currentDate: DateOnly.today().value,
        isResetting: false,
        initialized: true,
      });

      // Load candidates if modal should be shown
      if (shouldShowModal) {
        await loadCandidates(userId);
      }
    } catch (error) {
      notifySubscribers({
        ...globalDayResetState,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
        isResetting: false,
      });
    }
  },

  // Show start of day modal
  showStartOfDayModal: async (userId: string) => {
    notifySubscribers({
      ...globalDayResetState,
      shouldShowBanner: false,
    });

    console.log("show!");

    await loadCandidates(userId);

    // Force show modal regardless of repository logic
    notifySubscribers({
      ...globalDayResetState,
      shouldShowModal: true,
    });
  },

  // Confirm start of day
  confirmStartOfDay: async (userId: string, selections: TaskSelection[]) => {
    if (globalDayResetState.isConfirming) return;

    initializeUseCases();

    notifySubscribers({
      ...globalDayResetState,
      isConfirming: true,
      error: null,
    });

    try {
      const result = await confirmStartOfDayUseCase.execute({
        userId,
        selections,
      });

      if (result.isError) {
        notifySubscribers({
          ...globalDayResetState,
          error: result.error.message,
          isConfirming: false,
        });
        return;
      }

      notifySubscribers({
        ...globalDayResetState,
        shouldShowModal: false,
        shouldShowBanner: false,
        isConfirming: false,
      });
    } catch (error) {
      notifySubscribers({
        ...globalDayResetState,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
        isConfirming: false,
      });
    }
  },

  // Restore day
  restoreDay: async (userId: string) => {
    if (globalDayResetState.isRestoring) return;

    initializeUseCases();

    notifySubscribers({
      ...globalDayResetState,
      isRestoring: true,
      error: null,
    });

    try {
      const result = await restoreDayUseCase.execute({ userId });

      if (result.isError) {
        notifySubscribers({
          ...globalDayResetState,
          error: result.error.message,
          isRestoring: false,
        });
        return;
      }

      notifySubscribers({
        ...globalDayResetState,
        shouldShowModal: false,
        shouldShowBanner: false,
        isRestoring: false,
      });
    } catch (error) {
      notifySubscribers({
        ...globalDayResetState,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
        isRestoring: false,
      });
    }
  },

  // Dismiss banner
  dismissBanner: () => {
    notifySubscribers({
      ...globalDayResetState,
      shouldShowBanner: false,
    });
  },

  // Close modal
  closeModal: () => {
    notifySubscribers({
      ...globalDayResetState,
      shouldShowModal: false,
    });
  },

  // Force day reset (for testing)
  forceDayReset: async (userId: string) => {
    if (globalDayResetState.isResetting) return;

    initializeUseCases();

    notifySubscribers({
      ...globalDayResetState,
      isResetting: true,
      error: null,
    });

    try {
      // Принудительно выполняем сброс дня
      const result = await dayResetUseCase.execute({ userId });

      if (result.isError) {
        notifySubscribers({
          ...globalDayResetState,
          error: result.error.message,
          isResetting: false,
        });
        return;
      }

      // После сброса показываем баннер и делаем восстановление доступным
      notifySubscribers({
        ...globalDayResetState,
        shouldShowBanner: true,
        isRestoreAvailable: true,
        shouldShowModal: false,
        isResetting: false,
        initialized: true,
      });

      console.log("🧪 Day reset forced successfully");
    } catch (error) {
      notifySubscribers({
        ...globalDayResetState,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
        isResetting: false,
      });
    }
  },

  // Clear error
  clearError: () => {
    notifySubscribers({
      ...globalDayResetState,
      error: null,
    });
  },
};

// Функции для подписки/отписки
export const subscribeToDayResetState = (
  callback: (state: DayResetState) => void
) => {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
};

export const getDayResetState = () => globalDayResetState;
