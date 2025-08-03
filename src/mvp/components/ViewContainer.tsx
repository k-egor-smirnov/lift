import React from "react";

interface ViewContainerProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * ViewContainer - универсальная обертка для контента экранов.
 * Обеспечивает единообразное отображение и может быть легко расширена
 * для добавления общих функций (например, анимации переходов, обработка ошибок).
 */
export const ViewContainer: React.FC<ViewContainerProps> = ({
  children,
  className = "",
}) => {
  return <div className={`view-container ${className}`}>{children}</div>;
};
