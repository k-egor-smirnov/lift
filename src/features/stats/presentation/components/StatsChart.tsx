import React from 'react';
import { DailyStatistics } from '../../application/services/StatisticsService';
import { StatsPeriod } from '../view-models/StatsViewModel';

interface StatsChartProps {
  data: DailyStatistics[];
  period: StatsPeriod;
}

export const StatsChart: React.FC<StatsChartProps> = ({ data, period }) => {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Productivity Trend</h3>
        <div className="text-center py-8 text-gray-500">
          No data available for chart
        </div>
      </div>
    );
  }

  const maxValue = Math.max(
    ...data.map(d => d.simpleCompleted + d.focusCompleted + d.inboxReviewed),
    1
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    switch (period) {
      case 'day':
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      case 'week':
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      case 'month':
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      default:
        return dateString;
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Productivity Trend</h3>
        <div className="flex items-center space-x-4 text-sm">
          <div className="flex items-center">
            <div className="w-3 h-3 bg-blue-500 rounded mr-2"></div>
            <span className="text-gray-600">Simple</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-purple-500 rounded mr-2"></div>
            <span className="text-gray-600">Focus</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-orange-500 rounded mr-2"></div>
            <span className="text-gray-600">Reviewed</span>
          </div>
        </div>
      </div>

      <div className="relative">
        {/* Chart container */}
        <div className="flex items-end justify-between h-64 space-x-1">
          {data.map((item, index) => {
            const total = item.simpleCompleted + item.focusCompleted + item.inboxReviewed;
            const height = total > 0 ? (total / maxValue) * 100 : 0;
            
            return (
              <div key={index} className="flex-1 flex flex-col items-center group">
                {/* Bar */}
                <div className="relative w-full max-w-12 mb-2">
                  <div
                    className="w-full bg-gray-100 rounded-t transition-all duration-300 group-hover:opacity-80"
                    style={{ height: `${Math.max(height, 2)}%` }}
                  >
                    {/* Stacked bars */}
                    <div className="relative h-full">
                      {/* Simple tasks (bottom) */}
                      {item.simpleCompleted > 0 && (
                        <div
                          className="absolute bottom-0 w-full bg-blue-500 rounded-t"
                          style={{
                            height: `${(item.simpleCompleted / total) * 100}%`
                          }}
                        />
                      )}
                      
                      {/* Focus tasks (middle) */}
                      {item.focusCompleted > 0 && (
                        <div
                          className="absolute w-full bg-purple-500"
                          style={{
                            bottom: `${(item.simpleCompleted / total) * 100}%`,
                            height: `${(item.focusCompleted / total) * 100}%`
                          }}
                        />
                      )}
                      
                      {/* Inbox reviewed (top) */}
                      {item.inboxReviewed > 0 && (
                        <div
                          className="absolute top-0 w-full bg-orange-500 rounded-t"
                          style={{
                            height: `${(item.inboxReviewed / total) * 100}%`
                          }}
                        />
                      )}
                    </div>
                  </div>
                  
                  {/* Tooltip on hover */}
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10">
                    <div>Simple: {item.simpleCompleted}</div>
                    <div>Focus: {item.focusCompleted}</div>
                    <div>Reviewed: {item.inboxReviewed}</div>
                    <div className="font-semibold">Total: {total}</div>
                  </div>
                </div>
                
                {/* Date label */}
                <div className="text-xs text-gray-500 text-center transform -rotate-45 origin-center">
                  {formatDate(item.date)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 h-64 flex flex-col justify-between text-xs text-gray-500 -ml-8">
          <span>{maxValue}</span>
          <span>{Math.round(maxValue * 0.75)}</span>
          <span>{Math.round(maxValue * 0.5)}</span>
          <span>{Math.round(maxValue * 0.25)}</span>
          <span>0</span>
        </div>
      </div>

      {/* Summary */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-blue-600">
              {data.reduce((sum, item) => sum + item.simpleCompleted, 0)}
            </div>
            <div className="text-sm text-gray-600">Simple Tasks</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-purple-600">
              {data.reduce((sum, item) => sum + item.focusCompleted, 0)}
            </div>
            <div className="text-sm text-gray-600">Focus Tasks</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-orange-600">
              {data.reduce((sum, item) => sum + item.inboxReviewed, 0)}
            </div>
            <div className="text-sm text-gray-600">Inbox Reviewed</div>
          </div>
        </div>
      </div>
    </div>
  );
};