import React from "react";
import { TaskCategory } from "../../shared/domain/types";
import { Button } from "../../shared/ui/button";
import { Plus, Menu } from "lucide-react";

interface HeaderProps {
  activeView: "today" | TaskCategory;
  onNewTask: () => void;
  onMobileMenuToggle: () => void;
}

const getViewTitle = (view: "today" | TaskCategory) => {
  if (view === "today") return "Today";

  switch (view) {
    case TaskCategory.SIMPLE:
      return "Simple Tasks";
    case TaskCategory.FOCUS:
      return "Focus Tasks";
    case TaskCategory.INBOX:
      return "Inbox";
    default:
      return "Tasks";
  }
};

const getViewIcon = (view: "today" | TaskCategory) => {
  if (view === "today") return "☀️";

  switch (view) {
    case TaskCategory.SIMPLE:
      return "⚡";
    case TaskCategory.FOCUS:
      return "🎯";
    case TaskCategory.INBOX:
      return "📥";
    default:
      return "📝";
  }
};

export const Header: React.FC<HeaderProps> = ({
  activeView,
  onNewTask,
  onMobileMenuToggle,
}) => {
  return (
    <>
      <header
        className="bg-background border-b px-4 py-4 fixed h-16 w-full md:w-[calc(100%-256px)] z-40"
        role="banner"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={onMobileMenuToggle}
              className="md:hidden focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              aria-label="Open navigation menu"
              aria-expanded="false"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>

            <div className="flex items-center space-x-3">
              <span className="text-2xl" aria-hidden="true">
                {getViewIcon(activeView)}
              </span>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  {getViewTitle(activeView)}
                </h1>
              </div>
            </div>
          </div>

          <Button
            onClick={onNewTask}
            className="shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            data-testid="new-task-button"
            aria-label="Create new task"
          >
            <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
            <span>New Task</span>
          </Button>
        </div>
      </header>
      <div className="h-16" aria-hidden="true"></div>
    </>
  );
};
