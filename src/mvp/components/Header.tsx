import React from "react";
import { Sun, Zap, Target, Inbox, FileText, Plus, Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TaskCategory } from "../../shared/domain/types";
import { Button } from "../../shared/ui/button";

interface HeaderProps {
  activeView: "today" | TaskCategory;
  onMobileMenuToggle: () => void;
}

const getViewTitle = (view: "today" | TaskCategory, t: any) => {
  if (view === "today") return t("navigation.today");

  switch (view) {
    case TaskCategory.SIMPLE:
      return t("categories.simple");
    case TaskCategory.FOCUS:
      return t("categories.focus");
    case TaskCategory.INBOX:
      return t("categories.inbox");
    default:
      return t("common.tasks");
  }
};

const getViewIcon = (view: "today" | TaskCategory) => {
  if (view === "today") return Sun;

  switch (view) {
    case TaskCategory.SIMPLE:
      return Zap;
    case TaskCategory.FOCUS:
      return Target;
    case TaskCategory.INBOX:
      return Inbox;
    default:
      return FileText;
  }
};

export const Header: React.FC<HeaderProps> = ({
  activeView,
  onMobileMenuToggle,
}) => {
  const { t } = useTranslation();
  const IconComponent = getViewIcon(activeView);
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
              aria-label={t("common.openMenu")}
              aria-expanded="false"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>

            <div className="flex items-center space-x-3">
              <IconComponent
                className="w-6 h-6 text-gray-600"
                aria-hidden="true"
              />
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  {getViewTitle(activeView, t)}
                </h1>
              </div>
            </div>
          </div>
        </div>
      </header>
      <div className="h-16" aria-hidden="true"></div>
    </>
  );
};
