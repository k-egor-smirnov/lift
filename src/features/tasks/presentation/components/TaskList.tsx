import React, { useState } from "react";
import { Zap, Target, Inbox } from "lucide-react";
import { Task } from "../../../../shared/domain/entities/Task";
import { TaskCategory } from "../../../../shared/domain/types";
import { TaskCard } from "./TaskCard";
import { LogEntry } from "../../../../shared/application/use-cases/GetTaskLogsUseCase";
import { InlineTaskCreator } from "../../../../shared/ui/components/InlineTaskCreator";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import { motion } from "framer-motion";

interface TaskListProps {
  tasks: Task[];
  groupByCategory?: boolean;
  showTodayButton?: boolean;
  overdueDays?: number;
  todayTaskIds?: string[]; // Array of task IDs that are selected for today
  onComplete?: (taskId: string) => void;
  onRevertCompletion?: (taskId: string) => void;
  onEdit: (taskId: string, newTitle: string) => void;
  onDelete: (taskId: string) => void;
  onAddToToday?: (taskId: string) => void;
  onReorder?: (tasks: Task[]) => void;
  onLoadTaskLogs?: (taskId: string) => Promise<LogEntry[]>;
  onCreateLog?: (taskId: string, message: string) => Promise<boolean>;
  lastLogs?: Record<string, LogEntry>;
  emptyMessage?: string;
  onCreateTask?: (title: string, category: TaskCategory) => Promise<boolean>;
  currentCategory?: TaskCategory;
}

export const TaskList: React.FC<TaskListProps> = ({
  tasks,
  groupByCategory = false,
  showTodayButton = false,
  overdueDays = 3,
  todayTaskIds = [],
  onComplete,
  onRevertCompletion,
  onEdit,
  onDelete,
  onAddToToday,
  onReorder,
  onLoadTaskLogs,
  onCreateLog,
  lastLogs = {},
  emptyMessage = "No tasks found",
  onCreateTask,
  currentCategory,
}) => {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null
  );

  // Sort tasks by order field first
  const sortedTasks = [...tasks].sort((a, b) => a.order - b.order);

  // Calculate overdue and today task IDs
  const overdueTaskIds = sortedTasks
    .filter(
      (task) =>
        task.category === TaskCategory.INBOX && task.isOverdue(overdueDays)
    )
    .map((task) => task.id.value);

  // Today task IDs are passed as props from parent component

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Custom modifier to apply drag offset
  const applyDragOffset = ({
    transform,
  }: {
    transform: { x: number; y: number; scaleX: number; scaleY: number };
  }) => {
    if (!dragOffset) return transform;

    return {
      ...transform,
      x: transform.x - dragOffset.x,
      y: transform.y - dragOffset.y,
    };
  };

  // Group tasks by category if needed
  const groupedTasks = groupByCategory
    ? sortedTasks.reduce((acc, task) => {
        const category = task.category;
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(task);
        return acc;
      }, {} as Record<TaskCategory, Task[]>)
    : { all: sortedTasks };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = sortedTasks.find((t) => t.id.value === active.id);
    setActiveTask(task || null);

    // // Calculate offset from click point to element's top-left corner
    // const activatorEvent = (event as any).activatorEvent;

    // if (
    //   activatorEvent &&
    //   activatorEvent.clientX !== undefined &&
    //   activatorEvent.clientY !== undefined
    // ) {
    //   // Get the actual DOM element to calculate its bounding rect
    //   const element = document.querySelector(`#task-${active.id}`);

    //   if (element) {
    //     const rect = element.getBoundingClientRect();
    //     setDragOffset({
    //       x: activatorEvent.clientX - rect.left,
    //       y: activatorEvent.clientY - rect.top,
    //     });
    //   }
    // }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    setDragOffset(null);

    if (!over || active.id === over.id) {
      return;
    }

    if (onReorder) {
      const oldIndex = sortedTasks.findIndex(
        (task) => task.id.value === active.id
      );
      const newIndex = sortedTasks.findIndex(
        (task) => task.id.value === over.id
      );
      const newTasks = arrayMove(sortedTasks, oldIndex, newIndex);
      onReorder(newTasks);
    }
  };

  const renderTaskCard = (task: Task) => {
    console.log(todayTaskIds, todayTaskIds.includes(task.id.value));
    return (
      <TaskCard
        key={task.id.value}
        task={task}
        onComplete={onComplete || (() => {})}
        onRevertCompletion={onRevertCompletion}
        onEdit={onEdit}
        onDelete={onDelete}
        onAddToToday={onAddToToday}
        showTodayButton={showTodayButton}
        isOverdue={overdueTaskIds.includes(task.id.value)}
        isInTodaySelection={todayTaskIds.includes(task.id.value)}
        lastLog={lastLogs[task.id.value] || null}
        onLoadTaskLogs={onLoadTaskLogs}
        onCreateLog={onCreateLog}
        isDraggable={!!onReorder}
      />
    );
  };

  const getCategoryIcon = (category: TaskCategory) => {
    switch (category) {
      case TaskCategory.SIMPLE:
        return Zap;
      case TaskCategory.FOCUS:
        return Target;
      case TaskCategory.INBOX:
        return Inbox;
      default:
        return Zap;
    }
  };

  const renderCategoryHeader = (category: TaskCategory, taskCount: number) => {
    const CategoryIcon = getCategoryIcon(category);
    return (
      <div key={`header-${category}`} className="mb-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
          <CategoryIcon className="w-5 h-5" />
          {category}
          <span className="text-sm font-normal text-gray-500">
            ({taskCount})
          </span>
        </h3>
      </div>
    );
  };

  if (sortedTasks.length === 0) {
    return (
      <div className="space-y-6">
        {/* Inline Task Creator */}
        {onCreateTask && currentCategory && (
          <InlineTaskCreator
            onCreateTask={onCreateTask}
            category={currentCategory}
            placeholder={`Добавить задачу в ${currentCategory.toLowerCase()}...`}
          />
        )}

        <div className="text-center py-8 text-gray-500">
          <p>{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Inline Task Creator */}
      {onCreateTask && currentCategory && (
        <InlineTaskCreator
          onCreateTask={onCreateTask}
          category={currentCategory}
          placeholder={`Добавить задачу в ${currentCategory.toLowerCase()}...`}
        />
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToWindowEdges]}
      >
        <div className="space-y-4">
          {Object.entries(groupedTasks).map(([categoryKey, categoryTasks]) => {
            const category = categoryKey as TaskCategory;
            const taskIds = categoryTasks.map((task) => task.id.value);

            return (
              <div key={category}>
                {groupByCategory &&
                  renderCategoryHeader(category, categoryTasks.length)}
                <SortableContext
                  items={taskIds}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {categoryTasks.map(renderTaskCard)}
                  </div>
                </SortableContext>
              </div>
            );
          })}
        </div>

        <DragOverlay modifiers={[applyDragOffset, restrictToWindowEdges]}>
          {activeTask ? (
            <motion.div
              className="bg-white rounded-lg border-2 border-blue-300 shadow-lg p-2 max-w-xs"
              initial={{ scale: 0.8, opacity: 0.8 }}
              animate={{ scale: 1, opacity: 1 }}
              style={{
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                fontWeight: "bold",
                color: "#374151",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              data-testid="drag-overlay"
            >
              {activeTask.title.value}
            </motion.div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};
