import React from "react";
import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";

interface NoteEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({ value, onChange }) => {
  return (
    <div data-color-mode="light">
      <MDEditor
        value={value}
        onChange={(val) => onChange(val || "")}
        height={200}
      />
    </div>
  );
};
