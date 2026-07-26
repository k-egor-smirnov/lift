export interface TaskReorderIntent {
  readonly taskId: string;
  readonly leftTaskId: string | null;
  readonly rightTaskId: string | null;
}

export const taskReorderIntent = (
  orderedTaskIds: readonly string[],
  activeTaskId: string,
  overTaskId: string
): TaskReorderIntent | null => {
  if (activeTaskId === overTaskId) return null;

  const uniqueIds = new Set(orderedTaskIds);
  if (
    uniqueIds.size !== orderedTaskIds.length ||
    !uniqueIds.has(activeTaskId) ||
    !uniqueIds.has(overTaskId)
  ) {
    return null;
  }

  const activeIndex = orderedTaskIds.indexOf(activeTaskId);
  const overIndex = orderedTaskIds.indexOf(overTaskId);
  const reordered = [...orderedTaskIds];
  reordered.splice(activeIndex, 1);
  reordered.splice(overIndex, 0, activeTaskId);

  const movedIndex = reordered.indexOf(activeTaskId);
  return {
    taskId: activeTaskId,
    leftTaskId: reordered[movedIndex - 1] ?? null,
    rightTaskId: reordered[movedIndex + 1] ?? null,
  };
};
