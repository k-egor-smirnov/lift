import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

import type { CollaborativeTextViewModel } from "../../../features/tasks/presentation/view-models/CollaborativeTextViewModel";
import {
  CollaborativeTextEditor,
  type CollaborativeTextEditorHandle,
} from "../../../features/tasks/presentation/components/CollaborativeTextEditor";

interface NoteModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly viewModel: CollaborativeTextViewModel;
  readonly taskTitle: string;
}

export const NoteModal: React.FC<NoteModalProps> = ({
  isOpen,
  onClose,
  viewModel,
  taskTitle,
}) => {
  const { t } = useTranslation();
  const editorRef = useRef<CollaborativeTextEditorHandle>(null);
  const [isClosing, setIsClosing] = useState(false);

  if (!isOpen) return null;

  const handleClose = async () => {
    if (isClosing) return;
    setIsClosing(true);
    try {
      await editorRef.current?.flush();
      onClose();
    } catch {
      // The ViewModel exposes the retryable error next to the editor.
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={() => void handleClose()}
      />

      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            Заметка к задаче
          </h2>
          <button
            type="button"
            onClick={() => void handleClose()}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            disabled={isClosing}
            aria-label={t("common.close")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-2 bg-gray-50 border-b">
          <p className="text-sm text-gray-600 truncate" title={taskTitle}>
            {taskTitle}
          </p>
        </div>

        <div className="flex-1 p-4 overflow-auto">
          <CollaborativeTextEditor
            ref={editorRef}
            viewModel={viewModel}
            label={t("taskCard.note")}
            placeholder={t("ui.addNotePlaceholder")}
            autoFocus
            className="h-full"
            labelClassName="sr-only"
            controlClassName="min-h-[180px] w-full resize-y rounded-md border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center justify-end p-4 border-t bg-gray-50">
          <button
            type="button"
            onClick={() => void handleClose()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isClosing}
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
};
