import { useEffect, useRef, useState } from "react";
import { MouthState } from "@/hooks/use-speech";
import { Emotion } from "@/lib/emotion";

interface Props {
  mouthState: MouthState;
  isSpeaking: boolean;
  emotion: Emotion;
  hasNewTrigger?: boolean;
}

interface Particle {
  id: number;
  emoji: string;
  x: number;
  dx: number;
  delay: number;
}

const EMOTION_PARTICLES: Record<Emotion, string[]> = {
  idle: [],
  speaking: [],
  happy: ["💜", "✨", "🌸", "💜"],
  very_happy: ["💜", "✨", "🌸", "💖", "🌟"],
  hype: ["🔥", "⚡", "🌟", "✨", "🔥"],
  excited: ["✨", "⚡", "💫", "🌟", "⚡"],
  proud: ["👑", "💜", "✨", "🌟"],
  flirty: ["💖", "😘", "💜", "✨"],
  surprised: ["❗", "💥", "⭐"],
  angry: ["💢", "🔥", "💢"],
  savage: ["💢", "🔥", "😤", "⚡"],
  disgusted: ["🤢", "😤", "💢"],
  empathetic: ["💙", "🤗", "💜", "💧"],
  sad: ["💧", "💧", "💙"],
  curious: ["❓", "🔍", "💡", "✨"],
  confused: ["❓", "💭", "🌀"],
  philosophical: ["💭", "🌌", "✨", "🔮"],
  serious: ["⚡", "💜"],
  thinking: ["💭", "❓", "💡"],
  dance: ["💃", "🎵", "✨", "🎶"],
};

const AURA_COLORS: Record<Emotion, string> = {
  idle: "rgba(130,30,200,0.3)",
  speaking: "rgba(150,40,210,0.4)",
  happy: "rgba(255,140,200,0.45)",
  very_happy: "rgba(255,160,220,0.55)",
  hype: "rgba(255,220,50,0.50)",
  excited: "rgba(200,160,255,0.5)",
  proud: "rgba(200,100,255,0.48)",
  flirty: "rgba(255,100,200,0.50)",
  surprised: "rgba(80,180,255,0.4)",
  angry: "rgba(255,50,50,0.45)",
  savage: "rgba(255,80,0,0.50)",
  disgusted: "rgba(160,80,0,0.40)",
  empathetic: "rgba(80,150,255,0.40)",
  sad: "rgba(70,110,220,0.35)",
  curious: "rgba(100,220,255,0.40)",
  confused: "rgba(150,150,255,0.35)",
  philosophical: "rgba(80,40,200,0.40)",
  serious: "rgba(50,80,200,0.38)",
  thinking: "rgba(100,200,255,0.35)",
  dance: "rgba(255,100,220,0.50)",
};

let pid = 0;
function spawnParticles(emotion: Emotion): Particle[] {
  const emojis = EMOTION_PARTICLES[emotion];
  if (!emojis.length) return [];
  return emojis.slice(0, 4).map((emoji, i) => ({
    id: pid++,
    emoji,
    x: 60 + Math.random() * 240,
    dx: (Math.random() - 0.5) * 70,
    delay: i * 130,
  }));
}

