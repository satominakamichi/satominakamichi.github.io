import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { satomiState } from "./satomi-state.js";

let wss: WebSocketServer | null = null;

export function createSatomiWebSocketServer(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: "/satomi-ws" });

  wss.on("connection", (ws: WebSocket) => {
    const statusEvent = {
      type: "status",
      connected: satomiState.connected,
      tokenAddress: satomiState.tokenAddress,
    };
    ws.send(JSON.stringify(statusEvent));
  });

  return wss;
}

export function broadcastToClients(event: object): void {
  if (!wss) return;
  const data = JSON.stringify(event);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

export function broadcastStatus(): void {
  broadcastToClients({
    type: "status",
    connected: satomiState.connected,
    tokenAddress: satomiState.tokenAddress,
  });
}
