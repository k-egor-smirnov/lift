import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TaskLogList } from "./TaskLogList";
import { GetTaskLogsRequest } from "../../../../shared/application/use-cases/GetTaskLogsUseCase";
import {
  createLogViewModel,
  LogViewModelDependencies,
} from "../view-models/LogViewModel";
import { Button } from "../../../../shared/ui/button";

interface AllLogsViewProps {
  dependencies: LogViewModelDependencies;
}

type LogTypeFilter = "ALL" | "SYSTEM" | "USER" | "CONFLICT";

export const AllLogsView: React.FC<AllLogsViewProps> = ({ dependencies }) => {
  const { t } = useTranslation();
  const [logViewModel] = useState(() => createLogViewModel(dependencies));
  const [activeFilter, setActiveFilter] = useState<LogTypeFilter>("ALL");

  // Subscribe to view model state
  const {
    logs,
    loading,
    error,
    pagination,
    loadLogs,
    loadNextPage,
    setFilter,
    clearError,
    refreshLogs,
    hasLogs,
  } = logViewModel();

  // Load logs on component mount
  useEffect(() => {
    const initialRequest: GetTaskLogsRequest = {
      page: 1,
      pageSize: 20,
      sortOrder: "desc",
    };
    loadLogs(initialRequest);
  }, [loadLogs]);

  // Handle filter change
  const handleFilterChange = (filter: LogTypeFilter) => {
    setActiveFilter(filter);
    const logType =
      filter === "ALL" ? undefined : (filter as "SYSTEM" | "USER" | "CONFLICT");
    setFilter({ logType });
  };

  // Handle refresh
  const handleRefresh = () => {
    refreshLogs();
  };

  // Handle load more
  const handleLoadMore = () => {
    if (pagination.hasNextPage && !loading) {
      loadNextPage();
    }
  };

  const filterButtons: { key: LogTypeFilter; label: string; count?: number }[] =
    [
      { key: "ALL", label: t("logs.filters.all") },
      { key: "SYSTEM", label: t("logs.filters.system") },
      { key: "USER", label: t("logs.filters.user") },
      // { key: 'CONFLICT', label: t('logs.filters.conflict') }
    ];

  return (
    <div className="space-y-6">
      {/* Filter Buttons */}
      <div className="flex flex-wrap gap-2">
        {filterButtons.map((filter) => (
          <Button
            key={filter.key}
            onClick={() => handleFilterChange(filter.key)}
            variant={activeFilter === filter.key ? "default" : "outline"}
            size="sm"
            className="flex items-center space-x-2"
          >
            <span>{filter.label}</span>
            {filter.count !== undefined && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-100 rounded-full">
                {filter.count}
              </span>
            )}
          </Button>
        ))}
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
              {t("common.dismiss", "Dismiss")}
            </Button>
          </div>
        </div>
      )}

      {/* Logs List */}
      <div className="bg-white rounded-lg">
        <TaskLogList
          logs={logs}
          loading={loading}
          error={error}
          onLoadMore={handleLoadMore}
          hasNextPage={pagination.hasNextPage}
          emptyMessage={t(
            "logs.noLogsFound",
            "No logs found for the selected filter"
          )}
          showTaskId={true}
        />
      </div>
    </div>
  );
};
