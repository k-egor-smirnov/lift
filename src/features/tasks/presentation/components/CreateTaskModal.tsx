import React from "react";
import { useTranslation } from "react-i18next";
import { CreateTaskModal as SharedCreateTaskModal } from "../../../../shared/presentation/components/CreateTaskModal";
import { TaskCategory } from "../../../../shared/domain/types";

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    title: string,
    category: TaskCategory,
    image?: File
  ) => Promise<boolean>;
  initialTitle?: string;
  initialCategory?: TaskCategory;
  hideCategorySelection?: boolean;
}

export const CreateTaskModal: React.FC<CreateTaskModalProps> = (props) => {
  const { t } = useTranslation();

  return <SharedCreateTaskModal {...props} t={t} />;
};
