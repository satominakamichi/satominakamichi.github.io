export type Emotion =
  | "idle"
  | "speaking"
  | "dance"
  // ── Positive spectrum ──────────────
  | "very_happy"
  | "hype"
  | "excited"
  | "proud"
  | "happy"
  | "flirty"
  // ── Negative spectrum ──────────────
  | "savage"
  | "disgusted"
  | "angry"
  | "empathetic"
  | "sad"
  // ── Cognitive spectrum ─────────────
  | "curious"
  | "confused"
  | "philosophical"
  | "serious"
  | "thinking"
  | "surprised";

export function detectEmotion(text: string): Emotion {
  const t = text.toLowerCase();

  // Phrase match — substring OK for multi-word phrases (no ambiguity)
  const phrase = (words: string[]) => words.some((w) => t.includes(w));

  // Word match — uses word boundaries to avoid "ew" hitting "knew", etc.
  const word = (words: string[]) =>
    words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t));

  // ── Dance — highest priority ──────────────────────────────────────────────
  if (phrase(["dance", "dancing", "shimmy", "groove", "boogie", "little dance",
              "show us some moves", "twerk"]) ||
      phrase(["moving in my chair", "doing my dance", "doing my shimmy"]))
    return "dance";

  // ── Very Happy — euphoric overflow ────────────────────────────────────────
  if (phrase(["screaming", "cannot contain", "losing it", "oh my god", "euphoric",
              "jumping", "best day", "absolutely beautiful", "this is everything",
              "i love this so much", "best vtuber"]))
    return "very_happy";

  // ── Hype — energy, momentum ───────────────────────────────────────────────
  if (phrase(["now we're talking", "let's ride", "keep going", "here we go",
              "let's go", "lfg", "wagmi", "bullish", "we're moving",
              "this is it", "come on", "let's gooo", "lets go"]) ||
      word(["pump", "pumped", "100x", "10x", "momentum"]))
    return "hype";

  // ── Excited — broad enthusiasm ────────────────────────────────────────────
  if (phrase(["amazing", "incredible", "insane", "moon", "gem", "banger",
              "excited", "hyped", "love it", "fantastic", "go go", "fire"]))
    return "excited";

  // ── Philosophical — deep thought (check BEFORE disgusted) ────────────────
  if (phrase(["think about it", "bigger picture", "step back", "kind of like",
              "what it means", "profound", "perspective on", "what we do right now",
              "the point", "the design", "whole design", "nobody knows",
              "actually knows", "not knowing"]) ||
      phrase(["what happens after", "after we die", "before we die"]))
    return "philosophical";

  // ── Savage — dry roast ────────────────────────────────────────────────────
  if (phrase(["obviously", "clearly you", "bold of you", "classic move",
              "bless your heart", "are you serious", "bought the top",
              "interesting choice", "well that happened", "congratulations on that",
              "at least you're honest", "pretending", "you bought the"]))
    return "savage";

  // ── Disgusted — eye-roll ──────────────────────────────────────────────────
  if (phrase(["absolutely not", "hard no", "please no", "cringe", "yikes",
              "that's awful", "seriously no", "no way i"]) ||
      word(["ugh", "gross", "yuck"]))
    return "disgusted";

  // ── Angry ─────────────────────────────────────────────────────────────────
  if (phrase(["scam", "rug pull", "bearish", "trash", "terrible", "stupid",
              "ridiculous", "furious"]) ||
      word(["hate", "dumb", "mad", "angry"]))
    return "angry";

  // ── Proud — vindicated, confident ────────────────────────────────────────
  if (phrase(["smart move", "good call", "nailed it", "exactly right",
              "well played", "good instinct", "you got it", "that's right",
              "brilliant", "sharp", "that's the move"]))
    return "proud";

  // ── Flirty — playful tease ────────────────────────────────────────────────
  if (phrase(["play along", "give it back", "teasing", "charming",
              "come on then", "got me there", "you're funny", "flirt",
              "witty", "can't help it", "you're something", "okay you win",
              "romance subplot", "fishing"]))
    return "flirty";

  // ── Empathetic — comforting ───────────────────────────────────────────────
  if (phrase(["that's rough", "i hear you", "it hurts", "acknowledge",
              "genuinely hard", "makes sense that", "i get that",
              "lost money", "rekt", "i'm sorry", "one bad day", "bad day",
              "one exam"]))
    return "empathetic";

  // ── Sad ───────────────────────────────────────────────────────────────────
  if (phrase(["unfortunately", "disappoint", "miss",
              "unfortunate", "i failed", "i give up", "giving up"]) ||
      word(["sad", "broke", "failed", "sorry"]))
    return "sad";

  // ── Happy — general positive ──────────────────────────────────────────────
  if (phrase(["haha", "hehe", "awesome", "love you", "love this", "cute",
              "sweet", "great", "so good", "so cool"]) ||
      word(["happy", "glad", "fun", "enjoy", "good"]))
    return "happy";

  // ── Serious — focused explanation mode ───────────────────────────────────
  if (phrase(["listen", "hear me out", "let me be real", "the truth is",
              "here's what's actually", "be honest", "real talk",
              "market cap", "tokenomics", "circulating supply",
              "difference between", "what it actually"]))
    return "serious";

  // ── Curious — leaning in ──────────────────────────────────────────────────
  if (phrase(["tell me more", "say more", "actually curious",
              "did you get in", "are you riding", "wait so", "what if"]))
    return "curious";

  // ── Confused ─────────────────────────────────────────────────────────────
  if (phrase(["makes no sense", "lost me", "i don't follow", "confused",
              "what do you mean", "i'm sorry what", "that can't be right"]))
    return "confused";

  // ── Surprised — shocked ───────────────────────────────────────────────────
  if (phrase(["oh my", "wait what", "unbelievable", "unexpected",
              "wait actually what", "that's actually insane"]) ||
      word(["whoa", "omg", "wow"]))
    return "surprised";

  // ── Thinking — pondering ──────────────────────────────────────────────────
  if (phrase(["i think", "i wonder", "maybe", "perhaps", "let me think",
              "kind of think", "i kind of", "i'm okay with", "depends on",
              "not sure", "hollow"]) ||
      word(["hmm", "interesting", "consider", "honestly"]))
    return "thinking";

  return "speaking";
}
