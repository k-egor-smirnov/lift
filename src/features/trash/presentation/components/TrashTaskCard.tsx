import React from "react";
import { Task } from "../../../../shared/domain/entities/Task";
import { Button } from "../../../../shared/ui/button";
import { TaskCardHeader } from "../../tasks/presentation/components/task-card/TaskCardHeader";
import { useTranslation } from "react-i18next";

interface TrashTaskCardProps {
  task: Task;
  onRestore: (taskId: string) => void;
}

export const TrashTaskCard: React.FC<TrashTaskCardProps> = ({ task, onRestore }) => {
  const { t } = useTranslation();
  return (
    <article className="bg-white rounded-lg border shadow-sm px-4 py-2 space-y-2">
      <TaskCardHeader category={task.category} currentCategory={task.category} isOverdue={false} />
      <div className="flex items-center justify-between">
        <span>{task.title.value}</span>
        <Button variant="ghost" onClick={() => onRestore(task.id.value)} data-testid={`restore-${task.id.value}`}>
          {t("trash.restore")}
        </Button>
      </div>
    </article>
  );
};
