import React from "react";
import { useTranslation } from "react-i18next";

interface TaskDeferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeferConfirm: (deferDate: Date) => void;
}

export const TaskDeferModal: React.FC<TaskDeferModalProps> = ({
  isOpen,
  onClose,
  onDeferConfirm,
}) => {
  const { t } = useTranslation();

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-80 max-w-sm mx-4">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          {t("taskCard.deferTask")}
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Выберите дату, на которую отложить задачу:
        </p>
        <div className="space-y-3">
          <button
            onClick={() => {
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              onDeferConfirm(tomorrow);
            }}
            className="w-full p-3 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="font-medium">Завтра</div>
            <div className="text-sm text-gray-500">
              {new Date(
                Date.now() + 24 * 60 * 60 * 1000
              ).toLocaleDateString()}
            </div>
          </button>
          <button
            onClick={() => {
              const nextWeek = new Date();
              nextWeek.setDate(nextWeek.getDate() + 7);
              onDeferConfirm(nextWeek);
            }}
            className="w-full p-3 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="font-medium">Через неделю</div>
            <div className="text-sm text-gray-500">
              {new Date(
                Date.now() + 7 * 24 * 60 * 60 * 1000
              ).toLocaleDateString()}
            </div>
          </button>
          <button
            onClick={() => {
              const nextMonth = new Date();
              nextMonth.setMonth(nextMonth.getMonth() + 1);
              onDeferConfirm(nextMonth);
            }}
            className="w-full p-3 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="font-medium">Через месяц</div>
            <div className="text-sm text-gray-500">
              {new Date(
                Date.now() + 30 * 24 * 60 * 60 * 1000
              ).toLocaleDateString()}
            </div>
          </button>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
};