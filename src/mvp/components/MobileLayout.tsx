import React, { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { TaskCategory } from "../../shared/domain/types";
import { TodayMobileView } from "../../features/today/presentation/components/TodayMobileView";
import { TaskList } from "../../features/tasks/presentation/components/TaskList";
import { Task } from "../../shared/domain/entities/Task";
import { TaskId } from "../../shared/domain/value-objects/TaskId";
import { TodayViewModelDependencies } from "../../features/today/presentation/view-models/TodayViewModel";
import { LogEntry } from "../../shared/application/use-cases/GetTaskLogsUseCase";
import { Plus, Inbox, Zap, Target, Clock } from "lucide-react";
import "./MobileLayout.css";

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
  const { t } = useTranslation();

  const screens = [
    { id: "today", label: t("mobileLayout.today"), component: "today" },
    { id: "categories", label: t("mobileLayout.categories"), component: "categories" },
  ];

  const [selectedCategory, setSelectedCategory] = useState<TaskCategory | null>(null);

  const handleCategoryClick = (category: TaskCategory) => {
    setSelectedCategory(category);
  };

  const handleCategoryClose = () => {
    setSelectedCategory(null);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollLeft = e.currentTarget.scrollLeft;
    const screenWidth = e.currentTarget.clientWidth;
    const newActiveScreen = Math.round(scrollLeft / screenWidth);
    
    if (newActiveScreen !== activeScreen) {
      setActiveScreen(newActiveScreen);
      if (selectedCategory) {
        setSelectedCategory(null);
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

  return (
    <div className="h-screen w-full overflow-hidden bg-gray-50 flex flex-col">
      {/* Scroll container with snap */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="mobile-scroll-container flex-1 overflow-x-auto overflow-y-hidden flex flex-col"
        style={{
          scrollSnapType: "x mandatory",
          scrollBehavior: "smooth",
          overscrollBehaviorX: "contain",
        }}
      >
        {/* Horizontal screens wrapper */}
        <div className="flex flex-1">
          {/* Today Screen */}
          <div
            className="w-full h-full flex-shrink-0 overflow-y-auto"
            style={{ 
              scrollSnapAlign: "start",
              scrollSnapStop: "always"
            }}
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

          {/* Categories Screen */}
          <div
            className="w-full h-full flex-shrink-0 overflow-y-auto px-4 py-6"
            style={{ 
              scrollSnapAlign: "start",
              scrollSnapStop: "always"
            }}
          >
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{t("mobileLayout.categories")}</h2>
              <p className="text-gray-500 text-sm">{t("mobileLayout.allTasksByCategory")}</p>
            </div>

            <div className="space-y-6">
              {Object.entries(categoryConfig).map(([cat, config]) => {
                const Icon = config.icon;
                const categoryTasks = tasks.filter(
                  (task) => task.category === cat
                );
                const activeTasks = categoryTasks.filter(t => !t.completedAt);

                return (
                  <div key={cat} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-5 h-5 ${config.color}`} />
                        <h3 className={`font-semibold ${config.color}`}>
                          {config.label}
                        </h3>
                        <span className="text-sm text-gray-500">
                          {categoryTasks.length}
                        </span>
                      </div>
                    </div>

                    <div className="pl-7 space-y-1">
                      {activeTasks.length === 0 ? (
                        <p className="text-sm text-gray-400 italic">{t("mobileLayout.noTasks")}</p>
                      ) : (
                        <>
                          {activeTasks.slice(0, 2).map(task => (
                            <div 
                              key={task.id.value} 
                              className="text-sm text-gray-700 flex items-start gap-2"
                            >
                              <span className="text-gray-400 mt-0.5">•</span>
                              <span className="flex-1 truncate">{task.title.toString()}</span>
                            </div>
                          ))}
                          {activeTasks.length > 2 && (
                            <p className="text-sm text-gray-500">
                              {t("mobileLayout.andMore")} {activeTasks.length - 2}
                            </p>
                          )}
                        </>
                      )}

                      {categoryTasks.length > 0 && (
                        <button
                          onClick={() => handleCategoryClick(cat as TaskCategory)}
                          className={`mt-2 text-sm font-medium ${config.color} hover:underline`}
                        >
                        {t("mobileLayout.openCategory")} {config.label} →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Bar - child of scroll container for scroll-driven animations */}
        {!selectedCategory && (
          <div className="mobile-bottom-bar">
            <div className="mobile-input-container">
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

                <div className="flex items-center gap-2 p-3">
                  <button
                    onClick={() => setShowCategoryPicker(!showCategoryPicker)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg ${currentCategory.bgColor} ${currentCategory.color} transition-all active:scale-95`}
                  >
                    <CategoryIcon className="w-4 h-4" />
                  </button>

                  <div className="flex-1 relative">
                    <input
                      ref={inputRef}
                      type="text"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      onKeyDown={handleKeyDown}
                    placeholder={t("tasks.addTaskPlaceholder")}
                      className="w-full px-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                      autoComplete="off"
                    />
                  </div>

                  {newTaskTitle.trim() && (
                    <button
                      onClick={handleCreateTask}
                      className="p-2.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 active:scale-95 transition-all"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  )}
                </div>
            </div>

            <div className="mobile-pagination flex justify-center gap-2 py-3">
              {screens.map((_, index) => (
                <div
                  key={index}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    index === activeScreen
                      ? "bg-blue-500 w-6"
                      : "bg-gray-300 w-1.5"
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Category Detail Modal/Overlay */}
      {selectedCategory && (
        <div className="fixed inset-0 bg-white z-50 flex flex-col">
          <div className="flex items-center gap-3 p-4 border-b border-gray-200">
            <button
              onClick={handleCategoryClose}
              className="p-2 -ml-2 text-gray-600 hover:text-gray-900"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              {(() => {
                const config = categoryConfig[selectedCategory];
                const Icon = config.icon;
                return (
                  <>
                    <Icon className={`w-5 h-5 ${config.color}`} />
                    <h2 className="text-xl font-bold text-gray-900">
                      {config.label}
                    </h2>
                  </>
                );
              })()}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 pb-32">
            {(() => {
              const categoryTasks = tasks.filter(
                (task) => task.category === selectedCategory
              );
              return categoryTasks.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  {(() => {
                    const config = categoryConfig[selectedCategory];
                    const Icon = config.icon;
                    return <Icon className="w-12 h-12 mx-auto mb-3 opacity-50" />;
                  })()}
                  <p>{t("mobileLayout.noTasksInCategory")}</p>
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
              );
            })()}
          </div>

          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-bottom z-50">
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

            <div className="flex items-center gap-2 p-3">
              <button
                onClick={() => setShowCategoryPicker(!showCategoryPicker)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg ${currentCategory.bgColor} ${currentCategory.color} transition-all active:scale-95`}
              >
                <CategoryIcon className="w-4 h-4" />
              </button>

              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t("tasks.addTaskPlaceholder")}
                  className="w-full px-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  autoComplete="off"
                />
              </div>

              {newTaskTitle.trim() && (
                <button
                  onClick={handleCreateTask}
                  className="p-2.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 active:scale-95 transition-all"
                >
                  <Plus className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
