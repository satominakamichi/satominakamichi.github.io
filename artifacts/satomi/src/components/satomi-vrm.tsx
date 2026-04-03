import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  VRMLoaderPlugin,
  VRM,
  VRMHumanBoneName,
  VRMExpressionPresetName,
} from "@pixiv/three-vrm";
import { SatomiAvatar } from "@/components/satomi-avatar";
import { MouthState } from "@/hooks/use-speech";
import { Emotion } from "@/lib/emotion";

function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

interface Props {
  mouthState: MouthState;
  isSpeaking: boolean;
  emotion: Emotion;
  hasNewTrigger?: boolean;
  overrideGesture?: string;
  onWave?: () => void;
}

const EMOTION_TO_EXPR: Partial<Record<Emotion, { expr: VRMExpressionPresetName; intensity: number }>> = {
  // Positive
  very_happy:   { expr: VRMExpressionPresetName.Happy,     intensity: 1.00 },
  hype:         { expr: VRMExpressionPresetName.Surprised, intensity: 0.80 },
  excited:      { expr: VRMExpressionPresetName.Happy,     intensity: 0.95 },
  proud:        { expr: VRMExpressionPresetName.Relaxed,   intensity: 0.85 },
  happy:        { expr: VRMExpressionPresetName.Happy,     intensity: 0.80 },
  flirty:       { expr: VRMExpressionPresetName.Happy,     intensity: 0.65 },
  dance:        { expr: VRMExpressionPresetName.Happy,     intensity: 0.90 },
  // Negative
  savage:       { expr: VRMExpressionPresetName.Angry,     intensity: 0.45 },
  disgusted:    { expr: VRMExpressionPresetName.Angry,     intensity: 0.55 },
  angry:        { expr: VRMExpressionPresetName.Angry,     intensity: 1.00 },
  empathetic:   { expr: VRMExpressionPresetName.Sad,       intensity: 0.55 },
  sad:          { expr: VRMExpressionPresetName.Sad,       intensity: 0.90 },
  // Cognitive
  curious:      { expr: VRMExpressionPresetName.Relaxed,   intensity: 0.70 },
  confused:     { expr: VRMExpressionPresetName.Surprised, intensity: 0.65 },
  philosophical:{ expr: VRMExpressionPresetName.Relaxed,   intensity: 0.55 },
  serious:      { expr: VRMExpressionPresetName.Neutral,   intensity: 0.70 },
  thinking:     { expr: VRMExpressionPresetName.Relaxed,   intensity: 0.70 },
  surprised:    { expr: VRMExpressionPresetName.Surprised, intensity: 0.95 },
};

const MOUTH_TO_VISEME: Record<MouthState, { aa: number; oh: number; ee: number }> = {
  "mouth-closed": { aa: 0,    oh: 0,    ee: 0   },
  "mouth-open":   { aa: 0.45, oh: 0.25, ee: 0   },
  "mouth-wide":   { aa: 0.85, oh: 0.10, ee: 0.2 },
};

