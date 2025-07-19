import React from 'react';
import { StatsPeriod } from '../view-models/StatsViewModel';

interface PeriodSelectorProps {
  selectedPeriod: StatsPeriod;
  onPeriodChange: (period: StatsPeriod) => void;
}

export const PeriodSelector: React.FC<PeriodSelectorProps> = ({
  selectedPeriod,
  onPeriodChange
}) => {
  const periods: { value: StatsPeriod; label: string; icon: string }[] = [
    { value: 'day', label: 'Day', icon: '📅' },
    { value: 'week', label: 'Week', icon: '📊' },
    { value: 'month', label: 'Month', icon: '📈' }
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
              ${selectedPeriod === period.value
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }
            `}
          >
            <span className="mr-2">{period.icon}</span>
            {period.label}
          </button>
        ))}
      </div>
    </div>
  );
};