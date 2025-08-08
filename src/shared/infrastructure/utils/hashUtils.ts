/**
 * Utility functions for hashing objects
 */

/**
 * Create a simple hash of an object for sync queue operations
 * This is used to detect changes in entities for sync purposes
 */
export function hashObject(obj: any): string {
  // Convert object to a stable JSON string
  const jsonString = JSON.stringify(obj, Object.keys(obj).sort());

  // Simple hash function (djb2 algorithm)
  let hash = 5381;
  for (let i = 0; i < jsonString.length; i++) {
    hash = (hash << 5) + hash + jsonString.charCodeAt(i);
  }

  // Convert to positive number and return as hex string
  return (hash >>> 0).toString(16);
}

/**
 * Create a hash of a task entity for sync operations
 */
export function hashTask(task: any): string {
  // Only hash the fields that matter for sync
  const syncData = {
    id: task.id?.value || task.id,
    title: task.title?.value || task.title,
    category: task.category,
    status: task.status,
    updatedAt: task.updatedAt?.toISOString() || task.updatedAt,
    deletedAt: task.deletedAt?.toISOString() || task.deletedAt,
    inboxEnteredAt: task.inboxEnteredAt?.toISOString() || task.inboxEnteredAt,
    note: task.note ?? null,
  };

  return hashObject(syncData);
}
