import 'reflect-metadata'
import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { vi } from 'vitest'

// Mock DateOnly
vi.mock('../shared/domain/value-objects/DateOnly', () => {
  const mockDate = new Date('2023-12-01T12:00:00Z');
  const mockDateString = '2023-12-01';
  const mockYesterdayString = '2023-11-30';
  
  // Mock Date.now to return fixed timestamp
  const originalDateNow = Date.now;
  Date.now = () => new Date('2023-12-01T12:00:00Z').getTime();
  
  // Store original Date for cleanup
  const originalDate = global.Date;
  
  return {
    DateOnly: {
      today: () => ({
        value: mockDateString,
        daysDifference: (other: any) => {
          const thisDate = new Date(mockDateString);
          const otherDate = new Date(other.value || other);
          const diffTime = Math.abs(otherDate.getTime() - thisDate.getTime());
          const days = diffTime / (1000 * 60 * 60 * 24);
          return days === 0 ? 0 : Math.ceil(days);
        },
      }),
      yesterday: () => ({
        value: mockYesterdayString,
        daysDifference: (other: any) => {
          const thisDate = new Date(mockYesterdayString);
          const otherDate = new Date(other.value || other);
          const diffTime = Math.abs(otherDate.getTime() - thisDate.getTime());
          const days = diffTime / (1000 * 60 * 60 * 24);
          return days === 0 ? 0 : Math.ceil(days);
        },
      }),
      getCurrentDate: () => mockDate,
      fromDate: (date: Date) => {
        // Use local date formatting to avoid timezone issues
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const localDateString = `${year}-${month}-${day}`;
        
        return {
          value: localDateString,
          daysDifference: (other: any) => {
            const thisDate = new Date(localDateString);
            const otherDate = new Date(other.value || other);
            const diffTime = Math.abs(otherDate.getTime() - thisDate.getTime());
            const days = diffTime / (1000 * 60 * 60 * 24);
            return days === 0 ? 0 : Math.ceil(days);
          },
        };
      },
      fromString: (dateString: string) => ({
        value: dateString,
        daysDifference: (other: any) => {
          const thisDate = new Date(dateString);
          const otherDate = new Date(other.value || other);
          const diffTime = Math.abs(otherDate.getTime() - thisDate.getTime());
          const days = diffTime / (1000 * 60 * 60 * 24);
          return days === 0 ? 0 : Math.ceil(days);
        },
      }),
    },
  };
})

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      // Simple key-to-text mapping for tests
      const translations: Record<string, string> = {
        // Categories
        'categories.simple': 'Simple',
        'categories.focus': 'Focus', 
        'categories.inbox': 'Inbox',
        'categories.deferred': 'Deferred',
        
        // TaskCard translations
        'taskCard.justNow': 'Just now',
        'taskCard.justNowShort': 'Just now',
        'taskCard.touchHelp': 'Touch help',
        'taskCard.overdue': '⚠️ Overdue',
        'taskCard.save': 'Save',
        'taskCard.cancel': 'Cancel',
        'taskCard.removeFromToday': 'Remove from Today',
        'taskCard.addToToday': 'Add to Today',
        'taskCard.removeTaskFromToday': 'Remove task from today',
        'taskCard.addTaskToToday': 'Add task to today',
        'taskCard.taskActions': 'Task actions',
        'taskCard.completeTask': '✅ Complete',
        'taskCard.revertTask': '↩️ Revert',
        'taskCard.moreActions': 'More actions',
        'taskCard.deferTask': 'Defer Task',
        'taskCard.deleteTask': 'Delete Task',
        'taskCard.lastLog': 'Last log',
        'taskCard.noLogsYet': 'No logs yet',
        'taskCard.logHistory': 'Log History',
        'taskCard.hideLogHistory': 'Hide',
        'taskCard.addNewLogPlaceholder': 'Add new log...',
        'taskCard.saveLog': 'Save log',
        'taskCard.loadingLogs': 'Loading logs...',
        'taskCard.taskLogEntries': 'Task log entries',
        'taskCard.noLogsFound': 'No logs found',
        'taskCard.editTask': 'Edit Task',
        'taskCard.markTaskAsComplete': 'Mark task as complete',
        'taskCard.showLogHistory': 'Show Log History',
        'taskCard.addLog': 'Add Log',
        'taskCard.addFirstLog': 'Add First Log',
        
        // Time formatting
        'taskCard.minutesAgo': `${options?.count || 0}m ago`,
        'taskCard.hoursAgo': `${options?.count || 0}h ago`,
        'taskCard.daysAgo': `${options?.count || 0}d ago`,
        
        // Navigation translations
        'navigation.today': 'Today',
        
        // TodayView translations
        'todayView.title': 'Today',
        'todayView.noTasksSelected': 'No tasks selected for today',
        'todayView.startByAdding': 'Start by adding tasks to your daily selection',
        'todayView.tip': 'Tip',
        'todayView.dailySelectionResets': 'Your daily selection resets every day',
        'todayView.completedTasks': 'Completed Tasks',
        'todayView.progress': 'Progress',
        'todayView.complete': 'complete',
        
        // Common translations
        'common.today': 'Today',
        'common.loading': 'Loading...',
        'common.error': 'Error',
        'common.cancel': 'Cancel',
        'common.save': 'Save',
      }
      
      return translations[key] || key
    },
    i18n: {
      changeLanguage: vi.fn(),
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
}))