import { useEffect } from "react";
import { DateOnly } from "../../shared/domain/value-objects/DateOnly";

/**
 * Hook that refreshes today task IDs when the day changes.
 *
 * @param refresh Function that reloads today task IDs
 */
export const useTodayTaskIdsRefresh = (
  refresh: () => Promise<void>
): void => {
  useEffect(() => {
    let lastDate = DateOnly.today().value;

    const checkForDayChange = async () => {
      const currentDate = DateOnly.today().value;
      if (currentDate !== lastDate) {
        lastDate = currentDate;
        await refresh();
      }
    };

    const interval = setInterval(checkForDayChange, 60_000); // every minute
    return () => clearInterval(interval);
  }, [refresh]);
};

