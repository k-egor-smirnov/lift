import { useRef, useState } from "react";
import { Inbox, Menu, Target, Zap } from "lucide-react";

import type { WorkspaceTaskReadModel } from "../../features/workspaces/application/ports/WorkspaceRepository";
import type { TodayViewModelDependencies } from "../../features/today/presentation/view-models/TodayViewModel";
import { TodayMobileView } from "../../features/today/presentation/components/TodayMobileView";
import type { TaskListItem } from "../../features/tasks/presentation/models/TaskListItem";
import type { TaskReorderIntent } from "../../features/tasks/presentation/models/TaskReorderIntent";
import type { Tag } from "../../features/tags/presentation/view-models/TagViewModel";
import type { LogEntry } from "../../shared/application/use-cases/GetTaskLogsUseCase";
import { TaskCategory } from "../../shared/domain/types";
import { MobileTaskInput } from "../../shared/ui/components/MobileTaskInput";
import type { ActiveView } from "./Sidebar";

interface SecureMobileLayoutProps {
  readonly todayDependencies: TodayViewModelDependencies;
  readonly tasks: readonly WorkspaceTaskReadModel[];
  readonly onMenu: () => void;
  readonly onViewChange: (view: ActiveView) => void;
  readonly onCreateTask: (
    title: string,
    category: TaskCategory
  ) => Promise<boolean>;
  readonly onEditTask: (task: TaskListItem) => void;
  readonly onDeleteTask: (taskId: string) => void;
  readonly onDefer: (taskId: string, date: string) => void;
  readonly onUndefer: (taskId: string) => Promise<void>;
  readonly onReorder: (intent: TaskReorderIntent) => void;
  readonly onLoadTaskLogs: (taskId: string) => Promise<LogEntry[]>;
  readonly onCreateLog: (taskId: string, message: string) => Promise<boolean>;
  readonly lastLogs: Record<string, LogEntry>;
  readonly tags: readonly Tag[];
  readonly taskTags: Record<string, string[]>;
}

const categories = [
  {
    id: TaskCategory.INBOX,
    label: "Входящие",
    icon: Inbox,
    color: "text-gray-600",
    bg: "bg-gray-100",
  },
  {
    id: TaskCategory.SIMPLE,
    label: "Простые",
    icon: Zap,
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
  {
    id: TaskCategory.FOCUS,
    label: "Фокус",
    icon: Target,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
] as const;

export const SecureMobileLayout = (props: SecureMobileLayoutProps) => {
  const viewport = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);

  return (
    <div className="h-[100dvh] overflow-hidden bg-gray-50 md:hidden">
      <button
        type="button"
        onClick={props.onMenu}
        aria-label="Открыть меню"
        className="fixed left-3 top-[max(.75rem,env(safe-area-inset-top))] z-50 rounded-xl border bg-white/95 p-2.5 shadow-sm backdrop-blur"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div
        ref={viewport}
        onScroll={(event) =>
          setPage(
            Math.round(
              event.currentTarget.scrollLeft / event.currentTarget.clientWidth
            )
          )
        }
        className="flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none]"
      >
        <section className="h-full w-full flex-none snap-start overflow-y-auto">
          <TodayMobileView
            refreshToken={props.tasks
              .map((task) => `${task.taskId}:${task.completion}`)
              .join("|")}
            dependencies={props.todayDependencies}
            onEditTask={props.onEditTask}
            onDeleteTask={props.onDeleteTask}
            onDefer={props.onDefer}
            onUndefer={props.onUndefer}
            onReorderTasks={props.onReorder}
            onLoadTaskLogs={props.onLoadTaskLogs}
            onCreateLog={props.onCreateLog}
            lastLogs={props.lastLogs}
            tags={props.tags}
            taskTags={props.taskTags}
          />
        </section>
        <section className="h-full w-full flex-none snap-start overflow-y-auto px-5 pb-28 pt-7">
          <h1 className="text-center text-2xl font-bold">Категории</h1>
          <p className="mt-2 text-center text-sm text-gray-500">
            Все локальные задачи по типу
          </p>
          <div className="mt-8 space-y-3">
            {categories.map(({ id, label, icon: Icon, color, bg }) => {
              const count = props.tasks.filter(
                (task) => task.completion === "active" && task.category === id
              ).length;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => props.onViewChange(id)}
                  className="flex w-full items-center gap-4 rounded-2xl border bg-white p-4 text-left shadow-sm"
                >
                  <span className={`rounded-xl p-3 ${bg} ${color}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="flex-1 font-semibold">{label}</span>
                  <span className="text-sm text-gray-500">{count}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() =>
              viewport.current?.scrollTo({ left: 0, behavior: "smooth" })
            }
            className="mt-6 w-full rounded-xl border bg-white px-4 py-3 text-sm font-medium"
          >
            Вернуться в Сегодня
          </button>
        </section>
      </div>
      <div className="pointer-events-none fixed bottom-[4.6rem] left-0 right-0 z-40 flex justify-center gap-1.5">
        <span
          className={`h-1.5 rounded-full transition-all ${page === 0 ? "w-5 bg-gray-800" : "w-1.5 bg-gray-300"}`}
        />
        <span
          className={`h-1.5 rounded-full transition-all ${page === 1 ? "w-5 bg-gray-800" : "w-1.5 bg-gray-300"}`}
        />
      </div>
      {page === 0 && (
        <MobileTaskInput
          onCreateTask={async (title, category) => {
            await props.onCreateTask(title, category);
          }}
        />
      )}
    </div>
  );
};
