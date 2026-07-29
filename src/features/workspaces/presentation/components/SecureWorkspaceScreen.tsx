import React, { useCallback, useEffect, useState } from "react";

import type { SecureRuntime } from "../../application/SecureRuntime";
import type { SecureSyncDiagnostics } from "../../application/SecureRuntime";
import type { WorkspaceTaskReadModel } from "../../application/ports/WorkspaceRepository";
import { ResultUtils, type Result } from "../../../../shared/domain/Result";
import { TaskCategory } from "../../../../shared/domain/types";

interface SecureWorkspaceScreenProps {
  readonly runtime: SecureRuntime;
}

export const SecureWorkspaceScreen: React.FC<SecureWorkspaceScreenProps> = ({
  runtime,
}) => {
  const [tasks, setTasks] = useState<readonly WorkspaceTaskReadModel[]>([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TaskCategory>(TaskCategory.INBOX);
  const [todayOnly, setTodayOnly] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [sync, setSync] = useState<SecureSyncDiagnostics | null>(null);

  const refresh = useCallback(async () => {
    try {
      const date = await runtime.effectiveDate();
      const nextTasks = todayOnly
        ? await runtime.useCases.getTodayTasks.execute({
            includeCompleted: true,
          })
        : null;
      if (nextTasks !== null && ResultUtils.isFailure(nextTasks)) {
        throw nextTasks.error;
      }
      setEffectiveDate(date);
      setTasks(
        nextTasks === null ? await runtime.findTasks() : nextTasks.data.tasks
      );
      setSync(await runtime.syncDiagnostics());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Read failed");
    }
  }, [runtime, todayOnly]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(() => void refresh(), 1_000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const createTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (title.trim().length === 0) return;
    setBusy(true);
    const result = await runtime.useCases.createTask.execute({
      title,
      category,
    });
    if (ResultUtils.isFailure(result)) setError(result.error.message);
    else {
      setTitle("");
      await refresh();
    }
    setBusy(false);
  };

  const mutate = async (operation: () => Promise<Result<unknown, Error>>) => {
    setBusy(true);
    try {
      const result = await operation();
      if (ResultUtils.isFailure(result)) throw result.error;
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Write failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-5 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Lift</h1>
            <p className="text-xs text-slate-400">
              {effectiveDate} · local-first · {online ? "online" : "offline"}
            </p>
            {sync !== null && (
              <p
                className="text-xs text-slate-500"
                data-testid="sync-diagnostics"
              >
                Matrix {sync.matrixPhase}/{sync.inboxLifecycle} · sync: out{" "}
                {sync.pendingOutbox}/{sync.acknowledgedOutbox} · in{" "}
                {sync.pendingInbox}
                {sync.pendingReasons.length > 0
                  ? ` (${sync.pendingStates.join(",")}:${sync.pendingReasons.join(",")})`
                  : ""}{" "}
                · keys {sync.waitingKeys} · quarantine {sync.quarantined}
                {sync.quarantineReasons.length > 0
                  ? ` (${sync.quarantineReasons.join(",")})`
                  : ""}
              </p>
            )}
          </div>
          <div className="flex rounded-lg bg-slate-900 p-1 text-sm">
            <button
              onClick={() => setTodayOnly(false)}
              className={`rounded-md px-3 py-1.5 ${todayOnly ? "text-slate-400" : "bg-slate-700"}`}
            >
              Все
            </button>
            <button
              onClick={() => setTodayOnly(true)}
              className={`rounded-md px-3 py-1.5 ${todayOnly ? "bg-slate-700" : "text-slate-400"}`}
            >
              Сегодня
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-4xl space-y-5 px-5 py-6">
        <form onSubmit={createTask} className="flex flex-col gap-3 sm:flex-row">
          <input
            aria-label="Новая задача"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Новая заметка или задача"
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
          />
          <select
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as TaskCategory)
            }
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
          >
            <option value={TaskCategory.INBOX}>Inbox</option>
            <option value={TaskCategory.SIMPLE}>Simple</option>
            <option value={TaskCategory.FOCUS}>Focus</option>
          </select>
          <button
            disabled={busy}
            className="rounded-lg bg-cyan-500 px-4 py-2 font-medium text-slate-950 disabled:opacity-50"
          >
            Добавить
          </button>
        </form>

        {error && (
          <p className="rounded-lg bg-red-950 p-3 text-red-300">{error}</p>
        )}

        <ul className="space-y-2" data-testid="secure-task-list">
          {tasks.map((task) => (
            <li
              key={task.taskId}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4"
            >
              <button
                aria-label={
                  task.completion === "active" ? "Завершить" : "Вернуть"
                }
                onClick={() =>
                  void mutate(() =>
                    task.completion === "active"
                      ? runtime.useCases.completeTask.execute({
                          taskId: task.taskId,
                        })
                      : runtime.useCases.reopenTask.execute({
                          taskId: task.taskId,
                        })
                  )
                }
                className="h-5 w-5 rounded-full border border-cyan-400"
              >
                {task.completion === "completed" ? "✓" : ""}
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={
                    task.completion === "completed"
                      ? "line-through text-slate-500"
                      : ""
                  }
                >
                  {task.title}
                </p>
                <p className="text-xs text-slate-500">{task.category}</p>
              </div>
              {todayOnly ? (
                <button
                  onClick={() =>
                    void mutate(() =>
                      runtime.useCases.removeTaskFromToday.execute({
                        taskId: task.taskId,
                      })
                    )
                  }
                  className="text-xs text-cyan-300"
                >
                  Убрать
                </button>
              ) : (
                <button
                  onClick={() =>
                    void mutate(() =>
                      runtime.useCases.addTaskToToday.execute({
                        taskId: task.taskId,
                      })
                    )
                  }
                  className="text-xs text-cyan-300"
                >
                  Сегодня
                </button>
              )}
              <button
                onClick={() =>
                  void mutate(() =>
                    runtime.useCases.deleteTask.execute({ taskId: task.taskId })
                  )
                }
                className="text-xs text-red-300"
              >
                Удалить
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
};
