
import { SyncEvent } from '../types';

class SyncService {
  private eventSource: EventSource | null = null;
  private roomCode: string | null = null;

  async joinRoom(code: string, onEvent: (event: SyncEvent) => void) {
    this.leaveRoom();
    const cleanCode = code.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!cleanCode) return;
    this.roomCode = cleanCode;

    // Use ntfy.sh SSE stream. Note: EventSource automatically handles reconnection.
    this.eventSource = new EventSource(`https://ntfy.sh/auction-room-${this.roomCode}/sse`);
    
    this.eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        // ntfy.sh wraps the broadcasted payload in the 'message' field
        if (data.message) {
          const event: SyncEvent = JSON.parse(data.message);
          onEvent(event);
        }
      } catch (err) {
        // Silently skip heartbeat or malformed messages
      }
    };

    this.eventSource.onerror = (e) => {
      // EventSource naturally reconnects. We log as debug to avoid cluttering the console with "errors".
      console.debug("Sync connection refreshed or temporarily lost. Reconnecting automatically...");
    };
  }

  async sendEvent(event: SyncEvent) {
    if (!this.roomCode) return;

    try {
      // Broadcast to ntfy.sh topic
      await fetch(`https://ntfy.sh/auction-room-${this.roomCode}`, {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'Title': 'Auction Event',
          'Tags': 'money_with_wings'
        }
      });
    } catch (err) {
      console.error("Failed to broadcast event:", err);
    }
  }

  leaveRoom() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.roomCode = null;
  }
}

export const syncService = new SyncService();
