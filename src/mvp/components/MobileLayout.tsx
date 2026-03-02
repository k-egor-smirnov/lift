import React, { useState, useRef } from "react";
import { TaskCategory } from "../../shared/domain/types";
import { TodayMobileView } from "../../features/today/presentation/components/TodayMobileView";
import { TaskList } from "../../features/tasks/presentation/components/TaskList";
import { Task } from "../../shared/domain/entities/Task";
import { TaskId } from "../../shared/domain/value-objects/TaskId";
import { TodayViewModelDependencies } from "../../features/today/presentation/view-models/TodayViewModel";
import { LogEntry } from "../../shared/application/use-cases/GetTaskLogsUseCase";
import { Plus, Inbox, Zap, Target, Clock } from "lucide-react";

interface MobileLayoutProps {
  todayDependencies: TodayViewModelDependencies;
  tasks: Task[];
  onEditTask: (taskId: string, newTitle: string) => void;
  onDeleteTask: (taskId: string) => void;
  onDefer: (taskId: string, deferDate: Date) => void;
  onUndefer: (taskId: TaskId) => Promise<void>;
  onReorderTasks: (tasks: Task[]) => void;
  onLoadTaskLogs: (taskId: string) => Promise<LogEntry[]>;
  onCreateLog: (taskId: string, message: string) => Promise<boolean>;
  onCreateTask: (title: string, category: TaskCategory) => Promise<void>;
  onComplete: (taskId: string) => void;
}

const categoryConfig = {
  [TaskCategory.INBOX]: {
    icon: Inbox,
    label: "Inbox",
    color: "text-gray-600",
    bgColor: "bg-gray-100",
  },
  [TaskCategory.SIMPLE]: {
    icon: Zap,
    label: "Simple",
    color: "text-yellow-600",
    bgColor: "bg-yellow-100",
  },
  [TaskCategory.FOCUS]: {
    icon: Target,
    label: "Focus",
    color: "text-blue-600",
    bgColor: "bg-blue-100",
  },
};

