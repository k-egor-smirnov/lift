import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Task } from '../../../../shared/domain/entities/Task';
import { TaskRepository } from '../../../../shared/domain/repositories/TaskRepository';
import { ClearDeletedTasksUseCase } from '../../../../shared/application/use-cases/ClearDeletedTasksUseCase';
import { Button } from '../../../../shared/ui/button';

export interface TrashViewDependencies {
  taskRepository: TaskRepository;
  clearDeletedTasksUseCase: ClearDeletedTasksUseCase;
}

interface TrashViewProps {
  dependencies: TrashViewDependencies;
}

export const TrashView: React.FC<TrashViewProps> = ({ dependencies }) => {
  const { t } = useTranslation();
  const { taskRepository, clearDeletedTasksUseCase } = dependencies;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTasks = async () => {
    const deleted = await taskRepository.findDeleted();
    setTasks(deleted);
    setLoading(false);
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleClear = async () => {
    await clearDeletedTasksUseCase.execute();
    await loadTasks();
  };

  if (loading) {
    return <p>{t('common.loading', 'Loading...')}</p>;
  }

  return (
    <div>
      {tasks.length === 0 ? (
        <p>{t('trash.empty', 'Trash is empty')}</p>
      ) : (
        <>
          <ul className="space-y-2 mb-4">
            {tasks.map((task) => (
              <li key={task.id.value} className="p-2 border rounded">
                {task.title.value}
              </li>
            ))}
          </ul>
          <Button onClick={handleClear} data-testid="clear-trash">
            {t('trash.clear', 'Clear trash')}
          </Button>
        </>
      )}
    </div>
  );
};
