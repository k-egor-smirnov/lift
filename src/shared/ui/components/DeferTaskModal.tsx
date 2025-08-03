import React, { useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { Task } from "../../domain/entities/Task";
import { TaskId } from "../../domain/value-objects/TaskId";

interface DeferTaskModalProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  onDefer: (taskId: TaskId, deferredUntil: Date) => Promise<void>;
}

export const DeferTaskModal: React.FC<DeferTaskModalProps> = ({
  task,
  isOpen,
  onClose,
  onDefer,
}) => {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleDefer = async () => {
    if (!selectedDate) return;

    setIsLoading(true);
    try {
      await onDefer(task.id, selectedDate);
      onClose();
    } catch (error) {
      console.error("Failed to defer task:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getPresetDate = (days: number): Date => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  };

  const getNextWeekStart = (): Date => {
    const date = new Date();
    const dayOfWeek = date.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    date.setDate(date.getDate() + daysUntilMonday);
    return date;
  };

  const presets = [
    { label: "Через день", date: getPresetDate(1) },
    { label: "Через 2 дня", date: getPresetDate(2) },
    { label: "В начале недели", date: getNextWeekStart() },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 max-w-full mx-4">
        <h2 className="text-xl font-semibold mb-4">Отложить задачу</h2>

        <div className="mb-4">
          <p className="text-gray-600 mb-2">Задача: {task.title.value}</p>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Выберите дату:
          </label>
          <DatePicker
            selected={selectedDate}
            onChange={(date) => setSelectedDate(date)}
            minDate={new Date()}
            dateFormat="dd.MM.yyyy"
            placeholderText="Выберите дату"
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            locale="ru"
          />
        </div>

        <div className="mb-6">
          <p className="text-sm font-medium text-gray-700 mb-2">
            Быстрый выбор:
          </p>
          <div className="flex flex-wrap gap-2">
            {presets.map((preset, index) => (
              <button
                key={index}
                onClick={() => setSelectedDate(preset.date)}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleDefer}
            disabled={!selectedDate || isLoading}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? "Откладываю..." : "Отложить"}
          </button>
        </div>
      </div>
    </div>
  );
};
