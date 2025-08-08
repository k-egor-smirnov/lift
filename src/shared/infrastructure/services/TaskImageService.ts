import { ulid } from "ulid";
import { rgbaToThumbHash, thumbHashToDataURL } from "thumbhash";
import { TodoDatabase, TaskImageRecord } from "../database/TodoDatabase";

export class TaskImageService {
  constructor(private db: TodoDatabase) {}

  private async fileToThumbhash(file: File): Promise<string> {
    const img = new Image();
    const url = URL.createObjectURL(file);
    try {
      await new Promise((resolve, reject) => {
        img.onload = () => resolve(null);
        img.onerror = (e) => reject(e);
        img.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context not available");
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const hash = rgbaToThumbHash(
        imageData.width,
        imageData.height,
        imageData.data
      );
      let binary = "";
      hash.forEach((b) => (binary += String.fromCharCode(b)));
      return btoa(binary);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async addImages(taskId: string, files: File[]): Promise<TaskImageRecord[]> {
    await this.db.initialize();
    const records: TaskImageRecord[] = [];
    for (const file of files) {
      const thumbhash = await this.fileToThumbhash(file);
      const record: TaskImageRecord = {
        id: ulid(),
        taskId,
        data: file,
        thumbhash,
        createdAt: new Date(),
      };
      await this.db.taskImages.put(record);
      records.push(record);
    }
    return records;
  }

  async getImages(taskId: string): Promise<TaskImageRecord[]> {
    await this.db.initialize();
    return await this.db.taskImages.where("taskId").equals(taskId).toArray();
  }
}

export function thumbhashToDataUrl(hash: string): string {
  const binary = atob(hash);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return thumbHashToDataURL(bytes);
}
