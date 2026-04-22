import React, { useState } from "react";
import {
  Sun,
  Zap,
  Target,
  Inbox,
  Clock,
  FileText,
  Settings,
  Plus,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { TaskCategory } from "../../shared/domain/types";
import { Button } from "../../shared/ui/button";
import { cn } from "../../shared/lib/utils";
import LiftLogo from "../../../assets/icon.png";
import { DEFAULT_TAG_COLORS, Tag } from "../../shared/domain/entities/Tag";

interface SidebarProps {
  activeView: "today" | "logs" | "settings" | TaskCategory | `tag:${string}`;
  onViewChange: (
    view: "today" | "logs" | "settings" | TaskCategory | `tag:${string}`
  ) => void;
  taskCounts: Record<TaskCategory, number>;
  tagTaskCounts: Record<string, number>;
  availableTags: Tag[];
  onCreateTag: (name: string, color: string) => Promise<string | null>;
  hasOverdueTasks: boolean;
  isMobileMenuOpen: boolean;
  onMobileMenuClose: () => void;
  showTodayHighlight: boolean;
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
  tagTaskCounts,
  availableTags,
  onCreateTag,
  hasOverdueTasks,
  isMobileMenuOpen,
  onMobileMenuClose,
  showTodayHighlight,
}) => {
  const { t } = useTranslation();
  const [isTagsCollapsed, setIsTagsCollapsed] = useState(false);

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

  const settingsItem = {
    id: "settings" as const,
    icon: Settings,
    name: t("navigation.settings"),
    count: null,
  };

  const handleItemClick = (
    viewId: "today" | "logs" | "settings" | TaskCategory | `tag:${string}`
  ) => {
    onViewChange(viewId);
    onMobileMenuClose();
  };

  const handleCreateTag = async () => {
    const name = window.prompt("Название тэга");
    if (!name?.trim()) return;
    const color =
      DEFAULT_TAG_COLORS[Math.floor(Math.random() * DEFAULT_TAG_COLORS.length)];
    await onCreateTag(name.trim(), color);
  };

  const sidebarContent = (
    <div
      className="flex flex-col h-full bg-white"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-between p-6 h-16 box-border">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center overflow-hidden">
            <img src={LiftLogo} alt="" />
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

      <nav className="flex-1 p-4 space-y-1 flex flex-col" role="list">
        <div className="space-y-1">
          {menuItems.map((item) => {
            const shouldHighlightToday =
              item.id === "today" &&
              showTodayHighlight &&
              activeView !== "today";

            return (
              <Button
                key={item.id}
                variant={activeView === item.id ? "secondary" : "ghost"}
                onClick={() => handleItemClick(item.id)}
                className={cn(
                  "w-full justify-between h-auto p-3 text-left font-normal focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500",
                  activeView === item.id &&
                    "bg-primary/10 text-primary hover:bg-primary/15"
                )}
              >
                <div className="flex items-center space-x-3">
                  <item.icon className="w-5 h-5" aria-hidden="true" />
                  <span className="font-medium">{item.name}</span>
                  {shouldHighlightToday && (
                    <span
                      className="ml-1 inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse"
                      aria-hidden="true"
                    />
                  )}
                </div>
                {item.count !== null && (
                  <span
                    className={cn(
                      "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-medium",
                      activeView === item.id
                        ? "bg-primary/20 text-primary"
                        : item.id === TaskCategory.INBOX && hasOverdueTasks
                          ? "text-muted-foreground bg-red-300/20"
                          : "bg-muted text-muted-foreground"
                    )}
                  >
                    {item.count}
                  </span>
                )}
              </Button>
            );
          })}
        </div>

        <div className="pt-3 mt-2 border-t">
          <div className="flex justify-end mb-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCreateTag}
              className="h-7 w-7"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <button
            type="button"
            onClick={() => setIsTagsCollapsed((prev) => !prev)}
            className="w-full flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground py-1"
          >
            <span>Тэги</span>
            {isTagsCollapsed ? (
              <ChevronRight className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
          {!isTagsCollapsed && (
            <div className="mt-1 space-y-1">
              {availableTags.map((tag) => {
                const tagView = `tag:${tag.id}` as const;
                return (
                  <Button
                    key={tag.id}
                    variant={activeView === tagView ? "secondary" : "ghost"}
                    onClick={() => handleItemClick(tagView)}
                    className="w-full justify-between h-8 px-2"
                  >
                    <span className="inline-flex items-center gap-2 text-sm">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {tagTaskCounts[tag.id] || 0}
                    </span>
                  </Button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-auto pt-4 border-t">
          <Button
            variant={activeView === settingsItem.id ? "secondary" : "ghost"}
            onClick={() => handleItemClick(settingsItem.id)}
            className={cn(
              "w-full justify-start h-auto p-3 text-left font-normal focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500",
              activeView === settingsItem.id &&
                "bg-primary/10 text-primary hover:bg-primary/15"
            )}
          >
            <div className="flex items-center space-x-3">
              <settingsItem.icon className="w-5 h-5" aria-hidden="true" />
              <span className="font-medium">{settingsItem.name}</span>
            </div>
          </Button>
        </div>
      </nav>
    </div>
  );

  return (
    <>
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:z-30">
        <div className="flex flex-col flex-grow bg-background">
          {sidebarContent}
        </div>
      </div>

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
