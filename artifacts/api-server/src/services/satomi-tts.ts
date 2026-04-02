import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { logger } from "../lib/logger.js";

const ELEVENLABS_VOICE_ID = "XJ2fW4ybq7HouelYYGcL";
const ELEVENLABS_API_KEY  = process.env.ELEVENLABS_API_KEY ?? "";

async function elevenlabsTTS(text: string): Promise<Buffer> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability:        0.45,
          similarity_boost: 0.80,
          style:            0.35,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ElevenLabs ${response.status}: ${errText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function edgeTTS(text: string): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata("en-US-AriaNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const { audioStream } = tts.toStream(text);
    audioStream.on("data",  (c: Buffer) => chunks.push(c));
    audioStream.on("close", () => resolve(Buffer.concat(chunks)));
    audioStream.on("error", reject);
    setTimeout(() => reject(new Error("Edge TTS timeout")), 15_000);
  });
}

export async function synthesizeSpeech(text: string): Promise<Buffer> {
  // Try ElevenLabs first if API key is configured
  if (ELEVENLABS_API_KEY) {
    try {
      const audio = await elevenlabsTTS(text);
      logger.info({ chars: text.length }, "ElevenLabs TTS OK");
      return audio;
    } catch (err: any) {
      const is402 = err?.message?.includes("402") || err?.message?.includes("payment_required");
      logger.warn({ err: err?.message, is402 }, "ElevenLabs TTS failed — falling back to Edge TTS");
    }
  }

  // Fallback: Edge TTS (Microsoft)
  try {
    const audio = await edgeTTS(text);
    logger.info({ chars: text.length }, "Edge TTS fallback OK");
    return audio;
  } catch (err) {
    logger.error({ err, text: text.slice(0, 60) }, "Edge TTS fallback also failed");
    throw err;
  }
}
