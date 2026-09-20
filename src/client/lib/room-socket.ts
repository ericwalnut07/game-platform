import type { ClientRoomMessage, ServerRoomMessage } from "../../shared/room-protocol";
import type { RoomCredentials } from "../../shared/api";

export type RoomConnectionState = "CONNECTING" | "CONNECTED" | "RECONNECTING" | "OFFLINE" | "CLOSED";

interface RoomSocketCallbacks {
  onMessage: (message: ServerRoomMessage) => void;
  onStatus: (state: RoomConnectionState) => void;
}

const BACKOFF_MS = [500, 1_000, 2_000, 4_000, 8_000, 12_000] as const;
const FORCE_REFRESH_AFTER_HIDDEN_MS = 15_000;

export class RoomSocket {
  private socket: WebSocket | null = null;
  private credentials: RoomCredentials | null = null;
  private callbacks: RoomSocketCallbacks | null = null;
  private retryTimer: number | null = null;
  private retryAttempt = 0;
  private manuallyClosed = false;
  private hiddenAt: number | null = null;
  private listenersAttached = false;

  connect(
    credentials: RoomCredentials,
    onMessage: (message: ServerRoomMessage) => void,
    onStatus: (state: RoomConnectionState) => void
  ): void {
    this.close(false);
    this.credentials = credentials;
    this.callbacks = { onMessage, onStatus };
    this.manuallyClosed = false;
    this.retryAttempt = 0;
    this.attachBrowserListeners();
    this.open(false);
  }

  private attachBrowserListeners(): void {
    if (this.listenersAttached) return;
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.listenersAttached = true;
  }

  private detachBrowserListeners(): void {
    if (!this.listenersAttached) return;
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.listenersAttached = false;
  }

  private handleOnline = (): void => {
    if (this.manuallyClosed) return;
    this.retryAttempt = 0;
    this.open(true);
  };

  private handleOffline = (): void => {
    if (this.manuallyClosed) return;
    this.clearRetry();
    this.callbacks?.onStatus("OFFLINE");
  };

  private handleVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") {
      this.hiddenAt = Date.now();
      return;
    }
    const hiddenDuration = this.hiddenAt === null ? 0 : Date.now() - this.hiddenAt;
    this.hiddenAt = null;
    if (this.manuallyClosed || !navigator.onLine) return;

    // Mobile browsers can preserve an apparently OPEN WebSocket across sleep even
    // though the underlying network path is gone. After a meaningful sleep,
    // deliberately replace the connection so the server sends a fresh room/game view.
    if (hiddenDuration >= FORCE_REFRESH_AFTER_HIDDEN_MS || this.socket?.readyState !== WebSocket.OPEN) {
      this.retryAttempt = 0;
      this.open(true);
    }
  };

  private open(isReconnect: boolean): void {
    if (this.manuallyClosed || !this.credentials || !this.callbacks) return;
    if (!navigator.onLine) {
      this.callbacks.onStatus("OFFLINE");
      return;
    }

    this.clearRetry();
    const previous = this.socket;
    this.socket = null;
    if (previous && previous.readyState !== WebSocket.CLOSED) {
      try { previous.close(1000, "replace connection"); } catch { /* ignore */ }
    }

    this.callbacks.onStatus(isReconnect ? "RECONNECTING" : "CONNECTING");
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    const url = new URL(`${scheme}://${window.location.host}/api/rooms/${encodeURIComponent(this.credentials.roomCode)}/ws`);
    url.searchParams.set("playerId", this.credentials.playerId);

    // Keep the bearer-like room token out of the URL so it is not exposed in
    // ordinary request URL logs. The server validates the auth.* subprotocol and
    // negotiates the stable room-v1 protocol.
    const socket = new WebSocket(url, ["room-v1", `auth.${this.credentials.sessionToken}`]);
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (socket !== this.socket) return;
      this.retryAttempt = 0;
      this.callbacks?.onStatus("CONNECTED");
    });

    socket.addEventListener("close", () => {
      if (socket !== this.socket) return;
      this.socket = null;
      if (this.manuallyClosed) {
        this.callbacks?.onStatus("CLOSED");
        return;
      }
      if (!navigator.onLine) {
        this.callbacks?.onStatus("OFFLINE");
        return;
      }
      this.callbacks?.onStatus("RECONNECTING");
      this.scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      // The close event performs the retry. Calling close here makes browsers that
      // only emit `error` converge onto the same retry path.
      if (socket === this.socket && socket.readyState !== WebSocket.CLOSED) {
        try { socket.close(); } catch { /* ignore */ }
      }
    });

    socket.addEventListener("message", (event) => {
      if (socket !== this.socket) return;
      try {
        this.callbacks?.onMessage(JSON.parse(String(event.data)) as ServerRoomMessage);
      } catch {
        // Ignore malformed messages. Server-side validation remains authoritative.
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.manuallyClosed || !navigator.onLine || this.retryTimer !== null) return;
    const delay = BACKOFF_MS[Math.min(this.retryAttempt, BACKOFF_MS.length - 1)]!;
    this.retryAttempt += 1;
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      this.open(true);
    }, delay);
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  send(message: ClientRoomMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error("Room connection is not open");
    this.socket.send(JSON.stringify(message));
  }

  close(manual = true): void {
    if (manual) this.manuallyClosed = true;
    this.clearRetry();
    if (this.socket) {
      try { this.socket.close(1000, "client close"); } catch { /* ignore */ }
    }
    this.socket = null;
    if (manual) {
      this.detachBrowserListeners();
      this.callbacks?.onStatus("CLOSED");
      this.credentials = null;
      this.callbacks = null;
    }
  }
}

export function requestId(): string {
  return crypto.randomUUID();
}
