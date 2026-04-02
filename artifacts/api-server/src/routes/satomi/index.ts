import { Router, type IRouter } from "express";
import { z } from "zod";
import { satomiState, addLog } from "../../services/satomi-state.js";
import { generateSatomiResponse } from "../../services/satomi-ai.js";
import { reconnectPumpFunChat, getIntakeMode } from "../../services/pumpfun-chat.js";
import { broadcastToClients } from "../../services/satomi-ws.js";
import { satomiConfig } from "../../services/satomi.config.js";
import { synthesizeSpeech } from "../../services/satomi-tts.js";

const GetSatomiStatusResponse = z.object({
  connected: z.boolean(),
  tokenAddress: z.string(),
  uptime: z.number(),
  intakeMode: z.enum(["websocket", "polling", "idle"]),
  config: z.object({
    triggerWord: z.string(),
    spamWindowMs: z.number(),
    model: z.string(),
    maxTokens: z.number(),
    pollIntervalMs: z.number(),
    languagePreference: z.string(),
  }),
});

const GetSatomiStatsResponse = z.object({
  messagesReceived: z.number(),
  triggerCount: z.number(),
  responsesGenerated: z.number(),
});

const GetSatomiLogsResponseItem = z.object({
  username: z.string(),
  question: z.string(),
  response: z.string(),
  timestamp: z.union([z.date(), z.string(), z.number()]),
});
const GetSatomiLogsResponse = z.array(GetSatomiLogsResponseItem);

const TestSatomiBody = z.object({
  username: z.string().default("TestUser"),
  message: z.string().min(1),
});

const TestSatomiResponse = z.object({
  response: z.string(),
  emotion: z.string(),
  gesture: z.string(),
  expression: z.string(),
});

// ─── Server-side emotion detection (mirrors frontend emotion.ts) ──────────────
type Emotion = "idle"|"speaking"|"dance"|"very_happy"|"hype"|"excited"|"proud"|
  "happy"|"flirty"|"savage"|"disgusted"|"angry"|"empathetic"|"sad"|
  "curious"|"confused"|"philosophical"|"serious"|"thinking"|"surprised";

function detectEmotion(text: string): Emotion {
  const t = text.toLowerCase();
  const phrase = (w: string[]) => w.some((v) => t.includes(v));
  const word = (w: string[]) => w.some((v) => new RegExp(`\\b${v.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`).test(t));

  if (phrase(["dance","dancing","shimmy","groove","boogie","twerk","moving in my chair","doing my dance"])) return "dance";
  if (phrase(["screaming","cannot contain","losing it","oh my god","euphoric","jumping","best day","i love this so much","best vtuber"])) return "very_happy";
  if (phrase(["now we're talking","let's ride","here we go","let's go","lets go","let's gooo","lfg","wagmi","bullish","come on"]) || word(["pump","pumped","100x","10x","momentum"])) return "hype";
  if (phrase(["amazing","incredible","insane","moon","gem","banger","excited","hyped","love it","fantastic","fire"])) return "excited";
  if (phrase(["think about it","bigger picture","kind of like","what it means","profound","what we do right now","nobody knows","actually knows","not knowing","what happens after","after we die"])) return "philosophical";
  if (phrase(["obviously","clearly you","bold of you","classic move","bless your heart","are you serious","bought the top","interesting choice","at least you're honest","pretending"])) return "savage";
  if (phrase(["absolutely not","hard no","please no","cringe","yikes","that's awful","seriously no","no way i"]) || word(["ugh","gross","yuck"])) return "disgusted";
  if (phrase(["scam","rug pull","bearish","trash","terrible","ridiculous","furious"]) || word(["hate","dumb","mad","angry","stupid"])) return "angry";
  if (phrase(["smart move","good call","nailed it","exactly right","well played","good instinct","you got it","that's right","brilliant","sharp","that's the move"])) return "proud";
  if (phrase(["play along","teasing","charming","come on then","got me there","you're funny","flirt","witty","you're something","okay you win","romance subplot","fishing"])) return "flirty";
  if (phrase(["that's rough","i hear you","genuinely hard","makes sense that","i get that","lost money","rekt","i'm sorry","one bad day","one exam"])) return "empathetic";
  if (phrase(["unfortunately","disappoint","i failed","i give up","giving up"]) || word(["sad","broke","failed","sorry"])) return "sad";
  if (phrase(["haha","hehe","awesome","love you","love this","cute","sweet","great","so good","so cool"]) || word(["happy","glad","fun","enjoy"])) return "happy";
  if (phrase(["listen","hear me out","let me be real","the truth is","be honest","real talk","market cap","tokenomics","difference between","what it actually"])) return "serious";
  if (phrase(["tell me more","say more","actually curious","did you get in","are you riding","wait so","what if"])) return "curious";
  if (phrase(["makes no sense","lost me","i don't follow","confused","what do you mean","that can't be right"])) return "confused";
  if (phrase(["oh my","wait what","unbelievable","unexpected","wait actually what","that's actually insane"]) || word(["whoa","omg","wow"])) return "surprised";
  if (phrase(["i think","i wonder","maybe","perhaps","let me think","i kind of","i'm okay with","depends on","not sure","hollow"]) || word(["hmm","interesting","consider","honestly"])) return "thinking";
  return "speaking";
}

