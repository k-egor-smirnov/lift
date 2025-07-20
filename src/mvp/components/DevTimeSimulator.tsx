import React, { useState } from 'react';
import { Clock, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DateOnly } from '../../shared/domain/value-objects/DateOnly';
import { useOnboardingViewModel } from '../../features/onboarding/presentation/view-models/OnboardingViewModel';
import { getService, tokens } from '../../shared/infrastructure/di';
import { DailySelectionRepository } from '../../shared/domain/repositories/DailySelectionRepository';

/**
 * Dev component for simulating time travel and day transitions
 * Allows developers to test daily modal behavior and task selection reset
 */
export const DevTimeSimulator: React.FC = () => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    return DateOnly.today().value;
  });
  const [originalDate, setOriginalDate] = useState<Date | null>(null);
  
  const { reset: resetOnboardingState } = useOnboardingViewModel();

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
  };

  const handleSimulateDay = async () => {
    try {
      // Store original date if not already stored
      if (!originalDate) {
        setOriginalDate(new Date());
      }

      // Parse the selected date and set it as system time
      const targetDate = new Date(selectedDate + 'T09:00:00');
      
      // Mock the system time using vi.setSystemTime (for testing) or Date.now
      // In a real app, this would need a more sophisticated time mocking solution
      if (typeof window !== 'undefined') {
        // Store the mocked date in localStorage for DateOnly.today() to use
        localStorage.setItem('__dev_mocked_date__', targetDate.toISOString());
        
        // Clear daily modal state for the new day
        const dateKey = targetDate.toISOString().split('T')[0];
        const modalKey = `dailyModal_shown_${dateKey}`;
        localStorage.removeItem(modalKey);
        
        // Clear today's task selection to simulate fresh day
        try {
          const dailySelectionRepository = getService<DailySelectionRepository>(tokens.DAILY_SELECTION_REPOSITORY_TOKEN);
          const today = DateOnly.today(); // This will use the mocked date
          await dailySelectionRepository.clearDay(today);
          console.log('Cleared daily task selection for:', today.value);
        } catch (error) {
          console.error('Failed to clear daily selection:', error);
        }
        
        // Reset onboarding state
        resetOnboardingState();
        
        // Force page reload to apply the new date
        window.location.reload();
      }
      
      console.log('Time simulated to:', targetDate.toISOString());
    } catch (error) {
      console.error('Failed to simulate time:', error);
    }
  };

  const handleResetTime = () => {
    try {
      // Remove mocked date
      localStorage.removeItem('__dev_mocked_date__');
      
      // Reset onboarding state
      resetOnboardingState();
      
      // Clear original date
      setOriginalDate(null);
      
      // Reset to today
      setSelectedDate(DateOnly.today().value);
      
      // Force page reload to apply the reset
      window.location.reload();
      
      console.log('Time reset to current date');
    } catch (error) {
      console.error('Failed to reset time:', error);
    }
  };

  const handleNextDay = () => {
    const currentDate = DateOnly.fromString(selectedDate);
    const nextDay = currentDate.addDays(1);
    setSelectedDate(nextDay.value);
  };

  const handlePreviousDay = () => {
    const currentDate = DateOnly.fromString(selectedDate);
    const previousDay = currentDate.addDays(-1);
    setSelectedDate(previousDay.value);
  };

  const isTimeSimulated = originalDate !== null || localStorage.getItem('__dev_mocked_date__');

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-4 bg-purple-600 hover:bg-purple-700 text-white p-3 rounded-full shadow-lg transition-colors z-50"
        title={t('devTimeSimulator.openTitle')}
      >
        <Clock className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 bg-white border border-gray-200 rounded-lg shadow-xl p-4 z-50 w-80">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{t('devTimeSimulator.title')}</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        {/* Status */}
        <div className="text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-600">{t('devTimeSimulator.currentDate')}:</span>
            <span className="font-medium">
              {DateOnly.today().value}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{t('devTimeSimulator.timeSimulated')}:</span>
            <span className={isTimeSimulated ? 'text-purple-600 font-medium' : 'text-gray-400'}>
              {isTimeSimulated ? t('devTimeSimulator.yes') : t('devTimeSimulator.no')}
            </span>
          </div>
        </div>

        {/* Date Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('devTimeSimulator.targetDate')}:
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePreviousDay}
              className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
              title={t('devTimeSimulator.previousDay')}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              onClick={handleNextDay}
              className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
              title={t('devTimeSimulator.nextDay')}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={handleSimulateDay}
            className="w-full px-3 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors"
          >
            {t('devTimeSimulator.simulateDay')}
          </button>
          
          {isTimeSimulated && (
            <button
              onClick={handleResetTime}
              className="w-full px-3 py-2 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors"
            >
              {t('devTimeSimulator.resetToCurrentTime')}
            </button>
          )}
        </div>

        <div className="text-xs text-gray-500 bg-purple-50 p-2 rounded">
          <strong>{t('devTimeSimulator.devMode')}:</strong> {t('devTimeSimulator.description')}
        </div>
      </div>
    </div>
  );
};