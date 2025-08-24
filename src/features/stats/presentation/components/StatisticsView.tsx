import React, { useEffect } from "react";
import {
  useStatsViewModel,
  formatPeriodLabel,
} from "../view-models/StatsViewModel";
import { StatsCards } from "./StatsCards";
import { StatsChart } from "./StatsChart";
import { PeriodSelector } from "./PeriodSelector";

export const StatisticsView: React.FC = () => {
  const {
    selectedPeriod,
    selectedDate,
    dailyStats,
    weeklyStats,
    monthlyStats,
    chartData,
    isLoading,
    error,
    setPeriod,
    loadStatistics,
    loadChartData,
    navigatePeriod,
  } = useStatsViewModel();

  useEffect(() => {
    loadStatistics();
    loadChartData();
  }, []);

  const getCurrentStats = () => {
    switch (selectedPeriod) {
      case "day":
        return dailyStats;
      case "week":
        return weeklyStats;
      case "month":
        return monthlyStats;
      default:
        return null;
    }
  };

  const currentStats = getCurrentStats();

  if (error) {
    return (
      <div className="p-6 text-center">
        <div className="text-red-600 mb-4">
          <svg
            className="w-12 h-12 mx-auto mb-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <p className="text-lg font-medium">Failed to load statistics</p>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
        <button
          onClick={() => {
            loadStatistics();
            loadChartData();
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Statistics</h1>
        <p className="text-gray-600">
          Track your productivity and task completion patterns
        </p>
      </div>

      {/* Period Selector */}
      <PeriodSelector
        selectedPeriod={selectedPeriod}
        onPeriodChange={setPeriod}
      />

      {/* Navigation */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={() => navigatePeriod("prev")}
          className="flex items-center px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg
            className="w-5 h-5 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Previous
        </button>

        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">
            {formatPeriodLabel(selectedPeriod, selectedDate)}
          </h2>
        </div>

        <button
          onClick={() => navigatePeriod("next")}
          className="flex items-center px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          Next
          <svg
            className="w-5 h-5 ml-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading statistics...</span>
        </div>
      )}

      {/* Statistics Content */}
      {!isLoading && currentStats && (
        <div className="space-y-8">
          {/* Stats Cards */}
          <StatsCards stats={currentStats} period={selectedPeriod} />

          {/* Chart */}
          <StatsChart data={chartData} period={selectedPeriod} />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !currentStats && (
        <div className="text-center py-12">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No statistics available
          </h3>
          <p className="text-gray-600">
            Complete some tasks to see your productivity statistics.
          </p>
        </div>
      )}
    </div>
  );
};
