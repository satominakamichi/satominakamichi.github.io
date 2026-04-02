export const SATOMI_CONFIG = {
  tokenMintAddress: process.env.PUMP_TOKEN_MINT ?? "",
  triggerWord: "satomi",
  spamWindowMs: 10_000,

  claudeModel: "claude-haiku-4-5",
  maxResponseLength: 150,

  streamWidth: 1280,
  streamHeight: 720,
  ttsRate: 1.1,
  ttsPitch: 1.2,

  wsPath: "/satomi-ws",
} as const;