const EMOTION_TO_EXPR: Record<string, string> = {
  very_happy: "😄 Happy 1.0", hype: "😲 Surprised 0.8", excited: "😄 Happy 0.95",
  proud: "😌 Relaxed 0.85", happy: "😄 Happy 0.8", flirty: "😄 Happy 0.65",
  dance: "😄 Happy 0.9", savage: "😠 Angry 0.45", disgusted: "😠 Angry 0.55",
  angry: "😠 Angry 1.0", empathetic: "😢 Sad 0.55", sad: "😢 Sad 0.9",
  curious: "😌 Relaxed 0.7", confused: "😲 Surprised 0.65", philosophical: "😌 Relaxed 0.55",
  serious: "😐 Neutral 0.7", thinking: "😌 Relaxed 0.7", surprised: "😲 Surprised 0.95",
  speaking: "😐 Neutral 0.5", idle: "😐 Neutral 0",
};

const SPEAK_POOL_NAMES = [
  "R_EXP","BOTH","BOTH","L_EXP","R_HIGH","CONV","CONV","COY","SHRUG","CHEST",
  "POINT_R","POINT_L","COUNT","PEACE","BOTH_PT","PUSH","SELF","CHIN","THINK_R",
  "MIC_R","MIC_BOTH","OPEN_R","OPEN_BOTH","FRONT_BOTH",
];

const UpdateSatomiConfigBody = z.object({ tokenAddress: z.string() });
const UpdateSatomiConfigResponse = z.object({
  connected: z.boolean(),
  tokenAddress: z.string(),
  uptime: z.number(),
});

const router: IRouter = Router();

router.get("/status", (_req, res) => {
  const data = GetSatomiStatusResponse.parse({
    connected: satomiState.connected,
    tokenAddress: satomiState.tokenAddress,
    uptime: (Date.now() - satomiState.startTime) / 1000,
    intakeMode: getIntakeMode(),
    config: {
      triggerWord: satomiConfig.triggerWord,
      spamWindowMs: satomiConfig.spamWindowMs,
      model: satomiConfig.model,
      maxTokens: satomiConfig.maxTokens,
      pollIntervalMs: satomiConfig.pollIntervalMs,
      languagePreference: satomiConfig.languagePreference,
    },
  });
  res.json(data);
});

router.get("/stats", (_req, res) => {
  const data = GetSatomiStatsResponse.parse({
    messagesReceived: satomiState.messagesReceived,
    triggerCount: satomiState.triggerCount,
    responsesGenerated: satomiState.responsesGenerated,
  });
  res.json(data);
});

router.get("/logs", (_req, res) => {
  const data = GetSatomiLogsResponse.parse(
    satomiState.logs.map((entry) => ({
      username: entry.username,
      question: entry.question,
      response: entry.response,
      timestamp: entry.timestamp,
    })),
  );
  res.json(data);
});

router.post("/test", async (req, res) => {
  const body = TestSatomiBody.parse(req.body);
  const { text: response, gesture } = await generateSatomiResponse(body.username, body.message);

  const combined  = body.message + " " + response;
  const emotion   = detectEmotion(combined);
  const expression= EMOTION_TO_EXPR[emotion] ?? "😐 Neutral 0.5";

  satomiState.triggerCount += 1;
  satomiState.responsesGenerated += 1;
  addLog({
    username: body.username,
    question: body.message,
    response,
    timestamp: new Date(),
  });

  broadcastToClients({
    type: "trigger",
    username: body.username,
    message: body.message,
    timestamp: Date.now(),
  });

  broadcastToClients({
    type: "response",
    username: body.username,
    question: body.message,
    response,
    gesture,
    timestamp: Date.now(),
  });

  const result = TestSatomiResponse.parse({ response, emotion, gesture, expression });
  res.json(result);
});

router.put("/config", (req, res) => {
  const body = UpdateSatomiConfigBody.parse(req.body);
  reconnectPumpFunChat(body.tokenAddress);

  const data = UpdateSatomiConfigResponse.parse({
    connected: satomiState.connected,
    tokenAddress: satomiState.tokenAddress,
    uptime: (Date.now() - satomiState.startTime) / 1000,
  });
  res.json(data);
});

router.post("/greet", async (_req, res) => {
  try {
    const { text } = await generateSatomiResponse(
      "SATOMI_AI",
      "[WAVE_GREETING] You just waved hello to viewers. Give a short, casual, natural greeting — no more than 15 words. Sometimes use Japanese, sometimes English, mix it up. Be yourself, keep it fresh.",
    );
    res.json({ text });
  } catch {
    res.json({ text: "hey hey! glad you're here~" });
  }
});

const SpeakBody = z.object({ text: z.string().min(1).max(500) });

router.post("/speak", async (req, res) => {
  const { text } = SpeakBody.parse(req.body);
  try {
    const audio = await synthesizeSpeech(text);
    res.set("Content-Type", "audio/mpeg");
    res.set("Content-Length", String(audio.length));
    res.set("Cache-Control", "no-store");
    res.send(audio);
  } catch {
    res.status(503).json({ error: "TTS unavailable" });
  }
});

export default router;
