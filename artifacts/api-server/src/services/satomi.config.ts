export const satomiConfig = {
  triggerWord: process.env.SATOMI_TRIGGER_WORD ?? "satomi",
  spamWindowMs: Number(process.env.SATOMI_SPAM_WINDOW_MS ?? 10_000),
  model: process.env.SATOMI_MODEL ?? "claude-haiku-4-5",
  maxTokens: Number(process.env.SATOMI_MAX_TOKENS ?? 150),
  pollIntervalMs: Number(process.env.SATOMI_POLL_INTERVAL_MS ?? 60_000),
  wsReconnectAttempts: Number(process.env.SATOMI_WS_RECONNECT_ATTEMPTS ?? 5),
  wsFailoverDelaySec: Number(process.env.SATOMI_WS_FAILOVER_DELAY_SEC ?? 15),
  languagePreference: process.env.SATOMI_LANGUAGE ?? "auto",
} as const;
