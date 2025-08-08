import React from "react";
import { StickyNote, StickyNoteText } from "lucide-react";
import { getChecklistProgressFromHTML } from "../../utils/checklist";

interface Props {
  note: string | null;
}

export const TaskNoteIndicator: React.FC<Props> = ({ note }) => {
  const { completed, total } = getChecklistProgressFromHTML(note ?? "");
  const hasNote = note != null && note.trim().length > 0;
  const Icon = hasNote ? StickyNote : StickyNoteText;

  return (
    <div className="flex items-center gap-1 text-xs text-gray-600">
      <Icon className="w-4 h-4" />
      {total > 0 && (
        <span>
          {completed} / {total}
        </span>
      )}
    </div>
  );
};
