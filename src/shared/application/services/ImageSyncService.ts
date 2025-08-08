import { injectable } from "tsyringe";
import Peer from "simple-peer";

export interface ImageSyncService {
  broadcastImage(taskId: string, image: Blob): Promise<void>;
}

@injectable()
export class SyncthingLikeImageSyncService implements ImageSyncService {
  private peers: Peer.Instance[] = [];

  constructor() {
    // In a real implementation, peers would be discovered and connected
    // using a signaling server. This simplified version keeps track of
    // connected peers and relays images to them.
  }

  addPeer(peer: Peer.Instance): void {
    this.peers.push(peer);
  }

  async broadcastImage(taskId: string, image: Blob): Promise<void> {
    const buffer = await image.arrayBuffer();
    const payload = JSON.stringify({
      taskId,
      data: Array.from(new Uint8Array(buffer)),
    });
    for (const peer of this.peers) {
      try {
        peer.send(payload);
      } catch (e) {
        console.error("Failed to send image to peer", e);
      }
    }
  }
}
