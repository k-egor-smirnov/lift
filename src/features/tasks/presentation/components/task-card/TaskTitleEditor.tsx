import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";

import type { CollaborativeTextViewModel } from "../../view-models/CollaborativeTextViewModel";
import {
  CollaborativeTextEditor,
  type CollaborativeTextEditorHandle,
} from "../CollaborativeTextEditor";

interface TaskTitleEditorProps {
  readonly viewModel: CollaborativeTextViewModel;
  readonly onClose: () => void;
}

export const TaskTitleEditor: React.FC<TaskTitleEditorProps> = ({
  viewModel,
  onClose,
}) => {
  const { t } = useTranslation();
  const editorRef = useRef<CollaborativeTextEditorHandle>(null);
  const [isClosing, setIsClosing] = useState(false);

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
    <div
      className="flex items-start gap-2"
      data-testid="task-card-title-editor"
    >
      <CollaborativeTextEditor
        ref={editorRef}
        viewModel={viewModel}
        label="Title"
        autoFocus
        className="flex-1"
        labelClassName="sr-only"
        controlClassName="w-full text-sm leading-snug font-medium text-gray-900 bg-white border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        onKeyDown={(event) => {
          if (
            event.nativeEvent.isComposing ||
            event.nativeEvent.keyCode === 229
          ) {
            return;
          }
          if (event.key === "Enter" || event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            void handleClose();
          } else if (event.key === " ") {
            event.stopPropagation();
          }
        }}
      />
      <button
        type="button"
        onClick={() => void handleClose()}
        disabled={isClosing}
        className="p-1 text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors"
        title={t("common.close")}
      >
        <Check className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => void handleClose()}
        disabled={isClosing}
        className="p-1 text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded transition-colors"
        title={t("common.close")}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
