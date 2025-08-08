import { TaskImage } from "../entities/TaskImage";

export interface TaskImageRepository {
  save(image: TaskImage): Promise<void>;
  create(
    taskId: string,
    data: ArrayBuffer,
    thumbhash: string
  ): Promise<TaskImage>;
  findByTaskId(taskId: string): Promise<TaskImage[]>;
}
