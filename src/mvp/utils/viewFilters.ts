import { Task } from "@/shared/domain/entities/Task";
import { TaskCategory } from "@/shared/domain/types";
import { ActiveView } from "../components/Sidebar";

interface GetVisibleTasksParams {
  activeView: ActiveView;
  tasks: Task[];
  taskTags: Record<string, string[]>;
}

export const getVisibleTasks = ({
  activeView,
  tasks,
  taskTags,
}: GetVisibleTasksParams): Task[] => {
  const activeTasks = tasks.filter((task) => task.isActive);

  const categoryFilteredTasks =
    activeView === "today" ||
    activeView === "logs" ||
    activeView === "settings" ||
    activeView.startsWith("tag:")
      ? activeTasks
      : activeTasks.filter(
          (task) => task.category === (activeView as TaskCategory)
        );

  if (!activeView.startsWith("tag:")) {
    return categoryFilteredTasks;
  }

  const activeTagId = activeView.slice(4);
  return categoryFilteredTasks.filter((task) =>
    (taskTags[task.id.value] ?? []).includes(activeTagId)
  );
};
