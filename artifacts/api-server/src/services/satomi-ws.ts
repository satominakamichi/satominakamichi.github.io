import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { satomiState } from "./satomi-state.js";
import { initChatLogTable, getRecentChatLog } from "./satomi-db.js";
import { logger } from "../lib/logger.js";

let wss: WebSocketServer | null = null;

export async function createSatomiWebSocketServer(server: Server): Promise<WebSocketServer> {
  // Ensure the persistent chat log table exists
  try {
    await initChatLogTable();
    logger.info("satomi_chat_log table ready");
  } catch (err) {
    logger.error({ err }, "Failed to init satomi_chat_log table");
  }

  wss = new WebSocketServer({ server, path: "/satomi-ws" });

  wss.on("connection", async (ws: WebSocket) => {
    // 1. Send connection status
    ws.send(JSON.stringify({ type: "status", connected: satomiState.connected }));

    // 2. Send recent chat history so every device starts in sync
    try {
      const history = await getRecentChatLog(5);
      if (history.length > 0) {
        ws.send(JSON.stringify({ type: "history", pairs: history }));
      }
    } catch (err) {
      logger.error({ err }, "Failed to send chat history to new client");
    }
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
  broadcastToClients({ type: "status", connected: satomiState.connected });
}
