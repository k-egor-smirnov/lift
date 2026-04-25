import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Zap, Target, Inbox } from "lucide-react";
import { Task } from "../../../../shared/domain/entities/Task";
import { TaskCategory } from "../../../../shared/domain/types";
import { TaskCard } from "./TaskCard";
import { DeferredTaskCard } from "./DeferredTaskCard";
import { LogEntry } from "../../../../shared/application/use-cases/GetTaskLogsUseCase";
import { InlineTaskCreator } from "../../../../shared/ui/components/InlineTaskCreator";
import { TaskId } from "../../../../shared/domain/value-objects/TaskId";
import { TaskViewModel } from "../view-models/TaskViewModel";
import { Tag } from "../../../tags/presentation/view-models/TagViewModel";
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
import { AnimatePresence, motion } from "framer-motion";

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
  onLoadTaskLogs?: (taskId: string) => Promise<LogEntry[]>;
  onCreateLog?: (taskId: string, message: string) => Promise<boolean>;
  onCreateTask?: (title: string, category: TaskCategory) => Promise<void>;
  lastLogs?: Record<string, LogEntry>;
  emptyMessage?: string;
  currentCategory?: TaskCategory;
  taskViewModel?: TaskViewModel;
  tags?: Tag[];
  taskTags?: Record<string, string[]>;
  onCreateTag?: (name: string, color: string) => void;
  onUpdateTaskTags?: (taskId: string, tagIds: string[]) => void;
  onDropOnToday?: (taskId: string) => void;
  onDropOnCategory?: (taskId: string, category: TaskCategory) => void;
  onDropOnTag?: (taskId: string, tagId: string) => void;
  forceShowCategory?: boolean;
}

type TaskAnimationDirection = -1 | 1;

type TaskDropTarget =
  | { type: "today" }
  | { type: "category"; category: TaskCategory }
  | { type: "tag"; tagId: string };

