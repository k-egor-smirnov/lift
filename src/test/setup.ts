import 'reflect-metadata'
import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { vi } from 'vitest'

// Use a fixed system time for deterministic tests
vi.useFakeTimers()
vi.setSystemTime(new Date('2023-12-01T12:00:00Z'))

// Provide a lightweight mock for DateOnly that preserves the class behaviour
vi.mock('../shared/domain/value-objects/DateOnly', async () => {
  const actual = await vi.importActual<typeof import('../shared/domain/value-objects/DateOnly')>(
    '../shared/domain/value-objects/DateOnly'
  )

  const { DateOnly: ActualDateOnly } = actual

  class MockDateOnly extends ActualDateOnly {
    static override today(): any {
      return ActualDateOnly.fromDate(new Date(Date.now()))
    }

    static override yesterday(): any {
      return this.today().subtractDays(1)
    }

    static override getCurrentDate(): Date {
      return new Date(Date.now())
    }
  }

  return { ...actual, DateOnly: MockDateOnly }
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