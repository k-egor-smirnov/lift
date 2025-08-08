import React from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import { Modal, ModalBody, ModalFooter } from "../../../../../shared/ui/Modal";
import { Button } from "../../../../../shared/ui/button";

interface TaskNoteModalProps {
  isOpen: boolean;
  initialNote: string | null;
  onSave: (note: string | null) => void;
  onClose: () => void;
}

export const TaskNoteModal: React.FC<TaskNoteModalProps> = ({
  isOpen,
  initialNote,
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
    content: initialNote || "",
  });

  const handleSave = () => {
    if (!editor) {
      onSave(null);
      return;
    }
    const html = editor.getHTML();
    const isEmpty = html === "<p></p>" || html === "<p></p>\n";
    onSave(isEmpty ? null : html);
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Заметка" size="lg">
      <ModalBody>
        {editor && (
          <div>
            <EditorContent
              editor={editor}
              className="border rounded min-h-[200px] p-2 focus:outline-none"
            />
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button onClick={handleSave}>Сохранить</Button>
      </ModalFooter>
    </Modal>
  );
};
