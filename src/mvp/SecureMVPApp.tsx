import { useCallback, useEffect, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";

import type { SecureRuntime } from "../features/workspaces/application/SecureRuntime";
import type { SyncHealth } from "../features/workspaces/application/queries/GetSyncHealthQuery";
import type { WorkspaceTaskReadModel } from "../features/workspaces/application/ports/WorkspaceRepository";
import { SyncStatusIndicator } from "../features/workspaces/presentation/components/SyncStatusIndicator";
import { AllLogsView } from "../features/logs/presentation/components";
import { SecureSettings } from "../features/settings/presentation/components/SecureSettings";
import { StatisticsView } from "../features/stats/presentation/components";
import { useStatsViewModel } from "../features/stats/presentation/view-models/StatsViewModel";
import {
  TaskEditorDialog,
  type TaskEditorValue,
} from "../features/tasks/presentation/components/TaskEditorDialog";
import { TaskList } from "../features/tasks/presentation/components/TaskList";
import {
  workspaceTaskToListItem,
  type TaskListItem,
} from "../features/tasks/presentation/models/TaskListItem";
import type { TaskReorderIntent } from "../features/tasks/presentation/models/TaskReorderIntent";
import { TodayView } from "../features/today/presentation/components/TodayView";
import type { TodayViewModelDependencies } from "../features/today/presentation/view-models/TodayViewModel";
import type { Tag } from "../features/tags/presentation/view-models/TagViewModel";
import { ResultUtils, type Result } from "../shared/domain/Result";
import { TaskCategory } from "../shared/domain/types";
import type { LogEntry } from "../shared/application/use-cases/GetTaskLogsUseCase";
import { TaskLogService } from "../shared/application/services/TaskLogService";
import { Header } from "./components/Header";
import { Sidebar, type ActiveView } from "./components/Sidebar";
import { SecureMobileLayout } from "./components/SecureMobileLayout";

interface SecureMVPAppProps {
  readonly runtime: SecureRuntime;
}

const initialSyncHealth: SyncHealth = {
  kind: "offline-usable",
  matrixPhase: "signed-out",
  matrixLive: false,
  pendingOutbox: 0,
  pendingInbox: 0,
  waitingKeys: 0,
  pausedAuthorization: 0,
  quarantined: 0,
  conflicts: 0,
};

const tagColor = (tag: string): string => {
  const colors = [
    "#f43f5e",
    "#f59e0b",
    "#10b981",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
  ];
  let hash = 0;
  for (const character of tag) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length] ?? colors[0]!;
};

const requireSuccess = <T, E extends Error>(result: Result<T, E>): T => {
  if (ResultUtils.isFailure(result)) throw result.error;
  return result.data;
};

