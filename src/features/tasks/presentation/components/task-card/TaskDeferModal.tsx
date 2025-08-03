import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "../../../../../shared/ui/calendar";
import { Button } from "../../../../../shared/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../../../shared/ui/popover";
import { cn } from "../../../../../shared/lib/utils";

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
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();

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

        {/* Календарь */}
        <div className="mb-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !selectedDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? (
                  format(selectedDate, "PPP")
                ) : (
                  <span>Выберите дату</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                disabled={(date) => date < new Date()}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Пресеты */}
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-2">Быстрый выбор:</p>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                setSelectedDate(tomorrow);
              }}
              className="text-xs"
            >
              Завтра
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const nextWeek = new Date();
                nextWeek.setDate(nextWeek.getDate() + 7);
                setSelectedDate(nextWeek);
              }}
              className="text-xs"
            >
              Через неделю
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const nextMonth = new Date();
                nextMonth.setMonth(nextMonth.getMonth() + 1);
                setSelectedDate(nextMonth);
              }}
              className="text-xs"
            >
              Через месяц
            </Button>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button
            onClick={() => {
              if (selectedDate) {
                onDeferConfirm(selectedDate);
              }
            }}
            disabled={!selectedDate}
          >
            Отложить
          </Button>
        </div>
      </div>
    </div>
  );
};
