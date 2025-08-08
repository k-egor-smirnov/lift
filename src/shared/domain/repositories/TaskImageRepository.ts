import { TaskId } from "../value-objects/TaskId";

export interface TaskImageRepository {
  get(taskId: TaskId): Promise<Blob | null>;
  save(taskId: TaskId, image: Blob): Promise<void>;
}