export const SecureMVPApp = ({ runtime }: SecureMVPAppProps) => {
  const [activeView, setActiveView] = useState<ActiveView>("today");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [tasks, setTasks] = useState<readonly WorkspaceTaskReadModel[]>([]);
  const [todayIds, setTodayIds] = useState<readonly string[]>([]);
  const [lastLogs, setLastLogs] = useState<Record<string, LogEntry>>({});
  const [editing, setEditing] = useState<TaskListItem | null>(null);
  const [localTags, setLocalTags] = useState<readonly string[]>([]);
  const [tagsCollapsed, setTagsCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncHealth, setSyncHealth] = useState<SyncHealth>(initialSyncHealth);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= 640
  );

  const logService = useMemo(
    () =>
      new TaskLogService(
        runtime.useCases.getTaskLogs,
        runtime.useCases.createUserLog
      ),
    [runtime]
  );
  const todayDependencies: TodayViewModelDependencies = useMemo(
    () => ({
      getTodayTasksUseCase: runtime.useCases.getTodayTasks,
      addTaskToTodayUseCase: runtime.useCases.addTaskToToday,
      removeTaskFromTodayUseCase: runtime.useCases.removeTaskFromToday,
      completeTaskUseCase: runtime.useCases.completeTask,
      revertTaskCompletionUseCase: runtime.useCases.reopenTask,
    }),
    [runtime]
  );
  const logDependencies = useMemo(
    () => ({
      getTaskLogsUseCase: runtime.useCases.getTaskLogs,
      createUserLogUseCase: runtime.useCases.createUserLog,
    }),
    [runtime]
  );

  const refresh = useCallback(
    async (withLogs = false) => {
      const [nextTasks, today] = await Promise.all([
        runtime.findTasks(),
        runtime.useCases.getTodayTasks.execute({ includeCompleted: true }),
      ]);
      setTasks(nextTasks);
      setTodayIds(requireSuccess(today).tasks.map((task) => task.taskId));
      if (withLogs)
        setLastLogs(
          await logService.loadLastLogsForTasks(
            nextTasks.map((task) => task.taskId)
          )
        );
      setLoading(false);
    },
    [logService, runtime]
  );

  useEffect(() => {
    void refresh(true).catch((error) =>
      toast.error(error instanceof Error ? error.message : "Ошибка чтения")
    );
  }, [refresh]);
  useEffect(() => {
    const interval = setInterval(
      () => void refresh(false).catch(() => undefined),
      1_000
    );
    return () => clearInterval(interval);
  }, [refresh]);
  useEffect(() => {
    const update = () =>
      void runtime
        .syncHealth()
        .then(setSyncHealth)
        .catch(() => undefined);
    update();
    const interval = setInterval(update, 1_000);
    addEventListener("online", update);
    addEventListener("offline", update);
    return () => {
      clearInterval(interval);
      removeEventListener("online", update);
      removeEventListener("offline", update);
    };
  }, [runtime]);
  useEffect(() => {
    useStatsViewModel.getState().initialize(runtime.useCases.statistics);
  }, [runtime]);
  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth <= 640);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const tagNames = useMemo(
    () =>
      [
        ...new Set([...localTags, ...tasks.flatMap((task) => task.tags)]),
      ].sort(),
    [localTags, tasks]
  );
  const tags: Tag[] = useMemo(
    () => tagNames.map((name) => ({ id: name, name, color: tagColor(name) })),
    [tagNames]
  );
  const taskTags = useMemo(
    () =>
      Object.fromEntries(tasks.map((task) => [task.taskId, [...task.tags]])),
    [tasks]
  );
  const taskCounts = useMemo(
    () =>
      Object.fromEntries(
        Object.values(TaskCategory).map((category) => [
          category,
          tasks.filter(
            (task) => task.completion === "active" && task.category === category
          ).length,
        ])
      ) as Record<TaskCategory, number>,
    [tasks]
  );
  const tagCounts = useMemo(
    () =>
      Object.fromEntries(
        tags.map((tag) => [
          tag.id,
          tasks.filter((task) => task.tags.includes(tag.id)).length,
        ])
      ),
    [tags, tasks]
  );

  const mutate = useCallback(
    async (operation: () => Promise<Result<unknown, Error>>) => {
      try {
        requireSuccess(await operation());
        await refresh(true);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Не удалось сохранить изменение"
        );
        throw error;
      }
    },
    [refresh]
  );

  const createTask = useCallback(
    async (title: string, category: TaskCategory) => {
      try {
        const created = requireSuccess(
          await runtime.useCases.createTask.execute({
            title,
            category,
            addToToday: activeView === "today",
          })
        );
        if (activeView.startsWith("tag:")) {
          const tagged = await runtime.useCases.updateTaskTags.execute({
            taskId: created.taskId,
            tags: [activeView.slice(4)],
          });
          if (ResultUtils.isFailure(tagged))
            toast.warning(
              "Задача создана, но тэг не назначен. Повторите назначение в редакторе."
            );
        }
        await refresh(true);
        return true;
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Не удалось создать задачу"
        );
        return false;
      }
    },
    [activeView, refresh, runtime]
  );

  const toggleToday = useCallback(
    async (taskId: string) => {
      await mutate(() =>
        todayIds.includes(taskId)
          ? runtime.useCases.removeTaskFromToday.execute({ taskId })
          : runtime.useCases.addTaskToToday.execute({ taskId })
      );
    },
    [mutate, runtime, todayIds]
  );
  const defer = useCallback(
    async (taskId: string, deferredUntil: string) => {
      await mutate(() =>
        runtime.useCases.deferTask.execute({ taskId, deferredUntil })
      );
    },
    [mutate, runtime]
  );
  const reorder = useCallback(
    async (intent: TaskReorderIntent) => {
      await mutate(() => runtime.useCases.reorderTasks.execute(intent));
    },
    [mutate, runtime]
  );

  const saveEditor = useCallback(
    async (value: TaskEditorValue) => {
      if (editing === null) return;
      const taskId = editing.taskId;
      requireSuccess(
        await runtime.useCases.changeTaskTitle.execute({
          taskId,
          title: value.title,
        })
      );
      requireSuccess(
        await runtime.useCases.changeTaskNote.execute({
          taskId,
          note: value.note,
        })
      );
      if (editing.category !== value.category)
        requireSuccess(
          await runtime.useCases.updateTask.execute({
            taskId,
            category: value.category,
          })
        );
      requireSuccess(
        await runtime.useCases.updateTaskTags.execute({
          taskId,
          tags: value.tags,
        })
      );
      await refresh(true);
    },
    [editing, refresh, runtime]
  );

  const renameTag = useCallback(
    async (from: string, to: string) => {
      const normalized = to.trim();
      if (!normalized || normalized === from) return;
      await Promise.all(
        tasks
          .filter((task) => task.tags.includes(from))
          .map((task) =>
            runtime.useCases.updateTaskTags
              .execute({
                taskId: task.taskId,
                tags: task.tags.map((tag) => (tag === from ? normalized : tag)),
              })
              .then(requireSuccess)
          )
      );
      setLocalTags((values) =>
        values.map((tag) => (tag === from ? normalized : tag))
      );
      await refresh();
    },
    [refresh, runtime, tasks]
  );
  const deleteTag = useCallback(
    async (tag: string) => {
      await Promise.all(
        tasks
          .filter((task) => task.tags.includes(tag))
          .map((task) =>
            runtime.useCases.updateTaskTags
              .execute({
                taskId: task.taskId,
                tags: task.tags.filter((value) => value !== tag),
              })
              .then(requireSuccess)
          )
      );
      setLocalTags((values) => values.filter((value) => value !== tag));
      await refresh();
    },
    [refresh, runtime, tasks]
  );

  const selectedTag = activeView.startsWith("tag:")
    ? activeView.slice(4)
    : null;
  const category = Object.values(TaskCategory).includes(
    activeView as TaskCategory
  )
    ? (activeView as TaskCategory)
    : TaskCategory.INBOX;
  const visibleTasks = tasks.filter(
    (task) =>
      task.completion === "active" &&
      (selectedTag !== null
        ? task.tags.includes(selectedTag)
        : task.category === category)
  );
  const signature = tasks
    .map(
      (task) =>
        `${task.taskId}:${task.title}:${task.category}:${task.completion}`
    )
    .join("|");

  const commonList = {
    onDelete: (taskId: string) => {
      if (confirm("Удалить задачу?"))
        void mutate(() => runtime.useCases.deleteTask.execute({ taskId }));
    },
    onEdit: setEditing,
    onComplete: (taskId: string) => {
      void mutate(() => runtime.useCases.completeTask.execute({ taskId }));
    },
    onRevertCompletion: (taskId: string) => {
      void mutate(() => runtime.useCases.reopenTask.execute({ taskId }));
    },
    onAddToToday: (taskId: string) => {
      void toggleToday(taskId);
    },
    onDefer: (taskId: string, date: string) => {
      void defer(taskId, date);
    },
    onUndefer: async (taskId: string) => {
      await mutate(() => runtime.useCases.undeferTask.execute({ taskId }));
    },
    onReorder: (intent: TaskReorderIntent) => {
      void reorder(intent);
    },
    onLoadTaskLogs: (taskId: string) => logService.loadTaskLogs(taskId),
    onCreateLog: (taskId: string, message: string) =>
      logService.createLog(taskId, message).then(async (success) => {
        if (success) await refresh(true);
        return success;
      }),
    lastLogs,
    tags,
    taskTags,
    onDropOnToday: (taskId: string) => {
      void toggleToday(taskId);
    },
    onDropOnCategory: (taskId: string, next: TaskCategory) => {
      if (next === TaskCategory.DEFERRED) {
        const date = new Date();
        date.setDate(date.getDate() + 1);
        void defer(taskId, date.toISOString().slice(0, 10));
      } else
        void mutate(() =>
          runtime.useCases.updateTask.execute({ taskId, category: next })
        );
    },
    onDropOnTag: (taskId: string, tag: string) => {
      const current = tasks.find((task) => task.taskId === taskId)?.tags ?? [];
      void mutate(() =>
        runtime.useCases.updateTaskTags.execute({
          taskId,
          tags: [...new Set([...current, tag])],
        })
      );
    },
  };

  const sidebar = (
    <Sidebar
      activeView={activeView}
      onViewChange={setActiveView}
      taskCounts={taskCounts}
      hasOverdueTasks={false}
      isMobileMenuOpen={mobileMenu}
      onMobileMenuClose={() => setMobileMenu(false)}
      showTodayHighlight={todayIds.length > 0}
      tags={tags}
      tagsCollapsed={tagsCollapsed}
      tagTaskCounts={tagCounts}
      onCreateTag={(name) =>
        setLocalTags((values) => [...new Set([...values, name.trim()])])
      }
      onRenameTag={(id, name) => void renameTag(id, name)}
      onDeleteTag={(id) => void deleteTag(id)}
      onToggleTagsCollapsed={() => setTagsCollapsed((value) => !value)}
    />
  );

  if (isMobile && activeView === "today" && !loading) {
    return (
      <div className="min-h-[100dvh] bg-background text-foreground">
        {sidebar}
        <SecureMobileLayout
          todayDependencies={todayDependencies}
          tasks={tasks}
          onMenu={() => setMobileMenu(true)}
          onViewChange={setActiveView}
          onCreateTask={createTask}
          onEditTask={setEditing}
          onDeleteTask={commonList.onDelete}
          onDefer={commonList.onDefer}
          onUndefer={commonList.onUndefer}
          onReorder={commonList.onReorder}
          onLoadTaskLogs={commonList.onLoadTaskLogs}
          onCreateLog={commonList.onCreateLog}
          lastLogs={lastLogs}
          tags={tags}
          taskTags={taskTags}
        />
        <TaskEditorDialog
          task={editing}
          tags={tags}
          selectedTags={
            editing === null ? [] : (taskTags[editing.taskId] ?? [])
          }
          onClose={() => setEditing(null)}
          onSave={saveEditor}
        />
        <Toaster richColors position="bottom-center" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {sidebar}
      <div className="md:pl-64">
        <Header
          activeView={activeView}
          activeTagName={selectedTag ?? undefined}
          onMobileMenuToggle={() => setMobileMenu((value) => !value)}
        />
        <SyncStatusIndicator health={syncHealth} />
        <main className="px-4 pb-12 pt-28 md:px-8 md:pt-6">
          {loading ? (
            <div className="py-16 text-center text-gray-500">Загрузка…</div>
          ) : activeView === "today" ? (
            <TodayView
              key={signature}
              dependencies={todayDependencies}
              onEditTask={setEditing}
              onDeleteTask={commonList.onDelete}
              onDefer={commonList.onDefer}
              onUndefer={commonList.onUndefer}
              onReorderTasks={commonList.onReorder}
              onLoadTaskLogs={commonList.onLoadTaskLogs}
              onCreateLog={commonList.onCreateLog}
              lastLogs={lastLogs}
              onCreateTask={createTask}
              tags={tags}
              taskTags={taskTags}
              onDropOnToday={commonList.onDropOnToday}
              onDropOnCategory={commonList.onDropOnCategory}
              onDropOnTag={commonList.onDropOnTag}
            />
          ) : activeView === "logs" ? (
            <div className="mx-auto max-w-4xl">
              <AllLogsView dependencies={logDependencies} />
            </div>
          ) : activeView === "settings" ? (
            <SecureSettings runtime={runtime} />
          ) : activeView === "stats" ? (
            <StatisticsView />
          ) : (
            <div className="mx-auto max-w-4xl">
              <TaskList
                tasks={visibleTasks.map(workspaceTaskToListItem)}
                currentCategory={category}
                todayTaskIds={todayIds}
                showTodayButton
                showDeferButton
                onCreateTask={createTask}
                emptyMessage="Задач пока нет"
                forceShowCategory={selectedTag !== null}
                {...commonList}
              />
            </div>
          )}
        </main>
      </div>
      <TaskEditorDialog
        task={editing}
        tags={tags}
        selectedTags={editing === null ? [] : (taskTags[editing.taskId] ?? [])}
        onClose={() => setEditing(null)}
        onSave={saveEditor}
      />
      <Toaster richColors position="bottom-right" />
    </div>
  );
};