export function SatomiAvatar({ mouthState, isSpeaking, emotion, hasNewTrigger }: Props) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [blinking, setBlinking] = useState(false);
  const blinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevEmotion = useRef<Emotion>("idle");

  useEffect(() => {
    if (emotion !== prevEmotion.current) {
      prevEmotion.current = emotion;
      const p = spawnParticles(emotion);
      if (p.length) {
        setParticles((prev) => [...prev, ...p]);
        setTimeout(() => setParticles((prev) => prev.filter((x) => !p.find((pp) => pp.id === x.id))), 2200);
      }
    }
  }, [emotion]);

  useEffect(() => {
    const schedule = () => {
      blinkTimer.current = setTimeout(() => {
        setBlinking(true);
        setTimeout(() => { setBlinking(false); schedule(); }, 160);
      }, 2500 + Math.random() * 4000);
    };
    schedule();
    return () => { if (blinkTimer.current) clearTimeout(blinkTimer.current); };
  }, []);

  const ex = emotion === "excited";
  const hp = emotion === "happy";
  const sp = emotion === "surprised";
  const ag = emotion === "angry";
  const sd = emotion === "sad";
  const tk = emotion === "thinking";
  const speaking = emotion === "speaking" && isSpeaking;

  const bodyAnim = ex ? "excited-bounce 0.7s ease-in-out infinite"
    : hp ? "body-sway 3s ease-in-out infinite"
    : ag ? "angry-shake 0.5s ease-in-out infinite"
    : sd ? "sad-droop 3.5s ease-in-out infinite"
    : tk ? "thinking-lean 2.5s ease-in-out infinite"
    : speaking ? "speaking-nod 1.2s ease-in-out infinite"
    : hasNewTrigger ? "bounce-react 0.4s ease-in-out"
    : "float 4s ease-in-out infinite";

  const headAnim = speaking ? "head-nod 1.2s ease-in-out infinite"
    : tk ? "head-tilt-l 2.5s ease-in-out infinite"
    : ag ? "head-angry 0.5s ease-in-out infinite"
    : sd ? "head-sad 3.5s ease-in-out infinite"
    : "none";

  const rArmAnim = ex ? "arm-wave-r 0.5s ease-in-out infinite"
    : hp ? "arm-wave-r 1.2s ease-in-out infinite"
    : sp ? "arm-surprised-r 0.6s ease-out forwards"
    : ag ? "arm-angry 0.5s ease-in-out infinite"
    : "arm-idle-r 4s ease-in-out infinite";

  const lArmAnim = ex ? "arm-wave-l 0.5s ease-in-out infinite 0.12s"
    : tk ? "arm-think 2.5s ease-in-out infinite"
    : ag ? "arm-angry 0.5s ease-in-out infinite 0.08s"
    : "arm-idle-l 4s ease-in-out infinite 0.4s";

  const hairSpeed = ex ? "0.7s" : hp ? "1.5s" : "3.2s";

  const eyeScaleY = blinking ? 0.05
    : hp || ex ? 0.55
    : sp ? 1.5
    : ag ? 0.65
    : sd ? 0.8
    : 1.0;

  const eyeColor = ag ? "#ff4444" : sd ? "#7799cc" : hp || ex ? "#ff88dd" : "#cc44ff";
  const eyeShape = hp || ex ? "40% 40% 60% 60%" : sp ? "50%" : ag ? "20% 20% 50% 50%" : "50%";

  const browRotL = ag ? -18 : sd ? 12 : sp ? -8 : -8;
  const browRotR = ag ? 18 : sd ? -12 : sp ? 8 : 8;
  const browY = sp ? -3 : ag ? -1 : 0;

  const mouthW = mouthState === "mouth-wide" ? 20 : mouthState === "mouth-open" ? 14 : 10;
  const mouthH = mouthState === "mouth-wide" ? 10 : mouthState === "mouth-open" ? 6 : 2.5;

  return (
    <div className="relative w-[400px] h-[600px] flex items-end justify-center">
      {/* Aura glow */}
      <div
        className="absolute inset-0 -z-10 rounded-full blur-[100px] pointer-events-none"
        style={{ background: AURA_COLORS[emotion], animation: "aura-pulse 2.5s ease-in-out infinite", transition: "background 0.6s ease" }}
      />

      {/* ── Main animated character ── */}
      <div className="absolute inset-0" style={{ animation: bodyAnim }}>
        <svg
          viewBox="0 0 360 590"
          width="360"
          height="590"
          style={{ position: "absolute", left: 20, top: 5 }}
          overflow="visible"
        >
          <defs>
            <linearGradient id="hairGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#A030DD" />
              <stop offset="60%" stopColor="#7B20BB" />
              <stop offset="100%" stopColor="#5B0F99" />
            </linearGradient>
            <linearGradient id="hairHighlight" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#9B30DD" />
              <stop offset="50%" stopColor="#C060FF" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#9B30DD" />
            </linearGradient>
            <linearGradient id="skinGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FFE5C8" />
              <stop offset="100%" stopColor="#F0C8A0" />
            </linearGradient>
            <linearGradient id="outfitGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#1A0B30" />
              <stop offset="100%" stopColor="#0A0418" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="softglow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* ─── HAIR BACK — Left strand ─── */}
          <g style={{ transformOrigin: "155px 72px", animation: `hair-sway-l ${hairSpeed} ease-in-out infinite` }}>
            <path d="M 155 72 Q 125 100 110 150 Q 95 210 92 280 Q 88 350 90 420 Q 91 470 95 500 Q 98 515 108 515 L 122 512 Q 116 490 115 440 Q 114 380 117 310 Q 120 240 130 170 Q 142 110 162 78 Z"
              fill="url(#hairGrad)" />
            <path d="M 138 75 Q 108 110 98 165 Q 88 225 90 295 Q 91 360 96 425 Q 99 465 103 490 Q 93 480 88 440 Q 83 370 84 300 Q 84 225 93 158 Q 103 100 132 70 Z"
              fill="#5B0F99" opacity="0.6" />
          </g>

          {/* ─── HAIR BACK — Right strand ─── */}
          <g style={{ transformOrigin: "205px 72px", animation: `hair-sway-r ${hairSpeed} ease-in-out infinite 0.4s` }}>
            <path d="M 205 72 Q 235 100 250 150 Q 265 210 268 280 Q 272 350 270 420 Q 269 470 265 500 Q 262 515 252 515 L 238 512 Q 244 490 245 440 Q 246 380 243 310 Q 240 240 230 170 Q 218 110 198 78 Z"
              fill="url(#hairGrad)" />
            <path d="M 222 75 Q 252 110 262 165 Q 272 225 270 295 Q 269 360 264 425 Q 261 465 257 490 Q 267 480 272 440 Q 277 370 276 300 Q 276 225 267 158 Q 257 100 228 70 Z"
              fill="#5B0F99" opacity="0.6" />
          </g>

          {/* ─── BODY / OUTFIT ─── */}
          <g style={{ transformOrigin: "180px 310px", animation: "body-breathe 3s ease-in-out infinite" }}>
            {/* Torso */}
            <path d="M 105 205 Q 95 225 93 260 L 93 320 Q 93 335 110 342 L 155 352 L 205 352 L 250 342 Q 267 335 267 320 L 267 260 Q 265 225 255 205 Z"
              fill="url(#outfitGrad)" />
            {/* Cyber trim lines */}
            <path d="M 110 215 L 250 215" stroke="#00E5FF" strokeWidth="1.5" opacity="0.7" filter="url(#glow)" />
            <path d="M 105 270 L 255 270" stroke="#00E5FF" strokeWidth="1" opacity="0.4" />
            <path d="M 107 295 L 253 295" stroke="#CC44EE" strokeWidth="0.8" opacity="0.35" />
            {/* Center chest detail */}
            <path d="M 162 218 Q 175 230 180 228 Q 185 230 198 218" fill="none" stroke="#00E5FF" strokeWidth="1.5" filter="url(#glow)" opacity="0.8" />
            <circle cx="180" cy="240" r="6" fill="none" stroke="#00E5FF" strokeWidth="1.5" filter="url(#glow)" opacity="0.6" />
            <circle cx="180" cy="240" r="3" fill="#00E5FF" opacity="0.5" />
            {/* Shoulders */}
            <ellipse cx="103" cy="205" rx="16" ry="10" fill="#1A0B30" />
            <ellipse cx="257" cy="205" rx="16" ry="10" fill="#1A0B30" />
          </g>

          {/* ─── LEGS ─── */}
          <g style={{ transformOrigin: "180px 360px", animation: "leg-sway 4s ease-in-out infinite" }}>
            {/* Left leg */}
            <path d="M 150 350 Q 140 380 135 420 Q 130 460 132 500 L 132 520 L 155 520 L 158 500 Q 162 465 165 425 Q 168 380 170 350 Z"
              fill="#0D0820" />
            {/* Left boot */}
            <path d="M 132 510 Q 128 530 125 540 L 162 540 Q 165 530 158 510 Z" fill="#0A0418" />
            <path d="M 125 540 L 165 540" stroke="#00E5FF" strokeWidth="1.5" opacity="0.6" filter="url(#glow)" />
            {/* Right leg */}
            <path d="M 210 350 Q 220 380 225 420 Q 230 460 228 500 L 228 520 L 205 520 L 202 500 Q 198 465 195 425 Q 192 380 190 350 Z"
              fill="#0D0820" />
            {/* Right boot */}
            <path d="M 228 510 Q 232 530 235 540 L 198 540 Q 195 530 202 510 Z" fill="#0A0418" />
            <path d="M 195 540 L 235 540" stroke="#00E5FF" strokeWidth="1.5" opacity="0.6" filter="url(#glow)" />
          </g>

          {/* ─── LEFT ARM ─── */}
          <g style={{ transformOrigin: "105px 205px", animation: lArmAnim }}>
            {/* Upper arm */}
            <path d="M 106 200 Q 90 225 78 270 Q 70 305 68 340 Q 70 360 84 362 Q 98 364 100 344 Q 100 308 108 274 Q 116 234 118 204 Z"
              fill="url(#skinGrad)" />
            {/* Sleeve cuff */}
            <path d="M 69 330 Q 67 350 69 362 L 100 366 Q 102 354 100 335 Z"
              fill="#1A0B30" />
            <path d="M 66 358 Q 71 368 98 368" stroke="#00E5FF" strokeWidth="1.5" opacity="0.7" filter="url(#glow)" />
            {/* Hand */}
            <ellipse cx="76" cy="368" rx="13" ry="10" fill="url(#skinGrad)" />
            {/* Fingers suggestion */}
            <path d="M 65 365 Q 63 375 66 380" stroke="#F0C8A0" strokeWidth="3" strokeLinecap="round" />
            <path d="M 72 368 Q 70 378 73 383" stroke="#F0C8A0" strokeWidth="3" strokeLinecap="round" />
            <path d="M 79 368 Q 78 378 81 382" stroke="#F0C8A0" strokeWidth="3" strokeLinecap="round" />
          </g>

          {/* ─── RIGHT ARM ─── */}
          <g style={{ transformOrigin: "255px 205px", animation: rArmAnim }}>
            {/* Upper arm */}
            <path d="M 254 200 Q 270 225 282 270 Q 290 305 292 340 Q 290 360 276 362 Q 262 364 260 344 Q 260 308 252 274 Q 244 234 242 204 Z"
              fill="url(#skinGrad)" />
            {/* Sleeve cuff */}
            <path d="M 291 330 Q 293 350 291 362 L 260 366 Q 258 354 260 335 Z"
              fill="#1A0B30" />
            <path d="M 294 358 Q 289 368 262 368" stroke="#CC44EE" strokeWidth="1.5" opacity="0.7" filter="url(#glow)" />
            {/* Hand */}
            <ellipse cx="284" cy="368" rx="13" ry="10" fill="url(#skinGrad)" />
            {/* Fingers */}
            <path d="M 295 365 Q 297 375 294 380" stroke="#F0C8A0" strokeWidth="3" strokeLinecap="round" />
            <path d="M 288 368 Q 290 378 287 383" stroke="#F0C8A0" strokeWidth="3" strokeLinecap="round" />
            <path d="M 281 368 Q 282 378 279 382" stroke="#F0C8A0" strokeWidth="3" strokeLinecap="round" />
          </g>

          {/* ─── NECK ─── */}
          <rect x="168" y="178" width="24" height="30" rx="4" fill="url(#skinGrad)" />
          {/* Collar / choker */}
          <path d="M 150 200 Q 165 212 180 212 Q 195 212 210 200" fill="none" stroke="#CC44EE" strokeWidth="2.5" filter="url(#glow)" />
          <rect x="165" y="202" width="30" height="8" rx="3" fill="#1A0B30" stroke="#CC44EE" strokeWidth="1" />

          {/* ─── HEAD ─── */}
          <g style={{ transformOrigin: "180px 180px", animation: headAnim, transition: "animation 0.3s" }}>
            {/* Face shape */}
            <path d="M 122 100 Q 120 55 180 50 Q 240 55 238 100 L 240 140 Q 238 178 216 186 Q 198 192 180 192 Q 162 192 144 186 Q 122 178 120 140 Z"
              fill="url(#skinGrad)" />
            {/* Cheek highlight */}
            <ellipse cx="135" cy="148" rx="14" ry="9" fill={ag ? "rgba(255,80,80,0)" : sd ? "rgba(100,130,200,0.15)" : "rgba(255,150,180,0.22)"} style={{ transition: "fill 0.4s" }} />
            <ellipse cx="225" cy="148" rx="14" ry="9" fill={ag ? "rgba(255,80,80,0)" : sd ? "rgba(100,130,200,0.15)" : "rgba(255,150,180,0.22)"} style={{ transition: "fill 0.4s" }} />

            {/* ── EYEBROWS ── */}
            <rect x="136" y="107" width="28" height="4" rx="2"
              fill={ag ? "#ff5544" : sd ? "#7799cc" : "#7B22CC"}
              style={{
                transformOrigin: "150px 109px",
                transform: `rotate(${browRotL}deg) translateY(${browY}px)`,
                transition: "transform 0.3s ease, fill 0.3s ease",
              }}
            />
            <rect x="196" y="107" width="28" height="4" rx="2"
              fill={ag ? "#ff5544" : sd ? "#7799cc" : "#7B22CC"}
              style={{
                transformOrigin: "210px 109px",
                transform: `rotate(${browRotR}deg) translateY(${browY}px)`,
                transition: "transform 0.3s ease, fill 0.3s ease",
              }}
            />

            {/* ── EYES ── */}
            {/* Eye whites */}
            <ellipse cx="153" cy="127" rx="19" ry="16" fill="white" opacity="0.95" />
            <ellipse cx="207" cy="127" rx="19" ry="16" fill="white" opacity="0.95" />
            {/* Eye iris */}
            <ellipse cx="153" cy="127" rx="13" ry="13"
              fill={eyeColor}
              style={{ transformOrigin: "153px 127px", transform: `scaleY(${eyeScaleY})`, transition: "transform 0.1s ease, fill 0.3s ease" }}
            />
            <ellipse cx="207" cy="127" rx="13" ry="13"
              fill={eyeColor}
              style={{ transformOrigin: "207px 127px", transform: `scaleY(${eyeScaleY})`, transition: "transform 0.1s ease, fill 0.3s ease" }}
            />
            {/* Pupil */}
            {eyeScaleY > 0.2 && (
              <>
                <ellipse cx="154" cy="128" rx="6" ry="6" fill="#1A0033" style={{ transformOrigin: "153px 127px", transform: `scaleY(${eyeScaleY})` }} />
                <ellipse cx="208" cy="128" rx="6" ry="6" fill="#1A0033" style={{ transformOrigin: "207px 127px", transform: `scaleY(${eyeScaleY})` }} />
                {/* Eye shine */}
                <circle cx="158" cy="122" r="3.5" fill="white" opacity="0.9" style={{ transformOrigin: "153px 127px", transform: `scaleY(${eyeScaleY})` }} />
                <circle cx="212" cy="122" r="3.5" fill="white" opacity="0.9" style={{ transformOrigin: "207px 127px", transform: `scaleY(${eyeScaleY})` }} />
                <circle cx="147" cy="131" r="1.5" fill="white" opacity="0.5" style={{ transformOrigin: "153px 127px", transform: `scaleY(${eyeScaleY})` }} />
                <circle cx="201" cy="131" r="1.5" fill="white" opacity="0.5" style={{ transformOrigin: "207px 127px", transform: `scaleY(${eyeScaleY})` }} />
              </>
            )}
            {/* Eyelashes top */}
            <path d="M 134 115 Q 153 108 172 115" fill="none" stroke={eyeColor} strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
            <path d="M 188 115 Q 207 108 226 115" fill="none" stroke={eyeColor} strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />

            {/* ── NOSE (subtle) ── */}
            <path d="M 177 152 Q 180 158 183 152" fill="none" stroke="#D4A880" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />

            {/* ── MOUTH ── */}
            <ellipse cx="180" cy="168"
              rx={mouthW / 2} ry={mouthH / 2}
              fill={ag ? "#cc2200" : sd ? "#8899bb" : "#cc3366"}
              style={{ transition: "rx 0.08s ease, ry 0.08s ease, fill 0.3s ease" }}
            />
            {mouthState !== "mouth-closed" && (
              <ellipse cx="180" cy="168"
                rx={mouthW / 2 - 1} ry={mouthH / 2 - 0.5}
                fill="#1A0020" opacity="0.8"
              />
            )}
            {/* Smile / lip line */}
            {mouthState === "mouth-closed" && (
              <path
                d={hp || ex ? "M 170 166 Q 180 174 190 166" : sd ? "M 170 170 Q 180 164 190 170" : ag ? "M 170 168 Q 180 163 190 168" : "M 170 167 Q 180 172 190 167"}
                fill="none" stroke={ag ? "#aa1100" : sd ? "#7788aa" : "#aa2255"} strokeWidth="1.5" strokeLinecap="round"
                style={{ transition: "d 0.3s ease" }}
              />
            )}

            {/* ── HAIR FRONT (bangs) ── */}
            <g style={{ transformOrigin: "180px 50px", animation: `bangs-sway ${hairSpeed} ease-in-out infinite` }}>
              {/* Center bang */}
              <path d="M 163 52 Q 172 48 180 50 Q 188 48 197 52 Q 190 62 180 65 Q 170 62 163 52 Z" fill="#A030DD" />
              {/* Left bangs */}
              <path d="M 120 88 Q 122 58 138 52 Q 148 48 162 52 Q 148 65 140 82 Q 132 98 128 112 Q 120 100 120 88 Z" fill="#9B30DD" />
              <path d="M 118 92 Q 115 70 122 62 Q 118 80 118 92 Z" fill="#7B20BB" />
              {/* Right bangs */}
              <path d="M 240 88 Q 238 58 222 52 Q 212 48 198 52 Q 212 65 220 82 Q 228 98 232 112 Q 240 100 240 88 Z" fill="#9B30DD" />
              <path d="M 242 92 Q 245 70 238 62 Q 242 80 242 92 Z" fill="#7B20BB" />
              {/* Side pieces */}
              <path d="M 122 112 Q 115 140 118 165 Q 120 175 125 178 Q 120 160 120 140 Q 120 125 122 112 Z" fill="#8B22CC" />
              <path d="M 238 112 Q 245 140 242 165 Q 240 175 235 178 Q 240 160 240 140 Q 240 125 238 112 Z" fill="#8B22CC" />
            </g>

            {/* ── HAIR ACCESSORIES (cyber orbs) ── */}
            <circle cx="148" cy="80" r="7" fill="#1A0B30" stroke="#00E5FF" strokeWidth="1.5" filter="url(#glow)" />
            <circle cx="148" cy="80" r="4" fill="#00E5FF" opacity="0.6" filter="url(#glow)" />
            <circle cx="212" cy="80" r="7" fill="#1A0B30" stroke="#CC44EE" strokeWidth="1.5" filter="url(#glow)" />
            <circle cx="212" cy="80" r="4" fill="#CC44EE" opacity="0.6" filter="url(#glow)" />
          </g>

          {/* ── ANGER mark ── */}
          {ag && (
            <text x="230" y="60" fontSize="22" style={{ animation: "anger-mark 0.6s ease-in-out infinite" }}>💢</text>
          )}
          {/* ── SAD tears ── */}
          {sd && (
            <>
              <ellipse cx="148" cy="155" rx="3" ry="6" fill="#88AAFF" opacity="0.9" style={{ animation: "tear-drop 2s ease-in infinite 0.5s" }} />
              <ellipse cx="212" cy="155" rx="3" ry="6" fill="#88AAFF" opacity="0.9" style={{ animation: "tear-drop 2s ease-in infinite 1.1s" }} />
            </>
          )}
          {/* ── THINKING dots ── */}
          {tk && (
            <>
              {[0, 1, 2].map((i) => (
                <circle key={i} cx={230 + i * 11} cy={55} r={4}
                  fill="#88CCFF"
                  style={{ animation: `thought-dot 1s ease-in-out infinite`, animationDelay: `${i * 200}ms` }}
                />
              ))}
            </>
          )}
          {/* ── EXCITED sparkle ring ── */}
          {ex && (
            <g style={{ transformOrigin: "180px 300px", animation: "spin-sparkle 2s linear infinite", opacity: 0.7 }}>
              <text x="80" y="200" fontSize="18">✨</text>
              <text x="270" y="180" fontSize="18">⚡</text>
              <text x="75" y="380" fontSize="16">💫</text>
            </g>
          )}
        </svg>
      </div>

      {/* Floating emoji particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute pointer-events-none text-xl select-none"
          style={{
            left: p.x,
            bottom: "20%",
            animation: "particle-rise 1.8s ease-out forwards",
            animationDelay: `${p.delay}ms`,
            ["--dx" as string]: `${p.dx}px`,
          }}
        >
          {p.emoji}
        </div>
      ))}
    </div>
  );
}
