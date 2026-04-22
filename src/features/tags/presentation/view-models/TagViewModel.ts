import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Tag {
  id: string;
  name: string;
  color: string;
}

interface TagState {
  tags: Tag[];
  tagsCollapsed: boolean;
  taskTags: Record<string, string[]>;
  createTag: (name: string, color: string) => Tag;
  renameTag: (tagId: string, name: string) => void;
  deleteTag: (tagId: string) => void;
  assignTagsToTask: (taskId: string, tagIds: string[]) => void;
  removeTaskTagRelations: (taskId: string) => void;
  toggleTagsCollapsed: () => void;
  getTagsForTask: (taskId: string) => Tag[];
  getTaskCountByTag: (tagId: string) => number;
}

const normalizeTagName = (name: string) => name.trim();

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `tag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export const useTagViewModel = create<TagState>()(
  persist(
    (set, get) => ({
      tags: [],
      tagsCollapsed: false,
      taskTags: {},

      createTag: (name: string, color: string) => {
        const normalizedName = normalizeTagName(name);
        const existing = get().tags.find(
          (tag) => tag.name.toLowerCase() === normalizedName.toLowerCase()
        );

        if (existing) {
          return existing;
        }

        const tag: Tag = {
          id: createId(),
          name: normalizedName,
          color,
        };

        set((state) => ({ tags: [...state.tags, tag] }));
        return tag;
      },

      renameTag: (tagId: string, name: string) => {
        const normalizedName = normalizeTagName(name);
        if (!normalizedName) {
          return;
        }

        set((state) => ({
          tags: state.tags.map((tag) =>
            tag.id === tagId ? { ...tag, name: normalizedName } : tag
          ),
        }));
      },

      deleteTag: (tagId: string) => {
        set((state) => {
          const nextTaskTags = Object.fromEntries(
            Object.entries(state.taskTags).map(([taskId, tagIds]) => [
              taskId,
              tagIds.filter((id) => id !== tagId),
            ])
          );

          return {
            tags: state.tags.filter((tag) => tag.id !== tagId),
            taskTags: nextTaskTags,
          };
        });
      },

      assignTagsToTask: (taskId: string, tagIds: string[]) => {
        const deduplicated = Array.from(new Set(tagIds));
        set((state) => ({
          taskTags: {
            ...state.taskTags,
            [taskId]: deduplicated,
          },
        }));
      },

      removeTaskTagRelations: (taskId: string) => {
        set((state) => {
          const nextTaskTags = { ...state.taskTags };
          delete nextTaskTags[taskId];
          return { taskTags: nextTaskTags };
        });
      },

      toggleTagsCollapsed: () => {
        set((state) => ({ tagsCollapsed: !state.tagsCollapsed }));
      },

      getTagsForTask: (taskId: string) => {
        const { tags, taskTags } = get();
        const tagIds = taskTags[taskId] ?? [];
        return tags.filter((tag) => tagIds.includes(tag.id));
      },

      getTaskCountByTag: (tagId: string) => {
        const { taskTags } = get();
        return Object.values(taskTags).filter((tagIds) =>
          tagIds.includes(tagId)
        ).length;
      },
    }),
    {
      name: "lift-tags-storage",
      partialize: (state) => ({
        tags: state.tags,
        tagsCollapsed: state.tagsCollapsed,
        taskTags: state.taskTags,
      }),
    }
  )
);
