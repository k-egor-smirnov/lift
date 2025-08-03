import React, { useEffect } from "react";
import { TrashViewModel } from "../view-models/TrashViewModel";
import { Button } from "../../../shared/ui/button";
import { TrashTaskCard } from "./TrashTaskCard";
import { useTranslation } from "react-i18next";

interface TrashViewProps {
  viewModel: TrashViewModel;
}

export const TrashView: React.FC<TrashViewProps> = ({ viewModel }) => {
  const { t } = useTranslation();
  const { tasks, loadTasks, clearTrash, restoreTask, loading, error } = viewModel();

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  return (
    <div className="space-y-4">
      {error && <div className="text-red-500">{error}</div>}
      {tasks.length > 0 && (
        <Button variant="destructive" onClick={clearTrash} data-testid="clear-trash">
          {t("trash.clear")}
        </Button>
      )}
      {loading && <div>Loading...</div>}
      <div className="space-y-2">
        {tasks.map((task) => (
          <TrashTaskCard key={task.id.value} task={task} onRestore={restoreTask} />
        ))}
      </div>
      {tasks.length === 0 && !loading && (
        <p className="text-center text-gray-500">{t("trash.empty")}</p>
      )}
    </div>
  );
};
