import { io, type Socket } from "socket.io-client";
import { logger } from "../lib/logger.js";
import { satomiState, addLog } from "./satomi-state.js";
import { generateSatomiResponse } from "./satomi-ai.js";
import { broadcastToClients, broadcastStatus } from "./satomi-ws.js";
import { satomiConfig } from "./satomi.config.js";

const recentMessages = new Map<string, number>();
let wsFailures = 0;
let usingPolling = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let socket: Socket | null = null;
const seenMsgIds = new Set<string>();

function shouldProcess(username: string, message: string): boolean {
  if (!message.toLowerCase().includes(satomiConfig.triggerWord.toLowerCase())) return false;
  const key = `${username}:${message.trim().toLowerCase()}`;
  const lastSeen = recentMessages.get(key) ?? 0;
  const now = Date.now();
  if (now - lastSeen < satomiConfig.spamWindowMs) return false;
  recentMessages.set(key, now);
  return true;
}

async function handleIncomingMessage(username: string, message: string): Promise<void> {
  satomiState.messagesReceived++;

  broadcastToClients({
    type: "chat",
    username,
    message,
    timestamp: Date.now(),
  });

  if (shouldProcess(username, message)) {
    await handleTrigger(username, message);
  }
}

async function handleTrigger(username: string, message: string): Promise<void> {
  satomiState.triggerCount++;

  broadcastToClients({
    type: "trigger",
    username,
    message,
    timestamp: Date.now(),
  });

  const { text: response, gesture } = await generateSatomiResponse(username, message);
  satomiState.responsesGenerated++;

  const entry = { username, question: message, response, timestamp: new Date() };
  addLog(entry);

  broadcastToClients({
    type: "response",
    username,
    question: message,
    response,
    gesture,
    timestamp: Date.now(),
  });
}

async function pollMessages(tokenAddress: string): Promise<void> {
  try {
    const res = await fetch(
      `https://client-api.pump.fun/chats/${tokenAddress}/messages?limit=50`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return;

    const body = (await res.json()) as Array<{ id?: string; username?: string; message?: string }>;
    if (!Array.isArray(body)) return;

    for (const item of body) {
      const id = item.id ?? `${item.username}:${item.message}`;
      if (seenMsgIds.has(id)) continue;
      seenMsgIds.add(id);
      if (seenMsgIds.size > 2000) {
        const first = seenMsgIds.values().next().value;
        if (first !== undefined) seenMsgIds.delete(first);
      }

      const username = item.username ?? "anon";
      const message = item.message ?? "";
      if (!message) continue;

      await handleIncomingMessage(username, message).catch((err) => {
        logger.error({ err }, "Polling: error handling message");
      });
    }
  } catch (err) {
    logger.warn({ err }, "HTTP poll failed");
  }
}

function startPollingFallback(tokenAddress: string): void {
  if (pollTimer) clearInterval(pollTimer);
  usingPolling = true;
  satomiState.connected = false;
  broadcastStatus();
  logger.warn({ tokenAddress }, "Falling back to HTTP polling for Pump.fun chat");

  seenMsgIds.clear();
  pollMessages(tokenAddress).catch(() => {});
  pollTimer = setInterval(() => {
    pollMessages(tokenAddress).catch(() => {});
  }, satomiConfig.pollIntervalMs);
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  usingPolling = false;
}

export function startPumpFunChat(tokenAddress?: string): void {
  const addr = tokenAddress ?? satomiState.tokenAddress;

  if (!addr) {
    logger.info("No PUMP_TOKEN_MINT configured — Pump.fun chat not started");
    return;
  }

  stopPolling();
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  satomiState.tokenAddress = addr;
  satomiState.connected = false;
  wsFailures = 0;

  logger.info({ tokenAddress: addr }, "Connecting to Pump.fun chat via WebSocket");

  socket = io("https://client-api.pump.fun", {
    transports: ["websocket"],
    path: "/socket.io/",
    reconnectionDelay: 1000,
    reconnectionAttempts: satomiConfig.wsReconnectAttempts,
    timeout: 10000,
  });

  socket.on("connect", () => {
    logger.info({ tokenAddress: addr }, "Connected to Pump.fun WS");
    satomiState.connected = true;
    wsFailures = 0;
    if (usingPolling) {
      stopPolling();
      logger.info("WS reconnected — stopping polling fallback");
    }
    broadcastStatus();
    socket!.emit("join", { mint: addr });
  });

  socket.on("disconnect", (reason) => {
    logger.warn({ reason }, "Disconnected from Pump.fun WS");
    satomiState.connected = false;
    broadcastStatus();
  });

  socket.on("connect_error", (err) => {
    wsFailures++;
    logger.error({ err: err.message, wsFailures }, "Pump.fun WS connection error");
    satomiState.connected = false;

    if (wsFailures >= satomiConfig.wsReconnectAttempts && !usingPolling) {
      logger.warn("WS failed too many times — switching to HTTP polling fallback");
      socket?.disconnect();
      socket = null;
      startPollingFallback(addr);
    }
  });

  socket.on("reconnect_failed", () => {
    logger.warn("WS reconnect_failed — switching to HTTP polling fallback");
    if (!usingPolling) startPollingFallback(addr);
  });

  socket.on("message", (data: { username?: string; message?: string }) => {
    if (!data || typeof data.message !== "string") return;
    const username = data.username ?? "anon";
    handleIncomingMessage(username, data.message).catch((err) => {
      logger.error({ err }, "WS: error handling message");
    });
  });
}

export function stopPumpFunChat(): void {
  stopPolling();
  if (socket) {
    socket.disconnect();
    socket = null;
    satomiState.connected = false;
    broadcastStatus();
  }
}

export function reconnectPumpFunChat(tokenAddress: string): void {
  satomiState.tokenAddress = tokenAddress;
  startPumpFunChat(tokenAddress);
  broadcastStatus();
}

export function getIntakeMode(): "websocket" | "polling" | "idle" {
  if (usingPolling) return "polling";
  if (socket?.connected) return "websocket";
  return "idle";
}
