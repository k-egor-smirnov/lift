import React, { useState } from 'react';
import { useOnboardingViewModel } from '../../features/onboarding/presentation/view-models/OnboardingViewModel';

export const DevDailyModalSimulator: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [overdueDays, setOverdueDays] = useState(3);
  
  const {
    isModalVisible,
    modalShownToday,
    loadDailyModalData,
    showDailyModal,
    hideDailyModal,
    reset
  } = useOnboardingViewModel();

  const handleShowModal = async () => {
    try {
      await loadDailyModalData(overdueDays);
      showDailyModal();
      console.log('🧪 Daily modal simulated with', overdueDays, 'overdue days');
    } catch (error) {
      console.error('Failed to simulate daily modal:', error);
    }
  };

  const handleResetModalState = () => {
    // Clear localStorage flag for today
    const today = new Date().toISOString().split('T')[0];
    const key = `dailyModal_shown_${today}`;
    localStorage.removeItem(key);
    
    // Reset view model state
    reset();
    
    console.log('🧪 Daily modal state reset - can show again today');
  };

  const handleForceHide = () => {
    hideDailyModal();
    console.log('🧪 Daily modal force hidden');
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-colors z-50"
        title="Open Daily Modal Simulator (Dev Mode)"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.959 8.959 0 01-4.906-1.476L3 21l2.476-5.094A8.959 8.959 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white border border-gray-200 rounded-lg shadow-xl p-4 z-50 w-80">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">🧪 Daily Modal Simulator</h3>
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
            <span className="text-gray-600">Modal Visible:</span>
            <span className={isModalVisible ? 'text-green-600 font-medium' : 'text-gray-400'}>
              {isModalVisible ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Shown Today:</span>
            <span className={modalShownToday ? 'text-orange-600 font-medium' : 'text-gray-400'}>
              {modalShownToday ? 'Yes' : 'No'}
            </span>
          </div>
        </div>

        {/* Overdue Days Setting */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Overdue Days Threshold:
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="30"
              value={overdueDays}
              onChange={(e) => setOverdueDays(parseInt(e.target.value) || 3)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-500">days</span>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={handleShowModal}
            className="w-full px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
          >
            Show Daily Modal
          </button>
          
          {isModalVisible && (
            <button
              onClick={handleForceHide}
              className="w-full px-3 py-2 text-sm bg-orange-600 hover:bg-orange-700 text-white rounded-md transition-colors"
            >
              Force Hide Modal
            </button>
          )}
          
          <button
            onClick={handleResetModalState}
            className="w-full px-3 py-2 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors"
          >
            Reset Modal State
          </button>
        </div>

        <div className="text-xs text-gray-500 bg-blue-50 p-2 rounded">
          <strong>Dev Mode:</strong> This simulates the daily modal that appears when starting a new day. 
          Use "Reset Modal State" to allow showing the modal again today.
        </div>
      </div>
    </div>
  );
};