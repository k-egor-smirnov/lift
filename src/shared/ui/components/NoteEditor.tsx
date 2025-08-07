import React, { useEffect, useRef } from "react";

interface NoteEditorProps {
  value: string;
  onChange: (value: string) => void;
}

// A very small rich text editor based on a contenteditable div.
// Provides basic formatting via document.execCommand which is
// widely supported for simple use cases.
export const NoteEditor: React.FC<NoteEditorProps> = ({ value, onChange }) => {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const handleInput = () => {
    onChange(editorRef.current?.innerHTML || "");
  };

  const applyFormat = (command: string) => {
    document.execCommand(command, false, "");
    handleInput();
  };

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={() => applyFormat("bold")}
          className="px-2 py-1 text-sm border rounded"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => applyFormat("italic")}
          className="px-2 py-1 text-sm border rounded font-serif italic"
        >
          I
        </button>
        <button
          type="button"
          onClick={() => applyFormat("underline")}
          className="px-2 py-1 text-sm border rounded underline"
        >
          U
        </button>
      </div>
      <div
        ref={editorRef}
        className="border rounded p-2 min-h-[120px] focus:outline-none"
        contentEditable
        onInput={handleInput}
      />
    </div>
  );
};
