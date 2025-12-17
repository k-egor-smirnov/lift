import React, { useEffect, useMemo, useState } from "react";
import { Zap, Target, Inbox } from "lucide-react";
import { Task } from "../../../../shared/domain/entities/Task";
import { TaskCategory, TaskStatus } from "../../../../shared/domain/types";
import { TaskCard } from "./TaskCard";
import { DeferredTaskCard } from "./DeferredTaskCard";
import { LogEntry } from "../../../../shared/application/use-cases/GetTaskLogsUseCase";
import { InlineTaskCreator } from "../../../../shared/ui/components/InlineTaskCreator";
import { TaskId } from "../../../../shared/domain/value-objects/TaskId";
import { TaskViewModel } from "../view-models/TaskViewModel";
import { TaskDetailModal } from "./TaskDetailModal";
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
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import { motion } from "framer-motion";

interface TaskListProps {
  tasks: Task[];
  groupByCategory?: boolean;
  showTodayButton?: boolean;
  showDeferButton?: boolean;
  overdueDays?: number;
  todayTaskIds?: string[]; // Array of task IDs that are selected for today
  onComplete?: (taskId: string) => void;
  onRevertCompletion?: (taskId: string) => void;
  onEdit: (taskId: string, newTitle: string) => void;
  onDelete: (taskId: string) => void;
  onAddToToday?: (taskId: string) => void;
  onDefer?: (taskId: string, deferDate: Date) => void;
  onUndefer?: (taskId: TaskId) => Promise<void>;
  onReorder?: (tasks: Task[]) => void;
  onCompleteSilent?: (taskId: string) => void;
  onRevertCompletionSilent?: (taskId: string) => void;
  onLoadTaskLogs?: (taskId: string) => Promise<LogEntry[]>;
  onCreateLog?: (taskId: string, message: string) => Promise<boolean>;
  onCreateTask?: (title: string, category: TaskCategory) => Promise<void>;
  lastLogs?: Record<string, LogEntry>;
  emptyMessage?: string;
  currentCategory?: TaskCategory;
  taskViewModel?: TaskViewModel;
}

