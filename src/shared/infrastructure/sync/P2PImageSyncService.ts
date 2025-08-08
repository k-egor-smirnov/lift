import Peer from "simple-peer";

/**
 * Simple peer-to-peer image synchronization service using WebRTC (simple-peer).
 * This service broadcasts image updates between connected peers. It is a
 * lightweight approximation of syncthing-style direct synchronization.
 */
export class P2PImageSyncService {
  private peers: Peer.Instance[] = [];

  /** Callback invoked when an image is received from a peer */
  public onImage?: (taskId: string, imageBase64: string) => void;

  /**
   * Create a new peer connection. The returned peer should have its signalling
   * data exchanged with a remote peer through any signalling server.
   */
  connect(initiator: boolean): Peer.Instance {
    const peer = new Peer({ initiator, trickle: false });
    peer.on("data", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as {
          taskId: string;
          image: string;
        };
        this.onImage?.(msg.taskId, msg.image);
      } catch {
        // Ignore malformed messages
      }
    });
    this.peers.push(peer);
    return peer;
  }

  /**
   * Broadcast an image associated with a task to all connected peers.
   */
  broadcastImage(taskId: string, image: Blob): void {
    const reader = new FileReader();
    reader.onload = () => {
      const message = JSON.stringify({ taskId, image: reader.result });
      for (const peer of this.peers) {
        try {
          peer.send(message);
        } catch {
          // Ignore send errors
        }
      }
    };
    reader.readAsDataURL(image);
  }
}
