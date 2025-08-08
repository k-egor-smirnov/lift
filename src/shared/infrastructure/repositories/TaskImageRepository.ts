import { injectable } from "tsyringe";
import { ulid } from "ulid";
import { TodoDatabase, TaskImageRecord } from "../database/TodoDatabase";
import { rgbaToThumbHash } from "thumbhash";

@injectable()
export class TaskImageRepository {
  constructor(private db: TodoDatabase) {}

  async addImages(taskId: string, files: File[]): Promise<TaskImageRecord[]> {
    const added: TaskImageRecord[] = [];
    for (const file of files) {
      const id = ulid();
      let thumbhash = "";
      try {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const hash = rgbaToThumbHash(
            imageData.data,
            canvas.width,
            canvas.height
          );
          thumbhash = btoa(String.fromCharCode(...hash));
        }
      } catch (err) {
        console.warn("Failed to generate thumbhash", err);
      }
      const record: TaskImageRecord = {
        id,
        taskId,
        blob: file,
        thumbhash,
      };
      await this.db.taskImages.add(record);
      added.push(record);
    }
    return added;
  }

  async getImages(taskId: string): Promise<TaskImageRecord[]> {
    return this.db.taskImages.where({ taskId }).toArray();
  }

  async deleteImage(id: string): Promise<void> {
    await this.db.taskImages.delete(id);
  }
}
