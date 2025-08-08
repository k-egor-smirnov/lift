import { injectable, inject } from "tsyringe";
import { TaskImageRepository } from "../../domain/repositories/TaskImageRepository";
import { TaskImage } from "../../domain/entities/TaskImage";
import { rgbaToThumbHash } from "thumbhash";
import { SupabaseClientFactory } from "../../infrastructure/database/SupabaseClient";
import * as tokens from "../../infrastructure/di/tokens";

@injectable()
export class TaskImageService {
  constructor(
    @inject(tokens.TASK_IMAGE_REPOSITORY_TOKEN)
    private repository: TaskImageRepository,
    @inject(tokens.SUPABASE_CLIENT_FACTORY_TOKEN)
    private supabaseFactory: SupabaseClientFactory
  ) {}

  async addImages(taskId: string, files: File[]): Promise<TaskImage[]> {
    const images: TaskImage[] = [];
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const thumbhash = await this.generateThumbhash(file);
      const image = await this.repository.create(
        taskId,
        arrayBuffer,
        thumbhash
      );
      images.push(image);
      await this.saveThumbhash(taskId, image.id, thumbhash).catch(() => {});
      // TODO: implement P2P sync for image binary data
    }
    return images;
  }

  async getImages(taskId: string): Promise<TaskImage[]> {
    return this.repository.findByTaskId(taskId);
  }

  private async generateThumbhash(file: File): Promise<string> {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const width = Math.min(bitmap.width, 100);
    const height = Math.min(bitmap.height, 100);
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const hash = rgbaToThumbHash(width, height, imageData.data);
    return btoa(String.fromCharCode(...hash));
  }

  private async saveThumbhash(
    taskId: string,
    imageId: string,
    thumbhash: string
  ): Promise<void> {
    try {
      const client = this.supabaseFactory.getClient();
      await client.from("task_images").insert({
        id: imageId,
        task_id: taskId,
        thumbhash,
      });
    } catch {
      // Ignore errors, supabase may be offline
    }
  }
}
