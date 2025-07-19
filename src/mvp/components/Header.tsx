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
      <header className="bg-background border-b px-4 py-4 fixed h-16 w-full">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={onMobileMenuToggle}
              className="md:hidden"
            >
              <Menu className="h-5 w-5" />
            </Button>

            <div className="flex items-center space-x-3">
              <span className="text-2xl">{getViewIcon(activeView)}</span>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  {getViewTitle(activeView)}
                </h1>
              </div>
            </div>
          </div>

          <Button
            onClick={onNewTask}
            className="shadow-sm"
            data-testid="new-task-button"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Task
          </Button>
        </div>
      </header>
      <div className="h-16"></div>
    </>
  );
};
