import React, { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Link as LinkIcon,
  CheckSquare,
} from "lucide-react";

interface TiptapEditorProps {
  content?: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
}

export const TiptapEditor: React.FC<TiptapEditorProps> = ({
  content = "",
  onChange,
  placeholder = "Добавьте заметку...",
  className = "",
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList.configure({
        HTMLAttributes: {
          class: "task-list",
        },
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: {
          class: "task-item",
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-blue-600 underline",
        },
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none min-h-[120px] p-3 border rounded-md",
        placeholder,
      },
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) {
    return null;
  }

  const addLink = () => {
    const url = window.prompt("Введите URL:");
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  return (
    <div className={`tiptap-editor ${className}`}>
      {/* Toolbar */}
      <div className="border-b p-2 flex flex-wrap gap-1 bg-gray-50 rounded-t-md">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-2 rounded hover:bg-gray-200 transition-colors ${
            editor.isActive("bold") ? "bg-gray-300" : ""
          }`}
          title="Жирный"
        >
          <Bold className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-2 rounded hover:bg-gray-200 transition-colors ${
            editor.isActive("italic") ? "bg-gray-300" : ""
          }`}
          title="Курсив"
        >
          <Italic className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`p-2 rounded hover:bg-gray-200 transition-colors ${
            editor.isActive("strike") ? "bg-gray-300" : ""
          }`}
          title="Зачёркнутый"
        >
          <Strikethrough className="w-4 h-4" />
        </button>

        <div className="w-px h-6 bg-gray-300 mx-1 self-center" />

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-2 rounded hover:bg-gray-200 transition-colors ${
            editor.isActive("bulletList") ? "bg-gray-300" : ""
          }`}
          title="Маркированный список"
        >
          <List className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`p-2 rounded hover:bg-gray-200 transition-colors ${
            editor.isActive("orderedList") ? "bg-gray-300" : ""
          }`}
          title="Нумерованный список"
        >
          <ListOrdered className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          className={`p-2 rounded hover:bg-gray-200 transition-colors ${
            editor.isActive("taskList") ? "bg-gray-300" : ""
          }`}
          title="Чеклист"
        >
          <CheckSquare className="w-4 h-4" />
        </button>

        <div className="w-px h-6 bg-gray-300 mx-1 self-center" />

        <button
          type="button"
          onClick={addLink}
          className={`p-2 rounded hover:bg-gray-200 transition-colors ${
            editor.isActive("link") ? "bg-gray-300" : ""
          }`}
          title="Вставить ссылку"
        >
          <LinkIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Editor */}
      <EditorContent editor={editor} className="min-h-[120px]" />

      <style>{`
        .tiptap-editor .ProseMirror {
          outline: none;
        }

        .tiptap-editor .task-list {
          list-style: none;
          padding: 0;
        }

        .tiptap-editor .task-item {
          display: flex;
          align-items: flex-start;
          margin: 0.25rem 0;
        }

        .tiptap-editor .task-item > label {
          flex: 0 0 auto;
          margin-right: 0.5rem;
          user-select: none;
        }

        .tiptap-editor .task-item > div {
          flex: 1 1 auto;
        }

        .tiptap-editor .task-item input[type="checkbox"] {
          cursor: pointer;
        }

        .tiptap-editor ul[data-type="taskList"] {
          list-style: none;
          padding: 0;
        }

        .tiptap-editor li[data-type="taskItem"] {
          display: flex;
          align-items: flex-start;
        }

        .tiptap-editor li[data-type="taskItem"] > label {
          flex: 0 0 auto;
          margin-right: 0.5rem;
          user-select: none;
        }

        .tiptap-editor li[data-type="taskItem"] > div {
          flex: 1 1 auto;
        }
      `}</style>
    </div>
  );
};
