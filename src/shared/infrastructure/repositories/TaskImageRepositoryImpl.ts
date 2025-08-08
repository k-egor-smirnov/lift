import { injectable, inject } from "tsyringe";
import { ulid } from "ulid";
import { TaskImageRepository } from "../../domain/repositories/TaskImageRepository";
import { TaskImage } from "../../domain/entities/TaskImage";
import { TodoDatabase } from "../database/TodoDatabase";
import * as tokens from "../di/tokens";

@injectable()
export class TaskImageRepositoryImpl implements TaskImageRepository {
  constructor(@inject(tokens.DATABASE_TOKEN) private db: TodoDatabase) {}

  async save(image: TaskImage): Promise<void> {
    await this.db.taskImages.put(image);
  }

  async create(
    taskId: string,
    data: ArrayBuffer,
    thumbhash: string
  ): Promise<TaskImage> {
    const image: TaskImage = {
      id: ulid(),
      taskId,
      data,
      thumbhash,
      createdAt: new Date(),
    };
    await this.save(image);
    return image;
  }

  async findByTaskId(taskId: string): Promise<TaskImage[]> {
    return this.db.taskImages.where("taskId").equals(taskId).toArray();
  }
}
