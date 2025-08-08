import { injectable, inject } from "tsyringe";
import Peer, { DataConnection } from "peerjs";
import { TaskRepository } from "../../domain/repositories/TaskRepository";
import { TaskId } from "../../domain/value-objects/TaskId";
import * as tokens from "../di/tokens";

/**
 * Service responsible for peer-to-peer synchronization of task images.
 * Uses WebRTC via peerjs to exchange binary image data directly between devices,
 * similar in spirit to syncthing's block exchange algorithm.
 */
@injectable()
export class ImageSyncService {
  private peer: Peer;
  private connections: Map<string, DataConnection> = new Map();

  constructor(
    @inject(tokens.TASK_REPOSITORY_TOKEN)
    private readonly taskRepository: TaskRepository
  ) {
    // Create a peer with a random ID; in real app this could be deterministic
    this.peer = new Peer();
    this.peer.on("connection", (conn) => {
      this.handleConnection(conn);
    });
  }

  /**
   * Connect to another peer by id
   */
  connect(peerId: string): void {
    const conn = this.peer.connect(peerId);
    this.handleConnection(conn);
  }

  private handleConnection(conn: DataConnection) {
    this.connections.set(conn.peer, conn);
    conn.on("data", async (data: any) => {
      if (data && data.taskId && data.image) {
        const buffer = new Uint8Array(data.image).buffer;
        const taskId = TaskId.fromString(data.taskId);
        const task = await this.taskRepository.findById(taskId);
        if (task) {
          task.updateImage(buffer, data.thumbhash || "");
          await this.taskRepository.save(task);
        }
      }
    });
  }

  /**
   * Send image data to a connected peer
   */
  sendImage(
    peerId: string,
    taskId: string,
    image: ArrayBuffer,
    thumbhash: string
  ): void {
    const conn = this.connections.get(peerId);
    if (conn && conn.open) {
      conn.send({
        taskId,
        image: Array.from(new Uint8Array(image)),
        thumbhash,
      });
    }
  }
}
