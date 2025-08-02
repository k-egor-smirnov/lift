import React from 'react';
import { useSync } from '../hooks/useSync';

interface SyncStatusIndicatorProps {
  /** Показывать ли детальную информацию */
  detailed?: boolean;
  /** CSS класс для кастомизации стилей */
  className?: string;
  /** Обработчик клика для ручной синхронизации */
  onManualSync?: () => void;
}

/**
 * Компонент для отображения статуса синхронизации
 * Показывает состояние подключения, синхронизации и ошибки
 */
export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({
  detailed = false,
  className = '',
  onManualSync
}) => {
  const { status, sync } = useSync();

  const handleManualSync = async () => {
    if (onManualSync) {
      onManualSync();
    } else {
      await sync();
    }
  };

  const getStatusColor = () => {
    if (status.error) return 'text-red-500';
    if (status.isSyncing) return 'text-blue-500';
    if (!status.isOnline) return 'text-gray-500';
    if (status.isRealtimeConnected) return 'text-green-500';
    return 'text-yellow-500';
  };

  const getStatusIcon = () => {
    if (status.isSyncing) {
      return (
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      );
    }

    if (status.error) {
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
      );
    }

    if (!status.isOnline) {
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M18.364 5.636l-12.728 12.728m0 0L12 12m-6.364 6.364L12 12m6.364-6.364L12 12"
          />
        </svg>
      );
    }

    if (status.isRealtimeConnected) {
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    }

    return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    );
  };

  const getStatusText = () => {
    if (status.isSyncing) return 'Синхронизация...';
    if (status.error) return 'Ошибка синхронизации';
    if (!status.isOnline) return 'Офлайн';
    if (status.isRealtimeConnected) return 'Синхронизировано';
    return 'Готов к синхронизации';
  };

  const formatLastSync = (date: Date | null) => {
    if (!date) return 'Никогда';
    
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Только что';
    if (minutes < 60) return `${minutes} мин назад`;
    if (hours < 24) return `${hours} ч назад`;
    return `${days} дн назад`;
  };

  if (!detailed) {
    return (
      <button
        onClick={handleManualSync}
        disabled={status.isSyncing}
        className={`inline-flex items-center space-x-1 ${getStatusColor()} hover:opacity-75 disabled:opacity-50 ${className}`}
        title={getStatusText()}
      >
        {getStatusIcon()}
      </button>
    );
  }

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className={`flex items-center space-x-1 ${getStatusColor()}`}>
        {getStatusIcon()}
        <span className="text-sm font-medium">{getStatusText()}</span>
      </div>
      
      {status.lastSyncAt && (
        <span className="text-xs text-gray-500">
          {formatLastSync(status.lastSyncAt)}
        </span>
      )}
      
      {status.error && (
        <div className="text-xs text-red-600 max-w-xs truncate" title={status.error.message}>
          {status.error.message}
        </div>
      )}
      
      {!status.isSyncing && (
        <button
          onClick={handleManualSync}
          className="text-xs text-blue-600 hover:text-blue-800 underline"
        >
          Синхронизировать
        </button>
      )}
    </div>
  );
};

export default SyncStatusIndicator;