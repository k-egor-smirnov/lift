import { injectable, inject } from "tsyringe";
import { TaskImageRepository } from "../../domain/repositories/TaskImageRepository";
import { TodoDatabase } from "../database/TodoDatabase";
import { TaskId } from "../../domain/value-objects/TaskId";
import * as tokens from "../di/tokens";

@injectable()
export class TaskImageRepositoryImpl implements TaskImageRepository {
  constructor(@inject(tokens.DATABASE_TOKEN) private db: TodoDatabase) {}

  async get(taskId: TaskId): Promise<Blob | null> {
    const record = await this.db.taskImages.get(taskId.value);
    return record ? record.imageData : null;
  }

  async save(taskId: TaskId, image: Blob): Promise<void> {
    await this.db.taskImages.put({
      taskId: taskId.value,
      imageData: image,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
