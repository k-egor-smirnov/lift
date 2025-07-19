import React from 'react';
import { Task } from '../../../../shared/domain/entities/Task';
import { TaskCategory } from '../../../../shared/domain/types';
import { TaskCard } from './TaskCard';

interface TaskListProps {
  tasks: Task[];
  groupByCategory?: boolean;
  showTodayButton?: boolean;
  overdueDays?: number;
  onComplete: (taskId: string) => void;
  onEdit: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onAddToToday?: (taskId: string) => void;
  emptyMessage?: string;
}

const getCategoryTitle = (category: TaskCategory): string => {
  switch (category) {
    case TaskCategory.SIMPLE:
      return '⚡ Simple Tasks';
    case TaskCategory.FOCUS:
      return '🎯 Focus Tasks';
    case TaskCategory.INBOX:
      return '📥 Inbox';
    default:
      return 'Tasks';
  }
};

const getCategoryDescription = (category: TaskCategory): string => {
  switch (category) {
    case TaskCategory.SIMPLE:
      return 'Quick tasks that can be done easily';
    case TaskCategory.FOCUS:
      return 'Important tasks that require focused attention';
    case TaskCategory.INBOX:
      return 'Tasks that need to be reviewed and categorized';
    default:
      return '';
  }
};

export const TaskList: React.FC<TaskListProps> = ({
  tasks,
  groupByCategory = false,
  showTodayButton = false,
  overdueDays = 3,
  onComplete,
  onEdit,
  onDelete,
  onAddToToday,
  emptyMessage = 'No tasks found',
}) => {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 text-6xl mb-4">📝</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Tasks</h3>
        <p className="text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  if (!groupByCategory) {
    return (
      <div className="space-y-4">
        {tasks.map((task) => (
          <TaskCard
            key={task.id.value}
            task={task}
            onComplete={onComplete}
            onEdit={onEdit}
            onDelete={onDelete}
            onAddToToday={onAddToToday}
            showTodayButton={showTodayButton}
            isOverdue={task.category === TaskCategory.INBOX && task.isOverdue(overdueDays)}
          />
        ))}
      </div>
    );
  }

  // Group tasks by category
  const tasksByCategory = tasks.reduce((acc, task) => {
    if (!acc[task.category]) {
      acc[task.category] = [];
    }
    acc[task.category].push(task);
    return acc;
  }, {} as Record<TaskCategory, Task[]>);

  // Define category order
  const categoryOrder = [TaskCategory.INBOX, TaskCategory.FOCUS, TaskCategory.SIMPLE];

  return (
    <div className="space-y-8">
      {categoryOrder.map((category) => {
        const categoryTasks = tasksByCategory[category] || [];
        if (categoryTasks.length === 0) return null;

        const overdueCount = category === TaskCategory.INBOX 
          ? categoryTasks.filter(task => task.isOverdue(overdueDays)).length 
          : 0;

        return (
          <div key={category} className="space-y-4">
            {/* Category Header */}
            <div className="border-b border-gray-200 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                    {getCategoryTitle(category)}
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                      {categoryTasks.length}
                    </span>
                    {overdueCount > 0 && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800 animate-pulse">
                        {overdueCount} overdue
                      </span>
                    )}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {getCategoryDescription(category)}
                  </p>
                </div>
              </div>
            </div>

            {/* Category Tasks */}
            <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {categoryTasks.map((task) => (
                <TaskCard
                  key={task.id.value}
                  task={task}
                  onComplete={onComplete}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onAddToToday={onAddToToday}
                  showTodayButton={showTodayButton}
                  isOverdue={task.category === TaskCategory.INBOX && task.isOverdue(overdueDays)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};