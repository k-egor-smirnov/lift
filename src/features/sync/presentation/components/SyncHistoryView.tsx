import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../shared/ui/button";
import {
  Filter,
  Calendar,
  Clock,
  BarChart3,
  AlertTriangle,
  RefreshCw,
  Loader,
  Plus,
} from "lucide-react";
import {
  Summary,
  SummaryType,
  SummaryStatus,
} from "../../../../shared/domain/entities/Summary";
import {
  createSyncHistoryViewModel,
  SyncHistoryViewModelDependencies,
} from "../view-models/SyncHistoryViewModel";
import { SyncHistoryList } from "./SyncHistoryList";
import { ForceSummarizationModal } from "./ForceSummarizationModal";
import { getService, tokens } from "../../../../shared/infrastructure/di";
import { ProcessSummaryUseCase } from "../../../../shared/application/use-cases/ProcessSummaryUseCase";
import { ForceWeeklySummaryUseCase } from "../../../../shared/application/use-cases/ForceWeeklySummaryUseCase";

interface SyncHistoryViewProps {
  dependencies: SyncHistoryViewModelDependencies;
}

type SyncFilter = SummaryType | "ALL";

const getSyncTypeInfo = (type: SyncFilter, t: any) => {
  switch (type) {
    case SummaryType.DAILY:
      return {
        icon: Calendar,
        label: t("sync.daily", "Дневная"),
        color: "text-blue-600",
      };
    case SummaryType.WEEKLY:
      return {
        icon: Clock,
        label: t("sync.weekly", "Недельная"),
        color: "text-green-600",
      };
    case SummaryType.MONTHLY:
      return {
        icon: BarChart3,
        label: t("sync.monthly", "Месячная"),
        color: "text-purple-600",
      };
    case "ALL":
      return {
        icon: RefreshCw,
        label: t("sync.all", "Все"),
        color: "text-gray-600",
      };
    default:
      return { icon: RefreshCw, label: "Unknown", color: "text-gray-600" };
  }
};

const getStatusColor = (status: SummaryStatus) => {
  switch (status) {
    case SummaryStatus.NEW:
      return "text-gray-500 bg-gray-100";
    case SummaryStatus.PROCESSING:
      return "text-blue-500 bg-blue-100";
    case SummaryStatus.COMPLETED:
      return "text-green-500 bg-green-100";
    case SummaryStatus.FAILED:
      return "text-red-500 bg-red-100";
    default:
      return "text-gray-500 bg-gray-100";
  }
};

const getStatusText = (status: SummaryStatus, t: any) => {
  switch (status) {
    case SummaryStatus.NEW:
      return t("sync.status.new", "Новая");
    case SummaryStatus.PROCESSING:
      return t("sync.status.processing", "Обработка");
    case SummaryStatus.COMPLETED:
      return t("sync.status.completed", "Завершена");
    case SummaryStatus.FAILED:
      return t("sync.status.failed", "Ошибка");
    default:
      return status;
  }
};