export const TaskList: React.FC<TaskListProps> = ({
  tasks,
  groupByCategory = false,
  showTodayButton = false,
  showDeferButton = false,
  overdueDays = 3,
  todayTaskIds = [],
  onComplete,
  onRevertCompletion,
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
  tags = [],
  taskTags = {},
  onCreateTag,
  onUpdateTaskTags,
  onDropOnToday,
  onDropOnCategory,
  onDropOnTag,
  forceShowCategory = false,
}) => {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [isOverExternalDropTarget, setIsOverExternalDropTarget] =
    useState(false);
  const [isOverSidebarDropScope, setIsOverSidebarDropScope] = useState(false);
  const previousTaskPositionsRef = useRef<
    Map<string, { index: number; order: number }>
  >(new Map());
  const lastDragPointRef = useRef<{ x: number; y: number } | null>(null);
  const hoveredDropTargetRef = useRef<HTMLElement | null>(null);
  const hoveredDropTargetDataRef = useRef<TaskDropTarget | null>(null);
  const isOverExternalDropTargetRef = useRef(false);
  const isOverSidebarDropScopeRef = useRef(false);
  const trackingFrameRef = useRef<number | null>(null);

  // Sort tasks by order field first
  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => a.order - b.order),
    [tasks]
  );
  const canDragTasks = Boolean(
    onReorder || onDropOnToday || onDropOnCategory || onDropOnTag
  );
  const activeTaskId = activeTask?.id.value ?? null;
  const isDragActive = activeTask !== null;

  const taskAnimationDirections = useMemo(() => {
    const previousPositions = previousTaskPositionsRef.current;
    const previousOrders = Array.from(previousPositions.values()).map(
      (position) => position.order
    );
    const minPreviousOrder =
      previousOrders.length > 0 ? Math.min(...previousOrders) : undefined;

    return sortedTasks.reduce<Record<string, TaskAnimationDirection>>(
      (acc, task, index) => {
        const taskId = task.id.value;
        const previousPosition = previousPositions.get(taskId);

        if (!previousPosition) {
          acc[taskId] =
            minPreviousOrder !== undefined && task.order <= minPreviousOrder
              ? -1
              : 1;
          return acc;
        }

        acc[taskId] = index < previousPosition.index ? -1 : 1;
        return acc;
      },
      {}
    );
  }, [sortedTasks]);

  useEffect(() => {
    previousTaskPositionsRef.current = new Map(
      sortedTasks.map((task, index) => [
        task.id.value,
        { index, order: task.order },
      ])
    );
  }, [sortedTasks]);

  // Calculate overdue and today task IDs
  const overdueTaskIds = useMemo(
    () =>
      new Set(
        sortedTasks
          .filter(
            (task) =>
              task.category === TaskCategory.INBOX &&
              task.isOverdue(overdueDays)
          )
          .map((task) => task.id.value)
      ),
    [overdueDays, sortedTasks]
  );
  const todayTaskIdSet = useMemo(() => new Set(todayTaskIds), [todayTaskIds]);

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

  const getActivatorCoordinates = (event: Event | null) => {
    if (!event) return null;

    if ("clientX" in event && "clientY" in event) {
      return {
        x: event.clientX,
        y: event.clientY,
      };
    }

    if ("touches" in event && event.touches.length > 0) {
      return {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      };
    }

    return null;
  };

  // Keep the compact preview centered under the pointer for stable menu drops.
  const centerDragOverlay = ({
    activatorEvent,
    activeNodeRect,
    overlayNodeRect,
    transform,
  }: {
    activatorEvent: Event | null;
    activeNodeRect: { left: number; top: number } | null;
    overlayNodeRect: { width: number; height: number } | null;
    transform: { x: number; y: number; scaleX: number; scaleY: number };
  }) => {
    const activatorCoordinates = getActivatorCoordinates(activatorEvent);
    if (!activatorCoordinates || !activeNodeRect || !overlayNodeRect) {
      return transform;
    }

    const activatorOffset = {
      x: activatorCoordinates.x - activeNodeRect.left,
      y: activatorCoordinates.y - activeNodeRect.top,
    };

    return {
      ...transform,
      x: transform.x + activatorOffset.x - overlayNodeRect.width / 2,
      y: transform.y + activatorOffset.y - overlayNodeRect.height / 2,
    };
  };

  const getDropStateFromPoint = useCallback(
    (point: {
      x: number;
      y: number;
    }): {
      dropTargetElement: HTMLElement | null;
      isOverSidebarDropScope: boolean;
    } => {
      const elements =
        document.elementsFromPoint?.(point.x, point.y) ??
        [document.elementFromPoint(point.x, point.y)].filter(Boolean);

      let dropTargetElement: HTMLElement | null = null;
      let isOverSidebarDropScope = false;

      for (const element of elements) {
        if (!(element instanceof HTMLElement)) {
          continue;
        }

        dropTargetElement ??= element.closest(
          "[data-task-drop-target]"
        ) as HTMLElement | null;
        isOverSidebarDropScope ||= Boolean(
          element.closest("[data-task-drop-scope='sidebar']")
        );

        if (dropTargetElement && isOverSidebarDropScope) {
          break;
        }
      }

      return { dropTargetElement, isOverSidebarDropScope };
    },
    []
  );

  const readTaskDropTarget = useCallback(
    (target: HTMLElement | null): TaskDropTarget | null => {
      if (!target) {
        return null;
      }

      if (target.dataset.taskDropTarget === "today") {
        return { type: "today" };
      }

      if (target.dataset.taskDropTarget === "category") {
        const category = target.dataset.taskDropCategory as
          | TaskCategory
          | undefined;

        if (
          category &&
          Object.values(TaskCategory).includes(category as TaskCategory)
        ) {
          return { type: "category", category };
        }
      }

      if (target.dataset.taskDropTarget === "tag") {
        const tagId = target.dataset.taskDropTagId;
        if (tagId) {
          return { type: "tag", tagId };
        }
      }

      return null;
    },
    []
  );

  const updateHoveredDropTarget = useCallback(
    (point: { x: number; y: number }) => {
      const {
        dropTargetElement: nextTarget,
        isOverSidebarDropScope: nextIsOverSidebarDropScope,
      } = getDropStateFromPoint(point);
      const nextDropTargetData = readTaskDropTarget(nextTarget);
      const nextIsOverExternalDropTarget = nextDropTargetData !== null;

      if (hoveredDropTargetRef.current !== nextTarget) {
        hoveredDropTargetRef.current?.removeAttribute("data-task-drop-hover");
        nextTarget?.setAttribute("data-task-drop-hover", "true");
        hoveredDropTargetRef.current = nextTarget;
      }

      hoveredDropTargetDataRef.current = nextDropTargetData;

      if (
        isOverExternalDropTargetRef.current !== nextIsOverExternalDropTarget
      ) {
        isOverExternalDropTargetRef.current = nextIsOverExternalDropTarget;
        setIsOverExternalDropTarget(nextIsOverExternalDropTarget);
      }

      if (isOverSidebarDropScopeRef.current !== nextIsOverSidebarDropScope) {
        isOverSidebarDropScopeRef.current = nextIsOverSidebarDropScope;
        setIsOverSidebarDropScope(nextIsOverSidebarDropScope);
      }
    },
    [getDropStateFromPoint, readTaskDropTarget]
  );

  const flushDropTargetTracking = useCallback(() => {
    trackingFrameRef.current = null;
    if (lastDragPointRef.current) {
      updateHoveredDropTarget(lastDragPointRef.current);
    }
  }, [updateHoveredDropTarget]);

  const scheduleDropTargetTracking = useCallback(
    (point: { x: number; y: number }) => {
      lastDragPointRef.current = point;

      if (trackingFrameRef.current !== null) {
        return;
      }

      trackingFrameRef.current = window.requestAnimationFrame(
        flushDropTargetTracking
      );
    },
    [flushDropTargetTracking]
  );

  const trackDragPointer = useCallback(
    (event: PointerEvent) => {
      scheduleDropTargetTracking({ x: event.clientX, y: event.clientY });
    },
    [scheduleDropTargetTracking]
  );

  const startDropTargetTracking = useCallback(
    (point: { x: number; y: number } | null) => {
      document.body.setAttribute("data-task-dragging", "true");
      if (point) {
        scheduleDropTargetTracking(point);
      }

      window.addEventListener("pointermove", trackDragPointer, {
        passive: true,
      });
    },
    [scheduleDropTargetTracking, trackDragPointer]
  );

  const stopDropTargetTracking = useCallback(() => {
    window.removeEventListener("pointermove", trackDragPointer);
    if (trackingFrameRef.current !== null) {
      window.cancelAnimationFrame(trackingFrameRef.current);
      trackingFrameRef.current = null;
    }
    document.body.removeAttribute("data-task-dragging");
    hoveredDropTargetRef.current?.removeAttribute("data-task-drop-hover");
    hoveredDropTargetRef.current = null;
    hoveredDropTargetDataRef.current = null;
    isOverExternalDropTargetRef.current = false;
    isOverSidebarDropScopeRef.current = false;
    setIsOverExternalDropTarget(false);
    setIsOverSidebarDropScope(false);
    lastDragPointRef.current = null;
  }, [trackDragPointer]);

  useEffect(() => {
    return () => {
      stopDropTargetTracking();
    };
  }, [stopDropTargetTracking]);

  // Group tasks by category if needed
  const groupedTasks = useMemo(
    () =>
      groupByCategory
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
        : { all: sortedTasks },
    [groupByCategory, sortedTasks]
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = sortedTasks.find((t) => t.id.value === String(active.id));
    setActiveTask(task || null);

    const activatorEvent = (event as any).activatorEvent;

    if (
      activatorEvent &&
      activatorEvent.clientX !== undefined &&
      activatorEvent.clientY !== undefined
    ) {
      startDropTargetTracking({
        x: activatorEvent.clientX,
        y: activatorEvent.clientY,
      });
    } else {
      startDropTargetTracking(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const activeTaskId = String(active.id);
    const wasOverExternalDropTarget = isOverExternalDropTargetRef.current;
    const finalDropState = lastDragPointRef.current
      ? getDropStateFromPoint(lastDragPointRef.current)
      : null;
    const finalDropTargetElement = finalDropState
      ? finalDropState.dropTargetElement
      : hoveredDropTargetRef.current;
    const finalDropTarget =
      (finalDropTargetElement && readTaskDropTarget(finalDropTargetElement)) ||
      (!finalDropState ? hoveredDropTargetDataRef.current : null);
    const wasOverSidebarDropScope =
      isOverSidebarDropScopeRef.current ||
      Boolean(finalDropState?.isOverSidebarDropScope);

    setActiveTask(null);
    stopDropTargetTracking();

    if (finalDropTarget?.type === "today") {
      onDropOnToday?.(activeTaskId);
      return;
    }

    if (finalDropTarget?.type === "category") {
      onDropOnCategory?.(activeTaskId, finalDropTarget.category);
      return;
    }

    if (finalDropTarget?.type === "tag") {
      onDropOnTag?.(activeTaskId, finalDropTarget.tagId);
      return;
    }

    if (wasOverExternalDropTarget || wasOverSidebarDropScope) {
      return;
    }

    if (!over || active.id === over.id) {
      return;
    }

    if (onReorder) {
      const oldIndex = sortedTasks.findIndex(
        (task) => task.id.value === activeTaskId
      );
      const newIndex = sortedTasks.findIndex(
        (task) => task.id.value === String(over.id)
      );
      const newTasks = arrayMove(sortedTasks, oldIndex, newIndex);
      onReorder(newTasks);
    }
  };

  const renderTaskCard = (task: Task) => {
    const animationDirection = taskAnimationDirections[task.id.value] ?? 1;

    // Use DeferredTaskCard for deferred tasks
    if (task.category === TaskCategory.DEFERRED && onUndefer) {
      return (
        <DeferredTaskCard
          key={task.id.value}
          task={task}
          onUndefer={onUndefer}
          animationDirection={animationDirection}
          isListDragActive={isDragActive}
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
        isOverdue={overdueTaskIds.has(task.id.value)}
        isInTodaySelection={todayTaskIdSet.has(task.id.value)}
        lastLog={lastLogs[task.id.value] || null}
        onLoadTaskLogs={onLoadTaskLogs}
        onCreateLog={onCreateLog}
        isDraggable={canDragTasks}
        isListDragActive={isDragActive}
        isActiveDragItem={activeTaskId === task.id.value}
        suppressDropIndicator={
          isOverExternalDropTarget || isOverSidebarDropScope
        }
        currentCategory={forceShowCategory ? undefined : currentCategory}
        taskViewModel={taskViewModel}
        tags={tags}
        selectedTagIds={taskTags[task.id.value] ?? []}
        onCreateTag={onCreateTag}
        onUpdateTaskTags={onUpdateTaskTags}
        animationDirection={animationDirection}
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
          <div className="space-y-4" data-testid="task-list">
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
                        <AnimatePresence initial={false}>
                          {categoryTasks.map(renderTaskCard)}
                        </AnimatePresence>
                      </div>
                    </SortableContext>
                  </div>
                );
              }
            )}
          </div>

          <DragOverlay
            dropAnimation={null}
            modifiers={[centerDragOverlay, restrictToWindowEdges]}
            style={{ pointerEvents: "none" }}
          >
            {activeTask ? (
              <motion.div
                className="pointer-events-none bg-white rounded-lg border-2 border-blue-300 shadow-lg p-2 max-w-[240px] text-sm"
                initial={{ scale: 0.8, opacity: 0.8 }}
                animate={{
                  scale: 1,
                  opacity: isOverSidebarDropScope ? 0.55 : 1,
                }}
                transition={{ duration: 0.12, ease: "easeOut" }}
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

      <AnimatePresence initial={false}>
        {sortedTasks.length === 0 && (
          <motion.div
            key="empty-state"
            className="text-center py-8 text-gray-500"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <p>{emptyMessage}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
