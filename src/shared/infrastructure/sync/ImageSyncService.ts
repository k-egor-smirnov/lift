import Peer from "simple-peer";
import { TaskImageRecord, todoDatabase } from "../database/TodoDatabase";
import { TaskImageService } from "../services/TaskImageService";

export class ImageSyncService {
  private peers: Peer.Instance[] = [];
  constructor(private imageService: TaskImageService) {}

  addPeer(peer: Peer.Instance) {
    this.peers.push(peer);
    peer.on("data", async (data) => {
      try {
        const payload = JSON.parse(data.toString());
        if (payload.type === "image") {
          const bytes = Uint8Array.from(atob(payload.data), (c) =>
            c.charCodeAt(0)
          );
          const blob = new Blob([bytes], { type: payload.mime });
          await todoDatabase.taskImages.add({
            id: payload.id,
            taskId: payload.taskId,
            data: blob,
            thumbhash: payload.thumbhash,
            createdAt: new Date(payload.createdAt),
          } as TaskImageRecord);
        }
      } catch (e) {
        console.error("Failed to process incoming image", e);
      }
    });
  }

  async broadcastImage(record: TaskImageRecord) {
    const buffer = await record.data.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    const payload = JSON.stringify({
      type: "image",
      id: record.id,
      taskId: record.taskId,
      data: base64,
      mime: record.data.type,
      thumbhash: record.thumbhash,
      createdAt: record.createdAt.toISOString(),
    });
    this.peers.forEach((p) => p.send(payload));
  }
}