export const TaskList: React.FC<TaskListProps> = ({
  tasks,
  groupByCategory = false,
  showTodayButton = false,
  showDeferButton = false,
  overdueDays = 3,
  todayTaskIds = [],
  onComplete,
  onRevertCompletion,
  onCompleteSilent,
  onRevertCompletionSilent,
  onEdit,
  onDelete,
  onAddToToday,
  onDefer,
  onUndefer,
  onReorder,
  onLoadTaskLogs,
  onCreateLog,
  onCreateTask,
  lastLogs = {},
  emptyMessage = "No tasks found",
  currentCategory,
  taskViewModel,
}) => {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskSnapshot, setSelectedTaskSnapshot] = useState<Task | null>(
    null
  );

  // Sort tasks by order field first
  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => a.order - b.order),
    [tasks]
  );

  const selectedTask = useMemo(
    () => sortedTasks.find((task) => task.id.value === selectedTaskId) || null,
    [selectedTaskId, sortedTasks]
  );

  useEffect(() => {
    if (!selectedTaskId) {
      setSelectedTaskSnapshot(null);
      return;
    }

    const match = sortedTasks.find((task) => task.id.value === selectedTaskId);
    if (match) {
      setSelectedTaskSnapshot(match);
    }
  }, [selectedTaskId, sortedTasks]);

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
      x: transform.x + dragOffset.x,
      y: transform.y + dragOffset.y,
    };
  };

  // Group tasks by category if needed
  const groupedTasks = groupByCategory
    ? sortedTasks.reduce(
        (acc, task) => {
          const category = task.category;
          if (!acc[category]) {
            acc[category] = [];
          }
          acc[category].push(task);
          return acc;
        },
        {} as Record<TaskCategory, Task[]>
      )
    : { all: sortedTasks };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = sortedTasks.find((t) => t.id.value === active.id);
    setActiveTask(task || null);

    // Calculate offset from click point to element's top-left corner
    const activatorEvent = (event as any).activatorEvent;

    if (
      activatorEvent &&
      activatorEvent.clientX !== undefined &&
      activatorEvent.clientY !== undefined
    ) {
      // Get the actual DOM element to calculate its bounding rect
      const element = document.querySelector(`#task-${active.id}`);
      // Get the DndContext container to account for its position
      const dndContainer =
        element?.closest("[data-dnd-context]") || document.body;

      if (element) {
        const rect = element.getBoundingClientRect();
        const containerRect = dndContainer.getBoundingClientRect();

        // Calculate simple offset from click point to element's top-left corner
        setDragOffset({
          x: activatorEvent.clientX - rect.left,
          y: activatorEvent.clientY - rect.top,
        });
      }
    }
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

  const handleOpenDetails = (task: Task) => {
    setSelectedTaskId(task.id.value);
    setSelectedTaskSnapshot(task);
  };

  const handleCloseDetails = () => {
    setSelectedTaskId(null);
    setSelectedTaskSnapshot(null);
  };

  const handleChangeStatusFromModal = (taskId: string, status: TaskStatus) => {
    if (status === TaskStatus.COMPLETED) {
      if (onCompleteSilent) {
        onCompleteSilent(taskId);
      } else if (onComplete) {
        onComplete(taskId);
      }
    }

    if (status === TaskStatus.ACTIVE) {
      if (onRevertCompletionSilent) {
        onRevertCompletionSilent(taskId);
      } else if (onRevertCompletion) {
        onRevertCompletion(taskId);
      }
    }
  };

  const handleEditDescription = async (taskId: string, description: string) => {
    if (!taskViewModel) return;

    try {
      const { changeTaskNote } = taskViewModel();
      await changeTaskNote(taskId, description);
    } catch (error) {
      console.error("Failed to save task note:", error);
    }
  };

  const renderTaskCard = (task: Task) => {
    // Use DeferredTaskCard for deferred tasks
    if (task.category === TaskCategory.DEFERRED && onUndefer) {
      return (
        <DeferredTaskCard
          key={task.id.value}
          task={task}
          onUndefer={onUndefer}
        />
      );
    }

    return (
      <TaskCard
        key={task.id.value}
        task={task}
        onComplete={onComplete || (() => {})}
        onRevertCompletion={onRevertCompletion}
        onEdit={onEdit}
        onDelete={onDelete}
        onAddToToday={onAddToToday}
        onDefer={onDefer}
        showTodayButton={showTodayButton}
        showDeferButton={showDeferButton}
        isOverdue={overdueTaskIds.includes(task.id.value)}
        isInTodaySelection={todayTaskIds.includes(task.id.value)}
        lastLog={lastLogs[task.id.value] || null}
        onCreateLog={onCreateLog}
        isDraggable={!!onReorder}
        currentCategory={currentCategory}
        onOpenDetails={handleOpenDetails}
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
        {/* Inline Task Creator - не показываем для отложенных задач */}
        {onCreateTask &&
          currentCategory &&
          currentCategory !== TaskCategory.DEFERRED && (
            <InlineTaskCreator
              onCreateTask={onCreateTask}
              category={currentCategory}
              placeholder={`Добавить задачу...`}
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
      {/* Inline Task Creator - не показываем для отложенных задач */}
      {onCreateTask &&
        currentCategory &&
        currentCategory !== TaskCategory.DEFERRED && (
          <InlineTaskCreator
            onCreateTask={onCreateTask}
            category={currentCategory}
            placeholder={`Добавить задачу...`}
          />
        )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToWindowEdges]}
      >
        <div data-dnd-context>
          <div className="space-y-4">
            {Object.entries(groupedTasks).map(
              ([categoryKey, categoryTasks]) => {
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
              }
            )}
          </div>

          <DragOverlay modifiers={[applyDragOffset]}>
            {activeTask ? (
              <motion.div
                className="bg-white rounded-lg border-2 border-blue-300 shadow-lg p-2 max-w-[240px] text-sm"
                initial={{ scale: 0.8, opacity: 0.8 }}
                animate={{ scale: 1, opacity: 1 }}
                data-testid="drag-overlay"
              >
                <p className="font-medium text-gray-800 truncate">
                  {activeTask.title.value}
                </p>
                {lastLogs[activeTask.id.value] && (
                  <p className="mt-1 text-xs text-gray-500 truncate">
                    {lastLogs[activeTask.id.value].message}
                  </p>
                )}
              </motion.div>
            ) : null}
          </DragOverlay>
        </div>
      </DndContext>

      <TaskDetailModal
        isOpen={!!selectedTaskId}
        task={selectedTask || selectedTaskSnapshot}
        onClose={handleCloseDetails}
        onEditTitle={onEdit}
        onEditDescription={handleEditDescription}
        onChangeStatus={handleChangeStatusFromModal}
        onLoadTaskLogs={onLoadTaskLogs}
        onCreateLog={onCreateLog}
      />
    </div>
  );
};
