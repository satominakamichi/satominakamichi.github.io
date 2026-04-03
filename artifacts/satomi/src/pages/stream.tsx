import { useRef, useState, useCallback, useEffect } from "react";
import { useSpeech, resumeAudioCtx } from "@/hooks/use-speech";
import { SatomiWsEvent, useSatomiWs } from "@/hooks/use-satomi-ws";
import { SatomiVRM } from "@/components/satomi-vrm";
import { detectEmotion, Emotion } from "@/lib/emotion";
import { apiUrl } from "@/lib/api-url";

const GREET_FALLBACKS = [
  "hey hey! glad you're here~",
  "こんにちは！今日もよろしくね~",
  "yo! what's good everyone?",
  "hiii! ask me anything~",
];

async function fetchWaveGreeting(): Promise<string> {
  try {
    const res = await fetch(apiUrl("/api/satomi/greet"), { method: "POST" });
    if (!res.ok) throw new Error("greet failed");
    const data = await res.json() as { text: string };
    return data.text;
  } catch {
    return GREET_FALLBACKS[Math.floor(Math.random() * GREET_FALLBACKS.length)];
  }
}

export default function Stream() {
  const { speak, isSpeaking, mouthState, currentSpeech, voiceMode } = useSpeech();
  const [hasNewTrigger, setHasNewTrigger] = useState(false);
  const [emotion, setEmotion] = useState<Emotion>("idle");
  const [audioActivated, setAudioActivated] = useState(false);
  const [currentGesture, setCurrentGesture] = useState<string | undefined>(undefined);
  const activatedRef = useRef(false);
  const emotionResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSpeakingRef = useRef(false);
  isSpeakingRef.current = isSpeaking;

  const IDLE_GREET_MS = 3 * 60 * 1000;

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      if (isSpeakingRef.current) { resetIdleTimer(); return; }
      fetchWaveGreeting().then((text) => speak(text, "ask_satomi"));
      resetIdleTimer();
    }, IDLE_GREET_MS);
  }, [speak]);

  // Start idle timer immediately on mount — no click required
  useEffect(() => {
    resetIdleTimer();
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, [resetIdleTimer]);

  const activateAudio = async () => {
    if (activatedRef.current) return;
    activatedRef.current = true;
    setAudioActivated(true);
    await resumeAudioCtx();
    resetIdleTimer();
  };

  const handleWsEvent = (event: SatomiWsEvent) => {
    if (event.type === "response") {
      const combined = event.question + " " + event.response;
      const detectedEmotion = detectEmotion(combined);
      setEmotion(detectedEmotion);
      if (event.gesture) setCurrentGesture(event.gesture);
      speak(event.response, event.username);
      resetIdleTimer();
      if (emotionResetTimer.current) clearTimeout(emotionResetTimer.current);
      emotionResetTimer.current = setTimeout(() => {
        setEmotion("idle");
        setCurrentGesture(undefined);
      }, 12000);
    } else if (event.type === "trigger") {
      setHasNewTrigger(true);
      resetIdleTimer();
      setTimeout(() => setHasNewTrigger(false), 500);
    }
  };

  const handleWave = useCallback(() => {
    if (!activatedRef.current) return;
    if (isSpeaking) return;
    fetchWaveGreeting().then((text) => speak(text, "ask_satomi"));
  }, [isSpeaking, speak]);

  const { status, pairs } = useSatomiWs(handleWsEvent);

  const activeEmotion: Emotion = isSpeaking && emotion === "idle" ? "speaking" : emotion;
  const voiceOn = voiceMode !== "unavailable";

  const emotionGlow = (
    (activeEmotion === "angry" || activeEmotion === "savage" || activeEmotion === "disgusted")
      ? "rgba(255,60,60,0.14)"
    : (activeEmotion === "sad" || activeEmotion === "empathetic")
      ? "rgba(80,120,200,0.14)"
    : (activeEmotion === "very_happy" || activeEmotion === "hype" || activeEmotion === "excited")
      ? "rgba(255,220,50,0.13)"
    : (activeEmotion === "flirty" || activeEmotion === "proud")
      ? "rgba(255,100,200,0.12)"
    : (activeEmotion === "curious" || activeEmotion === "philosophical")
      ? "rgba(100,200,255,0.11)"
    : "rgba(160,40,200,0.12)"
  );

  const emotionGlow2 = (
    (activeEmotion === "angry" || activeEmotion === "savage")
      ? "rgba(255,80,0,0.12)"
    : (activeEmotion === "disgusted")
      ? "rgba(180,60,0,0.10)"
    : (activeEmotion === "sad" || activeEmotion === "empathetic")
      ? "rgba(40,80,180,0.12)"
    : (activeEmotion === "very_happy" || activeEmotion === "hype")
      ? "rgba(255,200,0,0.12)"
    : (activeEmotion === "happy" || activeEmotion === "flirty")
      ? "rgba(255,100,180,0.12)"
    : (activeEmotion === "proud")
      ? "rgba(200,150,255,0.12)"
    : (activeEmotion === "serious")
      ? "rgba(50,100,200,0.10)"
    : "rgba(80,40,200,0.12)"
  );

  const subtitleBg = (
    (activeEmotion === "angry" || activeEmotion === "savage" || activeEmotion === "disgusted")
      ? "rgba(40,10,10,0.92)"
    : (activeEmotion === "sad" || activeEmotion === "empathetic")
      ? "rgba(10,15,40,0.92)"
    : (activeEmotion === "very_happy" || activeEmotion === "hype" || activeEmotion === "excited")
      ? "rgba(30,24,8,0.92)"
    : (activeEmotion === "flirty" || activeEmotion === "proud")
      ? "rgba(30,10,28,0.92)"
    : (activeEmotion === "curious" || activeEmotion === "philosophical")
      ? "rgba(8,20,35,0.92)"
    : "rgba(12,8,22,0.92)"
  );

  const subtitleBorder = (
    (activeEmotion === "angry" || activeEmotion === "savage" || activeEmotion === "disgusted")
      ? "rgba(255,80,80,0.45)"
    : (activeEmotion === "sad" || activeEmotion === "empathetic")
      ? "rgba(80,120,255,0.45)"
    : (activeEmotion === "very_happy" || activeEmotion === "hype" || activeEmotion === "excited")
      ? "rgba(255,210,50,0.50)"
    : (activeEmotion === "flirty" || activeEmotion === "proud")
      ? "rgba(255,120,220,0.40)"
    : (activeEmotion === "curious" || activeEmotion === "philosophical")
      ? "rgba(100,200,255,0.35)"
    : (activeEmotion === "serious")
      ? "rgba(80,140,255,0.35)"
    : "rgba(180,50,220,0.35)"
  );

  const accentLine = (
    (activeEmotion === "angry" || activeEmotion === "savage" || activeEmotion === "disgusted")
      ? "linear-gradient(to right, transparent, #ff4444, transparent)"
    : (activeEmotion === "sad" || activeEmotion === "empathetic")
      ? "linear-gradient(to right, transparent, #4488ff, transparent)"
    : (activeEmotion === "very_happy" || activeEmotion === "hype" || activeEmotion === "excited")
      ? "linear-gradient(to right, transparent, #ffcc33, transparent)"
    : (activeEmotion === "flirty" || activeEmotion === "proud")
      ? "linear-gradient(to right, transparent, #ff80dd, transparent)"
    : (activeEmotion === "curious" || activeEmotion === "philosophical")
      ? "linear-gradient(to right, transparent, #66ccff, transparent)"
    : "linear-gradient(to right, transparent, hsl(var(--primary)), transparent)"
  );

  const emotionEmoji: Record<string, string> = {
    happy: "😊", very_happy: "🥹", hype: "🔥", excited: "🤩",
    proud: "😤", flirty: "😏", savage: "💀", disgusted: "🙄",
    angry: "😡", empathetic: "🫂", sad: "😢", curious: "👀",
    confused: "😵", philosophical: "🌌", serious: "🎯",
    thinking: "🤔", surprised: "😮", dance: "💃",
  };

  return (
    <div
      className="w-screen h-screen bg-[#06060d] relative flex font-sans cursor-pointer overflow-hidden"
      onClick={activateAudio}
    >
      {/* Outer ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-[1]">
        <div
          className="absolute top-0 left-0 w-[55%] h-[55%] blur-[140px] rounded-full transition-all duration-700 opacity-60"
          style={{ background: emotionGlow }}
        />
        <div
          className="absolute bottom-0 right-0 w-[60%] h-[60%] blur-[160px] rounded-full transition-all duration-700 opacity-50"
          style={{ background: emotionGlow2 }}
        />
      </div>

      {/* ── Main frame (full screen, no border) ────────────── */}
      <div className="relative w-full h-full flex flex-col md:flex-row">
        {/* ── LEFT: Avatar section ─────────────────────────── */}
        <div className="w-full md:w-1/2 h-full relative flex flex-col overflow-hidden">


          {/* Top bar */}
          <div className="relative z-20 flex items-center justify-between px-5 pt-4 pb-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 bg-red-600/90 backdrop-blur-sm px-3 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                <span className="text-white text-xs font-bold tracking-widest">LIVE</span>
              </div>
              <div className="text-white/40 text-xs font-mono">
                SATOMI NAKAMICHI
              </div>
            </div>
            <div className="flex items-center gap-2">
              {voiceOn && (
                <div className="flex items-center gap-1.5 bg-green-500/15 border border-green-500/30 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-green-400 text-[10px] font-mono font-semibold">VOICE ON</span>
                </div>
              )}
              {activeEmotion !== "idle" && activeEmotion !== "speaking" && (
                <div className="text-base">{emotionEmoji[activeEmotion] ?? ""}</div>
              )}
            </div>
          </div>

          {/* Anime background image */}
          <div className="absolute inset-0 z-0">
            <img
              src={`${import.meta.env.BASE_URL}bg-anime.png`}
              alt=""
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/20" />
          </div>

          {/* Avatar on top of background — fills full left panel */}
          <div className="absolute inset-0 z-10">
            <SatomiVRM
              mouthState={mouthState}
              isSpeaking={isSpeaking}
              emotion={activeEmotion}
              hasNewTrigger={hasNewTrigger}
              overrideGesture={currentGesture}
              onWave={handleWave}
            />
            {/* Ground glow — blends feet into street */}
            <div className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none"
              style={{ background: "radial-gradient(ellipse 70% 60% at 50% 100%, rgba(130,60,255,0.55) 0%, rgba(60,20,160,0.25) 50%, transparent 100%)" }} />
            {/* Atmospheric haze from bottom */}
            <div className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
              style={{ background: "linear-gradient(to top, rgba(8,5,25,0.65) 0%, transparent 100%)" }} />
          </div>

          {/* Subtitle bar */}
          <div className="absolute bottom-[42vh] md:bottom-5 left-5 right-5 z-30">
            {currentSpeech ? (
              <div
                className="backdrop-blur-md border px-6 py-3.5 rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.8)] relative overflow-hidden transition-all duration-300"
                style={{ background: subtitleBg, borderColor: subtitleBorder }}
              >
                <div className="absolute top-0 left-0 w-full h-[2px]" style={{ background: accentLine }} />
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-primary font-bold uppercase tracking-wider text-xs flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    SATOMI NAKAMICHI
                  </span>
                  <span className="text-white/40 text-[11px]">→ @{currentSpeech.username}</span>
                </div>
                <p className="text-[17px] font-medium leading-relaxed tracking-wide text-white/95 drop-shadow-md">
                  {currentSpeech.text}
                </p>
              </div>
            ) : (
              <div className="h-[72px]" />
            )}
          </div>
        </div>

        {/* ── RIGHT: Chat panel ────────────────────────────── */}
        {/* Mobile: absolute overlay at bottom. Desktop: side panel */}
        <div
          className="
            absolute bottom-0 left-0 right-0 z-40
            md:static md:z-auto
            w-full md:w-[296px] md:flex-none
            flex flex-col
            md:border-t-0 md:border-l border-white/[0.07]
            min-h-0
            max-h-[38vh] md:max-h-full md:h-full
            rounded-t-2xl md:rounded-none
          "
        >
          {/* Mobile: glass background. Desktop: transparent (dark bg from parent) */}
          <div className="md:hidden absolute inset-0 pointer-events-none rounded-t-2xl"
            style={{ background: "rgba(6,6,18,0.88)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderTop: "1px solid rgba(255,255,255,0.09)" }} />

          {/* Panel header */}
          <div
            className="relative z-10 px-4 py-2.5 md:py-3.5 flex items-center justify-between"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-white/60">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              <span className="text-white/80 text-sm font-semibold">Live chat</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-white/30 font-mono">
              {pairs.length > 0 && <span>{pairs.length}</span>}
            </div>
          </div>

          {/* Chat messages - scrollable */}
          <div className="relative z-10 flex-1 overflow-y-auto flex flex-col-reverse px-3 py-2 md:py-3 gap-2 md:gap-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {pairs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-white/20">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </div>
                <p className="text-white/25 text-xs leading-relaxed">
                  Waiting for questions<br />from the live chat…
                </p>
              </div>
            ) : (
              [...pairs].reverse().map((p, i) => (
                <div key={`${p.timestamp}-${i}`} className="flex flex-col gap-1 animate-in slide-in-from-bottom-2 fade-in duration-300">
                  {/* User message */}
                  <div className="flex items-start gap-2.5">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
                      style={{
                        background: `hsl(${(p.username.charCodeAt(0) * 47) % 360}, 65%, 35%)`,
                        color: "rgba(255,255,255,0.9)",
                      }}
                    >
                      {p.username[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] font-semibold text-white/60 mr-1">@{p.username}</span>
                      <p className="text-[12px] text-white/80 leading-snug break-words">{p.message}</p>
                    </div>
                  </div>
                  {/* Satomi response */}
                  {p.response && (
                    <div className="flex items-start gap-2.5 ml-0.5">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5 bg-primary/20 border border-primary/30">
                        <span className="text-primary text-[9px]">S</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] font-semibold text-primary/70 mr-1">SATOMI</span>
                        <p className="text-[11px] text-white/50 leading-snug break-words">{p.response}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Panel footer */}
          <div
            className="relative z-10 px-4 py-2 md:py-3 flex flex-col gap-1"
            style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
          >
            <p className="text-[10px] text-white/25 leading-tight">
              Satomi reads live comments and replies to questions in real time
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] font-mono text-green-400/70">
                {status.connected ? "CONNECTED" : "CONNECTING…"}
              </span>
            </div>
          </div>
        </div>

        {/* ── ABOUT: Paper note (desktop only) ────────────── */}
        <div className="hidden md:flex flex-1 items-start justify-center pt-8 px-5 pb-6 border-l border-white/[0.07] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div
            className="relative w-full max-w-[480px]"
            style={{ transform: "rotate(-1deg)", filter: "drop-shadow(0 12px 32px rgba(0,0,0,0.8))" }}
          >
            {/* Two tape strips */}
            <div className="absolute -top-3.5 left-[28%] w-14 h-5 rounded-sm z-10"
              style={{ background: "rgba(255,220,180,0.4)", border: "1px solid rgba(255,220,180,0.25)" }} />
            <div className="absolute -top-3.5 right-[20%] w-10 h-5 rounded-sm z-10"
              style={{ background: "rgba(255,220,180,0.3)", border: "1px solid rgba(255,220,180,0.2)", transform: "rotate(2deg)" }} />

            {/* Paper */}
            <div className="relative rounded-sm overflow-hidden"
              style={{ background: "linear-gradient(165deg, #f6f1e9 0%, #eee8da 100%)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.07)" }}>

              {/* Top accent bar */}
              <div className="h-[4px] w-full" style={{ background: "linear-gradient(90deg, #a855f7, #6366f1, #38bdf8)" }} />

              {/* Inner layout: 2 columns */}
              <div className="flex">

                {/* LEFT: Stats */}
                <div className="flex-1 px-5 pt-4 pb-5 flex flex-col min-w-0">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-1">
                    <p className="text-[8px] font-bold tracking-[0.22em] uppercase" style={{ color: "#7c3aed" }}>CHARACTER'S FILE</p>
                    <span className="text-[7px] font-bold px-1.5 py-0.5 rounded ml-2 flex-shrink-0" style={{ background: "#ede9fe", color: "#7c3aed", border: "1px solid #c4b5fd" }}>No.1</span>
                  </div>
                  <p className="font-black text-[26px] leading-none" style={{ color: "#1e1b4b" }}>SATOMI</p>
                  <p className="font-black text-[26px] leading-none mb-1" style={{ color: "#1e1b4b" }}>NAKAMICHI</p>
                  <p className="text-[9px] font-mono mb-3" style={{ color: "#7c3aed88" }}>@ask_satomi • always online</p>

                  <div style={{ height: "1px", background: "#7c3aed30", marginBottom: "8px" }} />

                  {/* Stats */}
                  {([
                    ["Origin",       "The Internet"],
                    ["Species",      "Anime AI"],
                    ["Blood type",   "Solana"],
                    ["Status",       "LIVE 24/7 🔴"],
                    ["Occupation",   "AI VTuber"],
                    ["Alignment",    "Chaotic Degen"],
                    ["Fav thing",    "ur questions"],
                    ["Hates",        "paper hands"],
                    ["Biggest fear", "getting rugged"],
                    ["Signature",    "roasting bad calls"],
                    ["Secret",       "actually caring lol"],
                  ] as [string, string][]).map(([label, value], i, arr) => (
                    <div key={label} className="py-[5px]" style={{ borderBottom: i < arr.length - 1 ? "1px solid #7c3aed18" : "none" }}>
                      <p className="text-[7.5px] font-bold uppercase tracking-widest" style={{ color: "#7c3aed" }}>{label}</p>
                      <p className="text-[11px] font-medium leading-snug mt-px" style={{ color: "#1e1b4b" }}>{value}</p>
                    </div>
                  ))}

                  {/* Quote */}
                  <div className="mt-3 pt-2.5" style={{ borderTop: "1px dashed #7c3aed2a" }}>
                    <p className="text-[9px] italic leading-relaxed" style={{ color: "#4c1d9599" }}>
                      "i live in a server and read crypto twitter all day. no big deal."
                    </p>
                    <p className="text-[8px] mt-1 font-mono" style={{ color: "#7c3aed77" }}>— Satomi, probably</p>
                  </div>
                </div>

                {/* RIGHT: Character sketches stacked */}
                <div className="w-[180px] flex-shrink-0 flex flex-col"
                  style={{ borderLeft: "1px solid #7c3aed1a" }}>
                  <img
                    src={`${import.meta.env.BASE_URL}satomi-sketch2.png`}
                    alt="Satomi sitting sketch"
                    className="w-full object-cover object-top"
                    style={{ mixBlendMode: "multiply", opacity: 0.88 }}
                  />
                  <div style={{ height: "1px", background: "#7c3aed18" }} />
                  <img
                    src={`${import.meta.env.BASE_URL}satomi-sketch.png`}
                    alt="Satomi standing sketch"
                    className="w-full object-cover object-top"
                    style={{ mixBlendMode: "multiply", opacity: 0.85 }}
                  />
                </div>
              </div>

              {/* Bottom lines decoration */}
              <div className="px-5 pb-3 flex flex-col gap-1">
                {[0,1,2].map(i => (
                  <div key={i} style={{ height: "1px", background: "#7c3aed0d" }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Click-to-activate hint */}
      {!audioActivated && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="text-[10px] text-white/25 font-mono bg-black/40 px-3 py-1.5 rounded-full border border-white/10">
            click anywhere to enable audio
          </div>
        </div>
      )}
    </div>
  );
}
