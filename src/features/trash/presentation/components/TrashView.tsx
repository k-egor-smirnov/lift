import React, { useEffect } from "react";
import { TrashViewModel } from "../view-models/TrashViewModel";
import { Button } from "../../../shared/ui/button";

interface TrashViewProps {
  viewModel: TrashViewModel;
}

export const TrashView: React.FC<TrashViewProps> = ({ viewModel }) => {
  const { tasks, loadTasks, clearTrash, loading, error } = viewModel();

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  return (
    <div className="space-y-4">
      {error && <div className="text-red-500">{error}</div>}
      {tasks.length > 0 && (
        <Button variant="destructive" onClick={clearTrash} data-testid="clear-trash">
          Очистить корзину
        </Button>
      )}
      {loading && <div>Loading...</div>}
      <ul className="space-y-2">
        {tasks.map((task) => (
          <li key={task.id.value} className="p-2 bg-white rounded shadow">
            {task.title.value}
          </li>
        ))}
      </ul>
      {tasks.length === 0 && !loading && (
        <p className="text-center text-gray-500">Корзина пуста</p>
      )}
    </div>
  );
};
