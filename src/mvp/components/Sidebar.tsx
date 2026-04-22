import React, { useEffect, useRef, useState } from "react";
import {
  Sun,
  Zap,
  Target,
  Inbox,
  Clock,
  FileText,
  Settings,
  ChevronDown,
  Plus,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { TaskCategory } from "../../shared/domain/types";
import { Button } from "../../shared/ui/button";
import { cn } from "../../shared/lib/utils";
import LiftLogo from "../../../assets/icon.png";
import { Input } from "../../shared/ui/input";
import { Tag } from "../../features/tags/presentation/view-models/TagViewModel";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../shared/ui/popover";

export type ActiveView =
  | "today"
  | "logs"
  | "settings"
  | TaskCategory
  | `tag:${string}`;

interface SidebarProps {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  taskCounts: Record<TaskCategory, number>;
  hasOverdueTasks: boolean;
  isMobileMenuOpen: boolean;
  onMobileMenuClose: () => void;
  showTodayHighlight: boolean;
  tags: Tag[];
  tagsCollapsed: boolean;
  tagTaskCounts: Record<string, number>;
  onCreateTag: (name: string, color: string) => void;
  onToggleTagsCollapsed: () => void;
}

const TAG_COLORS = [
  "#f43f5e",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

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
  showTodayHighlight,
  tags,
  tagsCollapsed,
  tagTaskCounts,
  onCreateTag,
  onToggleTagsCollapsed,
}) => {
  const { t } = useTranslation();
  const [isCreateTagOpen, setIsCreateTagOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [selectedTagColor, setSelectedTagColor] = useState(TAG_COLORS[0]);
  const newTagInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (!isCreateTagOpen) return;
    const randomColor =
      TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
    setSelectedTagColor(randomColor);
    requestAnimationFrame(() => {
      newTagInputRef.current?.focus();
    });
  }, [isCreateTagOpen]);

  const handleItemClick = (viewId: ActiveView) => {
    onViewChange(viewId);
    onMobileMenuClose();
  };

  const handleCreateTag = () => {
    if (!newTagName.trim()) return;
    onCreateTag(newTagName.trim(), selectedTagColor);
    setNewTagName("");
    setIsCreateTagOpen(false);
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
                data-testid={`sidebar-${item.id.toLowerCase()}`}
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

          <div className="pt-2 mt-2 border-t">
            <div className="flex items-center justify-between mb-1 px-1">
              <Button
                variant="ghost"
                className="h-8 px-2 flex-1 justify-start text-muted-foreground"
                onClick={onToggleTagsCollapsed}
              >
                <ChevronDown
                  className={cn(
                    "w-4 h-4 mr-2 transition-transform",
                    tagsCollapsed && "-rotate-90"
                  )}
                />
                <span className="text-xs uppercase tracking-wide">Тэги</span>
              </Button>
              <Popover open={isCreateTagOpen} onOpenChange={setIsCreateTagOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    data-testid="create-tag-button-sidebar"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-3">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Новый тэг
                    </p>
                    <Input
                      ref={newTagInputRef}
                      value={newTagName}
                      onChange={(event) => setNewTagName(event.target.value)}
                      placeholder="Новый тэг"
                      className="h-8 text-xs"
                      data-testid="create-tag-input-sidebar"
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          handleCreateTag();
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      className="w-full h-8"
                      onClick={handleCreateTag}
                    >
                      Создать
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {!tagsCollapsed && (
              <div className="space-y-1">
                {tags.map((tag) => {
                  const viewId = `tag:${tag.id}` as const;
                  return (
                    <Button
                      key={tag.id}
                      variant={activeView === viewId ? "secondary" : "ghost"}
                      onClick={() => handleItemClick(viewId)}
                      className={cn(
                        "w-full justify-between h-8 px-2 text-left font-normal",
                        activeView === viewId &&
                          "bg-primary/10 text-primary hover:bg-primary/15"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="text-sm truncate">{tag.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {tagTaskCounts[tag.id] ?? 0}
                      </span>
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
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
            data-testid={`sidebar-${settingsItem.id.toLowerCase()}`}
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
