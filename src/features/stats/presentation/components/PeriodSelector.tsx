import React from "react";
import { Calendar, BarChart3, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StatsPeriod } from "../view-models/StatsViewModel";

interface PeriodSelectorProps {
  selectedPeriod: StatsPeriod;
  onPeriodChange: (period: StatsPeriod) => void;
}

export const PeriodSelector: React.FC<PeriodSelectorProps> = ({
  selectedPeriod,
  onPeriodChange,
}) => {
  const { t } = useTranslation();

  const periods: {
    value: StatsPeriod;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { value: "day", label: t("periods.day"), icon: Calendar },
    { value: "week", label: t("periods.week"), icon: BarChart3 },
    { value: "month", label: t("periods.month"), icon: TrendingUp },
  ];

  return (
    <div className="mb-6">
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
        {periods.map((period) => (
          <button
            key={period.value}
            onClick={() => onPeriodChange(period.value)}
            className={`
              flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all duration-200
              ${
                selectedPeriod === period.value
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }
            `}
          >
            <period.icon className="w-4 h-4 mr-2" />
            {period.label}
          </button>
        ))}
      </div>
    </div>
  );
};
