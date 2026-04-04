import { logger } from "../lib/logger.js";
import { satomiState, addLog } from "./satomi-state.js";
import { generateSatomiResponse } from "./satomi-ai.js";
import { broadcastToClients } from "./satomi-ws.js";
import { satomiConfig } from "./satomi.config.js";
import { pool } from "@workspace/db";

const BEARER_TOKEN  = process.env.TWITTER_BEARER_TOKEN;
const LIVE_TWEET_ID = process.env.TWITTER_LIVE_TWEET_ID;
const IDLE_GREET_MS = 5 * 60 * 1000; // 5 minutes

// ── Persistent KV helpers ─────────────────────────────────────────────────────
async function getKv(key: string): Promise<string | null> {
  const r = await pool.query("SELECT value FROM satomi_kv WHERE key = $1", [key]);
  return r.rows[0]?.value ?? null;
}
async function setKv(key: string, value: string): Promise<void> {
  await pool.query(
    `INSERT INTO satomi_kv (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value],
  );
}

// ── Runtime state ─────────────────────────────────────────────────────────────
// seenTweetIds: in-session only — cross-restart dedup handled by since_id in DB
const seenTweetIds   = new Set<string>();
const recentMessages = new Map<string, number>();
let pollTimer:      ReturnType<typeof setInterval> | null = null;
let sinceId:        string | null = null; // loaded from DB on startup
let idleGreetTimer: ReturnType<typeof setTimeout>  | null = null;
const recentIdleGreetings: string[] = [];

// ── Idle greeting ─────────────────────────────────────────────────────────────
function buildGreetPrompt(): string {
  const base = "[IDLE_GREETING] Nobody has talked to you for a bit so you say something naturally to fill the air — could be a random thought, a chill check-in, a joke, a Japanese phrase, a vibe, whatever. Under 15 words. Don't force it. Mix English and Japanese freely.";
  if (recentIdleGreetings.length === 0) return base;
  const avoidList = recentIdleGreetings.map((g, i) => `${i + 1}. "${g}"`).join(" | ");
  return `${base} You MUST NOT repeat or closely paraphrase anything you already said recently. Recent greetings to avoid: ${avoidList}`;
}

function scheduleIdleGreet(delayMs = IDLE_GREET_MS): void {
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
    scheduleIdleGreet(); // next cycle always full IDLE_GREET_MS
  }, delayMs);
}

// Called on every incoming tweet — resets idle countdown AND persists timestamp
function resetIdleTimer(): void {
  void setKv("last_tweet_at", String(Date.now()));
  scheduleIdleGreet(); // always IDLE_GREET_MS from now
}

// ── Spam dedup ────────────────────────────────────────────────────────────────
function shouldProcess(username: string, message: string): boolean {
  const key = `${username}:${message.trim().toLowerCase()}`;
  const lastSeen = recentMessages.get(key) ?? 0;
  const now = Date.now();
  if (now - lastSeen < satomiConfig.spamWindowMs) return false;
  recentMessages.set(key, now);
  return true;
}

// ── Handle incoming tweet ─────────────────────────────────────────────────────
async function handleTrigger(username: string, message: string): Promise<void> {
  satomiState.triggerCount++;
  resetIdleTimer();

  broadcastToClients({ type: "trigger", username, message, timestamp: Date.now() });

  const { text: response, gesture } = await generateSatomiResponse(username, message);
  satomiState.responsesGenerated++;

  addLog({ username, question: message, response, timestamp: new Date() });

  broadcastToClients({
    type: "response",
    username,
    question: message,
    response,
    gesture,
    timestamp: Date.now(),
  });
}

// ── Poll Twitter API ──────────────────────────────────────────────────────────
async function pollReplies(): Promise<void> {
  if (!BEARER_TOKEN || !LIVE_TWEET_ID) return;

  try {
    const query = `conversation_id:${LIVE_TWEET_ID} is:reply`;
    const url   = new URL("https://api.twitter.com/2/tweets/search/recent");
    url.searchParams.set("query",        query);
    url.searchParams.set("max_results",  "10");
    url.searchParams.set("tweet.fields", "author_id,created_at,text");
    url.searchParams.set("expansions",   "author_id");
    url.searchParams.set("user.fields",  "username");
    if (sinceId) url.searchParams.set("since_id", sinceId);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
      signal:  AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, "Twitter API error");
      return;
    }

    const data = await res.json() as {
      data?:     Array<{ id: string; text: string; author_id: string }>;
      includes?: { users?: Array<{ id: string; username: string }> };
      meta?:     { newest_id?: string };
    };

    // Persist newest_id → prevents reprocessing old tweets after restart
    if (data.meta?.newest_id && data.meta.newest_id !== sinceId) {
      sinceId = data.meta.newest_id;
      await setKv("since_id", sinceId);
      logger.info({ sinceId }, "since_id updated in DB");
    }

    if (!data.data || data.data.length === 0) return;

    const userMap = new Map<string, string>();
    for (const u of data.includes?.users ?? []) userMap.set(u.id, u.username);

    for (const tweet of data.data) {
      if (seenTweetIds.has(tweet.id)) continue;
      seenTweetIds.add(tweet.id);

      const username = userMap.get(tweet.author_id) ?? `user_${tweet.author_id.slice(-4)}`;
      const message  = tweet.text.replace(/@\w+\s*/g, "").trim();

      satomiState.messagesReceived++;

      if (shouldProcess(username, message)) {
        logger.info({ username, message }, "Twitter reply triggered");
        await handleTrigger(username, message);
      }
    }
  } catch (err) {
    logger.error({ err }, "Twitter poll error");
  }
}

// ── Startup ───────────────────────────────────────────────────────────────────
export async function startTwitterChat(): Promise<boolean> {
  if (!BEARER_TOKEN) {
    logger.info("No TWITTER_BEARER_TOKEN configured — Twitter live chat not started");
    return false;
  }
  if (!LIVE_TWEET_ID) {
    logger.info("No TWITTER_LIVE_TWEET_ID configured — Twitter live chat not started");
    return false;
  }

  // Restore since_id from DB — prevents old tweets from being reprocessed on restart
  const storedSinceId = await getKv("since_id");
  if (storedSinceId) {
    sinceId = storedSinceId;
    logger.info({ sinceId }, "since_id restored from DB");
  }

  // Calculate accurate initial idle delay based on last tweet timestamp in DB
  const lastTweetStr = await getKv("last_tweet_at");
  const lastTweetAt  = lastTweetStr ? parseInt(lastTweetStr, 10) : 0;
  const elapsed      = Date.now() - lastTweetAt;
  const initialDelay = lastTweetAt === 0
    ? IDLE_GREET_MS                              // no history → wait full 5 min
    : Math.max(0, IDLE_GREET_MS - elapsed);      // resume countdown from where it left off

  logger.info(
    { sinceLastTweetSec: Math.round(elapsed / 1000), greetInSec: Math.round(initialDelay / 1000) },
    "Twitter live chat started",
  );

  satomiState.connected = true;
  void pollReplies();
  pollTimer = setInterval(() => void pollReplies(), 60_000);
  scheduleIdleGreet(initialDelay);
  return true;
}

export function stopTwitterChat(): void {
  if (pollTimer)      { clearInterval(pollTimer);      pollTimer = null; }
  if (idleGreetTimer) { clearTimeout(idleGreetTimer);  idleGreetTimer = null; }
}

export function isTwitterChatActive(): boolean {
  return pollTimer !== null;
}
