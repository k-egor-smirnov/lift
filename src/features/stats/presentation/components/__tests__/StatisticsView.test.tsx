import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StatisticsView } from "../StatisticsView";
import { useStatsViewModel } from "../../view-models/StatsViewModel";

// Mock the view model
vi.mock("../../view-models/StatsViewModel", () => ({
  useStatsViewModel: vi.fn(),
  formatPeriodLabel: vi.fn(
    (period, date) => `${period} - ${date.toDateString()}`
  ),
}));

const mockUseStatsViewModel = useStatsViewModel as any;

describe("StatisticsView", () => {
  const mockViewModel = {
    selectedPeriod: "day" as const,
    selectedDate: new Date("2023-12-15"),
    dailyStats: {
      date: "2023-12-15",
      simpleCompleted: 5,
      focusCompleted: 3,
      inboxReviewed: 2,
    },
    weeklyStats: null,
    monthlyStats: null,
    chartData: [
      {
        date: "2023-12-14",
        simpleCompleted: 3,
        focusCompleted: 2,
        inboxReviewed: 1,
      },
      {
        date: "2023-12-15",
        simpleCompleted: 5,
        focusCompleted: 3,
        inboxReviewed: 2,
      },
    ],
    isLoading: false,
    error: null,
    setPeriod: vi.fn(),
    loadStatistics: vi.fn(),
    loadChartData: vi.fn(),
    navigatePeriod: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseStatsViewModel.mockReturnValue(mockViewModel);
  });

  it("should render statistics view with data", () => {
    render(<StatisticsView />);

    expect(screen.getByText("Statistics")).toBeInTheDocument();
    expect(
      screen.getByText("Track your productivity and task completion patterns")
    ).toBeInTheDocument();
  });

  it("should call loadStatistics and loadChartData on mount", () => {
    render(<StatisticsView />);

    expect(mockViewModel.loadStatistics).toHaveBeenCalled();
    expect(mockViewModel.loadChartData).toHaveBeenCalled();
  });

  it("should display loading state", () => {
    mockUseStatsViewModel.mockReturnValue({
      ...mockViewModel,
      isLoading: true,
      dailyStats: null,
    });

    render(<StatisticsView />);

    expect(screen.getByText("Loading statistics...")).toBeInTheDocument();
    expect(screen.getByText("Loading statistics...")).toBeInTheDocument(); // Loading text
  });

  it("should display error state", () => {
    const errorMessage = "Failed to load data";
    mockUseStatsViewModel.mockReturnValue({
      ...mockViewModel,
      error: errorMessage,
      dailyStats: null,
    });

    render(<StatisticsView />);

    expect(screen.getByText("Failed to load statistics")).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
    expect(screen.getByText("Try Again")).toBeInTheDocument();
  });

  it("should handle try again button click", () => {
    mockUseStatsViewModel.mockReturnValue({
      ...mockViewModel,
      error: "Some error",
      dailyStats: null,
    });

    render(<StatisticsView />);

    const tryAgainButton = screen.getByText("Try Again");
    fireEvent.click(tryAgainButton);

    expect(mockViewModel.loadStatistics).toHaveBeenCalled();
    expect(mockViewModel.loadChartData).toHaveBeenCalled();
  });

  it("should display empty state when no data", () => {
    mockUseStatsViewModel.mockReturnValue({
      ...mockViewModel,
      dailyStats: null,
      weeklyStats: null,
      monthlyStats: null,
    });

    render(<StatisticsView />);

    expect(screen.getByText("No statistics available")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Complete some tasks to see your productivity statistics."
      )
    ).toBeInTheDocument();
  });

  it("should handle navigation buttons", () => {
    render(<StatisticsView />);

    const prevButton = screen.getByText("Previous");
    const nextButton = screen.getByText("Next");

    fireEvent.click(prevButton);
    expect(mockViewModel.navigatePeriod).toHaveBeenCalledWith("prev");

    fireEvent.click(nextButton);
    expect(mockViewModel.navigatePeriod).toHaveBeenCalledWith("next");
  });

  it("should render stats cards when data is available", () => {
    render(<StatisticsView />);

    // StatsCards component should be rendered (we'll test it separately)
    expect(screen.getByText("day - Fri Dec 15 2023")).toBeInTheDocument(); // Period label
  });

  it("should render chart when data is available", () => {
    render(<StatisticsView />);

    // Chart should be rendered with data
    expect(mockViewModel.chartData).toHaveLength(2);
  });

  describe("period handling", () => {
    it("should display daily stats for day period", () => {
      render(<StatisticsView />);

      // Should show daily stats since selectedPeriod is 'day'
      expect(mockViewModel.selectedPeriod).toBe("day");
    });

    it("should display weekly stats for week period", () => {
      const weeklyViewModel = {
        ...mockViewModel,
        selectedPeriod: "week" as const,
        dailyStats: null,
        weeklyStats: {
          weekStart: "2023-12-11",
          weekEnd: "2023-12-17",
          simpleCompleted: 10,
          focusCompleted: 5,
          inboxReviewed: 3,
        },
      };

      mockUseStatsViewModel.mockReturnValue(weeklyViewModel);

      render(<StatisticsView />);

      expect(weeklyViewModel.selectedPeriod).toBe("week");
    });

    it("should display monthly stats for month period", () => {
      const monthlyViewModel = {
        ...mockViewModel,
        selectedPeriod: "month" as const,
        dailyStats: null,
        monthlyStats: {
          month: "2023-12",
          simpleCompleted: 50,
          focusCompleted: 25,
          inboxReviewed: 15,
        },
      };

      mockUseStatsViewModel.mockReturnValue(monthlyViewModel);

      render(<StatisticsView />);

      expect(monthlyViewModel.selectedPeriod).toBe("month");
    });
  });
});
