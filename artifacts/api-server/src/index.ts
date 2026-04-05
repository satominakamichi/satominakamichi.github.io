import http from "http";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { createSatomiWebSocketServer } from "./services/satomi-ws.js";
import { startTwitterChat } from "./services/twitter-chat.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

// Init WS server (async: creates DB table for chat history)
void createSatomiWebSocketServer(server).then(() => {
  server.listen(port, () => {
    logger.info({ port }, "Server listening");
    if (process.env.NODE_ENV === "production") {
      void startTwitterChat();
    } else {
      logger.info("Development mode — Twitter polling disabled");
    }
  });
});

server.on("error", (err) => {
  logger.error({ err }, "Server error");
  process.exit(1);
});
