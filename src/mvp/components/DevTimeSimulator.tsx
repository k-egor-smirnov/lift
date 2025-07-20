import React, { useState } from 'react';
import { DateOnly } from '../../shared/domain/value-objects/DateOnly';
import { useOnboardingViewModel } from '../../features/onboarding/presentation/view-models/OnboardingViewModel';
import { getService, tokens } from '../../shared/infrastructure/di';
import { DailySelectionRepository } from '../../shared/domain/repositories/DailySelectionRepository';

/**
 * Dev component for simulating time travel and day transitions
 * Allows developers to test daily modal behavior and task selection reset
 */
export const DevTimeSimulator: React.FC = () => {
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
          console.log('🗑️ Cleared daily task selection for:', today.value);
        } catch (error) {
          console.error('Failed to clear daily selection:', error);
        }
        
        // Reset onboarding state
        resetOnboardingState();
        
        // Force page reload to apply the new date
        window.location.reload();
      }
      
      console.log('🕐 Time simulated to:', targetDate.toISOString());
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
      
      console.log('🕐 Time reset to current date');
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
        title="Open Time Simulator (Dev Mode)"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 bg-white border border-gray-200 rounded-lg shadow-xl p-4 z-50 w-80">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">🕐 Time Simulator</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-4">
        {/* Status */}
        <div className="text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-600">Current Date:</span>
            <span className="font-medium">
              {DateOnly.today().value}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Time Simulated:</span>
            <span className={isTimeSimulated ? 'text-purple-600 font-medium' : 'text-gray-400'}>
              {isTimeSimulated ? 'Yes' : 'No'}
            </span>
          </div>
        </div>

        {/* Date Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Target Date:
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePreviousDay}
              className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
              title="Previous Day"
            >
              ←
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
              title="Next Day"
            >
              →
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={handleSimulateDay}
            className="w-full px-3 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors"
          >
            Simulate Day
          </button>
          
          {isTimeSimulated && (
            <button
              onClick={handleResetTime}
              className="w-full px-3 py-2 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors"
            >
              Reset to Current Time
            </button>
          )}
        </div>

        <div className="text-xs text-gray-500 bg-purple-50 p-2 rounded">
          <strong>Dev Mode:</strong> This simulates time travel to test daily transitions. 
          It will reset daily modal state and reload the page to apply changes.
        </div>
      </div>
    </div>
  );
};