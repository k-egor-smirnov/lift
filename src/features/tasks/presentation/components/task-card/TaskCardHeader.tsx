import React from "react";
import { TaskCategory } from "../../../../../shared/domain/types";
import { useTranslation } from "react-i18next";
import {
  Zap,
  Target,
  Inbox,
  FileText,
  AlertTriangle,
} from "lucide-react";

interface TaskCardHeaderProps {
  category: TaskCategory;
  currentCategory?: TaskCategory;
  isOverdue: boolean;
}

const getCategoryColor = (category: TaskCategory): string => {
  switch (category) {
    case TaskCategory.SIMPLE:
      return "bg-green-100 text-green-800 border-green-200";
    case TaskCategory.FOCUS:
      return "bg-blue-100 text-blue-800 border-blue-200";
    case TaskCategory.INBOX:
      return "bg-gray-100 text-gray-800 border-gray-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
};

const getCategoryIcon = (category: TaskCategory) => {
  switch (category) {
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

export const TaskCardHeader: React.FC<TaskCardHeaderProps> = ({
  category,
  currentCategory,
  isOverdue,
}) => {
  const { t } = useTranslation();
  const categoryColor = getCategoryColor(category);
  const CategoryIcon = getCategoryIcon(category);

  return (
    <div className="flex items-center gap-2 mb-1">
      {/* Only show category badge if not on the same category page */}
      {currentCategory !== category && (
        <span
          className={`
            inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border
            ${categoryColor}
          `}
        >
          <CategoryIcon className="w-3 h-3 mr-1" />
          {t(`categories.${category.toLowerCase()}`)}
        </span>
      )}
      {isOverdue && (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
          <AlertTriangle className="w-3 h-3 mr-1" />
          {t("taskCard.overdue")}
        </span>
      )}
    </div>
  );
};