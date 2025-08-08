import React, { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../../../shared/ui/dialog";
import { Button } from "../../../../../shared/ui/button";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Link as LinkIcon,
  CheckSquare,
} from "lucide-react";

interface TaskNoteModalProps {
  isOpen: boolean;
  initialNote: string | null;
  onSave: (html: string | null) => void;
  onClose: () => void;
}

export const TaskNoteModal: React.FC<TaskNoteModalProps> = ({
  isOpen,
  initialNote,
  onSave,
  onClose,
}) => {
  const editor = useEditor({
    extensions: [StarterKit, Link, TaskList, TaskItem],
    content: initialNote || "",
  });

  useEffect(() => {
    if (editor && isOpen) {
      editor.commands.setContent(initialNote || "", false);
    }
  }, [editor, initialNote, isOpen]);

  const handleSave = () => {
    if (editor) {
      const html = editor.getHTML();
      const isEmpty = html === "<p></p>" || html === "<p></p>\n";
      onSave(isEmpty ? null : html);
    }
    onClose();
  };

  const addLink = () => {
    const url = window.prompt("Enter URL");
    if (url && editor) {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: url })
        .run();
    }
  };

  const toolbarButton = (
    action: () => void,
    active: boolean,
    Icon: React.FC<any>
  ) => (
    <button
      type="button"
      onClick={action}
      className={`p-2 rounded hover:bg-gray-100 ${active ? "bg-gray-200" : ""}`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Заметка</DialogTitle>
        </DialogHeader>
        {editor && (
          <div className="mb-2 border rounded">
            <div className="flex items-center gap-1 border-b p-1 flex-wrap">
              {toolbarButton(
                () => editor.chain().focus().toggleBold().run(),
                editor.isActive("bold"),
                Bold
              )}
              {toolbarButton(
                () => editor.chain().focus().toggleItalic().run(),
                editor.isActive("italic"),
                Italic
              )}
              {toolbarButton(
                () => editor.chain().focus().toggleStrike().run(),
                editor.isActive("strike"),
                Strikethrough
              )}
              {toolbarButton(
                () => editor.chain().focus().toggleBulletList().run(),
                editor.isActive("bulletList"),
                List
              )}
              {toolbarButton(
                () => editor.chain().focus().toggleOrderedList().run(),
                editor.isActive("orderedList"),
                ListOrdered
              )}
              {toolbarButton(addLink, editor.isActive("link"), LinkIcon)}
              {toolbarButton(
                () => editor.chain().focus().toggleTaskList().run(),
                editor.isActive("taskList"),
                CheckSquare
              )}
            </div>
            <EditorContent
              editor={editor}
              className="min-h-[150px] p-2 focus:outline-none"
            />
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSave}>Сохранить</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
