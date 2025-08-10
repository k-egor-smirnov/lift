import { create } from "zustand";
import { ForceSummarizationUseCase } from "../../../../shared/application/use-cases/ForceSummarizationUseCase";
import { SummaryType } from "../../../../shared/domain/entities/Summary";
import { DateOnly } from "../../../../shared/domain/value-objects/DateOnly";

export interface ForceSummarizationRequest {
  type: SummaryType;
  date: Date;
}

export interface ForceSummarizationState {
  // State
  isLoading: boolean;
  error: string | null;
  isSuccess: boolean;

  // Actions
  forceSummarization: (request: ForceSummarizationRequest) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export interface ForceSummarizationViewModelDependencies {
  forceSummarizationUseCase: ForceSummarizationUseCase;
}

export const createForceSummarizationViewModel = (
  dependencies: ForceSummarizationViewModelDependencies
) => {
  const { forceSummarizationUseCase } = dependencies;

  return create<ForceSummarizationState>((set, get) => ({
    // Initial state
    isLoading: false,
    error: null,
    isSuccess: false,

    // Actions
    forceSummarization: async (request: ForceSummarizationRequest) => {
      set({ isLoading: true, error: null, isSuccess: false });

      try {
        const dateOnly = DateOnly.fromDate(request.date);

        const useCaseRequest = {
          type: request.type,
          date: dateOnly,
        };

        const result = await forceSummarizationUseCase.execute(useCaseRequest);

        if (result.isSuccess()) {
          set({ isSuccess: true });
        } else {
          set({ error: result.error.message });
        }
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Произошла ошибка",
        });
      } finally {
        set({ isLoading: false });
      }
    },

    clearError: () => {
      set({ error: null });
    },

    reset: () => {
      set({ isLoading: false, error: null, isSuccess: false });
    },
  }));
};
