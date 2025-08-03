import React, { useEffect, useState } from "react";
import {
  Sun,
  Zap,
  Target,
  Inbox,
  FileText,
  Plus,
  Menu,
  Clock,
  Settings,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { TaskCategory } from "../../shared/domain/types";
import { Button } from "../../shared/ui/button";

interface HeaderProps {
  activeView: "today" | "logs" | "settings" | "trash" | TaskCategory;
  onMobileMenuToggle: () => void;
}

const getViewTitle = (
  view: "today" | "logs" | "settings" | "trash" | TaskCategory,
  t: any
) => {
  if (view === "today") return t("navigation.today");
  if (view === "logs") return t("logs.title", "Activity Logs");
  if (view === "settings") return t("settings.title");
  if (view === "trash") return t("navigation.trash", "Trash");

  switch (view) {
    case TaskCategory.SIMPLE:
      return t("categories.simple");
    case TaskCategory.FOCUS:
      return t("categories.focus");
    case TaskCategory.INBOX:
      return t("categories.inbox");
    case TaskCategory.DEFERRED:
      return t("categories.deferred");
    default:
      return t("common.tasks");
  }
};

const getViewDescription = (
  view: "today" | "logs" | "settings" | "trash" | TaskCategory,
  t: any
) => {
  if (view === "today") return t("navigation.descriptions.today");
  if (view === "logs")
    return t("logs.subtitle", "View all system and user activity");
  if (view === "settings") return t("settings.app.description");
  if (view === "trash") return t("navigation.descriptions.trash", "Deleted tasks");

  switch (view) {
    case TaskCategory.SIMPLE:
      return t("navigation.descriptions.simple");
    case TaskCategory.FOCUS:
      return t("navigation.descriptions.focus");
    case TaskCategory.INBOX:
      return t("navigation.descriptions.inbox");
    case TaskCategory.DEFERRED:
      return t("navigation.descriptions.deferred");
    default:
      return t("navigation.descriptions.today");
  }
};

const getViewIcon = (
  view: "today" | "logs" | "settings" | "trash" | TaskCategory
) => {
  if (view === "today") return Sun;
  if (view === "logs") return FileText;
  if (view === "settings") return Settings;
  if (view === "trash") return Trash2;

  switch (view) {
    case TaskCategory.SIMPLE:
      return Zap;
    case TaskCategory.FOCUS:
      return Target;
    case TaskCategory.INBOX:
      return Inbox;
    case TaskCategory.DEFERRED:
      return Clock;
    default:
      return FileText;
  }
};

export const Header: React.FC<HeaderProps> = ({
  activeView,
  onMobileMenuToggle,
}) => {
  const { t } = useTranslation();
  const [scrollY, setScrollY] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const IconComponent = getViewIcon(activeView);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setScrollY(currentScrollY);

      // Collapse header when scrolling down on mobile
      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
        setIsCollapsed(currentScrollY > 80);
      } else {
        setIsCollapsed(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const headerHeight = isCollapsed ? "h-14" : "";

  return (
    <>
      <header
        className={`bg-background/95 backdrop-blur-sm md:pt-12 px-4 py-4 fixed md:static w-full md:w-full z-40 transition-all duration-300 ease-in-out ${headerHeight}`}
        role="banner"
      >
        <div className="flex items-start justify-between h-full">
          <div className="flex items-start space-x-4 h-full">
            <Button
              variant="ghost"
              size="icon"
              onClick={onMobileMenuToggle}
              className="md:hidden focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 mt-1"
              aria-label={t("common.openMenu")}
              aria-expanded="false"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>

            <div className="flex flex-col space-y-2 flex-1">
              {/* Icon and title row */}
              <div className="flex items-center space-x-3">
                <div
                  className={`transition-all duration-300 ${
                    isCollapsed ? "scale-75" : "scale-100"
                  }`}
                >
                  <IconComponent
                    className={`transition-all duration-300 text-gray-600 ${
                      isCollapsed ? "w-5 h-5" : "w-8 h-8 md:w-6 md:h-6"
                    }`}
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <h1
                    className={`font-bold text-foreground transition-all duration-300 ${
                      isCollapsed ? "text-lg" : "text-3xl md:text-2xl"
                    }`}
                  >
                    {getViewTitle(activeView, t)}
                  </h1>
                </div>
              </div>

              {/* Description - hidden when collapsed */}
              <div
                className={`transition-all duration-300 overflow-hidden ${
                  isCollapsed ? "max-h-0 opacity-0" : "max-h-20 opacity-100"
                }`}
              >
                <p className="text-gray-500 text-sm md:text-base leading-relaxed">
                  {getViewDescription(activeView, t)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>
    </>
  );
};
