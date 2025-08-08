import Peer from "simple-peer";

export class ImageSyncService {
  private peers: Peer.Instance[] = [];

  addPeer(initiator: boolean, onSignal: (data: any) => void) {
    const peer = new Peer({ initiator, trickle: false });
    peer.on("signal", onSignal);
    peer.on("data", (data) => {
      // Handle incoming image sync data
      try {
        const message = JSON.parse(data.toString());
        console.log("Received image data", message);
      } catch (e) {
        console.error("Failed to parse image sync message", e);
      }
    });
    this.peers.push(peer);
    return peer;
  }

  handleSignal(peer: Peer.Instance, data: any) {
    peer.signal(data);
  }

  broadcast(taskId: string, imageData: Uint8Array) {
    const payload = JSON.stringify({
      taskId,
      imageData: Array.from(imageData),
    });
    for (const peer of this.peers) {
      try {
        peer.send(payload);
      } catch (e) {
        console.error("Failed to send image data", e);
      }
    }
  }
}
