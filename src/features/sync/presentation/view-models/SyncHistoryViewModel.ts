import { useState, useCallback } from "react";
import {
  Summary,
  SummaryType,
  SummaryStatus,
} from "../../../../shared/domain/entities/Summary";
import {
  GetSyncHistoryUseCase,
  SyncHistoryRequest,
} from "../../../../shared/application/use-cases/GetSyncHistoryUseCase";
import { ResultUtils } from "../../../../shared/domain/Result";

export interface SyncHistoryViewModelDependencies {
  getSyncHistoryUseCase: GetSyncHistoryUseCase;
}

export interface SyncHistoryViewModel {
  // State
  summaries: Summary[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  activeFilter: SummaryType | "ALL";

  // Actions
  loadSyncHistory: (request?: SyncHistoryRequest) => Promise<void>;
  loadMore: () => Promise<void>;
  setFilter: (filter: SummaryType | "ALL") => void;
  refresh: () => Promise<void>;
  clearError: () => void;
}

export const createSyncHistoryViewModel = (
  dependencies: SyncHistoryViewModelDependencies
): (() => SyncHistoryViewModel) => {
  const { getSyncHistoryUseCase } = dependencies;

  return () => {
    const [summaries, setSummaries] = useState<Summary[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [activeFilter, setActiveFilter] = useState<SummaryType | "ALL">(
      "ALL"
    );
    const [offset, setOffset] = useState(0);

    const loadSyncHistory = useCallback(
      async (request?: SyncHistoryRequest) => {
        setLoading(true);
        setError(null);

        try {
          const filterType = activeFilter === "ALL" ? undefined : activeFilter;
          const result = await getSyncHistoryUseCase.execute({
            type: filterType,
            limit: 20,
            offset: 0,
            ...request,
          });

          if (ResultUtils.isSuccess(result)) {
            setSummaries(result.data.summaries);
            setHasMore(result.data.hasMore);
            setOffset(result.data.summaries.length);
          } else {
            setError(result.error.message);
            setSummaries([]);
            setHasMore(false);
          }
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to load sync history"
          );
          setSummaries([]);
          setHasMore(false);
        } finally {
          setLoading(false);
        }
      },
      [getSyncHistoryUseCase, activeFilter]
    );

    const loadMore = useCallback(async () => {
      if (!hasMore || loading) return;

      setLoading(true);
      try {
        const filterType = activeFilter === "ALL" ? undefined : activeFilter;
        const result = await getSyncHistoryUseCase.execute({
          type: filterType,
          limit: 20,
          offset,
        });

        if (ResultUtils.isSuccess(result)) {
          setSummaries((prev) => [...prev, ...result.data.summaries]);
          setHasMore(result.data.hasMore);
          setOffset((prev) => prev + result.data.summaries.length);
        } else {
          setError(result.error.message);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load more sync history"
        );
      } finally {
        setLoading(false);
      }
    }, [getSyncHistoryUseCase, activeFilter, offset, hasMore, loading]);

    const setFilter = useCallback(
      (filter: SummaryType | "ALL") => {
        setActiveFilter(filter);
        setOffset(0);
        // Reload with new filter
        loadSyncHistory({ type: filter === "ALL" ? undefined : filter });
      },
      [loadSyncHistory]
    );

    const refresh = useCallback(async () => {
      setOffset(0);
      await loadSyncHistory();
    }, [loadSyncHistory]);

    const clearError = useCallback(() => {
      setError(null);
    }, []);

    return {
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
    };
  };
};
