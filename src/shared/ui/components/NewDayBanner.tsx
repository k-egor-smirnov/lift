import React from 'react';
import { Button } from '../button';

interface NewDayBannerProps {
  /** Whether the banner is visible */
  isVisible: boolean;
  /** Callback when "Start Day" button is clicked */
  onStartDay: () => void;
  /** Callback when "Restore" button is clicked */
  onRestore?: () => void;
  /** Whether restore option is available */
  isRestoreAvailable?: boolean;
  /** Callback when banner is dismissed */
  onDismiss?: () => void;
  /** Custom CSS classes */
  className?: string;
}

/**
 * Banner component that appears after day reset to prompt user to start the day
 * Implements the "Новый день..." banner functionality
 */
export const NewDayBanner: React.FC<NewDayBannerProps> = ({
  isVisible,
  onStartDay,
  onRestore,
  isRestoreAvailable = false,
  onDismiss,
  className = ''
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    <div className={`new-day-banner ${className}`}>
      <div className="new-day-banner__content">
        <div className="new-day-banner__message">
          <span className="new-day-banner__icon">🌅</span>
          <span className="new-day-banner__text">
            Новый день! Время выбрать задачи на сегодня.
          </span>
        </div>
        
        <div className="new-day-banner__actions">
          <Button
            variant="primary"
            size="sm"
            onClick={onStartDay}
            className="new-day-banner__start-button"
          >
            Начать день
          </Button>
          
          {isRestoreAvailable && onRestore && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRestore}
              className="new-day-banner__restore-button"
            >
              Вернуть как было
            </Button>
          )}
          
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="new-day-banner__dismiss-button"
              aria-label="Закрыть баннер"
            >
              ✕
            </Button>
          )}
        </div>
      </div>
      
      <style jsx>{`
        .new-day-banner {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          animation: slideIn 0.3s ease-out;
        }
        
        .new-day-banner__content {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        
        .new-day-banner__message {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
        }
        
        .new-day-banner__icon {
          font-size: 20px;
        }
        
        .new-day-banner__text {
          font-weight: 500;
          font-size: 14px;
        }
        
        .new-day-banner__actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .new-day-banner__start-button {
          background: rgba(255, 255, 255, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.3);
          color: white;
          font-weight: 500;
        }
        
        .new-day-banner__start-button:hover {
          background: rgba(255, 255, 255, 0.3);
          border-color: rgba(255, 255, 255, 0.4);
        }
        
        .new-day-banner__restore-button {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.3);
          color: white;
        }
        
        .new-day-banner__restore-button:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.4);
        }
        
        .new-day-banner__dismiss-button {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.8);
          padding: 4px 8px;
          min-width: auto;
        }
        
        .new-day-banner__dismiss-button:hover {
          background: rgba(255, 255, 255, 0.1);
          color: white;
        }
        
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @media (max-width: 640px) {
          .new-day-banner__content {
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
          }
          
          .new-day-banner__actions {
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
};

export default NewDayBanner;