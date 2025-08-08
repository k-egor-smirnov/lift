import { injectable } from "tsyringe";
import { ulid } from "ulid";
import { rgbaToThumbHash, thumbHashToDataURL } from "thumbhash";
import { todoDatabase, TaskImageRecord } from "../database/TodoDatabase";
import { SupabaseClientFactory } from "../database/SupabaseClient";

@injectable()
export class TaskImageService {
  constructor(private supabaseFactory: SupabaseClientFactory) {}

  async addImages(taskId: string, files: File[]): Promise<TaskImageRecord[]> {
    const client = this.supabaseFactory.getClient();
    const records: TaskImageRecord[] = [];
    for (const file of files) {
      const blob = file as Blob;
      const thumbhash = await generateThumbhash(blob);
      const id = ulid();
      const record: TaskImageRecord = {
        id,
        taskId,
        data: blob,
        thumbhash,
        createdAt: new Date(),
      };
      await todoDatabase.taskImages.add(record);
      // store thumbhash in supabase
      try {
        await client
          .from("task_images")
          .upsert({ id, task_id: taskId, thumbhash });
      } catch (e) {
        console.error("Failed to sync thumbhash", e);
      }
      records.push(record);
    }
    return records;
  }

  async getImages(taskId: string): Promise<TaskImageRecord[]> {
    return todoDatabase.taskImages.where({ taskId }).toArray();
  }
}

async function generateThumbhash(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  ctx!.drawImage(bitmap, 0, 0);
  const imageData = ctx!.getImageData(0, 0, canvas.width, canvas.height);
  const hash = rgbaToThumbHash(canvas.width, canvas.height, imageData.data);
  // Convert Uint8Array to base64
  let binary = "";
  hash.forEach((b: number) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

export function thumbhashToDataUrl(hash: string): string {
  const binary = atob(hash);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
  return thumbHashToDataURL(array);
}
