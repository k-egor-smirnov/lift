import React from "react";
import {
  Summary,
  SummaryType,
  SummaryStatus,
} from "../../../../shared/domain/entities/Summary";
import { Button } from "../../../../shared/ui/button";
import {
  Calendar,
  Clock,
  BarChart3,
  ChevronDown,
  AlertCircle,
  CheckCircle,
  Loader,
  RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface SyncHistoryListProps {
  summaries: Summary[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onRestart?: (summary: Summary) => void;
  onForceWeekly?: (summary: Summary) => void;
  getStatusColor: (status: SummaryStatus) => string;
  getStatusText: (status: SummaryStatus, t: any) => string;
  getSyncTypeInfo: (
    type: SummaryType,
    t: any
  ) => { icon: any; label: string; color: string };
  t: any;
}

const getTypeIcon = (type: SummaryType) => {
  switch (type) {
    case SummaryType.DAILY:
      return Calendar;
    case SummaryType.WEEKLY:
      return Clock;
    case SummaryType.MONTHLY:
      return BarChart3;
    default:
      return Calendar;
  }
};

const getStatusIcon = (status: SummaryStatus) => {
  switch (status) {
    case SummaryStatus.COMPLETED:
      return CheckCircle;
    case SummaryStatus.FAILED:
      return AlertCircle;
    case SummaryStatus.PROCESSING:
      return Loader;
    default:
      return Clock;
  }
};

const formatSummaryDate = (summary: Summary) => {
  if (summary.type === SummaryType.DAILY) {
    return summary.dateKey;
  } else if (
    summary.type === SummaryType.WEEKLY &&
    summary.metadata?.weekStart &&
    summary.metadata?.weekEnd
  ) {
    return `${summary.metadata.weekStart} - ${summary.metadata.weekEnd}`;
  } else if (summary.type === SummaryType.MONTHLY && summary.metadata?.month) {
    return summary.metadata.month;
  }
  return summary.dateKey;
};

export const SyncHistoryList: React.FC<SyncHistoryListProps> = ({
  summaries,
  loading,
  hasMore,
  onLoadMore,
  onRestart,
  onForceWeekly,
  getStatusColor,
  getStatusText,
  getSyncTypeInfo,
  t,
}) => {
  return (
    <div className="divide-y divide-gray-200">
      {summaries.map((summary) => {
        const TypeIcon = getTypeIcon(summary.type);
        const StatusIcon = getStatusIcon(summary.status);
        const typeInfo = getSyncTypeInfo(summary.type, t);
        const statusColor = getStatusColor(summary.status);
        const statusText = getStatusText(summary.status, t);

        return (
          <div
            key={summary.id}
            className="p-6 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-start space-x-4">
              {/* Type Icon */}
              <div
                className={`flex-shrink-0 w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center ${typeInfo.color}`}
              >
                <TypeIcon className="w-5 h-5" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <h3 className="text-lg font-medium text-gray-900">
                      {typeInfo.label}
                    </h3>
                    <span className="text-sm text-gray-500">
                      {formatSummaryDate(summary)}
                    </span>
                  </div>

                  {/* Status Badge */}
                  <div
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor}`}
                  >
                    <StatusIcon
                      className={`w-3 h-3 mr-1 ${summary.status === SummaryStatus.PROCESSING ? "animate-spin" : ""}`}
                    />
                    {statusText}
                  </div>
                </div>

                {/* Summary Title */}
                {summary.title && (
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    {summary.title}
                  </p>
                )}

                {/* Summary Content */}
                {summary.content && (
                  <div className="text-sm text-gray-600 mb-3">
                    <div className="bg-gray-50 rounded-lg p-3 max-h-32 overflow-y-auto">
                      <pre className="whitespace-pre-wrap font-sans">
                        {summary.content}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {summary.error && (
                  <div className="text-sm text-red-600 mb-3">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="flex items-start space-x-2">
                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <span>{summary.error}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Timestamps */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                    <span>
                      {t("sync.created", "Создано")}:{" "}
                      {formatDistanceToNow(summary.createdAt, {
                        addSuffix: true,
                        locale: ru,
                      })}
                    </span>
                    {summary.processedAt && (
                      <span>
                        {t("sync.processed", "Обработано")}:{" "}
                        {formatDistanceToNow(summary.processedAt, {
                          addSuffix: true,
                          locale: ru,
                        })}
                      </span>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center space-x-2">
                    {onRestart &&
                      (summary.status === SummaryStatus.FAILED ||
                        summary.status === SummaryStatus.PROCESSING) && (
                        <Button
                          onClick={() => onRestart(summary)}
                          variant="outline"
                          size="sm"
                          className="flex items-center space-x-1 text-xs"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>{t("sync.restart", "Перезапустить")}</span>
                        </Button>
                      )}

                    {onForceWeekly &&
                      summary.type === SummaryType.WEEKLY &&
                      (summary.status === SummaryStatus.FAILED ||
                        summary.status === SummaryStatus.NEW) && (
                        <Button
                          onClick={() => onForceWeekly(summary)}
                          variant="outline"
                          size="sm"
                          className="flex items-center space-x-1 text-xs text-orange-600 border-orange-300 hover:bg-orange-50"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>{t("sync.forceWeekly", "Принудительно")}</span>
                        </Button>
                      )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Load More Button */}
      {hasMore && (
        <div className="p-6 text-center border-t">
          <Button
            onClick={onLoadMore}
            disabled={loading}
            variant="outline"
            className="flex items-center space-x-2"
          >
            {loading ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                <span>{t("common.loading", "Загрузка...")}</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                <span>{t("common.loadMore", "Загрузить еще")}</span>
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};
