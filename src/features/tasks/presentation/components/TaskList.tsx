import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import { AnimatePresence, motion } from "framer-motion";
import { FileClock, Inbox, Target, Zap } from "lucide-react";

import type { LogEntry } from "../../../../shared/application/use-cases/GetTaskLogsUseCase";
import { TaskCategory } from "../../../../shared/domain/types";
import { InlineTaskCreator } from "../../../../shared/ui/components/InlineTaskCreator";
import type { Tag } from "../../../tags/presentation/view-models/TagViewModel";
import type { TaskListItem } from "../models/TaskListItem";
import {
  taskReorderIntent,
  type TaskReorderIntent,
} from "../models/TaskReorderIntent";
import { DeferredTaskCard } from "./DeferredTaskCard";
import { TaskCard } from "./TaskCard";
import { TaskDeferModal } from "./task-card/TaskDeferModal";

interface TaskListProps {
  tasks: readonly TaskListItem[];
  groupByCategory?: boolean;
  showTodayButton?: boolean;
  showDeferButton?: boolean;
  todayTaskIds?: readonly string[];
  onComplete?: (taskId: string) => void;
  onRevertCompletion?: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onEdit?: (task: TaskListItem) => void;
  onAddToToday?: (taskId: string) => void;
  onDefer?: (taskId: string, deferDate: string) => void;
  onUndefer?: (taskId: string) => Promise<void>;
  onReorder?: (intent: TaskReorderIntent) => void;
  onLoadTaskLogs?: (taskId: string) => Promise<LogEntry[]>;
  onCreateLog?: (taskId: string, message: string) => Promise<boolean>;
  onCreateTask?: (title: string, category: TaskCategory) => Promise<boolean>;
  lastLogs?: Readonly<Record<string, LogEntry>>;
  emptyMessage?: string;
  currentCategory?: TaskCategory;
  tags?: readonly Tag[];
  taskTags?: Readonly<Record<string, readonly string[]>>;
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

const categoryOrder: readonly TaskCategory[] = [
  TaskCategory.INBOX,
  TaskCategory.SIMPLE,
  TaskCategory.FOCUS,
  TaskCategory.DEFERRED,
];

const isTaskCategory = (value: string | undefined): value is TaskCategory =>
  value !== undefined && categoryOrder.some((category) => category === value);

export const TaskList: React.FC<TaskListProps> = ({
  tasks,
  groupByCategory = false,
  showTodayButton = false,
  showDeferButton = false,
  todayTaskIds = [],
  onComplete,
  onRevertCompletion,
  onDelete,
  onEdit,
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
  tags = [],
  taskTags = {},
  onDropOnToday,
  onDropOnCategory,
  onDropOnTag,
  forceShowCategory = false,
}) => {
  const [activeTask, setActiveTask] = useState<TaskListItem | null>(null);
  const [deferredDropTaskId, setDeferredDropTaskId] = useState<string | null>(
    null
  );
  const [isOverExternalDropTarget, setIsOverExternalDropTarget] =
    useState(false);
  const [isOverSidebarDropScope, setIsOverSidebarDropScope] = useState(false);
  const previousTaskPositionsRef = useRef(new Map<string, number>());
  const lastDragPointRef = useRef<{ x: number; y: number } | null>(null);
  const hoveredDropTargetRef = useRef<HTMLElement | null>(null);
  const hoveredDropTargetDataRef = useRef<TaskDropTarget | null>(null);
  const isOverExternalDropTargetRef = useRef(false);
  const isOverSidebarDropScopeRef = useRef(false);
  const trackingFrameRef = useRef<number | null>(null);

  const taskAnimationDirections = useMemo(
    () =>
      tasks.reduce<Record<string, TaskAnimationDirection>>(
        (directions, task, index) => {
          const previousIndex = previousTaskPositionsRef.current.get(
            task.taskId
          );
          directions[task.taskId] =
            previousIndex !== undefined && index < previousIndex ? -1 : 1;
          return directions;
        },
        {}
      ),
    [tasks]
  );

  useEffect(() => {
    previousTaskPositionsRef.current = new Map(
      tasks.map((task, index) => [task.taskId, index])
    );
  }, [tasks]);

  const todayTaskIdSet = useMemo(() => new Set(todayTaskIds), [todayTaskIds]);
  const canDragTasks = Boolean(
    onReorder || onDropOnToday || onDropOnCategory || onDropOnTag
  );
  const isDragActive = activeTask !== null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const getActivatorCoordinates = (event: Event | null) => {
    if (event instanceof MouseEvent) {
      return { x: event.clientX, y: event.clientY };
    }

    if (
      typeof TouchEvent !== "undefined" &&
      event instanceof TouchEvent &&
      event.touches.length > 0
    ) {
      return { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }

    return null;
  };

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
    const coordinates = getActivatorCoordinates(activatorEvent);
    if (!coordinates || !activeNodeRect || !overlayNodeRect) return transform;

    return {
      ...transform,
      x:
        transform.x +
        coordinates.x -
        activeNodeRect.left -
        overlayNodeRect.width / 2,
      y:
        transform.y +
        coordinates.y -
        activeNodeRect.top -
        overlayNodeRect.height / 2,
    };
  };

  const getDropStateFromPoint = useCallback(
    (point: { x: number; y: number }) => {
      const hit = document.elementFromPoint?.(point.x, point.y) ?? null;
      const elements =
        document.elementsFromPoint?.(point.x, point.y) ?? (hit ? [hit] : []);
      let dropTargetElement: HTMLElement | null = null;
      let overSidebar = false;

      for (const element of elements) {
        if (!(element instanceof HTMLElement)) continue;
        dropTargetElement ??= element.closest(
          "[data-task-drop-target]"
        ) as HTMLElement | null;
        overSidebar ||= Boolean(
          element.closest("[data-task-drop-scope='sidebar']")
        );
        if (dropTargetElement && overSidebar) break;
      }

      return { dropTargetElement, isOverSidebarDropScope: overSidebar };
    },
    []
  );

  const readTaskDropTarget = useCallback(
    (target: HTMLElement | null): TaskDropTarget | null => {
      if (!target) return null;

      if (target.dataset.taskDropTarget === "today") return { type: "today" };

      if (target.dataset.taskDropTarget === "category") {
        const category = target.dataset.taskDropCategory;
        return isTaskCategory(category) ? { type: "category", category } : null;
      }

      if (target.dataset.taskDropTarget === "tag") {
        const tagId = target.dataset.taskDropTagId;
        return tagId ? { type: "tag", tagId } : null;
      }

      return null;
    },
    []
  );

  const updateHoveredDropTarget = useCallback(
    (point: { x: number; y: number }) => {
      const state = getDropStateFromPoint(point);
      const nextTarget = state.dropTargetElement;
      const nextData = readTaskDropTarget(nextTarget);
      const nextExternal = nextData !== null;

      if (hoveredDropTargetRef.current !== nextTarget) {
        hoveredDropTargetRef.current?.removeAttribute("data-task-drop-hover");
        nextTarget?.setAttribute("data-task-drop-hover", "true");
        hoveredDropTargetRef.current = nextTarget;
      }

      hoveredDropTargetDataRef.current = nextData;
      isOverExternalDropTargetRef.current = nextExternal;
      isOverSidebarDropScopeRef.current = state.isOverSidebarDropScope;
      setIsOverExternalDropTarget(nextExternal);
      setIsOverSidebarDropScope(state.isOverSidebarDropScope);
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
      if (trackingFrameRef.current !== null) return;
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
      if (point) scheduleDropTargetTracking(point);
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

  useEffect(() => stopDropTargetTracking, [stopDropTargetTracking]);

  const groupedTasks = useMemo(() => {
    if (!groupByCategory) {
      return [{ key: "all", category: null, tasks }];
    }

    return categoryOrder
      .map((category) => ({
        key: category,
        category,
        tasks: tasks.filter((task) => task.category === category),
      }))
      .filter((group) => group.tasks.length > 0);
  }, [groupByCategory, tasks]);

  const handleDragStart = (event: DragStartEvent) => {
    const taskId = String(event.active.id);
    setActiveTask(tasks.find((task) => task.taskId === taskId) ?? null);
    startDropTargetTracking(getActivatorCoordinates(event.activatorEvent));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const activeTaskId = String(event.active.id);
    const finalState = lastDragPointRef.current
      ? getDropStateFromPoint(lastDragPointRef.current)
      : null;
    const finalTargetElement = finalState
      ? finalState.dropTargetElement
      : hoveredDropTargetRef.current;
    const finalTarget =
      readTaskDropTarget(finalTargetElement) ??
      (finalState ? null : hoveredDropTargetDataRef.current);
    const wasOverSidebar =
      isOverSidebarDropScopeRef.current ||
      Boolean(finalState?.isOverSidebarDropScope);
    const wasOverExternal = isOverExternalDropTargetRef.current;

    setActiveTask(null);
    stopDropTargetTracking();

    if (finalTarget?.type === "today") {
      onDropOnToday?.(activeTaskId);
      return;
    }

    if (finalTarget?.type === "category") {
      if (finalTarget.category === TaskCategory.DEFERRED) {
        setDeferredDropTaskId(activeTaskId);
      } else {
        onDropOnCategory?.(activeTaskId, finalTarget.category);
      }
      return;
    }

    if (finalTarget?.type === "tag") {
      onDropOnTag?.(activeTaskId, finalTarget.tagId);
      return;
    }

    if (wasOverExternal || wasOverSidebar || !event.over) return;

    const intent = taskReorderIntent(
      tasks.map((task) => task.taskId),
      activeTaskId,
      String(event.over.id)
    );
    if (intent) onReorder?.(intent);
  };

  const getCategoryIcon = (category: TaskCategory) => {
    switch (category) {
      case TaskCategory.SIMPLE:
        return Zap;
      case TaskCategory.FOCUS:
        return Target;
      case TaskCategory.INBOX:
        return Inbox;
      case TaskCategory.DEFERRED:
        return FileClock;
    }
  };

  const renderTaskCard = (task: TaskListItem) => {
    const animationDirection = taskAnimationDirections[task.taskId] ?? 1;

    if (task.category === TaskCategory.DEFERRED && onUndefer) {
      return (
        <DeferredTaskCard
          key={task.taskId}
          task={task}
          onUndefer={onUndefer}
          animationDirection={animationDirection}
          isListDragActive={isDragActive}
        />
      );
    }

    return (
      <TaskCard
        key={task.taskId}
        task={task}
        onComplete={(taskId) => onComplete?.(taskId)}
        onRevertCompletion={onRevertCompletion}
        onDelete={onDelete}
        onEdit={onEdit ? () => onEdit(task) : undefined}
        onAddToToday={onAddToToday}
        onDefer={onDefer}
        showTodayButton={showTodayButton}
        showDeferButton={showDeferButton}
        isInTodaySelection={todayTaskIdSet.has(task.taskId)}
        lastLog={lastLogs[task.taskId] ?? null}
        onLoadTaskLogs={onLoadTaskLogs}
        onCreateLog={onCreateLog}
        isDraggable={canDragTasks}
        isListDragActive={isDragActive}
        isActiveDragItem={activeTask?.taskId === task.taskId}
        suppressDropIndicator={
          isOverExternalDropTarget || isOverSidebarDropScope
        }
        currentCategory={forceShowCategory ? undefined : currentCategory}
        tags={tags}
        selectedTagIds={taskTags[task.taskId] ?? []}
        animationDirection={animationDirection}
      />
    );
  };

  return (
    <div className="space-y-6">
      {onCreateTask &&
        currentCategory &&
        currentCategory !== TaskCategory.DEFERRED && (
          <InlineTaskCreator
            onCreateTask={onCreateTask}
            category={currentCategory}
            placeholder="Добавить задачу..."
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
            {groupedTasks.map((group) => {
              const CategoryIcon = group.category
                ? getCategoryIcon(group.category)
                : null;

              return (
                <div key={group.key}>
                  {groupByCategory && group.category && CategoryIcon && (
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
                        <CategoryIcon className="w-5 h-5" />
                        {group.category}
                        <span className="text-sm font-normal text-gray-500">
                          ({group.tasks.length})
                        </span>
                      </h3>
                    </div>
                  )}
                  <SortableContext
                    items={group.tasks.map((task) => task.taskId)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-3">
                      <AnimatePresence initial={false}>
                        {group.tasks.map(renderTaskCard)}
                      </AnimatePresence>
                    </div>
                  </SortableContext>
                </div>
              );
            })}
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
                  {activeTask.title}
                </p>
                {lastLogs[activeTask.taskId] && (
                  <p className="mt-1 text-xs text-gray-500 truncate">
                    {lastLogs[activeTask.taskId].message}
                  </p>
                )}
              </motion.div>
            ) : null}
          </DragOverlay>
        </div>
      </DndContext>

      <AnimatePresence initial={false}>
        {tasks.length === 0 && (
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

      <TaskDeferModal
        isOpen={deferredDropTaskId !== null}
        onClose={() => setDeferredDropTaskId(null)}
        onDeferConfirm={(date) => {
          if (deferredDropTaskId) onDefer?.(deferredDropTaskId, date);
          setDeferredDropTaskId(null);
        }}
      />
    </div>
  );
};
