import { logger } from "../lib/logger.js";
import { satomiState, addLog } from "./satomi-state.js";
import { generateSatomiResponse } from "./satomi-ai.js";
import { broadcastToClients } from "./satomi-ws.js";
import { satomiConfig } from "./satomi.config.js";

const BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;
const LIVE_TWEET_ID = process.env.TWITTER_LIVE_TWEET_ID;

const seenTweetIds = new Set<string>();
const recentMessages = new Map<string, number>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let sinceId: string | null = null;
let primed = false;

function shouldProcess(username: string, message: string): boolean {
  const key = `${username}:${message.trim().toLowerCase()}`;
  const lastSeen = recentMessages.get(key) ?? 0;
  const now = Date.now();
  if (now - lastSeen < satomiConfig.spamWindowMs) return false;
  recentMessages.set(key, now);
  return true;
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

async function pollReplies(): Promise<void> {
  if (!BEARER_TOKEN || !LIVE_TWEET_ID) return;

  try {
    const query = `conversation_id:${LIVE_TWEET_ID} is:reply`;
    const url = new URL("https://api.twitter.com/2/tweets/search/recent");
    url.searchParams.set("query", query);
    url.searchParams.set("max_results", "10");
    url.searchParams.set("tweet.fields", "author_id,created_at,text");
    url.searchParams.set("expansions", "author_id");
    url.searchParams.set("user.fields", "username");
    if (sinceId) url.searchParams.set("since_id", sinceId);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, "Twitter API error");
      return;
    }

    const data = await res.json() as {
      data?: Array<{ id: string; text: string; author_id: string }>;
      includes?: { users?: Array<{ id: string; username: string }> };
      meta?: { newest_id?: string };
    };

    if (data.meta?.newest_id) sinceId = data.meta.newest_id;

    if (!primed) {
      primed = true;
      logger.info({ sinceId }, "Twitter poll primed — skipping existing replies");
      return;
    }

    if (!data.data || data.data.length === 0) return;

    const userMap = new Map<string, string>();
    for (const u of data.includes?.users ?? []) userMap.set(u.id, u.username);

    for (const tweet of data.data) {
      if (seenTweetIds.has(tweet.id)) continue;
      seenTweetIds.add(tweet.id);

      const username = userMap.get(tweet.author_id) ?? `user_${tweet.author_id.slice(-4)}`;
      const message = tweet.text.replace(/@\w+\s*/g, "").trim();

      satomiState.messagesReceived++;

      broadcastToClients({
        type: "chat",
        username,
        message,
        timestamp: Date.now(),
      });

      const hasTrigger = message.toLowerCase().includes("satomi");
      if (hasTrigger && shouldProcess(username, message)) {
        logger.info({ username, message }, "Twitter reply triggered");
        await handleTrigger(username, message);
      }
    }
  } catch (err) {
    logger.error({ err }, "Twitter poll error");
  }
}

export function startTwitterChat(): boolean {
  if (!BEARER_TOKEN) {
    logger.info("No TWITTER_BEARER_TOKEN configured — Twitter live chat not started");
    return false;
  }
  if (!LIVE_TWEET_ID) {
    logger.info("No TWITTER_LIVE_TWEET_ID configured — Twitter live chat not started");
    return false;
  }

  logger.info({ tweetId: LIVE_TWEET_ID }, "Twitter live chat started");

  satomiState.connected = true;
  void pollReplies();
  pollTimer = setInterval(() => void pollReplies(), 60_000);
  return true;
}

export function stopTwitterChat(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function isTwitterChatActive(): boolean {
  return pollTimer !== null;
}