export const MobileLayout: React.FC<MobileLayoutProps> = ({
  todayDependencies,
  tasks,
  onEditTask,
  onDeleteTask,
  onDefer,
  onUndefer,
  onReorderTasks,
  onLoadTaskLogs,
  onCreateLog,
  onCreateTask,
  onComplete,
}) => {
  const [activeScreen, setActiveScreen] = useState(0);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskCategory, setNewTaskCategory] = useState<TaskCategory>(
    TaskCategory.INBOX
  );
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const screens = [
    { id: "today", label: "Сегодня", component: "today" },
    { id: "inbox", label: "Inbox", category: TaskCategory.INBOX },
    { id: "simple", label: "Simple", category: TaskCategory.SIMPLE },
    { id: "focus", label: "Focus", category: TaskCategory.FOCUS },
  ];

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollLeft = e.currentTarget.scrollLeft;
    const screenWidth = e.currentTarget.clientWidth;
    const newActiveScreen = Math.round(scrollLeft / screenWidth);
    if (newActiveScreen !== activeScreen) {
      setActiveScreen(newActiveScreen);
      // Update category based on screen
      const screen = screens[newActiveScreen];
      if (screen.category) {
        setNewTaskCategory(screen.category);
      }
    }
  };

  const handleCreateTask = async () => {
    const trimmedTitle = newTaskTitle.trim();
    if (!trimmedTitle) return;

    await onCreateTask(trimmedTitle, newTaskCategory);
    setNewTaskTitle("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreateTask();
    }
  };

  const currentCategory = categoryConfig[newTaskCategory];
  const CategoryIcon = currentCategory.icon;

  const filteredTasks = tasks.filter((task) => {
    const screen = screens[activeScreen];
    if (screen.id === "today") return true; // Today view has its own filtering
    if (screen.category) return task.category === screen.category;
    return false;
  });

  return (
    <div className="h-screen w-full overflow-hidden bg-gray-50 flex flex-col">
      {/* Scroll container with snap */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-x-auto overflow-y-hidden flex"
        style={{
          scrollSnapType: "x mandatory",
          scrollBehavior: "smooth",
        }}
      >
        {/* Today Screen */}
        <div
          className="w-full h-full flex-shrink-0 overflow-y-auto pb-32"
          style={{ scrollSnapAlign: "start" }}
        >
          <TodayMobileView
            dependencies={todayDependencies}
            onEditTask={onEditTask}
            onDeleteTask={onDeleteTask}
            onDefer={onDefer}
            onUndefer={onUndefer}
            onReorderTasks={onReorderTasks}
            onLoadTaskLogs={onLoadTaskLogs}
            onCreateLog={onCreateLog}
            onCreateTask={onCreateTask}
          />
        </div>

        {/* Category Screens */}
        {screens.slice(1).map((screen) => {
          const config = categoryConfig[screen.category!];
          const Icon = config.icon;
          const categoryTasks = tasks.filter(
            (task) => task.category === screen.category
          );

          return (
            <div
              key={screen.id}
              className="w-full h-full flex-shrink-0 overflow-y-auto pb-32 px-4 py-6"
              style={{ scrollSnapAlign: "start" }}
            >
              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className={`p-2 rounded-lg ${config.bgColor}`}>
                    <Icon className={`w-5 h-5 ${config.color}`} />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {screen.label}
                  </h2>
                </div>
                <p className="text-gray-500 text-sm">
                  {categoryTasks.length} задач
                </p>
              </div>

              {/* Task List */}
              <div className="space-y-3">
                {categoryTasks.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <Icon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Нет задач в этой категории</p>
                  </div>
                ) : (
                  <TaskList
                    tasks={categoryTasks}
                    onEdit={onEditTask}
                    onDelete={onDeleteTask}
                    onDefer={onDefer}
                    onUndefer={onUndefer}
                    onReorder={onReorderTasks}
                    onLoadTaskLogs={onLoadTaskLogs}
                    onCreateLog={onCreateLog}
                    onComplete={onComplete}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Task Input - Fixed */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-bottom z-50">
        {/* Category picker dropdown */}
        {showCategoryPicker && (
          <div className="absolute bottom-full left-0 right-0 bg-white border-t border-gray-200 shadow-lg">
            <div className="p-2 grid grid-cols-3 gap-2">
              {Object.entries(categoryConfig).map(([cat, config]) => {
                const Icon = config.icon;
                const isSelected = cat === newTaskCategory;
                return (
                  <button
                    key={cat}
                    onClick={() => {
                      setNewTaskCategory(cat as TaskCategory);
                      setShowCategoryPicker(false);
                      inputRef.current?.focus();
                    }}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg transition-all ${
                      isSelected
                        ? `${config.bgColor} ${config.color} ring-2 ring-offset-1`
                        : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs font-medium">{config.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Main input area */}
        <div className="flex items-center gap-2 p-3">
          {/* Category selector button */}
          <button
            onClick={() => setShowCategoryPicker(!showCategoryPicker)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg ${currentCategory.bgColor} ${currentCategory.color} transition-all active:scale-95`}
          >
            <CategoryIcon className="w-4 h-4" />
          </button>

          {/* Text input */}
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Добавить задачу..."
              className="w-full px-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
              autoComplete="off"
            />
          </div>

          {/* Submit button */}
          {newTaskTitle.trim() && (
            <button
              onClick={handleCreateTask}
              className="p-2.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 active:scale-95 transition-all"
            >
              <Plus className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Screen indicator dots */}
        <div className="flex justify-center gap-2 pb-2">
          {screens.map((_, index) => (
            <div
              key={index}
              className={`w-2 h-2 rounded-full transition-all ${
                index === activeScreen
                  ? "bg-blue-500 w-4"
                  : "bg-gray-300"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
