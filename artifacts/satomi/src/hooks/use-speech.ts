import { useState, useEffect, useRef, useCallback } from "react";
import { apiUrl } from "@/lib/api-url";

export type MouthState = "mouth-closed" | "mouth-open" | "mouth-wide";
export type VoiceMode = "edge-tts" | "web-speech" | "ready" | "unavailable";

interface QueueItem {
  text: string;
  username: string;
}

let sharedCtx: AudioContext | null = null;

export function resumeAudioCtx(): Promise<void> {
  if (!sharedCtx) {
    sharedCtx = new AudioContext();
  }
  if (sharedCtx.state === "suspended") {
    return sharedCtx.resume();
  }
  return Promise.resolve();
}

function getAudioCtx(): AudioContext {
  if (!sharedCtx) sharedCtx = new AudioContext();
  return sharedCtx;
}

async function fetchEdgeTTS(text: string): Promise<ArrayBuffer> {
  const res = await fetch(apiUrl("/api/satomi/speak"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`TTS fetch failed: ${res.status}`);
  return res.arrayBuffer();
}

const WEB_SPEECH_PREFERRED = [
  "Microsoft Aria Online (Natural) - English (United States)",
  "Microsoft Jenny Online (Natural) - English (United States)",
  "Microsoft Aria - English (United States)",
  "Google US English",
  "Samantha",
  "Karen",
];

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  for (const pref of WEB_SPEECH_PREFERRED) {
    const m = voices.find((v) => v.name === pref);
    if (m) return m;
  }
  return voices.find((v) => v.lang.startsWith("en")) ?? voices[0] ?? null;
}

export function useSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [mouthState, setMouthState] = useState<MouthState>("mouth-closed");
  const [currentSpeech, setCurrentSpeech] = useState<QueueItem | null>(null);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("ready");

  const queue = useRef<QueueItem[]>([]);
  const busy = useRef(false);
  const mounted = useRef(true);
  const wsVoices = useRef<SpeechSynthesisVoice[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    mounted.current = true;
    const loadVoices = () => {
      const v = window.speechSynthesis?.getVoices() ?? [];
      if (v.length) wsVoices.current = v;
    };
    loadVoices();
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      mounted.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (currentSourceRef.current) {
        try { currentSourceRef.current.stop(); } catch { /* */ }
      }
      window.speechSynthesis?.cancel();
    };
  }, []);

  function finishSpeech() {
    busy.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (mounted.current) {
      setIsSpeaking(false);
      setMouthState("mouth-closed");
      setCurrentSpeech(null);
    }
    timerRef.current = setTimeout(() => {
      if (mounted.current) processNext();
    }, 400);
  }

  async function playEdgeTTS(item: QueueItem): Promise<void> {
    try {
      const arrayBuf = await fetchEdgeTTS(item.text);
      const ctx = getAudioCtx();
      if (ctx.state === "suspended") await ctx.resume();

      const audioBuf = await ctx.decodeAudioData(arrayBuf);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.connect(ctx.destination);

      const source = ctx.createBufferSource();
      source.buffer = audioBuf;
      source.connect(analyser);
      currentSourceRef.current = source;

      if (mounted.current) { setIsSpeaking(true); setCurrentSpeech(item); }
      setVoiceMode("edge-tts");

      let finished = false;
      source.onended = () => {
        if (finished) return;
        finished = true;
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        finishSpeech();
      };

      const pollMouth = () => {
        if (!mounted.current || finished) return;
        analyser.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const avg = sum / dataArray.length;
        if (mounted.current) {
          if (avg > 18) setMouthState("mouth-wide");
          else if (avg > 6) setMouthState("mouth-open");
          else setMouthState("mouth-closed");
        }
        rafRef.current = requestAnimationFrame(pollMouth);
      };
      rafRef.current = requestAnimationFrame(pollMouth);

      source.start();
    } catch (err) {
      console.warn("[use-speech] Edge TTS failed, falling back to Web Speech", err);
      await playWebSpeech(item);
    }
  }

  function playWebSpeech(item: QueueItem): Promise<void> {
    return new Promise((resolve) => {
      if (mounted.current) { setIsSpeaking(true); setCurrentSpeech(item); }
      setVoiceMode("web-speech");

      const utter = new SpeechSynthesisUtterance(item.text);
      utter.rate = 1.05;
      utter.pitch = 1.0;
      utter.volume = 1.0;
      const best = pickVoice(wsVoices.current);
      if (best) utter.voice = best;

      utter.onboundary = (e) => {
        if (e.name !== "word" || !mounted.current) return;
        const word = item.text.substring(e.charIndex, e.charIndex + (e.charLength ?? 4));
        const vowels = (word.match(/[aeiouAEIOU]/g) ?? []).length;
        if (mounted.current) setMouthState(vowels >= 2 ? "mouth-wide" : "mouth-open");
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          if (mounted.current) setMouthState("mouth-closed");
        }, 220);
      };

      const done = () => { finishSpeech(); resolve(); };
      utter.onend = done;
      utter.onerror = done;

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    });
  }

  function processNext() {
    if (busy.current || queue.current.length === 0) return;
    busy.current = true;
    const item = queue.current.shift()!;
    // Show subtitle immediately — before audio so text always appears even if TTS fails
    if (mounted.current) { setIsSpeaking(true); setCurrentSpeech(item); }
    playEdgeTTS(item).catch(() => {
      busy.current = false;
      if (mounted.current) { setIsSpeaking(false); setCurrentSpeech(null); }
      processNext();
    });
  }

  const speak = useCallback((text: string, username: string) => {
    // Replace entire queue with just this item — no stale pile-up
    queue.current = [{ text, username }];
    processNext();
  }, []);

  return { isSpeaking, mouthState, currentSpeech, voiceMode, speak };
}
