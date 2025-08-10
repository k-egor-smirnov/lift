import React, { useState, useEffect } from "react";
import { createForceSummarizationViewModel } from "../view-models/ForceSummarizationViewModel";
import { SummaryType } from "../../../../shared/domain/entities/Summary";
import { getService, tokens } from "../../../../shared/infrastructure/di";

interface ForceSummarizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ForceSummarizationModal: React.FC<
  ForceSummarizationModalProps
> = ({ isOpen, onClose, onSuccess }) => {
  // Create view model with dependencies
  const viewModel = createForceSummarizationViewModel({
    forceSummarizationUseCase: getService(
      tokens.FORCE_SUMMARIZATION_USE_CASE_TOKEN
    ),
  })();

  const { isLoading, error, isSuccess, forceSummarization, clearError, reset } =
    viewModel;

  const [summaryType, setSummaryType] = useState<SummaryType>("DAILY");
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  useEffect(() => {
    if (isSuccess) {
      onSuccess?.();
      onClose();
      reset();
    }
  }, [isSuccess, onSuccess, onClose]); // Убираем reset из зависимостей

  useEffect(() => {
    if (!isOpen) {
      clearError();
      reset();
    }
  }, [isOpen]); // Убираем clearError и reset из зависимостей, чтобы избежать бесконечного цикла

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await forceSummarization({
        type: summaryType,
        date: new Date(selectedDate),
      });

      if (isSuccess) {
        onSuccess?.();
        onClose();
      }
    } catch (error) {
      console.error("Error during force summarization:", error);
    }
  };

  const getDateInputType = () => {
    switch (summaryType) {
      case "DAILY": {
        return "date";
      }
      case "WEEKLY": {
        return "week";
      }
      case "MONTHLY": {
        return "month";
      }
      default: {
        return "date";
      }
    }
  };

  const getDateLabel = () => {
    switch (summaryType) {
      case "DAILY": {
        return "Дата";
      }
      case "WEEKLY": {
        return "Неделя";
      }
      case "MONTHLY": {
        return "Месяц";
      }
      default: {
        return "Дата";
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Принудительная генерация суммаризации
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={isLoading}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Тип суммаризации
            </label>
            <select
              value={summaryType}
              onChange={(e) => setSummaryType(e.target.value as SummaryType)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            >
              <option value="DAILY">Дневная</option>
              <option value="WEEKLY">Недельная</option>
              <option value="MONTHLY">Месячная</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {getDateLabel()}
            </label>
            <input
              type={getDateInputType()}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
              required
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">
              {error}
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
              disabled={isLoading}
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
              disabled={isLoading}
            >
              {isLoading && (
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              )}
              {isLoading ? "Генерация..." : "Сгенерировать"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
