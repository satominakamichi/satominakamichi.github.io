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

// ── Server-side idle greeting ─────────────────────────────────────────────────
const IDLE_GREET_MS = 5 * 60 * 1000;
let idleGreetTimer: ReturnType<typeof setTimeout> | null = null;
const recentIdleGreetings: string[] = [];

function buildGreetPrompt(): string {
  const base = "[IDLE_GREETING] Nobody has talked to you for a bit so you say something naturally to fill the air — could be a random thought, a chill check-in, a joke, a Japanese phrase, a vibe, whatever. Under 15 words. Don't force it. Mix English and Japanese freely.";
  if (recentIdleGreetings.length === 0) return base;
  const avoidList = recentIdleGreetings.map((g, i) => `${i + 1}. "${g}"`).join(" | ");
  return `${base} You MUST NOT repeat or closely paraphrase anything you already said recently. Recent greetings to avoid: ${avoidList}`;
}

function scheduleIdleGreet(): void {
  if (idleGreetTimer) clearTimeout(idleGreetTimer);
  idleGreetTimer = setTimeout(async () => {
    try {
      const { text, gesture } = await generateSatomiResponse("__idle__", buildGreetPrompt());
      recentIdleGreetings.push(text);
      if (recentIdleGreetings.length > 15) recentIdleGreetings.shift();
      broadcastToClients({ type: "greeting", text, gesture, timestamp: Date.now() });
      logger.info({ text }, "Idle greeting broadcast");
    } catch (err) {
      logger.error({ err }, "Idle greeting failed");
    }
    scheduleIdleGreet();
  }, IDLE_GREET_MS);
}

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
  scheduleIdleGreet(); // reset idle timer on every incoming tweet

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
      // Mark all existing tweet IDs as seen so they are never re-processed
      for (const tweet of data.data ?? []) seenTweetIds.add(tweet.id);
      logger.info({ sinceId, skipped: seenTweetIds.size }, "Twitter poll primed — skipping existing replies");
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

      if (shouldProcess(username, message)) {
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
  scheduleIdleGreet();
  return true;
}

export function stopTwitterChat(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (idleGreetTimer) {
    clearTimeout(idleGreetTimer);
    idleGreetTimer = null;
  }
}

export function isTwitterChatActive(): boolean {
  return pollTimer !== null;
}
