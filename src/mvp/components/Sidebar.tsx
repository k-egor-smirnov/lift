import React from "react";
import { TaskCategory } from "../../shared/domain/types";
import { Button } from "../../shared/ui/button";
import { cn } from "../../shared/lib/utils";
import Logo from "../../../assets/icon.png";

interface SidebarProps {
  activeView: "today" | TaskCategory;
  onViewChange: (view: "today" | TaskCategory) => void;
  taskCounts: Record<TaskCategory, number>;
  isMobileMenuOpen: boolean;
  onMobileMenuClose: () => void;
}

const getCategoryInfo = (category: TaskCategory) => {
  switch (category) {
    case TaskCategory.SIMPLE:
      return { icon: "⚡", name: "Simple" };
    case TaskCategory.FOCUS:
      return { icon: "🎯", name: "Focus" };
    case TaskCategory.INBOX:
      return { icon: "📥", name: "Inbox" };
  }
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onViewChange,
  taskCounts,
  isMobileMenuOpen,
  onMobileMenuClose,
}) => {
  const menuItems = [
    {
      id: "today" as const,
      icon: "☀️",
      name: "Today",
      count: null,
    },
    ...Object.values(TaskCategory).map((category) => ({
      id: category,
      icon: getCategoryInfo(category).icon,
      name: getCategoryInfo(category).name,
      count: taskCounts[category] || 0,
    })),
  ];

  const handleItemClick = (viewId: "today" | TaskCategory) => {
    onViewChange(viewId);
    onMobileMenuClose();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between p-6 border-b h-16 box-border">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center overflow-hidden">
            <img src={Logo} alt="" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Lift</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onMobileMenuClose}
          className="md:hidden"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </Button>
      </div>

      <nav className="flex-1 p-4 space-y-1 border-r">
        {menuItems.map((item) => (
          <Button
            key={item.id}
            variant={activeView === item.id ? "secondary" : "ghost"}
            onClick={() => handleItemClick(item.id)}
            className={cn(
              "w-full justify-between h-auto p-3 text-left font-normal",
              activeView === item.id &&
                "bg-primary/10 text-primary hover:bg-primary/15"
            )}
            data-testid={`sidebar-${item.id.toLowerCase()}`}
          >
            <div className="flex items-center space-x-3">
              <span className="text-lg">{item.icon}</span>
              <span className="font-medium">{item.name}</span>
            </div>
            {item.count !== null && (
              <span
                className={cn(
                  "px-2 py-1 text-xs rounded-full font-medium",
                  activeView === item.id
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {item.count}
              </span>
            )}
          </Button>
        ))}
      </nav>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:z-30">
        <div className="flex flex-col flex-grow bg-background">
          {sidebarContent}
        </div>
      </div>

      {/* Mobile Sidebar */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={onMobileMenuClose}
          />
          <div className="relative flex-1 flex flex-col max-w-xs w-full">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