export const SyncHistoryView: React.FC<SyncHistoryViewProps> = ({
  dependencies,
}) => {
  const { t } = useTranslation();
  const [syncHistoryViewModel] = useState(() =>
    createSyncHistoryViewModel(dependencies)
  );
  const [isForceModalOpen, setIsForceModalOpen] = useState(false);

  const {
    summaries,
    loading,
    error,
    hasMore,
    activeFilter,
    loadSyncHistory,
    loadMore,
    setFilter,
    refresh,
    clearError,
  } = syncHistoryViewModel();

  // Load sync history on component mount
  useEffect(() => {
    loadSyncHistory();
  }, []); // Убираем loadSyncHistory из зависимостей, чтобы избежать бесконечного цикла

  // Handle filter change
  const handleFilterChange = (filter: SyncFilter) => {
    setFilter(filter);
  };

  // Handle refresh
  const handleRefresh = () => {
    refresh();
  };

  // Handle load more
  const handleLoadMore = () => {
    if (hasMore && !loading) {
      loadMore();
    }
  };

  // Handle restart summary
  const handleRestart = async (summary: Summary) => {
    try {
      const processSummaryUseCase = getService<ProcessSummaryUseCase>(
        tokens.PROCESS_SUMMARY_USE_CASE_TOKEN
      );
      await processSummaryUseCase.execute({ summaryId: summary.id });
      // Refresh the list to show updated status
      handleRefresh();
    } catch (error) {
      console.error("Failed to restart summary:", error);
      // TODO: Show error message to user
    }
  };

  // Handle force weekly summary
  const handleForceWeekly = async (summary: Summary) => {
    try {
      const forceWeeklySummaryUseCase = getService<ForceWeeklySummaryUseCase>(
        tokens.FORCE_WEEKLY_SUMMARY_USE_CASE_TOKEN
      );
      await forceWeeklySummaryUseCase.execute({
        summaryId: summary.id,
        ignoreFailedDailies: true,
      });
      // Refresh the list to show updated status
      handleRefresh();
    } catch (error) {
      console.error("Failed to force weekly summary:", error);
      // TODO: Show error message to user
    }
  };

  const filterButtons: {
    key: SyncFilter;
    info: ReturnType<typeof getSyncTypeInfo>;
  }[] = [
    { key: "ALL", info: getSyncTypeInfo("ALL", t) },
    { key: SummaryType.DAILY, info: getSyncTypeInfo(SummaryType.DAILY, t) },
    { key: SummaryType.WEEKLY, info: getSyncTypeInfo(SummaryType.WEEKLY, t) },
    { key: SummaryType.MONTHLY, info: getSyncTypeInfo(SummaryType.MONTHLY, t) },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {t("sync.title", "История синхронизации")}
        </h1>
        <div className="flex items-center space-x-2">
          <Button
            onClick={() => setIsForceModalOpen(true)}
            variant="default"
            size="sm"
            className="flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>
              {t("sync.forceSummarization", "Принудительная генерация")}
            </span>
          </Button>
          <Button
            onClick={handleRefresh}
            disabled={loading}
            variant="outline"
            size="sm"
            className="flex items-center space-x-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            <span>{t("common.refresh", "Обновить")}</span>
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {filterButtons.map(({ key, info }) => {
          const IconComponent = info.icon;
          return (
            <Button
              key={key}
              onClick={() => handleFilterChange(key)}
              variant={activeFilter === key ? "default" : "outline"}
              size="sm"
              className="flex items-center space-x-2"
            >
              <IconComponent className="w-4 h-4" />
              <span>{info.label}</span>
            </Button>
          );
        })}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-red-600">{error}</p>
            <Button
              onClick={clearError}
              variant="ghost"
              size="sm"
              className="text-red-600 hover:text-red-700"
            >
              {t("common.dismiss", "Закрыть")}
            </Button>
          </div>
        </div>
      )}

      {/* Sync History List */}
      <div className="bg-white rounded-lg border">
        {loading && summaries.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
            <p className="text-muted-foreground">
              {t("sync.loading", "Загрузка истории синхронизации...")}
            </p>
          </div>
        ) : summaries.length === 0 ? (
          <div className="text-center py-12">
            <RefreshCw className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">
              {t("sync.noHistory", "История синхронизации пуста")}
            </p>
          </div>
        ) : (
          <SyncHistoryList
            summaries={summaries}
            loading={loading}
            hasMore={hasMore}
            onLoadMore={handleLoadMore}
            onRestart={handleRestart}
            onForceWeekly={handleForceWeekly}
            getStatusColor={getStatusColor}
            getStatusText={getStatusText}
            getSyncTypeInfo={getSyncTypeInfo}
            t={t}
          />
        )}
      </div>

      {/* Force Summarization Modal */}
      <ForceSummarizationModal
        isOpen={isForceModalOpen}
        onClose={() => setIsForceModalOpen(false)}
        onSuccess={() => {
          handleRefresh();
        }}
      />
    </div>
  );
};
