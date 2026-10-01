import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomSocket } from "../../src/client/lib/room-socket";

class Socket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static instances: Socket[] = [];
  readyState = Socket.CONNECTING;
  close = vi.fn(() => { this.readyState = Socket.CLOSED; this.dispatchEvent(new Event("close")); });
  send = vi.fn();
  constructor(_url: URL, _protocols: string[]) { super(); Socket.instances.push(this); }
  open() { this.readyState = Socket.OPEN; this.dispatchEvent(new Event("open")); }
}
const credentials = { roomCode: "HUB123", playerId: "A", sessionToken: "test-session" };
beforeEach(() => {
  Socket.instances = [];
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("window", Object.assign(new EventTarget(), { location: { protocol: "http:", host: "localhost" }, setTimeout, clearTimeout }));
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
  vi.stubGlobal("navigator", { onLine: true });
});
afterEach(() => vi.unstubAllGlobals());

describe("room connection cleanup", () => {
  it("completes an abandoned upgrade before closing, without reviving its callbacks", () => {
    const room = new RoomSocket(), onStatus = vi.fn();
    room.connect(credentials, vi.fn(), onStatus);
    const abandoned = Socket.instances[0]!;
    room.close();
    expect(abandoned.close).not.toHaveBeenCalled();
    onStatus.mockClear();
    abandoned.open();
    expect(abandoned.close).toHaveBeenCalledWith(1000, "client close");
    expect(onStatus).not.toHaveBeenCalled();
    expect(room.isConnected()).toBe(false);
  });
  it("closes StrictMode's first connection after its delayed handshake and keeps the replacement usable", () => {
    const room = new RoomSocket(), onStatus = vi.fn();
    room.connect(credentials, vi.fn(), onStatus);
    const first = Socket.instances[0]!;
    room.close();
    room.connect(credentials, vi.fn(), onStatus);
    const current = Socket.instances[1]!;
    current.open(); onStatus.mockClear(); first.open();
    expect(first.close).toHaveBeenCalledOnce();
    expect(current.close).not.toHaveBeenCalled();
    expect(onStatus).not.toHaveBeenCalled();
    expect(room.isConnected()).toBe(true);
    const message = { type: "HEARTBEAT", requestId: "heartbeat" } as const;
    room.send(message); expect(current.send).toHaveBeenCalledWith(JSON.stringify(message));
    room.close(); expect(current.close).toHaveBeenCalledWith(1000, "client close");
  });
  it("finishes an in-flight upgrade when online recovery replaces it", () => {
    const room = new RoomSocket(); room.connect(credentials, vi.fn(), vi.fn());
    const previous = Socket.instances[0]!;
    window.dispatchEvent(new Event("online"));
    expect(previous.close).not.toHaveBeenCalled();
    previous.open(); expect(previous.close).toHaveBeenCalledWith(1000, "replace connection");
    Socket.instances[1]!.open(); expect(room.isConnected()).toBe(true); room.close();
  });
});
