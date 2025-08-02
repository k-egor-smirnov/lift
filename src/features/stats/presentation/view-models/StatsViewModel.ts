import { create } from 'zustand';
import { StatisticsService, DailyStatistics, WeeklyStatistics, MonthlyStatistics } from '../../application/services/StatisticsService';
import { TodoDatabase } from '../../../../shared/infrastructure/database/TodoDatabase';
import { container, tokens } from '../../../../shared/infrastructure/di';

export type StatsPeriod = 'day' | 'week' | 'month';

export interface StatsState {
  // Current period selection
  selectedPeriod: StatsPeriod;
  selectedDate: Date;
  
  // Statistics data
  dailyStats: DailyStatistics | null;
  weeklyStats: WeeklyStatistics | null;
  monthlyStats: MonthlyStatistics | null;
  
  // Chart data for trends
  chartData: DailyStatistics[];
  
  // Loading states
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setPeriod: (period: StatsPeriod) => void;
  setDate: (date: Date) => void;
  loadStatistics: () => Promise<void>;
  loadChartData: () => Promise<void>;
  navigatePeriod: (direction: 'prev' | 'next') => void;
}

const database = container.resolve<TodoDatabase>(tokens.DATABASE_TOKEN);
const statisticsService = new StatisticsService(database);

export const useStatsViewModel = create<StatsState>((set, get) => ({
  // Initial state
  selectedPeriod: 'day',
  selectedDate: new Date(),
  dailyStats: null,
  weeklyStats: null,
  monthlyStats: null,
  chartData: [],
  isLoading: false,
  error: null,

  // Actions
  setPeriod: (period: StatsPeriod) => {
    set({ selectedPeriod: period });
    get().loadStatistics();
    get().loadChartData();
  },

  setDate: (date: Date) => {
    set({ selectedDate: date });
    get().loadStatistics();
    get().loadChartData();
  },

  loadStatistics: async () => {
    const { selectedPeriod, selectedDate } = get();
    set({ isLoading: true, error: null });

    try {
      switch (selectedPeriod) {
        case 'day':
          const dailyStats = await statisticsService.getDailyStatistics(selectedDate);
          set({ dailyStats });
          break;
        case 'week':
          const weeklyStats = await statisticsService.getWeeklyStatistics(selectedDate);
          set({ weeklyStats });
          break;
        case 'month':
          const monthlyStats = await statisticsService.getMonthlyStatistics(selectedDate);
          set({ monthlyStats });
          break;
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load statistics' });
    } finally {
      set({ isLoading: false });
    }
  },

  loadChartData: async () => {
    const { selectedPeriod, selectedDate } = get();
    
    try {
      let startDate: Date;
      let endDate: Date;

      switch (selectedPeriod) {
        case 'day':
          // Show last 7 days for daily view
          startDate = new Date(selectedDate);
          startDate.setDate(startDate.getDate() - 6);
          endDate = new Date(selectedDate);
          break;
        case 'week':
          // Show last 4 weeks for weekly view (as daily data)
          startDate = new Date(selectedDate);
          startDate.setDate(startDate.getDate() - 27); // 4 weeks = 28 days
          endDate = new Date(selectedDate);
          break;
        case 'month':
          // Show last 30 days for monthly view
          startDate = new Date(selectedDate);
          startDate.setDate(startDate.getDate() - 29);
          endDate = new Date(selectedDate);
          break;
      }

      const chartData = await statisticsService.getDailyStatisticsRange(startDate, endDate);
      set({ chartData });
    } catch (error) {
      console.error('Failed to load chart data:', error);
    }
  },

  navigatePeriod: (direction: 'prev' | 'next') => {
    const { selectedPeriod, selectedDate } = get();
    const newDate = new Date(selectedDate);
    const multiplier = direction === 'next' ? 1 : -1;

    switch (selectedPeriod) {
      case 'day':
        newDate.setDate(newDate.getDate() + multiplier);
        break;
      case 'week':
        newDate.setDate(newDate.getDate() + (7 * multiplier));
        break;
      case 'month':
        newDate.setMonth(newDate.getMonth() + multiplier);
        break;
    }

    get().setDate(newDate);
  }
}));

// Helper functions for formatting
export const formatPeriodLabel = (period: StatsPeriod, date: Date): string => {
  switch (period) {
    case 'day':
      return date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    case 'week':
      const weekStart = getWeekStart(date);
      const weekEnd = getWeekEnd(date);
      return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    case 'month':
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long' 
      });
  }
};

export const getWeekStart = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
};

export const getWeekEnd = (date: Date): Date => {
  const weekStart = getWeekStart(date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return weekEnd;
};