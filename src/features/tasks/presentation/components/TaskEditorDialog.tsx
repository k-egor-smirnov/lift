import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { TaskCategory } from "../../../../shared/domain/types";
import type { Tag } from "../../../tags/presentation/view-models/TagViewModel";
import type { TaskListItem } from "../models/TaskListItem";

export interface TaskEditorValue {
  readonly title: string;
  readonly note: string;
  readonly category: TaskCategory;
  readonly tags: readonly string[];
}

interface TaskEditorDialogProps {
  readonly task: TaskListItem | null;
  readonly tags: readonly Tag[];
  readonly selectedTags: readonly string[];
  readonly onClose: () => void;
  readonly onSave: (value: TaskEditorValue) => Promise<void>;
}

export const TaskEditorDialog = ({
  task,
  tags,
  selectedTags,
  onClose,
  onSave,
}: TaskEditorDialogProps) => {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<TaskCategory>(TaskCategory.INBOX);
  const [taskTags, setTaskTags] = useState<readonly string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (task === null) return;
    setTitle(task.title);
    setNote(task.note);
    setCategory(
      task.category === TaskCategory.DEFERRED
        ? TaskCategory.INBOX
        : task.category
    );
    setTaskTags(selectedTags);
    setError(null);
  }, [selectedTags, task]);

  if (task === null) return null;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({ title, note, category, tags: taskTags });
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Не удалось сохранить задачу"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Редактирование задачи"
    >
      <button
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Закрыть"
      />
      <section className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">Редактирование задачи</h2>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-gray-100"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="space-y-4 overflow-auto p-4">
          <label className="block text-sm font-medium">
            Название
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 font-normal"
            />
          </label>
          <label className="block text-sm font-medium">
            Категория
            <select
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as TaskCategory)
              }
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 font-normal"
            >
              <option value={TaskCategory.INBOX}>Inbox</option>
              <option value={TaskCategory.SIMPLE}>Simple</option>
              <option value={TaskCategory.FOCUS}>Focus</option>
            </select>
          </label>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Тэги</legend>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const active = taskTags.includes(tag.id);
                return (
                  <button
                    type="button"
                    key={tag.id}
                    onClick={() =>
                      setTaskTags(
                        active
                          ? taskTags.filter((value) => value !== tag.id)
                          : [...taskTags, tag.id]
                      )
                    }
                    className={`rounded-full border px-3 py-1 text-xs ${active ? "bg-gray-100 ring-2 ring-blue-200" : "bg-white"}`}
                    style={{ color: tag.color }}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <label className="block text-sm font-medium">
            Заметка
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1 min-h-36 w-full resize-y rounded-md border p-3 font-normal"
              placeholder="Добавить заметку…"
            />
          </label>
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="flex justify-end gap-3 border-t bg-gray-50 p-4">
          <button
            onClick={onClose}
            className="rounded-md border bg-white px-4 py-2 text-sm"
          >
            Отмена
          </button>
          <button
            onClick={() => void save()}
            disabled={saving || !title.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </footer>
      </section>
    </div>
  );
};
