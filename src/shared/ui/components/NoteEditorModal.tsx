import React, { useEffect } from "react";
import { Modal, ModalFooter } from "../Modal";
import { Button } from "../button";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";

interface NoteEditorModalProps {
  open: boolean;
  initialContent: string | null;
  onSave: (html: string) => void;
  onClose: () => void;
}

export const NoteEditorModal: React.FC<NoteEditorModalProps> = ({
  open,
  initialContent,
  onSave,
  onClose,
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: initialContent ?? "",
  });

  useEffect(() => {
    if (editor && open) {
      editor.commands.setContent(initialContent ?? "");
    }
  }, [open, initialContent, editor]);

  const handleSave = () => {
    if (editor) {
      onSave(editor.getHTML());
    }
    onClose();
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Note">
      <div className="space-y-2">
        {editor && (
          <>
            <div className="flex gap-2 border-b pb-2">
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBold().run()}
                className="px-2 py-1 border rounded"
              >
                B
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className="px-2 py-1 border rounded"
              >
                I
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleStrike().run()}
                className="px-2 py-1 border rounded"
              >
                S
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                className="px-2 py-1 border rounded"
              >
                •
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                className="px-2 py-1 border rounded"
              >
                1.
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleTaskList().run()}
                className="px-2 py-1 border rounded"
              >
                []
              </button>
            </div>
            <EditorContent editor={editor} className="min-h-[200px]" />
          </>
        )}
      </div>
      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave}>Save</Button>
      </ModalFooter>
    </Modal>
  );
};
