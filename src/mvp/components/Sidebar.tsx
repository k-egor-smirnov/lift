import React from "react";
import { Sun, Zap, Target, Inbox, Clock, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TaskCategory } from "../../shared/domain/types";
import { Button } from "../../shared/ui/button";
import { cn } from "../../shared/lib/utils";
// import Logo from "../../../assets/icon.png";

interface SidebarProps {
  activeView: "today" | "logs" | TaskCategory;
  onViewChange: (view: "today" | "logs" | TaskCategory) => void;
  taskCounts: Record<TaskCategory, number>;
  hasOverdueTasks: boolean;
  isMobileMenuOpen: boolean;
  onMobileMenuClose: () => void;
}

const getCategoryInfo = (category: TaskCategory, t: any) => {
  switch (category) {
    case TaskCategory.SIMPLE:
      return { icon: Zap, name: t("categories.simple") };
    case TaskCategory.FOCUS:
      return { icon: Target, name: t("categories.focus") };
    case TaskCategory.INBOX:
      return { icon: Inbox, name: t("categories.inbox") };
    case TaskCategory.DEFERRED:
      return { icon: Clock, name: t("categories.deferred") };
    default:
      return { icon: Inbox, name: "Unknown" };
  }
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onViewChange,
  taskCounts,
  hasOverdueTasks,
  isMobileMenuOpen,
  onMobileMenuClose,
}) => {
  const { t } = useTranslation();

  const menuItems = [
    {
      id: "today" as const,
      icon: Sun,
      name: t("navigation.today"),
      count: null,
    },
    ...Object.values(TaskCategory).map((category) => ({
      id: category,
      icon: getCategoryInfo(category, t).icon,
      name: getCategoryInfo(category, t).name,
      count: taskCounts[category] || 0,
    })),
    {
      id: "logs" as const,
      icon: FileText,
      name: t("navigation.logs", "Logs"),
      count: null,
    },
  ];

  const handleItemClick = (viewId: "today" | "logs" | TaskCategory) => {
    onViewChange(viewId);
    onMobileMenuClose();
  };

  const sidebarContent = (
    <div
      className="flex flex-col h-full bg-white"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-between p-6 h-16 box-border">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg" aria-hidden="true">
              L
            </span>
          </div>
          <h2 className="text-xl font-bold text-foreground">Lift</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onMobileMenuClose}
          className="md:hidden focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          aria-label="Close navigation menu"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
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

      <nav className="flex-1 p-4 space-y-1" role="list">
        {menuItems.map((item) => (
          <Button
            key={item.id}
            variant={activeView === item.id ? "secondary" : "ghost"}
            onClick={() => handleItemClick(item.id)}
            className={cn(
              "w-full justify-between h-auto p-3 text-left font-normal focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500",
              activeView === item.id &&
                "bg-primary/10 text-primary hover:bg-primary/15"
            )}
            data-testid={`sidebar-${item.id.toLowerCase()}`}
            aria-current={activeView === item.id ? "page" : undefined}
            aria-label={`${item.name}${
              item.count !== null ? ` (${item.count} tasks)` : ""
            }`}
            role="listitem"
          >
            <div className="flex items-center space-x-3">
              <item.icon className="w-5 h-5" aria-hidden="true" />
              <span className="font-medium">{item.name}</span>
            </div>
            {item.count !== null && (
              <span
                className={cn(
                  "px-2 py-1 text-xs rounded-full font-medium",
                  activeView === item.id
                    ? "bg-primary/20 text-primary"
                    : item.id === TaskCategory.INBOX && hasOverdueTasks
                    ? "text-muted-foreground bg-red-300/20"
                    : "bg-muted text-muted-foreground"
                )}
                aria-label={`${item.count} tasks`}
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
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div
            className="fixed inset-0 bg-black/50 transition-opacity"
            onClick={onMobileMenuClose}
            aria-hidden="true"
          />
          <div className="relative flex-1 flex flex-col max-w-xs w-full transform transition-transform">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
