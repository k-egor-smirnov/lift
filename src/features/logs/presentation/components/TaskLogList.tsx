import React from 'react';
import { LogEntry } from '../../../../shared/application/use-cases/GetTaskLogsUseCase';

interface TaskLogListProps {
  logs: LogEntry[];
  loading?: boolean;
  error?: string | null;
  onLoadMore?: () => void;
  hasNextPage?: boolean;
  emptyMessage?: string;
  showTaskId?: boolean;
}

const getLogTypeIcon = (type: 'SYSTEM' | 'USER' | 'CONFLICT'): string => {
  switch (type) {
    case 'SYSTEM':
      return '⚙️';
    case 'USER':
      return '👤';
    case 'CONFLICT':
      return '⚠️';
    default:
      return '📝';
  }
};

const getLogTypeColor = (type: 'SYSTEM' | 'USER' | 'CONFLICT'): string => {
  switch (type) {
    case 'SYSTEM':
      return 'bg-blue-100 text-blue-800';
    case 'USER':
      return 'bg-green-100 text-green-800';
    case 'CONFLICT':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const formatDate = (date: Date): string => {
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInMinutes < 1) {
    return 'Just now';
  } else if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  } else if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  } else if (diffInDays < 7) {
    return `${diffInDays}d ago`;
  } else {
    return date.toLocaleDateString();
  }
};

const formatMetadata = (metadata?: Record<string, any>): string | null => {
  if (!metadata || Object.keys(metadata).length === 0) {
    return null;
  }

  // Handle common metadata patterns
  if (metadata.oldCategory && metadata.newCategory) {
    return `Changed from ${metadata.oldCategory} to ${metadata.newCategory}`;
  }

  if (metadata.oldTitle && metadata.newTitle) {
    return `Title changed from "${metadata.oldTitle}" to "${metadata.newTitle}"`;
  }

  if (metadata.entityType && metadata.winner) {
    return `Conflict resolved: ${metadata.winner} version selected`;
  }

  // Generic metadata display
  return Object.entries(metadata)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
};

export const TaskLogList: React.FC<TaskLogListProps> = ({
  logs,
  loading = false,
  error = null,
  onLoadMore,
  hasNextPage = false,
  emptyMessage = 'No logs found',
  showTaskId = false,
}) => {
  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-400 text-4xl mb-4">⚠️</div>
        <h3 className="text-lg font-medium text-red-900 mb-2">Error Loading Logs</h3>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (loading && logs.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin text-4xl mb-4">⏳</div>
        <p className="text-gray-500">Loading logs...</p>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 text-6xl mb-4">📝</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Logs</h3>
        <p className="text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Log entries */}
      <div className="space-y-3">
        {logs.map((log) => (
          <div
            key={log.id}
            className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3 flex-1">
                {/* Log type indicator */}
                <div className="flex-shrink-0">
                  <span className="text-lg">{getLogTypeIcon(log.type)}</span>
                </div>

                <div className="flex-1 min-w-0">
                  {/* Header with type and timestamp */}
                  <div className="flex items-center space-x-2 mb-2">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getLogTypeColor(
                        log.type
                      )}`}
                    >
                      {log.type}
                    </span>
                    {showTaskId && log.taskId && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        Task: {log.taskId.slice(-8)}
                      </span>
                    )}
                    <span className="text-sm text-gray-500">
                      {formatDate(log.createdAt)}
                    </span>
                  </div>

                  {/* Log message */}
                  <p className="text-gray-900 text-sm leading-relaxed">
                    {log.message}
                  </p>

                  {/* Metadata */}
                  {log.metadata && (
                    <div className="mt-2">
                      {formatMetadata(log.metadata) && (
                        <p className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                          {formatMetadata(log.metadata)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Load more button */}
      {hasNextPage && (
        <div className="text-center pt-4">
          <button
            onClick={onLoadMore}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Loading...
              </>
            ) : (
              'Load More'
            )}
          </button>
        </div>
      )}
    </div>
  );
};