export function SatomiVRM({ mouthState, isSpeaking, emotion, hasNewTrigger, overrideGesture, onWave }: Props) {
  const [webglAvailable] = useState(() => isWebGLAvailable());
  if (!webglAvailable) {
    return (
      <SatomiAvatar
        mouthState={mouthState}
        isSpeaking={isSpeaking}
        emotion={emotion}
        hasNewTrigger={hasNewTrigger}
      />
    );
  }
  return (
    <SatomiVRMCanvas
      mouthState={mouthState}
      isSpeaking={isSpeaking}
      emotion={emotion}
      hasNewTrigger={hasNewTrigger}
      overrideGesture={overrideGesture}
      onWave={onWave}
    />
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  GESTURE SYSTEM
//  Format (16 values):
//  [lArm_z, lArm_x, rArm_z, rArm_x,
//   lFore_z, lFore_x, rFore_z, rFore_x,
//   lHand_x, lHand_z, rHand_x, rHand_z,
//   lCurl, rCurl,
//   lExt,  rExt]   ← 0=normal curl, 1=index point, 2=peace (index+middle), 3=thumb up
//
//  CONFIRMED ARM AXES (from live testing):
//    Left  UpperArm  → z NEGATIVE = arm DOWN   (natural hang ≈ -1.30)
//    Right UpperArm  → z POSITIVE = arm DOWN   (natural hang ≈ +1.30)
//    Both  UpperArm  → x POSITIVE = arm FORWARD (toward camera)
//
//  FOREARM / ELBOW BEND:
//    Left  forearm   → x NEGATIVE = elbow bends TOWARD camera
//    Right forearm   → x POSITIVE = elbow bends TOWARD camera
//
//  FINGER CURL: lCurl/rCurl 0=open 1=fist (applied to non-extended fingers)
//  lExt/rExt: which fingers to EXTEND (keep straight):
//    0 = all curl uniformly
//    1 = index finger extended (POINTING)
//    2 = index + middle extended (PEACE ✌)
//    3 = thumb extended (THUMBS UP 👍)
//
//  SHOULDER BONES: LeftShoulder/RightShoulder — lSho.rotation.x = negative lean → arm goes forward.
//    Applied proportionally to arm-x in applyGesture to physically push arms toward camera.
// ════════════════════════════════════════════════════════════════════════════

const G = {
  // [lArm_z, lArm_x, rArm_z, rArm_x, lFore_z, lFore_x, rFore_z, rFore_x, lHand_x, lHand_z, rHand_x, rHand_z, lCurl, rCurl, lExt, rExt]
  //
  // ARM FORWARD LAW (verified):
  //   lArm_x POSITIVE → left  arm swings FORWARD (toward camera)  ← SAME sign as lFore for elbow cam is lFore_x NEGATIVE
  //   rArm_x POSITIVE → right arm swings FORWARD (toward camera)
  //   Use 0.60–1.30 for clearly visible forward positions.

  // 0 — natural resting hang, arms fully at sides
  REST:    [-1.30, 0.00,  1.30, 0.00,   0.00,  0.00,  0.00,  0.00,  0.00, 0.00, 0.00, 0.00,  0.12, 0.12,  0, 0],

  // 1 — right explain: arm raised and STRONGLY forward, elbow toward cam
  R_EXP:   [-0.62, 0.90,  1.30, 0.10,   0.12, -1.28,  0.00,  0.00,  0.00, 0.00, 0.15,-0.10,  0.12, 0.04,  0, 0],

  // 2 — both hands at chest-level, STRONGLY forward, elbows toward cam
  BOTH:    [-0.88, 0.75,  0.88, 0.75,   0.38, -1.10, -0.38,  1.10,  0.10, 0.00, 0.10, 0.00,  0.04, 0.04,  0, 0],

  // 3 — left explain
  L_EXP:   [-1.30, 0.10,  0.62, 0.90,   0.00,  0.00, -0.12,  1.28,  0.15, 0.10, 0.00, 0.00,  0.04, 0.12,  0, 0],

  // 4 — right arm HIGH emphatic, strongly forward
  R_HIGH:  [-0.30, 0.95,  1.30, 0.10,   0.05, -0.52,  0.00,  0.00,  0.00, 0.00, 0.20,-0.16,  0.12, 0.06,  0, 0],

  // 5 — conversational, both arms relaxed but clearly forward
  CONV:    [-0.95, 0.55,  0.95, 0.55,   0.26, -0.82, -0.26,  0.82,  0.06, 0.00, 0.06, 0.00,  0.06, 0.06,  0, 0],

  // 6 — flirty/coy: right hand swept forward toward face
  COY:     [-1.20, 0.08,  0.44, 0.80,   0.00, -0.28,  0.42,  1.10, -0.18, 0.20, 0.08, 0.00,  0.08, 0.18,  0, 0],

  // 7 — shrug "I don't know": arms slightly spread + slightly forward
  SHRUG:   [-1.00, 0.22,  1.00, 0.22,   0.08, -0.18, -0.08,  0.18, -0.22, 0.00,-0.22, 0.00,  0.18, 0.18,  0, 0],

  // 8 — right hand at chest (sincere), arm clearly forward
  CHEST:   [-1.30, 0.08,  0.48, 0.75,   0.00,  0.00,  0.30,  0.80, -0.18, 0.14, 0.00, 0.00,  0.10, 0.12,  0, 0],

  // 9 — pointing gesture (left arm raised)
  POINT_R: [-0.58, 0.95,  1.30, 0.08,   0.08, -1.20,  0.00,  0.00,  0.00, 0.00, 0.05,-0.08,  0.12, 0.78,  0, 1],

  // 10 — pointing gesture (right arm raised)
  POINT_L: [-1.30, 0.08,  0.58, 0.95,   0.00,  0.00, -0.08,  1.20,  0.05, 0.08, 0.00, 0.00,  0.78, 0.12,  1, 0],

  // 11 — index up "one point / listen"
  COUNT:   [-0.28, 1.00,  1.30, 0.10,   0.05, -0.48,  0.00,  0.00,  0.00, 0.00, 0.12,-0.10,  0.12, 0.80,  0, 1],

  // 12 — PEACE SIGN ✌ — arm forward
  PEACE:   [-0.55, 0.88,  1.30, 0.10,   0.10, -1.22,  0.00,  0.00,  0.00, 0.00, 0.10,-0.08,  0.12, 0.72,  0, 2],

  // 13 — BOTH INDEX POINT forward simultaneously
  BOTH_PT: [-0.82, 0.88,  0.82, 0.88,   0.34, -1.05, -0.34,  1.05,  0.08, 0.00, 0.08, 0.00,  0.78, 0.78,  1, 1],

  // 14 — PALM PUSH forward "stop/listen"
  PUSH:    [-0.70, 1.00,  1.30, 0.10,   0.05, -0.80,  0.00,  0.00,  0.00, 0.00, 0.30, 0.00,  0.04, 0.04,  0, 0],

  // 15 — SELF POINT: hand toward self, arm forward
  SELF:    [-0.85, 0.80,  1.30, 0.10,   0.00, -0.90,  0.00,  0.00, -0.15, 0.00, 0.00, 0.00,  0.12, 0.78,  0, 1],

  // ── Head-touch / contemplative gestures ─────────────────────────────────
  // 16 — CHIN HOLD: arm strongly forward + raised, hand at chin
  CHIN:    [-0.65, 0.92,  1.28, 0.10,   0.06, -1.50,  0.00,  0.00,  0.00, 0.00,-0.10, 0.10,  0.12, 0.42,  0, 1],

  // 17 — HEAD TOUCH: arm raised + strongly forward, hand near head
  HEAD_L:  [-1.30, 0.08,  0.08, 1.10,   0.00,  0.00, -0.06,  1.55, -0.14, 0.00, 0.00, 0.00,  0.32, 0.12,  0, 0],

  // 18 — THINK POSE: arm high + very strongly forward, hand at temple
  THINK_R: [-0.42, 1.05,  1.30, 0.10,   0.05, -1.58,  0.00,  0.00,  0.00, 0.00,-0.06, 0.08,  0.14, 0.52,  0, 1],

  // 19 — HAIR TOUCH: arm raised + forward, hand near hair
  HAIR_L:  [-1.30, 0.08,  0.18, 1.00,   0.00,  0.00,  0.08,  1.40, -0.10, 0.06, 0.00, 0.00,  0.28, 0.12,  0, 0],

  // ── Idle standing poses ──────────────────────────────────────────────────
  // 20 — WAIST: both hands relaxed, slightly forward at hip level
  WAIST:   [-1.18, 0.42,  1.18, 0.42,   0.06, -0.42, -0.06,  0.42, -0.06, 0.00,-0.06, 0.00,  0.16, 0.16,  0, 0],

  // 21 — HIP_R: right hand on hip, left relaxed slight forward
  HIP_R:   [-1.08,-0.08,  1.28, 0.12,   0.10, -0.15,  0.00,  0.08, -0.05, 0.00,-0.14,-0.10,  0.12, 0.24,  0, 0],

  // 22 — HIP_L: left hand on hip, right relaxed slight forward
  HIP_L:   [-1.28, 0.12,  1.08,-0.08,   0.00,  0.08, -0.10,  0.15,  0.14, 0.10,-0.05, 0.00,  0.24, 0.12,  0, 0],

  // 23 — CLASP: both hands loosely clasped in front — clearly forward at chest level
  CLASP:   [-1.10, 0.62,  1.10, 0.62,   0.08, -0.52, -0.08,  0.52, -0.06, 0.08,-0.06,-0.08,  0.26, 0.26,  0, 0],

  // 23b — CLASP_LOW: arms hang naturally, forearms fold inward → hands meet at lower belly
  CLASP_LOW: [-1.25, 0.14,  1.25, 0.14,  -1.10, -0.22,  1.10,  0.22,  -0.05, 0.04, -0.05,-0.04,  0.20, 0.20,  0, 0],

  // ── Object-interaction / natural explaining gestures ─────────────────────
  // HOLD_SMALL: both hands cupped as if holding a small object at belly/waist level
  HOLD_SMALL:  [-1.20, 0.28,  1.20, 0.28,  -0.68, -0.28,  0.68,  0.28,  -0.06, 0.03, -0.06,-0.03,  0.22, 0.22,  0, 0],

  // HOLD_LARGE: arms wide, elbows bent — like holding or framing a big sphere or broad concept
  HOLD_LARGE:  [-0.75, 0.65,  0.75, 0.65,  -0.18, -0.52,  0.18,  0.52,  -0.04, 0.06, -0.04,-0.06,  0.10, 0.10,  0, 0],

  // MEASURE_W: hands spread apart at chest level measuring width — "about this wide"
  MEASURE_W:   [-0.90, 0.55,  0.90, 0.55,  -0.10, -0.68,  0.10,  0.68,   0.00, 0.14,  0.00,-0.14,  0.06, 0.06,  0, 0],

  // PRESENT_R: right hand palm up presenting/offering information to the viewer
  PRESENT_R:   [-0.88, 0.72,  1.28, 0.10,  -0.05, -0.85,  0.00,  0.06,   0.00, 0.00,  0.18,-0.06,  0.12, 0.06,  0, 0],

  // 24 — SIDE_R: arm out to side, other relaxed slight forward
  SIDE_R:  [-1.10, 0.00,  1.28, 0.12,  -0.04, -0.20,  0.00,  0.00,  0.00, 0.00,-0.10,-0.12,  0.12, 0.18,  0, 0],

  // ── Forward-chest poses (mic / explaining) ───────────────────────────────
  // 25 — MIC_R: right hand holds mic at mouth level — arm forward+up, forearm bent up
  MIC_R:   [-0.55, 0.85,  1.28, 0.12,   0.05, -1.40,  0.00,  0.00,  0.00, 0.00,-0.20, 0.05,  0.12, 0.55,  0, 0],

  // 26 — MIC_BOTH: dramatic two-handed mic hold / presenter pose
  MIC_BOTH:[-0.72, 0.88,  0.72, 0.88,   0.08, -1.25, -0.08,  1.25, -0.08, 0.04,-0.08, 0.04,  0.30, 0.30,  0, 0],

  // 27 — OPEN_R: arm at side of chest, palm open forward
  OPEN_R:  [-0.80, 0.68,  1.28, 0.10,   0.12, -0.92,  0.05,  0.00,  0.00, 0.00, 0.12,-0.06,  0.06, 0.06,  0, 0],

  // 28 — OPEN_BOTH: both arms open at chest sides, palms forward — explaining big idea
  OPEN_BOTH:[-0.80, 0.60,  0.80, 0.60,   0.18, -0.88, -0.18,  0.88,  0.08, 0.00, 0.08, 0.00,  0.04, 0.04,  0, 0],

  // 29 — FRONT_BOTH: both arms directly in front of chest, elbows bent — "here's the thing"
  FRONT_BOTH:[-0.72, 0.95,  0.72, 0.95,   0.30, -1.30, -0.30,  1.30, -0.05, 0.04,-0.05, 0.04,  0.10, 0.10,  0, 0],

  // 30 — WAVE_R: right arm raised HIGH beside head, elbow bent, palm open toward camera
  //  rArm.rotation.y lerped via rArmYRef (→ 0.90 = supinate palm to camera); rHand wave animated in override
  WAVE_R:    [-1.30, 0.00, -0.82, 0.40,   0.00,  0.00,  0.10, 1.30, -0.35, 0.00, 0.08, 0.00,  0.10, 0.04,  0, 0],

  // 31 — REST_L: both arms hanging, clean neutral
  REST_L:    [-1.20, 0.08,  1.30, 0.05,   0.00,  0.10,  0.00, -0.06, -0.04, 0.00,-0.06, 0.00,  0.12, 0.14,  0, 0],

  // 32 — ARM_HUG: left hand gently rubs/holds right forearm at belly level (self-soothing)
  //   Right arm mostly down, forearm folded inward at belly.
  //   Left arm comes forward and across, open palm resting on right forearm.
  ARM_HUG:   [-0.92, 0.58,  1.02, 0.22,  -0.48, -0.42,  0.42,  0.62,   0.16, 0.12,-0.06, 0.04,  0.18, 0.28,  0, 0],

  // 33 — PALM_PRAY: both hands clasped palm-to-palm in front of chest, elbows clearly bent
  //   Both arms forward at chest height, elbows at ~90°, palms meet at center.
  PALM_PRAY: [-0.95, 0.72,  0.95, 0.72,   0.06, -0.82, -0.06,  0.82,   0.00, 0.14, 0.00,-0.14,  0.36, 0.36,  0, 0],
};

// ── Speaking pool: high energy, fast switch (1.2–2.0s) ─────────────────────
const SPEAK_POOL = [
  G.R_EXP,    G.BOTH,     G.BOTH,     G.L_EXP,    G.R_HIGH,
  G.CONV,     G.CONV,     G.COY,      G.SHRUG,    G.CHEST,
  G.POINT_R,  G.POINT_L,  G.COUNT,    G.PEACE,    G.BOTH_PT,
  G.PUSH,     G.SELF,     G.CHIN,     G.THINK_R,
  G.MIC_R,    G.MIC_BOTH, G.OPEN_R,   G.OPEN_BOTH,G.FRONT_BOTH,
  G.HOLD_SMALL, G.HOLD_LARGE, G.MEASURE_W, G.PRESENT_R,
];

// ── Idle pool: natural standing variation, slow switch (8–14s) ─────────────
// Rules: lArm_z must stay ≤ -0.88 (arm NOT horizontal/spread) for left arm.
// HAIR_L/HEAD_L/COY removed (lArm_z too high = left arm spreads out).
const IDLE_POOL = [
  G.REST,       G.REST_L,     G.WAIST,      G.CLASP_LOW,
  G.HIP_R,      G.HIP_L,      G.CLASP,      G.CLASP_LOW,
  G.WAVE_R,     G.WAVE_R,
  G.ARM_HUG,    G.PALM_PRAY,
];

// ─── Bone cache (populated once after VRM loads) ─────────────────────────────
interface BoneCache {
  hips:    THREE.Object3D | null;
  spine:   THREE.Object3D | null;
  chest:   THREE.Object3D | null;
  upper:   THREE.Object3D | null;
  neck:    THREE.Object3D | null;
  head:    THREE.Object3D | null;
  lSho:    THREE.Object3D | null;
  rSho:    THREE.Object3D | null;
  lArm:    THREE.Object3D | null;
  rArm:    THREE.Object3D | null;
  lFore:   THREE.Object3D | null;
  rFore:   THREE.Object3D | null;
  lHand:  THREE.Object3D | null;
  rHand:  THREE.Object3D | null;
  lUL:    THREE.Object3D | null;
  rUL:    THREE.Object3D | null;
  lLL:    THREE.Object3D | null;
  rLL:    THREE.Object3D | null;
  lFoot:  THREE.Object3D | null;
  rFoot:  THREE.Object3D | null;
  // fingers [proximal, intermediate, distal] × 4 fingers
  lF: Array<[THREE.Object3D|null, THREE.Object3D|null, THREE.Object3D|null]>;
  rF: Array<[THREE.Object3D|null, THREE.Object3D|null, THREE.Object3D|null]>;
  lThumb: THREE.Object3D | null;
  rThumb: THREE.Object3D | null;
}

function buildBoneCache(vrm: VRM): BoneCache {
  const h = vrm.humanoid;
  const g = (n: VRMHumanBoneName) => h.getNormalizedBoneNode(n);

  const lF = [
    [g(VRMHumanBoneName.LeftIndexProximal),  g(VRMHumanBoneName.LeftIndexIntermediate),  g(VRMHumanBoneName.LeftIndexDistal)],
    [g(VRMHumanBoneName.LeftMiddleProximal), g(VRMHumanBoneName.LeftMiddleIntermediate), g(VRMHumanBoneName.LeftMiddleDistal)],
    [g(VRMHumanBoneName.LeftRingProximal),   g(VRMHumanBoneName.LeftRingIntermediate),   g(VRMHumanBoneName.LeftRingDistal)],
    [g(VRMHumanBoneName.LeftLittleProximal), g(VRMHumanBoneName.LeftLittleIntermediate), g(VRMHumanBoneName.LeftLittleDistal)],
  ] as Array<[THREE.Object3D|null, THREE.Object3D|null, THREE.Object3D|null]>;

  const rF = [
    [g(VRMHumanBoneName.RightIndexProximal),  g(VRMHumanBoneName.RightIndexIntermediate),  g(VRMHumanBoneName.RightIndexDistal)],
    [g(VRMHumanBoneName.RightMiddleProximal), g(VRMHumanBoneName.RightMiddleIntermediate), g(VRMHumanBoneName.RightMiddleDistal)],
    [g(VRMHumanBoneName.RightRingProximal),   g(VRMHumanBoneName.RightRingIntermediate),   g(VRMHumanBoneName.RightRingDistal)],
    [g(VRMHumanBoneName.RightLittleProximal), g(VRMHumanBoneName.RightLittleIntermediate), g(VRMHumanBoneName.RightLittleDistal)],
  ] as Array<[THREE.Object3D|null, THREE.Object3D|null, THREE.Object3D|null]>;

  const cache: BoneCache = {
    hips:  g(VRMHumanBoneName.Hips),
    spine: g(VRMHumanBoneName.Spine),
    chest: g(VRMHumanBoneName.Chest),
    upper: g(VRMHumanBoneName.UpperChest),
    neck:  g(VRMHumanBoneName.Neck),
    head:  g(VRMHumanBoneName.Head),
    lSho:  g(VRMHumanBoneName.LeftShoulder),
    rSho:  g(VRMHumanBoneName.RightShoulder),
    lArm:  g(VRMHumanBoneName.LeftUpperArm),
    rArm:  g(VRMHumanBoneName.RightUpperArm),
    lFore: g(VRMHumanBoneName.LeftLowerArm),
    rFore: g(VRMHumanBoneName.RightLowerArm),
    lHand: g(VRMHumanBoneName.LeftHand),
    rHand: g(VRMHumanBoneName.RightHand),
    lUL:   g(VRMHumanBoneName.LeftUpperLeg),
    rUL:   g(VRMHumanBoneName.RightUpperLeg),
    lLL:   g(VRMHumanBoneName.LeftLowerLeg),
    rLL:   g(VRMHumanBoneName.RightLowerLeg),
    lFoot: g(VRMHumanBoneName.LeftFoot),
    rFoot: g(VRMHumanBoneName.RightFoot),
    lF, rF,
    lThumb: g(VRMHumanBoneName.LeftThumbProximal),
    rThumb: g(VRMHumanBoneName.RightThumbProximal),
  };

  console.log("[SatomiVRM] bones:", {
    body:   { hips:!!cache.hips, spine:!!cache.spine, chest:!!cache.chest, head:!!cache.head },
    arms:   { lArm:!!cache.lArm, rArm:!!cache.rArm, lFore:!!cache.lFore, rFore:!!cache.rFore },
    legs:   { lUL:!!cache.lUL, rUL:!!cache.rUL, lLL:!!cache.lLL, rLL:!!cache.rLL },
    fingers:{ lF0:!!lF[0][0], rF0:!!rF[0][0], lThumb:!!cache.lThumb, rThumb:!!cache.rThumb },
  });

  return cache;
}

// ─── Main canvas component ────────────────────────────────────────────────────
function SatomiVRMCanvas({ mouthState, isSpeaking, emotion, hasNewTrigger, overrideGesture, onWave }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const vrmRef       = useRef<VRM | null>(null);
  const bonesRef     = useRef<BoneCache | null>(null);
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null);
  const clockRef     = useRef(new THREE.Clock());
  const rafRef       = useRef<number | null>(null);

  const [loadState,    setLoadState]    = useState<"loading"|"loaded"|"error">("loading");
  const [loadProgress, setLoadProgress] = useState(0);

  // Live refs (avoid stale closures in RAF)
  const emotionRef         = useRef(emotion);
  const mouthRef           = useRef(mouthState);
  const speakingRef        = useRef(isSpeaking);
  const overrideGestureRef = useRef(overrideGesture);
  const onWaveRef          = useRef(onWave);
  emotionRef.current         = emotion;
  mouthRef.current           = mouthState;
  speakingRef.current        = isSpeaking;
  overrideGestureRef.current = overrideGesture;
  onWaveRef.current          = onWave;

  // Blink + expression state
  const blinkRef     = useRef({ value: 0, countdown: 3.5, blinking: false });
  const exprTargetRef  = useRef<Record<string, number>>({});
  const exprCurrentRef = useRef<Record<string, number>>({});

  // Arm lerp state — 14-value arrays matching gesture format
  const armTargetRef  = useRef([...G.WAIST]);
  const armCurrentRef = useRef([...G.WAIST]);
  const rArmYRef      = useRef(0); // lerped rArm.rotation.y (0 = rest, 0.90 = WAVE_R supination)
  const gestureRef    = useRef({
    // speaking gesture state
    idx: 0, timer: 0, switchAt: 1.4,
    // idle pose state (separate slower cycle)
    idleIdx: 0, idleTimer: 0, idleSwitch: 9.0,
  });

  // ── Expression update on emotion change ──────────────────────────────────
  useEffect(() => {
    const vrm = vrmRef.current;
    if (!vrm) return;
    const mapping = EMOTION_TO_EXPR[emotion];
    const exprName  = mapping?.expr;
    const intensity = mapping?.intensity ?? 1.0;
    const allPresets = [
      VRMExpressionPresetName.Happy,
      VRMExpressionPresetName.Sad,
      VRMExpressionPresetName.Angry,
      VRMExpressionPresetName.Surprised,
      VRMExpressionPresetName.Relaxed,
      VRMExpressionPresetName.Neutral,
    ];
    const targets: Record<string, number> = {};
    for (const p of allPresets) targets[p] = p === exprName ? intensity : 0;
    exprTargetRef.current = targets;
  }, [emotion]);

  // ── Reset speaking gesture state when speech begins (immediate gesture change) ──
  useEffect(() => {
    if (isSpeaking) {
      const gs = gestureRef.current;
      gs.timer   = gs.switchAt;  // force immediate switch on first frame
      gs.idx     = Math.floor(Math.random() * SPEAK_POOL.length);
    }
  }, [isSpeaking]);

  // ── Scene setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch {
      setLoadState("error");
      return;
    }
    const initW = containerRef.current?.clientWidth  || 600;
    const initH = containerRef.current?.clientHeight || 900;
    renderer.setSize(initW, initH);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    // Ambient: cool blue-purple matching neon street
    scene.add(new THREE.AmbientLight(0xb0a0ff, 0.55));
    // Key: slightly warm front-top
    const key  = new THREE.DirectionalLight(0xfff4ff, 1.1); key.position.set(0.6, 2.5, 2.5); scene.add(key);
    // Fill: neon pink/magenta from left (matches neon signs)
    const fill = new THREE.DirectionalLight(0xff60cc, 0.45); fill.position.set(-2, 1, 1); scene.add(fill);
    // Rim: cyan/teal from behind-right
    const rim  = new THREE.DirectionalLight(0x40e0ff, 0.50); rim.position.set(1.5, 2, -2); scene.add(rim);
    // Ground bounce: purple glow from below (street reflections)
    const ground = new THREE.DirectionalLight(0x7030ff, 0.30); ground.position.set(0, -1, 1); scene.add(ground);

    const camera = new THREE.PerspectiveCamera(30, initW / initH, 0.01, 100);
    cameraRef.current = camera;
    camera.position.set(0, 0.85, 3.5);
    camera.lookAt(0, 0.85, 0);

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      import.meta.env.BASE_URL + "satomi-model.vrm",
      (gltf) => {
        const vrm: VRM = gltf.userData.vrm;
        if (!vrm) { setLoadState("error"); return; }
        vrmRef.current = vrm;
        bonesRef.current = buildBoneCache(vrm);

        const meta = (vrm as any).meta;
        const specVer = meta?.specVersion ?? meta?.exporterVersion ?? "0.x";
        const isVrm1  = String(specVer).startsWith("1.");
        console.log("[SatomiVRM] version:", specVer, "isVrm1:", isVrm1);
        vrm.scene.rotation.y = isVrm1 ? Math.PI : 0;

        const box = new THREE.Box3().setFromObject(vrm.scene);
        const h   = box.max.y - box.min.y;
        vrm.scene.position.y = -box.min.y;
        // midY=0.52 → center of view is at 52% of body height (character lower in frame)
        // dist multiplier=1.20 → visible range = 1.2h, bottom=-0.15h (ground), top=1.05h (just above head)
        const midY = h * 0.52;
        const dist = (h * 1.20) / (2 * Math.tan((30 * Math.PI / 180) / 2));
        camera.position.set(0, midY, dist);
        camera.lookAt(0, midY, 0);
        console.log("[SatomiVRM] height:", h.toFixed(2), "dist:", dist.toFixed(2));

        scene.add(vrm.scene);
        initExprs(vrm);
        setLoadState("loaded");
      },
      (prog) => setLoadProgress(Math.round((prog.loaded / (prog.total || 1)) * 100)),
      () => setLoadState("error"),
    );

    // ── Animate loop ─────────────────────────────────────────────────────
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const delta   = Math.min(clockRef.current.getDelta(), 0.05);
      const elapsed = clockRef.current.getElapsedTime();
      const vrm = vrmRef.current;
      const bones = bonesRef.current;
      if (vrm && bones) {
        const em = emotionRef.current;
        if (em === "dance") {
          applyDance(bones, elapsed, delta);
        } else {
          applyIdle(bones, elapsed, delta);
          applyGesture(em, elapsed, delta);
        }
        applyExpressions(vrm, delta);
        applyLipSync(vrm, mouthRef.current);
        applyBlink(vrm, delta);
        vrm.update(delta);
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      renderer.dispose();
      vrmRef.current?.scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          (Array.isArray(m.material) ? m.material : [m.material]).forEach(mat => mat?.dispose());
        }
      });
    };
  }, []);

  // ── ResizeObserver: keep canvas/renderer matched to container ────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        const h = Math.floor(entry.contentRect.height);
        if (w < 10 || h < 10) return;
        rendererRef.current?.setSize(w, h);
        const cam = cameraRef.current;
        if (cam) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // ════════════════════════════════════════════════════════════════════════
  //  INIT EXPRESSIONS
  // ════════════════════════════════════════════════════════════════════════
  function initExprs(vrm: VRM) {
    const em = vrm.expressionManager;
    if (!em) return;
    const presets = [
      VRMExpressionPresetName.Happy, VRMExpressionPresetName.Sad,
      VRMExpressionPresetName.Angry, VRMExpressionPresetName.Surprised,
      VRMExpressionPresetName.Relaxed, VRMExpressionPresetName.Neutral,
    ];
    for (const p of presets) {
      em.setValue(p, 0);
      exprCurrentRef.current[p] = 0;
    }
    for (const v of ["aa","ih","ou","ee","oh"]) {
      try { em.setValue(v, 0); } catch { /**/ }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  IDLE LAYER — full body breathing, sway, micro-motion
  //  Runs every frame. Sets head, spine, hips, legs.
  //  Arms are handled by applyGesture.
  // ════════════════════════════════════════════════════════════════════════
  function applyIdle(b: BoneCache, t: number, _delta: number) {
    // ── Breathing ──────────────────────────────────────────────────────
    const breath    = Math.sin(t * 0.85) * 0.030;
    const breathSlow= Math.sin(t * 0.42) * 0.012;

    // ── Body bow (menunduk) — slow periodic forward lean ──────────────
    // Peaks briefly every ~63s, gives natural thoughtful-bow feeling
    const bowAmt = Math.max(0, Math.sin(t * 0.10) - 0.70) * 0.55;

    if (b.spine) {
      b.spine.rotation.x = breath + 0.005 + bowAmt * 0.55;
      b.spine.rotation.y = Math.sin(t * 0.28) * 0.018;
      b.spine.rotation.z = Math.sin(t * 0.35) * 0.010;
    }
    if (b.chest) {
      b.chest.rotation.x = breath * 0.75 + bowAmt * 0.35;
      b.chest.rotation.z = Math.sin(t * 0.32) * 0.008;
    }
    if (b.upper) {
      b.upper.rotation.x = breath * 0.50 + breathSlow + bowAmt * 0.20;
      b.upper.rotation.z = Math.sin(t * 0.29) * 0.006;
    }

    // ── Head & Neck — natural micro-sway ───────────────────────────────
    const headY = Math.sin(t * 0.32) * 0.12 + Math.sin(t * 0.17) * 0.04;
    const headX = Math.sin(t * 0.24) * 0.04 + breath * 0.5 - 0.04 + bowAmt * 0.30;
    const headZ = Math.sin(t * 0.27) * 0.05;

    if (b.head) {
      b.head.rotation.y = headY;
      b.head.rotation.x = headX;
      b.head.rotation.z = headZ;
    }
    if (b.neck) {
      b.neck.rotation.y = headY * 0.35;
      b.neck.rotation.x = headX * 0.45 + breath * 0.3;
      b.neck.rotation.z = headZ * 0.30;
    }

    // ── Leg stepping — alternating weight-shift / shuffle ─────────────
    // stepT cycles at natural walking idle pace (~7s per full cycle)
    const stepT    = t * 0.90;
    const stepL    = Math.sin(stepT);                        // left leg phase
    const stepR    = Math.sin(stepT + Math.PI);              // right leg (opposite)
    const stepLift = 0.18;                                   // upper leg lift amount
    const kneeBend = 0.12;                                   // lower leg bend

    // Hips shift opposite to lifting leg (weight transfer)
    const hipStep = Math.sin(stepT * 0.5) * 0.045;
    if (b.hips) {
      b.hips.rotation.y = Math.sin(t * 0.38) * 0.022;
      b.hips.rotation.z = Math.sin(t * 0.46) * 0.014 + hipStep;
      b.hips.rotation.x = Math.abs(breath) * 0.02 + bowAmt * 0.10;
    }

    if (b.lUL) {
      b.lUL.rotation.z =  hipStep * 0.5;
      b.lUL.rotation.x =  stepL * stepLift;   // forward/back swing
    }
    if (b.rUL) {
      b.rUL.rotation.z = -hipStep * 0.5;
      b.rUL.rotation.x =  stepR * stepLift;
    }
    // Knee bends when leg swings back (natural gait)
    if (b.lLL) b.lLL.rotation.x = Math.max(0, -stepL) * kneeBend;
    if (b.rLL) b.rLL.rotation.x = Math.max(0, -stepR) * kneeBend;
    // Foot angles to match leg phase
    if (b.lFoot) b.lFoot.rotation.x =  stepL * 0.06;
    if (b.rFoot) b.rFoot.rotation.x =  stepR * 0.06;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  GESTURE / ARM LAYER
  //  Lerps arms toward target gesture, applies on top of idle.
  //  Also handles emotion-specific head/spine modifiers.
  // ════════════════════════════════════════════════════════════════════════
  function applyGesture(em: Emotion, t: number, delta: number) {
    const b   = bonesRef.current;
    if (!b) return;
    const gs  = gestureRef.current;

    // ── Choose arm target based on emotion ─────────────────────────────
    if (em === "idle") {
      // Slow natural variation while not speaking
      gs.idleTimer += delta;
      if (gs.idleTimer >= gs.idleSwitch) {
        gs.idleTimer  = 0;
        gs.idleIdx    = Math.floor(Math.random() * IDLE_POOL.length);
        // Wave is short (2.5–4 s), normal poses are longer (7–12 s)
        gs.idleSwitch = IDLE_POOL[gs.idleIdx] === G.WAVE_R
          ? 2.5 + Math.random() * 1.5
          : 7.0 + Math.random() * 5.0;
        // Trigger lipsync when wave is selected
        if (IDLE_POOL[gs.idleIdx] === G.WAVE_R && !speakingRef.current) {
          onWaveRef.current?.();
        }
      }
      armTargetRef.current = [...IDLE_POOL[gs.idleIdx]];

    } else if (em === "speaking") {
      // AI-provided gesture takes priority — keeps pose consistent with spoken content
      const aiKey = overrideGestureRef.current;
      const aiPose = aiKey ? G[aiKey as keyof typeof G] : null;
      if (aiPose) {
        armTargetRef.current = [...aiPose];
      } else {
        gs.timer += delta;
        if (gs.timer >= gs.switchAt) {
          gs.timer = 0;
          let next = gs.idx;
          while (next === gs.idx) next = Math.floor(Math.random() * SPEAK_POOL.length);
          gs.idx      = next;
          gs.switchAt = 1.2 + Math.random() * 0.8;
        }
        armTargetRef.current = [...SPEAK_POOL[gs.idx]];
      }

      // Head nods slightly while speaking
      if (b.head) b.head.rotation.x += Math.sin(t * 2.5) * 0.018 - 0.02;

    } else if (em === "excited") {
      const w = Math.sin(t * 5.2) * 0.25;
      armTargetRef.current = [-0.55+w, 0.80, 0.55-w, 0.80, 0.28,-0.60,-0.28, 0.60, 0, 0, 0, 0, 0.05, 0.05, 0, 0];
      if (b.spine) b.spine.rotation.y += Math.sin(t * 4.5) * 0.05;

    } else if (em === "happy") {
      const bob = Math.sin(t * 2.2) * 0.06;
      armTargetRef.current = [-1.02+bob, 0.16, 1.02-bob, 0.16, 0.08,-0.52,-0.08, 0.52, 0.08, 0, 0.08, 0, 0.06, 0.06, 0, 0];

    } else if (em === "sad") {
      armTargetRef.current = [-1.50, 0.04, 1.50, 0.04, 0, 0, 0, 0, 0, 0, 0, 0, 0.30, 0.30, 0, 0];
      if (b.head)  b.head.rotation.x  -= 0.14;
      if (b.spine) b.spine.rotation.x -= 0.06;
      if (b.chest) b.chest.rotation.x -= 0.04;

    } else if (em === "angry") {
      const shake = Math.sin(t * 15) * 0.015;
      armTargetRef.current = [-1.10+shake, 0.14, 1.10+shake, 0.14, 0,-0.12, 0, 0.12,-0.20, 0,-0.20, 0, 0.72, 0.72, 0, 0];
      if (b.head) b.head.rotation.y += shake * 3.0;

    } else if (em === "surprised") {
      armTargetRef.current = [-0.62, 0.85, 0.62, 0.85, 0.32,-0.88,-0.32, 0.88, 0.14, 0.10, 0.14,-0.10, 0.08, 0.08, 0, 0];

    } else if (em === "thinking") {
      // right hand toward chin — strongly forward
      armTargetRef.current = [-1.26, 0.10, 0.80, 0.92, 0, 0, 0, 1.42, 0, 0,-0.24, 0.14, 0.14, 0.55, 0, 1];
      if (b.head) b.head.rotation.z += 0.08;

    } else if (em === "very_happy") {
      const bounce = Math.sin(t * 3.8) * 0.10;
      armTargetRef.current = [-0.26+bounce, 0.85, 0.26-bounce, 0.85, 0.70,-1.25,-0.70, 1.25, 0.12, 0.00, 0.12, 0.00, 0.04, 0.04, 0, 0];
      if (b.spine) b.spine.rotation.x += Math.sin(t * 3.8) * 0.04;
      if (b.hips)  b.hips.rotation.y  += Math.sin(t * 4.0) * 0.03;

    } else if (em === "hype") {
      const pump = Math.sin(t * 6.0) * 0.18;
      armTargetRef.current = [-1.05, 0.22, 0.26+pump, 0.92-pump*0.3, 0.00, 0.00,-0.05, 0.48, 0.00, 0.00, 0.12,-0.10, 0.12, 0.68, 0, 0];
      if (b.spine) b.spine.rotation.y += Math.sin(t * 3.5) * 0.04;

    } else if (em === "savage") {
      // Right hand raised, strongly forward — "are you serious?"
      armTargetRef.current = [-1.25, 0.10, 0.88, 0.80, 0.00, 0.00,-0.06, 0.75, 0.00, 0.00, 0.10,-0.05, 0.15, 0.55, 0, 1];
      if (b.head) { b.head.rotation.z += 0.10; b.head.rotation.y += Math.sin(t * 0.4) * 0.04; }

    } else if (em === "disgusted") {
      // Push hand out STRONGLY forward (stop / ew)
      armTargetRef.current = [-1.30, 0.10, 0.70, 1.00, 0.00, 0.00,-0.05, 0.80, 0.00, 0.00, 0.30, 0.00, 0.04, 0.04, 0, 0];
      if (b.head) b.head.rotation.y -= 0.15;

    } else if (em === "proud") {
      // Left hand at chest, strongly forward — proud/sincere
      armTargetRef.current = [-0.48, 0.82, 1.30, 0.08,-0.30,-0.80, 0.00, 0.00,-0.18, 0.14, 0.00, 0.00, 0.10, 0.12, 0, 0];
      if (b.spine) b.spine.rotation.x -= 0.04;

    } else if (em === "flirty") {
      // Left hand near face, swept strongly forward
      armTargetRef.current = [-0.44, 0.90, 1.20, 0.08,-0.42,-1.10, 0.00, 0.28,-0.18, 0.20, 0.08, 0.00, 0.08, 0.18, 0, 0];
      if (b.head) { b.head.rotation.z += 0.08; b.head.rotation.y += Math.sin(t * 0.6) * 0.06; }

    } else if (em === "empathetic") {
      // Both hands open forward at chest level — welcoming energy
      armTargetRef.current = [-0.58, 0.70, 0.58, 0.70, 0.22,-0.68,-0.22, 0.68, 0.08, 0.00, 0.08, 0.00, 0.06, 0.06, 0, 0];
      if (b.head)  b.head.rotation.x  -= 0.08;
      if (b.spine) b.spine.rotation.x -= 0.03;

    } else if (em === "curious") {
      // Right hand toward chin, strongly forward — listening intently
      armTargetRef.current = [-1.26, 0.10, 0.72, 0.92, 0.00, 0.00, 0.00, 1.35, 0.00, 0.00,-0.20, 0.12, 0.12, 0.52, 0, 1];
      if (b.head) { b.head.rotation.x -= 0.06; b.head.rotation.y += Math.sin(t * 0.5) * 0.06; }

    } else if (em === "confused") {
      // Shrug + head tilt — arms spread, slight forward
      armTargetRef.current = [-1.00, 0.28, 1.00, 0.28, 0.08,-0.18,-0.08, 0.18,-0.22, 0.00,-0.22, 0.00, 0.18, 0.18, 0, 0];
      if (b.head) { b.head.rotation.z += 0.14; b.head.rotation.y += 0.08; }

    } else if (em === "philosophical") {
      // Open hands, slow motion, contemplative — arms forward and open
      const slow = Math.sin(t * 0.8) * 0.08;
      armTargetRef.current = [-0.85+slow, 0.60, 0.85-slow, 0.60, 0.24,-0.72,-0.24, 0.72, 0.06, 0.00, 0.06, 0.00, 0.06, 0.06, 0, 0];
      if (b.head) b.head.rotation.y += Math.sin(t * 0.45) * 0.08;

    } else if (em === "serious") {
      // Index up "one important thing" — arm strongly forward
      armTargetRef.current = [-1.30, 0.10, 0.28, 1.00, 0.00, 0.00,-0.05, 0.48, 0.00, 0.00, 0.12,-0.10, 0.12, 0.80, 0, 1];
      if (b.head)  b.head.rotation.x  -= 0.04;
      if (b.spine) b.spine.rotation.x -= 0.02;

    } else if (em === "dance") {
      // handled by applyDance
    }
    // All other cases: armTargetRef was already set by emotion-specific branch above
    // (idle is handled at the top, unknown emotions keep last target)

    // ── Lerp arm current → target (all 16 values) ──────────────────────
    // Idle: slow fluid transitions; speaking/emotion: snappy
    const speed  = em === "idle" ? 2.8 : em === "speaking" ? 7.0 : 6.0;
    const tgt    = armTargetRef.current;
    const cur    = armCurrentRef.current;
    const jitter = speakingRef.current ? Math.sin(t * 7.5) * 0.010 : 0;

    for (let i = 0; i < 16; i++) {
      cur[i] += ((tgt[i] ?? 0) - cur[i]) * Math.min(delta * speed, 1);
    }

    // Micro-sway: breathing-synced arm float + jitter during speech
    const breathSway = Math.sin(t * 0.85) * 0.012;
    const armSway    = em === "idle" ? breathSway : jitter;

    // ── AXIS LAW (VRM 0.x, empirically confirmed) ───────────────────────────
    // UpperArm:  L z NEG = down | R z POS = down | both x POS = forward
    // LowerArm:  x sign is OPPOSITE to gesture storage:
    //            LeftLowerArm  x POS = elbow toward cam  → apply -cur[5]  (negate stored value)
    //            RightLowerArm x NEG = elbow toward cam  → apply -cur[7]  (negate stored value)
    // rotation.y (twist): POS = palm toward camera, NEG = palm behind body

    // Shoulder — natural 3-axis movement like human shoulder
    // elevation: shoulder lifts when arm is raised above natural hang (-1.30 / +1.30)
    const lElev = Math.max(0, cur[0] + 1.30);  // 0 at natural hang, positive when raised
    const rElev = Math.max(0, 1.30 - cur[2]);  // 0 at natural hang, positive when raised
    if (b.lSho) {
      b.lSho.rotation.x =  cur[1] * 0.14;              // protraction: leans forward with arm
      b.lSho.rotation.y =  cur[1] * 0.10;              // horizontal sweep with arm forward
      b.lSho.rotation.z =  lElev  * 0.18 + breathSway * 0.4; // elevation + breathing sway
    }
    if (b.rSho) {
      b.rSho.rotation.x =  cur[3] * 0.14;              // protraction: leans forward with arm
      b.rSho.rotation.y = -cur[3] * 0.10;              // horizontal sweep with arm forward
      b.rSho.rotation.z = -(rElev * 0.18) - breathSway * 0.4; // elevation + breathing sway
    }

    // Upper arm — lerp rArm.rotation.y smoothly (0 = rest, 0.90 = WAVE_R supination)
    const targetRArmY = (em === "idle" && IDLE_POOL[gs.idleIdx] === G.WAVE_R) ? 0.90 : 0.0;
    rArmYRef.current += (targetRArmY - rArmYRef.current) * Math.min(delta * 4.0, 1);

    if (b.lArm) { b.lArm.rotation.z = cur[0] - armSway; b.lArm.rotation.x = +cur[1]; b.lArm.rotation.y = 0; }
    if (b.rArm) { b.rArm.rotation.z = cur[2] + armSway; b.rArm.rotation.x = +cur[3]; b.rArm.rotation.y = rArmYRef.current; }

    // Forearm — x NEGATED: lFore x POS = elbow toward cam, rFore x NEG = elbow toward cam
    if (b.lFore) { b.lFore.rotation.z = -cur[4]; b.lFore.rotation.x = -cur[5] + breathSway * 0.5; b.lFore.rotation.y = 0; }
    if (b.rFore) { b.rFore.rotation.z = -cur[6]; b.rFore.rotation.x = -cur[7] + breathSway * 0.5; b.rFore.rotation.y = 0; }

    // Hand
    if (b.lHand) { b.lHand.rotation.x = cur[8];  b.lHand.rotation.y = 0; b.lHand.rotation.z = cur[9]  + breathSway * 0.3; }
    if (b.rHand) { b.rHand.rotation.x = cur[10]; b.rHand.rotation.y = 0; b.rHand.rotation.z = cur[11] - breathSway * 0.3; }

    // ── WAVE_R: rArm & rFore handled by lerp (gesture array values match target)
    // Only rHand needs override for the waving animation
    if (em === "idle" && IDLE_POOL[gs.idleIdx] === G.WAVE_R) {
      if (b.rHand) {
        b.rHand.rotation.x = 0.45 + Math.sin(t * 7.0) * 0.42;
        b.rHand.rotation.y =  0;
        b.rHand.rotation.z = -0.25;
      }
    }

    // Fingers
    applyFingers(b, cur[12], cur[13], cur[14], cur[15]);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  FINGER CONTROL
  //  curl: 0=open palm, 1=fist  (applied to non-extended fingers)
  //  ext:  0=all curl  1=index extended (POINT)  2=index+mid (PEACE)  3=thumb (THUMBS UP)
  // ════════════════════════════════════════════════════════════════════════
  function applyFingers(b: BoneCache, lCurl: number, rCurl: number, lExt: number, rExt: number) {
    // lF[0]=index lF[1]=middle lF[2]=ring lF[3]=little
    const applyHand = (
      fingers: BoneCache["lF"],
      thumb: THREE.Object3D | null,
      curl: number,
      ext: number,
      sign: 1 | -1,       // +1 = right (positive z curls), -1 = left (negative z curls)
    ) => {
      const extMode = Math.round(ext); // snap to integer for mode selection

      for (let fi = 0; fi < 4; fi++) {
        const [p, m, d] = fingers[fi];
        // Determine how much THIS finger curls
        let fc = curl;
        if (extMode === 1 && fi === 0) fc = 0;               // POINT: index straight
        if (extMode === 2 && fi <= 1)  fc = 0;               // PEACE: index+middle straight
        if (extMode === 3)             fc = curl * 0.95;     // THUMBS UP: all fingers curl

        if (p) p.rotation.z = sign * fc * 0.92;
        if (m) m.rotation.z = sign * fc * 1.00;
        if (d) d.rotation.z = sign * fc * 0.78;
      }

      // Thumb
      if (thumb) {
        if (extMode === 3) {
          // Thumbs up: thumb points up, barely rotated
          thumb.rotation.z = sign * 0.08;
          thumb.rotation.y = sign * 0.10;
        } else {
          thumb.rotation.z = sign * curl * 0.40;
          thumb.rotation.y = sign * curl * 0.30;
        }
      }
    };

    applyHand(b.lF, b.lThumb, lCurl, lExt, -1);
    applyHand(b.rF, b.rThumb, rCurl, rExt,  1);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  DANCE MODE — full body takes over, overrides idle + gesture
  // ════════════════════════════════════════════════════════════════════════
  function applyDance(b: BoneCache, t: number, _delta: number) {
    const beat  = t * 3.0;
    const beat2 = t * 1.5;
    const s = Math.sin, c = Math.cos;

    // Hips drives the whole body
    if (b.hips) {
      b.hips.rotation.y = s(beat)  * 0.24;
      b.hips.rotation.z = s(beat2) * 0.08;
      b.hips.rotation.x = Math.abs(s(beat)) * 0.05;
    }
    // Spine counter-rotates
    if (b.spine) { b.spine.rotation.y = -s(beat) * 0.14; b.spine.rotation.z = s(beat2) * 0.05; b.spine.rotation.x = 0.02; }
    if (b.chest) { b.chest.rotation.y = -s(beat) * 0.09; b.chest.rotation.z = s(beat2 + 0.6) * 0.04; }
    if (b.upper) { b.upper.rotation.y = -s(beat) * 0.06; b.upper.rotation.x = Math.abs(s(beat2)) * 0.02; }

    // Head bobs and sways with music
    if (b.head) {
      b.head.rotation.y = s(beat * 0.5) * 0.14;
      b.head.rotation.x = s(beat) * 0.07 - 0.03;
      b.head.rotation.z = s(beat2) * 0.07;
    }
    if (b.neck) {
      b.neck.rotation.y = s(beat * 0.5) * 0.07;
      b.neck.rotation.x = s(beat) * 0.04;
    }

    // Shoulders bob (OK in dance — adds energy)
    if (b.lSho) b.lSho.rotation.z = s(beat + Math.PI) * 0.12;
    if (b.rSho) b.rSho.rotation.z = s(beat) * 0.12;

    // Arms wave in alternating phase — negative rotation.y = forward for BOTH arms
    if (b.lArm) { b.lArm.rotation.z = -0.68 + s(beat + Math.PI) * 0.42; b.lArm.rotation.y = -(0.16 + s(beat2) * 0.12); b.lArm.rotation.x = 0; }
    if (b.rArm) { b.rArm.rotation.z =  0.68 - s(beat) * 0.42;           b.rArm.rotation.y = -(0.16 + s(beat2 + Math.PI) * 0.12); b.rArm.rotation.x = 0; }

    // Elbows bent forward and bouncing
    if (b.lFore) { b.lFore.rotation.z =  0.32 + s(beat + Math.PI) * 0.18; b.lFore.rotation.x = -0.62 + s(beat2) * 0.12; }
    if (b.rFore) { b.rFore.rotation.z = -0.32 - s(beat) * 0.18;           b.rFore.rotation.x =  0.62 + s(beat2 + Math.PI) * 0.12; }

    // Wrists groove
    if (b.lHand) { b.lHand.rotation.z =  s(beat * 1.3) * 0.20; b.lHand.rotation.x = 0.10; }
    if (b.rHand) { b.rHand.rotation.z = -s(beat * 1.3) * 0.20; b.rHand.rotation.x = 0.10; }

    // Fingers open while dancing
    applyFingers(b, 0.10, 0.10, 0, 0);

    // Legs step in rhythm
    if (b.lUL) { b.lUL.rotation.z = s(beat) * 0.10; b.lUL.rotation.x = s(beat) * 0.07; }
    if (b.rUL) { b.rUL.rotation.z = -s(beat) * 0.10; b.rUL.rotation.x = -s(beat) * 0.07; }
    if (b.lLL) b.lLL.rotation.x = Math.max(0, s(beat + Math.PI) * 0.18);
    if (b.rLL) b.rLL.rotation.x = Math.max(0, s(beat) * 0.18);
    if (b.lFoot) { b.lFoot.rotation.x = s(beat) * 0.10; b.lFoot.rotation.z = c(beat2) * 0.04; }
    if (b.rFoot) { b.rFoot.rotation.x = -s(beat) * 0.10; b.rFoot.rotation.z = -c(beat2) * 0.04; }

    // Keep arm lerp state somewhat in sync for smooth dance exit
    const cur = armCurrentRef.current;
    cur[0] += (-0.68 - cur[0]) * 0.05;
    cur[2] += ( 0.68 - cur[2]) * 0.05;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  EXPRESSIONS, LIP SYNC, BLINK
  // ════════════════════════════════════════════════════════════════════════
  function applyExpressions(vrm: VRM, delta: number) {
    const em = vrm.expressionManager;
    if (!em) return;
    const target  = exprTargetRef.current;
    const current = exprCurrentRef.current;
    for (const key of Object.keys(target)) {
      const tgt  = target[key] ?? 0;
      const cur  = current[key] ?? 0;
      const next = cur + (tgt - cur) * Math.min(delta * 4, 1);
      current[key] = next;
      try { em.setValue(key as VRMExpressionPresetName, next); } catch { /**/ }
    }
  }

  function applyLipSync(vrm: VRM, mouth: MouthState) {
    const em = vrm.expressionManager;
    if (!em) return;
    const vis = MOUTH_TO_VISEME[mouth];
    try { em.setValue("aa", vis.aa); } catch { /**/ }
    try { em.setValue("oh", vis.oh); } catch { /**/ }
    try { em.setValue("ee", vis.ee); } catch { /**/ }
  }

  function applyBlink(vrm: VRM, delta: number) {
    const em = vrm.expressionManager;
    if (!em) return;
    const bs = blinkRef.current;
    bs.countdown -= delta;
    if (bs.countdown <= 0) {
      bs.blinking  = true;
      bs.value     = 1;
      bs.countdown = 3 + Math.random() * 4;
    }
    if (bs.blinking) {
      bs.value = Math.max(0, bs.value - delta * 12);
      if (bs.value <= 0) bs.blinking = false;
    }
    try { em.setValue(VRMExpressionPresetName.Blink, bs.value); } catch { /**/ }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="relative w-full h-full">
      {loadState === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-purple-300 font-mono text-sm">{loadProgress}%</p>
          <p className="text-purple-400/60 font-mono text-xs">Loading 3D Model…</p>
        </div>
      )}
      {loadState === "error" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-red-400 font-mono text-xs text-center px-4">
            Failed to load VRM model.<br />Place satomi-model.vrm in public/
          </p>
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          background: "transparent",
          opacity: loadState === "loaded" ? 1 : 0,
          transition: "opacity 0.5s ease",
        }}
      />
    </div>
  );
}
