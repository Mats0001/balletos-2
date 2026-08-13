/**
 * skeletonCanvasRenderer.ts
 * 
 * Pure Canvas 2D drawing engine for the Vaganova skeleton overlay.
 * Replaces SVG rendering for buttery-smooth 60fps performance.
 * All drawing uses the 0-1000 viewbox coordinate system.
 */

import { ReconstructedSkeleton, KinematicPoint } from './vaganova3DKinematics';
import { vaganovaKineticAI } from './vaganovaKineticAI';
import { vaganovaArmAnalyzer, ArmPositionResult, ElbowAnalysis, EpaulementResult } from './vaganovaArmAnalyzer';
import { vaganovaFootAnalyzer, SickleWingResult, WeightDistributionResult } from './vaganovaFootAnalyzer';
import { VaganovaFullAnalysis } from './vaganovaAngleCalculator';
import {
  TeacherOverlayPacket,
  heuristicColor,
  heuristicDash,
} from '../types/teacherHeuristic';
import type { TeacherHeuristicState } from '../types/teacherHeuristic';
import type { GroundedGuideFrameContext, GroundedTeacherGuide } from '../types/groundedTeacherDraft';
import { isGroundedTeacherGuideCurrent } from './groundedTeacherDraftEngine';
import { getSkeletonTarget, getSkeletonTargetPoints, isSkeletonPointUsable, isSkeletonTargetGeometryUsable } from './skeletonTargetRegistry';
import type { SelectedSkeletonTarget, SkeletonTargetFrameContext } from '../types/skeletonTarget';
import type { NicoleReferenceFrameContext, NicoleReferenceLineGuide } from '../types/nicoleReferenceLine';
import { isNicoleReferenceGuideCurrent } from './nicoleReferenceLine';

// ─── ANATOMISCHE FARBPALETTE (Berater 2026-08-10 – Sprint 1) ───
// Farben kodieren Körperregionen, KEIN Status-Urteil.
// Ampelfarben (Grün/Rot) dürfen erst aus einer authorisierten MetricDecision (DecisionGate) kommen.
// Confidence wird über globalAlpha dargestellt (0.3–1.0).
const COLOR_SPINE    = '#64d2ff';   // cyan – Wirbelsäule
const COLOR_ARM      = '#c084fc';   // violett – Arme & Schultern
const COLOR_LEG      = '#818cf8';   // indigo – Beine
const COLOR_PELVIS   = '#94a3b8';   // slate – Becken
const COLOR_JOINT    = '#e2e8f0';   // weiss – Gelenk-Dots
const COLOR_HEAD     = '#c084fc';   // violett – Kopf
const COLOR_COG      = '#a78bfa';   // violett – Schwerpunkt-Lot
const COLOR_SELECTED = '#f59e0b';   // amber – selektiertes Gelenk
const COLOR_GLOW_CORRECTION = '#ff6b6b'; // rot-warm – Glow für Korrekturen
const COLOR_GLOW_GOOD = '#34d399';       // grün – Glow für Stärken
const COLOR_EPAULEMENT = '#64d2ff'; // cyan – Épaulement-Linie
const COLOR_TRAIL_WRIST = '#c084fc'; // violett – Handgelenk-Trajektorie
const COLOR_TRAIL_ANKLE = '#818cf8'; // indigo – Knöchel-Trajektorie

/** Opacity basierend auf Confidence (0.4–1.0). Kein Status-Urteil. */
const confidenceAlpha = (conf?: number): number =>
  conf === undefined ? 0.9 : Math.max(0.4, Math.min(1.0, 0.4 + conf * 0.6));

export type TeacherOverlayRegionKey =
  | 'torsoAlignment'
  | 'spine'
  | 'shoulder'
  | 'pelvis'
  | 'armL'
  | 'armR'
  | 'legL'
  | 'legR'
  | 'footL'
  | 'footR'
  | 'cog'
  | 'head';

export interface TeacherOverlayVisualStyle {
  state: TeacherHeuristicState;
  color: string;
  dash: number[];
}

export interface TeacherOverlayFrameContext {
  streamEpoch: number;
  framePtsSeconds: number;
  policyVersion: string;
}

const isTeacherHeuristicState = (value: unknown): value is TeacherHeuristicState =>
  value === 'heuristic_match'
  || value === 'heuristic_attention'
  || value === 'heuristic_strong_attention'
  || value === 'heuristic_review'
  || value === 'blocked';

/**
 * The single presentation contract for traffic-light colors.
 * Missing or malformed packets fail closed to yellow dashed review styling.
 */
export function resolveTeacherOverlayStyle(
  packet: TeacherOverlayPacket | undefined,
  key: TeacherOverlayRegionKey,
): TeacherOverlayVisualStyle {
  const candidate = packet?.[key];
  const state: TeacherHeuristicState = isTeacherHeuristicState(candidate)
    ? candidate
    : 'blocked';

  return {
    state,
    color: heuristicColor(state),
    dash: heuristicDash(state),
  };
}

/** Reject packets from another clip, frame, or policy revision. */
export function isTeacherOverlayPacketCurrent(
  packet: TeacherOverlayPacket | undefined,
  context: TeacherOverlayFrameContext | undefined,
): packet is TeacherOverlayPacket {
  if (!packet || !context) return false;

  return packet.streamEpoch === context.streamEpoch
    && packet.policyVersion === context.policyVersion
    && Number.isFinite(packet.framePtsSeconds)
    && Number.isFinite(context.framePtsSeconds)
    && Math.abs(packet.framePtsSeconds - context.framePtsSeconds) <= 0.000001;
}

/** Accept exact selection chrome/focus only for the skeleton frame it came from. */
export function isSelectedSkeletonTargetCurrent(
  target: SelectedSkeletonTarget | null | undefined,
  context: SkeletonTargetFrameContext | undefined,
): target is SelectedSkeletonTarget {
  if (target?.frameStatus !== 'exact_cache_frame' || !context) return false;
  return target.sourceId === context.sourceId
    && target.streamEpoch === context.streamEpoch
    && target.generation === context.generation
    && Math.abs(target.mediaTimeUs - context.mediaTimeUs) <= 1;
}

export function resolveSelectedSkeletonTargetFocus(
  target: SelectedSkeletonTarget | null | undefined,
  context: SkeletonTargetFrameContext | undefined,
  videoWidth: number,
  videoHeight: number,
): Readonly<{ x: number; y: number }> | null {
  if (
    !isSelectedSkeletonTargetCurrent(target, context)
    || !Number.isFinite(videoWidth)
    || !Number.isFinite(videoHeight)
    || videoWidth <= 0
    || videoHeight <= 0
    || !Number.isFinite(target.anchorNormalized.x)
    || !Number.isFinite(target.anchorNormalized.y)
  ) return null;
  return Object.freeze({
    x: target.anchorNormalized.x * videoWidth,
    y: target.anchorNormalized.y * videoHeight,
  });
}

/** Missing/blocked evidence has no red or green semantic glow. */
export function resolveTeacherGlowType(
  state: unknown,
): 'GOOD' | 'CORRECTION' | undefined {
  if (state === 'heuristic_match') return 'GOOD';
  if (state === 'heuristic_strong_attention') return 'CORRECTION';
  return undefined;
}

export interface CanvasRenderOptions {
  showSkeleton: boolean;
  showMotionTrails: boolean;
  showCoG: boolean;
  showAngleArcs: boolean;
  selectedJointId: string;
  /** When set, draws a pulsing glow ring around the selected joint */
  glowPulsePhase?: number;
  /** Whether the glow is for a GOOD cue (green) or CORRECTION (red-warm) */
  glowType?: 'GOOD' | 'CORRECTION';
  /** Show ideal position overlay (green dashed guide) for selected joint */
  showIdealOverlay?: boolean;
  /** Provenance-gated 2D orientation guide for the exact selected paused frame. */
  groundedAplombGuide?: GroundedTeacherGuide;
  /** Current runtime identity used to reject stale or cross-video guides. */
  groundedGuideFrameContext?: GroundedGuideFrameContext;
  /** Dim everything except the focused joint area (spotlight effect) */
  showFocusDim?: boolean;
  /** Index of the actually clicked landmark (for glow positioning) */
  clickedLandmarkIndex?: number;
  /** Exact joint/bone identity; draws neutral selection chrome only. */
  selectedSkeletonTarget?: SelectedSkeletonTarget | null;
  /** Current frame identity used to reject stale selection chrome. */
  selectedTargetFrameContext?: SkeletonTargetFrameContext;
  /** Nicole-owned direction for the exact selected bone. Never a traffic-light verdict. */
  nicoleReferenceGuide?: NicoleReferenceLineGuide | null;
  /** Current source/frame/dimension identity used to reject stale reference lines. */
  nicoleReferenceFrameContext?: NicoleReferenceFrameContext;
  isPlie: boolean;
  /** Typisiert als VaganovaFullAnalysis statt any (Berater 2026-08-11) */
  vaganovaAnalysis: VaganovaFullAnalysis | null;
  /** Darstellungsmodus:
   * 'lehrer-ampel' – Farben aus TeacherOverlayPacket (Nicole, nicht validiert)
   * 'anatomisch'   – Farbe nach Körperregion, kein Urteil
   * 'lehrbuch'     – monochromes Weiß, maximale Klarheit
   */
  overlayMode?: 'lehrer-ampel' | 'anatomisch' | 'lehrbuch';
  /**
   * Lehrer-Ampel Packet – MUSS gesetzt sein wenn overlayMode === 'lehrer-ampel'.
   * Der Renderer berechnet KEINE Heuristik selbst.
   * Fehlt das Packet im Lehrer-Ampel-Modus → alle Bereiche neutral/blocked.
   */
  overlayPacket?: TeacherOverlayPacket;
  /** Expected provenance for the packet rendered onto this exact skeleton frame. */
  overlayFrameContext?: TeacherOverlayFrameContext;
}

/**
 * Draws a line in viewbox coordinates.
 */
function drawLine(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  color: string,
  width: number,
  sx: number, sy: number,
  dash?: number[]
) {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  if (dash) ctx.setLineDash(dash);
  else ctx.setLineDash([]);
  ctx.moveTo(x1 * sx, y1 * sy);
  ctx.lineTo(x2 * sx, y2 * sy);
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * Draws a filled circle in viewbox coordinates.
 */
function drawCircle(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  r: number,
  fillColor: string,
  sx: number, sy: number,
  strokeColor?: string,
  strokeWidth?: number,
  strokeDash?: number[],
) {
  const avgScale = (sx + sy) / 2;
  ctx.beginPath();
  ctx.arc(cx * sx, cy * sy, r * avgScale, 0, Math.PI * 2);
  if (fillColor !== 'none') {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = (strokeWidth || 1) * avgScale;
    ctx.setLineDash(strokeDash ?? []);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/**
 * Draws a pulsing radial gradient glow around a point – used to highlight
 * the joint that a selected cue point refers to.
 * Creates a soft luminous spotlight effect visible even on bright backgrounds.
 * @param phase 0..1 pulsation phase (drives radius and alpha oscillation)
 * @param isGood true = green glow (strength), false = warm-red glow (correction)
 */
function drawGlowRing(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  baseRadius: number,
  phase: number,
  isGood: boolean,
  sx: number, sy: number
) {
  const avgScale = (sx + sy) / 2;
  // Breathing pulse: radius oscillates ±15%
  const pulse = 0.85 + 0.15 * Math.sin(phase * Math.PI * 2);
  // AGGRESSIVE: 3x multiplier for clearly visible halo (was 1.6x)
  const r = baseRadius * 3.0 * pulse * avgScale;
  const pxX = cx * sx;
  const pxY = cy * sy;

  // Parse base color into RGB for gradient stops
  const baseColor = isGood ? COLOR_GLOW_GOOD : COLOR_GLOW_CORRECTION;
  const rr = parseInt(baseColor.slice(1, 3), 16);
  const gg = parseInt(baseColor.slice(3, 5), 16);
  const bb = parseInt(baseColor.slice(5, 7), 16);

  ctx.save();

  // Layer 1 (dark backdrop) removed – Focus-Dim vignette provides contrast

  // Layer 2: Main colored glow — LARGE and BRIGHT
  const grad = ctx.createRadialGradient(pxX, pxY, 0, pxX, pxY, r);
  const centerAlpha = 0.65 + 0.15 * pulse;  // 0.65–0.80 (was 0.35–0.50)
  const midAlpha = 0.35 + 0.10 * pulse;     // 0.35–0.45 (was 0.18–0.25)
  grad.addColorStop(0,    `rgba(${rr},${gg},${bb},${centerAlpha})`);
  grad.addColorStop(0.25, `rgba(${rr},${gg},${bb},${midAlpha})`);
  grad.addColorStop(0.55, `rgba(${rr},${gg},${bb},0.12)`);
  grad.addColorStop(1,    `rgba(${rr},${gg},${bb},0)`);

  ctx.beginPath();
  ctx.arc(pxX, pxY, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Layer 3: Bright core dot for sharp visual anchor
  const coreR = baseRadius * 0.6 * avgScale; // was 0.3
  const coreGrad = ctx.createRadialGradient(pxX, pxY, 0, pxX, pxY, coreR);
  const coreAlpha = 0.85 + 0.15 * pulse; // 0.85–1.0 (was 0.6–0.85)
  coreGrad.addColorStop(0,   `rgba(${rr},${gg},${bb},${coreAlpha})`);
  coreGrad.addColorStop(0.5, `rgba(${rr},${gg},${bb},${coreAlpha * 0.5})`);
  coreGrad.addColorStop(1,   `rgba(${rr},${gg},${bb},0)`);
  ctx.beginPath();
  ctx.arc(pxX, pxY, coreR, 0, Math.PI * 2);
  ctx.fillStyle = coreGrad;
  ctx.fill();

  ctx.restore();
}

/**
 * Draws text in viewbox coordinates.
 */
function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  color: string,
  fontSize: number,
  sx: number, sy: number,
  align: CanvasTextAlign = 'center'
) {
  const avgScale = (sx + sy) / 2;
  ctx.fillStyle = color;
  ctx.font = `800 ${fontSize * avgScale}px Montserrat, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x * sx, y * sy);
}

/**
 * Draws a badge (rounded rect + text) in viewbox coordinates.
 */
function drawBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number, cy: number,
  width: number, height: number,
  bgColor: string,
  borderColor: string,
  textColor: string,
  fontSize: number,
  sx: number, sy: number
) {
  const avgScale = (sx + sy) / 2;
  const rx = cx * sx - (width * avgScale) / 2;
  const ry = cy * sy - (height * avgScale) / 2;
  const rw = width * avgScale;
  const rh = height * avgScale;
  const radius = 8 * avgScale;

  // Rounded rect background
  ctx.beginPath();
  ctx.roundRect(rx, ry, rw, rh, radius);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.5 * avgScale;
  ctx.stroke();

  // Text
  ctx.fillStyle = textColor;
  ctx.font = `800 ${fontSize * avgScale}px Montserrat, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx * sx, cy * sy);
}

/**
 * Draws an SVG-style path string on canvas. Supports M, L, C, Z commands.
 */
function drawSVGPath(
  ctx: CanvasRenderingContext2D,
  pathStr: string,
  fillColor: string | null,
  strokeColor: string | null,
  strokeWidth: number,
  sx: number, sy: number,
  opacity: number = 1.0
) {
  if (!pathStr || pathStr.length < 3) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  const avgScale = (sx + sy) / 2;

  ctx.beginPath();
  // Parse SVG path commands
  const cmds = pathStr.match(/[MLCZ][^MLCZ]*/gi);
  if (!cmds) { ctx.restore(); return; }

  for (const cmd of cmds) {
    const type = cmd[0].toUpperCase();
    const nums = cmd.slice(1).trim().split(/[\s,]+/).map(Number);
    
    if (type === 'M' && nums.length >= 2) {
      ctx.moveTo(nums[0] * sx, nums[1] * sy);
    } else if (type === 'L' && nums.length >= 2) {
      ctx.lineTo(nums[0] * sx, nums[1] * sy);
    } else if (type === 'C' && nums.length >= 6) {
      ctx.bezierCurveTo(nums[0] * sx, nums[1] * sy, nums[2] * sx, nums[3] * sy, nums[4] * sx, nums[5] * sy);
    } else if (type === 'Z') {
      ctx.closePath();
    }
  }

  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth * avgScale;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Main render function. Draws the complete skeleton overlay to a canvas.
 */
export function renderSkeletonToCanvas(
  canvas: HTMLCanvasElement,
  sk: ReconstructedSkeleton,
  cog: { x: number; y: number },
  armPositions: ArmPositionResult,
  elbowQuality: ElbowAnalysis,
  epaulement: EpaulementResult,
  footAlignment: SickleWingResult,
  weightDist: WeightDistributionResult,
  opts: CanvasRenderOptions,
  videoWidth: number = 1000,
  videoHeight: number = 1000
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;

  // Scale factors: video pixel coordinates → canvas pixels
  const sx = W / videoWidth;
  const sy = H / videoHeight;

  ctx.clearRect(0, 0, W, H);

  if (!opts.showSkeleton) return;

  // ─── OVERLAY-MODUS FARB-RESOLVER ───
  // Berater-konform: Ampelfarben DÜRFEN in 'lehrer-ampel'-Modus erscheinen,
  // weil Nicole diese explizit eingestellt hat und der Disclaimer-Text klar macht
  // dass es sich um nicht-validierte Rohdaten handelt.
  // 'anatomisch' und 'lehrbuch' enthalten KEINE Urteils-Farben.
  const mode = opts.overlayMode ?? 'anatomisch';
  // Packet aus opts – fehlt es im Lehrer-Modus, alles gelb gestrichelt/review
  const pkt = mode === 'lehrer-ampel'
    && isTeacherOverlayPacketCurrent(opts.overlayPacket, opts.overlayFrameContext)
    ? opts.overlayPacket
    : undefined;

  /**
   * Holt Farbe aus TeacherOverlayPacket für einen Körperbereich.
   * Renderer berechnet KEINE Heuristik – nur Farb-Lookup.
   * Fehlt das Packet → gelb gestrichelt (Nicole prüft).
   */
  const packetColor = (key: TeacherOverlayRegionKey): string => {
    if (mode !== 'lehrer-ampel') return mode === 'lehrbuch' ? '#e2e8f0' : COLOR_JOINT;
    return resolveTeacherOverlayStyle(pkt, key).color;
  };

  /** Strich-Muster für blockierte Bereiche */
  const packetDash = (key: TeacherOverlayRegionKey): number[] => {
    if (mode !== 'lehrer-ampel') return [];
    return resolveTeacherOverlayStyle(pkt, key).dash;
  };

  /** Raw confidence may block evidence upstream, but must not pulse line opacity. */
  const stableAlpha = (confidence?: number): number =>
    mode === 'lehrer-ampel' ? 0.9 : confidenceAlpha(confidence);

  // Knochen-Farbe nach Region und Modus
  const boneColor = (regional: string): string =>
    mode === 'lehrbuch' ? '#e2e8f0' : regional;

  // Selektions-Highlight (immer amber, modusunabhängig)
  const selColor = COLOR_SELECTED;


  // Skeleton body part colors (mode-resolved above)

  // Destructure skeleton
  const {
    head, neck, sternum, navel, pelvisCenter,
    shoulderL, shoulderR, elbowL, elbowR, wristL, wristR,
    pelvisL, pelvisR, kneeL, kneeR, ankleL, ankleR, footL, footR
  } = sk;

  // ─── PLUMB LINE ───
  if (isSkeletonPointUsable(head)) {
    drawLine(ctx, head.x, head.y - 30, head.x, 950, 'rgba(255,255,255,0.45)', 2, sx, sy, [6, 6]);
  }

  // ─── MOTION TRAILS ───
  if (opts.showMotionTrails) {
    const ankleTrailColor = mode === 'lehrer-ampel' ? COLOR_TRAIL_ANKLE : '#30d158';
    // Tapering trails (comet tails)
    drawSVGPath(ctx, vaganovaKineticAI.getTaperingTrailPath('wristL', 10), 'rgba(192,132,252,0.5)', null, 0, sx, sy);
    drawSVGPath(ctx, vaganovaKineticAI.getTaperingTrailPath('wristR', 10), 'rgba(192,132,252,0.5)', null, 0, sx, sy);
    drawSVGPath(ctx, vaganovaKineticAI.getTaperingTrailPath('ankleL', 10), ankleTrailColor, null, 0, sx, sy, 0.5);
    drawSVGPath(ctx, vaganovaKineticAI.getTaperingTrailPath('ankleR', 10), ankleTrailColor, null, 0, sx, sy, 0.5);

    // Centerline spines
    drawSVGPath(ctx, vaganovaKineticAI.getTrailPath('wristL'), null, '#c084fc', 1.5, sx, sy, 0.6);
    drawSVGPath(ctx, vaganovaKineticAI.getTrailPath('wristR'), null, '#c084fc', 1.5, sx, sy, 0.6);
    drawSVGPath(ctx, vaganovaKineticAI.getTrailPath('ankleL'), null, ankleTrailColor, 1.5, sx, sy, 0.6);
    drawSVGPath(ctx, vaganovaKineticAI.getTrailPath('ankleR'), null, ankleTrailColor, 1.5, sx, sy, 0.6);

    // Trail endpoint nodes
    for (const [key, color] of [['wristL', '#c084fc'], ['wristR', '#c084fc'], ['ankleL', ankleTrailColor], ['ankleR', ankleTrailColor]] as [string, string][]) {
      const pts = vaganovaKineticAI.getTrailPoints(key);
      const len = pts.length;
      for (let i = 0; i < len; i++) {
        const progress = i / Math.max(1, len - 1);
        const r = 1.5 + progress * 2.5;
        const alpha = 0.15 + progress * 0.85;
        ctx.globalAlpha = alpha;
        drawCircle(ctx, pts[i].x, pts[i].y, r, color, sx, sy);
      }
      ctx.globalAlpha = 1.0;
    }
  }

  // ─── CoG & PLUMB VECTOR ───
  if (opts.showCoG) {
    // FIX 2026-08-11: CoG war auto-grün im Lehrer-Modus (Issue 1.1)
    // Jetzt: Farbe kommt aus TeacherOverlayPacket.cog
    // 'blocked' → gelb gestrichelt (fehlende Evidenz ist KEIN positiver Befund)
    const cogC = mode === 'lehrer-ampel'
      ? packetColor('cog')
      : COLOR_COG;
    const cogDash = mode === 'lehrer-ampel' ? packetDash('cog') : [];
    drawLine(ctx, cog.x, cog.y, cog.x, 950, cogC, 2.5, sx, sy, cogDash);
    drawCircle(ctx, cog.x, cog.y, 10,
      mode === 'lehrer-ampel' ? 'rgba(255,255,255,0.08)' : 'rgba(167,139,250,0.25)',
      sx, sy, cogC, 3);
    drawCircle(ctx, cog.x, cog.y, 3, mode === 'lehrer-ampel' ? cogC : '#ffffff', sx, sy);
  }

  // ─── WINKEL-BÖGEN (Turnout) ───
  if (opts.showAngleArcs) {
    const avgS = (sx + sy) / 2;
    const va = opts.vaganovaAnalysis;
    const turnoutPairs: Array<[KinematicPoint, 'turnoutL' | 'turnoutR']> = [
      [ankleL, 'turnoutL'],
      [ankleR, 'turnoutR'],
    ];
    for (const [anklePoint, turnoutKey] of turnoutPairs) {
      if (!isSkeletonPointUsable(anklePoint)) continue;
      const turnoutVal = va?.[turnoutKey];
      const turnoutConf = turnoutVal?.confidence ?? 0.7;
      // There is no evidence-compatible turnout field in TeacherOverlayPacket.
      // Keep the arc neutral instead of reusing raw measurement status.
      const turnoutStyle = resolveTeacherOverlayStyle(undefined, 'footL');
      const tColor = mode === 'lehrer-ampel' ? turnoutStyle.color : boneColor(COLOR_SPINE);
      ctx.beginPath();
      ctx.arc(anklePoint.x * sx, anklePoint.y * sy, 28 * avgS, Math.PI, 0);
      ctx.strokeStyle = tColor;
      ctx.lineWidth = 3 * avgS;
      ctx.setLineDash(mode === 'lehrer-ampel' ? turnoutStyle.dash : []);
      ctx.globalAlpha = stableAlpha(turnoutConf) * 0.7;
      ctx.fillStyle = mode === 'lehrer-ampel'
        ? 'rgba(255,255,255,0.04)'
        : 'rgba(226,232,240,0.06)';
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1.0;
    }
  }

  // ─── KOPF & HALS ───
  const headConf = opts.vaganovaAnalysis?.headTilt?.confidence;
  const headC = mode === 'lehrer-ampel' ? packetColor('head') : boneColor(COLOR_HEAD);
  ctx.globalAlpha = stableAlpha(headConf);
  if (isSkeletonPointUsable(head)) {
    drawCircle(ctx, head.x, head.y, 18,
      mode === 'lehrer-ampel' ? 'rgba(192,132,252,0.15)' : 'rgba(192,132,252,0.18)', sx, sy,
      mode !== 'lehrer-ampel' && opts.selectedJointId === 'head_epaulement' ? selColor : headC, 2.5,
      mode === 'lehrer-ampel' ? packetDash('head') : []);
  }
  if (isSkeletonPointUsable(head) && isSkeletonPointUsable(neck)) {
    drawLine(
      ctx,
      head.x,
      head.y,
      neck.x,
      neck.y,
      mode === 'lehrer-ampel' ? headC : boneColor(COLOR_SPINE),
      3.5,
      sx,
      sy,
      mode === 'lehrer-ampel' ? packetDash('head') : [],
    );
  }
  ctx.globalAlpha = 1.0;

  // ─── WIRBELSÄULE ───
  const spineConf = opts.vaganovaAnalysis?.spineTilt?.confidence;
  const spineC = mode === 'lehrer-ampel' ? packetColor('spine') : boneColor(COLOR_SPINE);
  const spineDash = mode === 'lehrer-ampel' ? packetDash('spine') : [];
  ctx.globalAlpha = stableAlpha(spineConf);
  if (isSkeletonPointUsable(neck) && isSkeletonPointUsable(sternum)) drawLine(ctx, neck.x, neck.y, sternum.x, sternum.y, spineC, 4, sx, sy, spineDash);
  if (isSkeletonPointUsable(sternum) && isSkeletonPointUsable(navel)) drawLine(ctx, sternum.x, sternum.y, navel.x, navel.y, spineC, 4, sx, sy, spineDash);
  if (isSkeletonPointUsable(navel) && isSkeletonPointUsable(pelvisCenter)) drawLine(ctx, navel.x, navel.y, pelvisCenter.x, pelvisCenter.y, spineC, 4, sx, sy, spineDash);
  if (isSkeletonPointUsable(neck)) drawCircle(ctx, neck.x, neck.y, 5.5, mode === 'lehrer-ampel' ? spineC : COLOR_JOINT, sx, sy);
  if (isSkeletonPointUsable(sternum)) drawCircle(ctx, sternum.x, sternum.y, 5.5, mode === 'lehrer-ampel' ? spineC : COLOR_JOINT, sx, sy);
  if (isSkeletonPointUsable(navel)) drawCircle(ctx, navel.x, navel.y, 6.5, mode === 'lehrer-ampel' ? spineC : selColor, sx, sy);
  if (isSkeletonPointUsable(pelvisCenter)) drawCircle(ctx, pelvisCenter.x, pelvisCenter.y, 7, mode === 'lehrer-ampel' ? packetColor('pelvis') : COLOR_JOINT, sx, sy);
  ctx.globalAlpha = 1.0;

  // ─── ARME (violett / status im Lehrer-Ampel-Modus) ───
  const armLConf = opts.vaganovaAnalysis?.armLineQualityL?.confidence;
  const armRConf = opts.vaganovaAnalysis?.armLineQualityR?.confidence;
  const armLStatusC = mode === 'lehrer-ampel' ? packetColor('armL') : boneColor(COLOR_ARM);
  const armRStatusC = mode === 'lehrer-ampel' ? packetColor('armR') : boneColor(COLOR_ARM);
  const armLDash = mode === 'lehrer-ampel' ? packetDash('armL') : [];
  const armRDash = mode === 'lehrer-ampel' ? packetDash('armR') : [];
  const armLColor = mode === 'lehrer-ampel' ? armLStatusC
    : opts.selectedJointId === 'port_de_bras_arms' ? selColor : boneColor(COLOR_ARM);
  const armRColor = mode === 'lehrer-ampel' ? armRStatusC
    : opts.selectedJointId === 'port_de_bras_arms' ? selColor : boneColor(COLOR_ARM);

  // Schulterleiste
  const shConf = opts.vaganovaAnalysis?.shoulderSymmetry?.confidence;
  const shC = mode === 'lehrer-ampel' ? packetColor('shoulder') : boneColor(COLOR_ARM);
  const shDash = mode === 'lehrer-ampel' ? packetDash('shoulder') : [];
  ctx.globalAlpha = stableAlpha(shConf);
  if (isSkeletonPointUsable(shoulderL) && isSkeletonPointUsable(shoulderR)) drawLine(ctx, shoulderL.x, shoulderL.y, shoulderR.x, shoulderR.y, shC, 3.5, sx, sy, shDash);
  if (isSkeletonPointUsable(shoulderL)) drawCircle(ctx, shoulderL.x, shoulderL.y, 7, mode === 'lehrer-ampel' ? shC : COLOR_JOINT, sx, sy);
  if (isSkeletonPointUsable(shoulderR)) drawCircle(ctx, shoulderR.x, shoulderR.y, 7, mode === 'lehrer-ampel' ? shC : COLOR_JOINT, sx, sy);
  ctx.globalAlpha = 1.0;

  // Linker Arm
  ctx.globalAlpha = stableAlpha(armLConf);
  if (isSkeletonPointUsable(shoulderL) && isSkeletonPointUsable(elbowL)) drawLine(ctx, shoulderL.x, shoulderL.y, elbowL.x, elbowL.y, armLColor, 4.5, sx, sy, armLDash);
  if (isSkeletonPointUsable(elbowL) && isSkeletonPointUsable(wristL)) drawLine(ctx, elbowL.x, elbowL.y, wristL.x, wristL.y, armLColor, 4.5, sx, sy, armLDash);
  // Rechter Arm
  ctx.globalAlpha = stableAlpha(armRConf);
  if (isSkeletonPointUsable(shoulderR) && isSkeletonPointUsable(elbowR)) drawLine(ctx, shoulderR.x, shoulderR.y, elbowR.x, elbowR.y, armRColor, 4.5, sx, sy, armRDash);
  if (isSkeletonPointUsable(elbowR) && isSkeletonPointUsable(wristR)) drawLine(ctx, elbowR.x, elbowR.y, wristR.x, wristR.y, armRColor, 4.5, sx, sy, armRDash);
  ctx.globalAlpha = 1.0;

  // Ellenbogen-Ringe: im Lehrer-Modus folgt auch das Strichmuster exakt dem
  // Regionszustand (solid = bewertet, dashed = Nicole prüft).
  const elbowC = boneColor(COLOR_ARM);
  ctx.globalAlpha = stableAlpha(armLConf ?? 0.8) * 0.85;
  if (isSkeletonPointUsable(elbowL)) drawCircle(
    ctx,
    elbowL.x,
    elbowL.y,
    18,
    'none',
    sx,
    sy,
    mode === 'lehrer-ampel' ? armLStatusC : elbowC,
    2,
    mode === 'lehrer-ampel' ? armLDash : [3, 2],
  );
  ctx.globalAlpha = stableAlpha(armRConf ?? 0.8) * 0.85;
  if (isSkeletonPointUsable(elbowR)) drawCircle(
    ctx,
    elbowR.x,
    elbowR.y,
    18,
    'none',
    sx,
    sy,
    mode === 'lehrer-ampel' ? armRStatusC : elbowC,
    2,
    mode === 'lehrer-ampel' ? armRDash : [3, 2],
  );
  ctx.globalAlpha = 1.0;

  // Gelenk-Dots
  if (isSkeletonPointUsable(elbowL)) drawCircle(ctx, elbowL.x, elbowL.y, 5.5, mode === 'lehrer-ampel' ? armLStatusC : COLOR_JOINT, sx, sy);
  if (isSkeletonPointUsable(elbowR)) drawCircle(ctx, elbowR.x, elbowR.y, 5.5, mode === 'lehrer-ampel' ? armRStatusC : COLOR_JOINT, sx, sy);
  if (isSkeletonPointUsable(wristL)) drawCircle(ctx, wristL.x, wristL.y, 5.5, mode === 'lehrer-ampel' ? armLStatusC : COLOR_JOINT, sx, sy);
  if (isSkeletonPointUsable(wristR)) drawCircle(ctx, wristR.x, wristR.y, 5.5, mode === 'lehrer-ampel' ? armRStatusC : COLOR_JOINT, sx, sy);

  // ─── ÉPAULEMENT: shoulder line only ───
  if (isSkeletonPointUsable(shoulderL) && isSkeletonPointUsable(shoulderR)) drawLine(
    ctx,
    shoulderL.x - 15,
    shoulderL.y,
    shoulderR.x + 15,
    shoulderR.y,
    mode === 'lehrer-ampel' ? shC : COLOR_EPAULEMENT,
    1.5,
    sx,
    sy,
    mode === 'lehrer-ampel' ? shDash : [6, 3],
  );

  // ─── TORSO RAHMEN ───
  // FIX 2026-08-11: Torso-Seitenlinien reagieren jetzt auf TeacherOverlayPacket.torsoAlignment
  // Vorher: boneColor(COLOR_SPINE) ignorierte den Lehrer-Ampel-Modus komplett (Issue 1.2)
  const torsoAlignC = mode === 'lehrer-ampel'
    ? packetColor('torsoAlignment')
    : boneColor(COLOR_SPINE);
  const torsoDash = mode === 'lehrer-ampel' ? packetDash('torsoAlignment') : [];
  const torsoConf = opts.vaganovaAnalysis?.spineTilt?.confidence;
  ctx.globalAlpha = stableAlpha(torsoConf) * 0.75;
  if (isSkeletonPointUsable(shoulderL) && isSkeletonPointUsable(pelvisL)) drawLine(ctx, shoulderL.x, shoulderL.y, pelvisL.x, pelvisL.y, torsoAlignC, 2.5, sx, sy, torsoDash);
  if (isSkeletonPointUsable(shoulderR) && isSkeletonPointUsable(pelvisR)) drawLine(ctx, shoulderR.x, shoulderR.y, pelvisR.x, pelvisR.y, torsoAlignC, 2.5, sx, sy, torsoDash);
  // Becken-Leiste
  const pelvisConf = opts.vaganovaAnalysis?.pelvicTilt?.confidence;
  const pelvisC = mode === 'lehrer-ampel' ? packetColor('pelvis') : boneColor(COLOR_PELVIS);
  const pelvisDash = mode === 'lehrer-ampel' ? packetDash('pelvis') : [];
  ctx.globalAlpha = stableAlpha(pelvisConf);
  if (isSkeletonPointUsable(pelvisL) && isSkeletonPointUsable(pelvisR)) drawLine(ctx, pelvisL.x, pelvisL.y, pelvisR.x, pelvisR.y, pelvisC, 4, sx, sy, pelvisDash);
  ctx.globalAlpha = 1.0;

  // ─── BEINE (aus TeacherOverlayPacket) ───
  // FIX 2026-08-11: teacherLegStatus() wurde aus dem Renderer entfernt.
  // Bein-Status kommt jetzt ausschließlich aus TeacherOverlayPacket.
  const legLC = mode === 'lehrer-ampel' ? packetColor('legL') : boneColor(COLOR_LEG);
  const legRC = mode === 'lehrer-ampel' ? packetColor('legR') : boneColor(COLOR_LEG);
  const legLDash = mode === 'lehrer-ampel' ? packetDash('legL') : [];
  const legRDash = mode === 'lehrer-ampel' ? packetDash('legR') : [];
  // Confidence für Opacity
  const legLConf = opts.vaganovaAnalysis?.knieFlexionL?.confidence ?? opts.vaganovaAnalysis?.valgusDriftL?.confidence;
  const legRConf = opts.vaganovaAnalysis?.knieFlexionR?.confidence ?? opts.vaganovaAnalysis?.valgusDriftR?.confidence;

  // Linkes Bein
  ctx.globalAlpha = stableAlpha(legLConf);
  if (isSkeletonPointUsable(pelvisL) && isSkeletonPointUsable(kneeL)) drawLine(ctx, pelvisL.x, pelvisL.y, kneeL.x, kneeL.y, legLC, 4.5, sx, sy, legLDash);
  if (isSkeletonPointUsable(kneeL) && isSkeletonPointUsable(ankleL)) drawLine(ctx, kneeL.x, kneeL.y, ankleL.x, ankleL.y, legLC, 4.5, sx, sy, legLDash);
  const kneeLSize = opts.selectedJointId === 'left_knee' ? 9 : 6.5;
  if (isSkeletonPointUsable(kneeL)) drawCircle(ctx, kneeL.x, kneeL.y, kneeLSize,
    mode === 'lehrer-ampel' ? legLC
      : opts.selectedJointId === 'left_knee' ? selColor : COLOR_JOINT, sx, sy);
  ctx.globalAlpha = 1.0;

  // Rechtes Bein
  ctx.globalAlpha = stableAlpha(legRConf);
  if (isSkeletonPointUsable(pelvisR) && isSkeletonPointUsable(kneeR)) drawLine(ctx, pelvisR.x, pelvisR.y, kneeR.x, kneeR.y, legRC, 4.5, sx, sy, legRDash);
  if (isSkeletonPointUsable(kneeR) && isSkeletonPointUsable(ankleR)) drawLine(ctx, kneeR.x, kneeR.y, ankleR.x, ankleR.y, legRC, 4.5, sx, sy, legRDash);
  const kneeRSize = opts.selectedJointId === 'right_knee' ? 9 : 6.5;
  if (isSkeletonPointUsable(kneeR)) drawCircle(ctx, kneeR.x, kneeR.y, kneeRSize,
    mode === 'lehrer-ampel' ? legRC
      : opts.selectedJointId === 'right_knee' ? selColor : COLOR_JOINT, sx, sy);
  ctx.globalAlpha = 1.0;

  // ─── FUß-DOTS (aus TeacherOverlayPacket) ───
  // FIX 2026-08-11: Fuß-Dots kommen jetzt aus Packet, nicht mehr direkt aus FootAnalyzer (Issue 1.3)
  // Foot dots remain visible for every usable foot; blocked/review is yellow dashed.
  const footLC = mode === 'lehrer-ampel' ? packetColor('footL') : boneColor(COLOR_LEG);
  const footRC = mode === 'lehrer-ampel' ? packetColor('footR') : boneColor(COLOR_LEG);
  if (isSkeletonPointUsable(ankleL) && isSkeletonPointUsable(footL) && mode === 'lehrer-ampel') {
    drawCircle(ctx, ankleL.x, ankleL.y, 8, footLC, sx, sy, footLC, 2);
  }
  if (isSkeletonPointUsable(ankleR) && isSkeletonPointUsable(footR) && mode === 'lehrer-ampel') {
    drawCircle(ctx, ankleR.x, ankleR.y, 8, footRC, sx, sy, footRC, 2);
  }
  if (isSkeletonPointUsable(ankleL) && isSkeletonPointUsable(footL)) {
    drawLine(ctx, ankleL.x, ankleL.y, footL.x, footL.y, footLC, 3.5, sx, sy,
      mode === 'lehrer-ampel' ? packetDash('footL') : []);
    drawCircle(ctx, footL.x, footL.y, 5, mode === 'lehrer-ampel' ? footLC : COLOR_JOINT, sx, sy);
  }
  if (isSkeletonPointUsable(ankleR) && isSkeletonPointUsable(footR)) {
    drawLine(ctx, ankleR.x, ankleR.y, footR.x, footR.y, footRC, 3.5, sx, sy,
      mode === 'lehrer-ampel' ? packetDash('footR') : []);
    drawCircle(ctx, footR.x, footR.y, 5, mode === 'lehrer-ampel' ? footRC : COLOR_JOINT, sx, sy);
  }

  // ─── SCHWERPUNKT-DOT ───
  // FIX 2026-08-11: WeightDist-Status wird nicht mehr direkt gerendet
  // CoG-Packet (projected_torso_center_proxy) kommt aus overlayPacket.cog (bereits oben gerendert)
  // Dieser separate WeightDist-Dot wurde entfernt – Doppeldarstellung vermieden

  // ─── FOCUS-DIM: Umgebung abdunkeln, Fokus-Bereich klar ───
  // Legt eine halbtransparente dunkle Schicht über das gesamte Bild
  // mit einem kreisförmigen "Fenster" um das selektierte Gelenk.
  const selectedTarget = opts.selectedSkeletonTarget;
  const selectionContext = opts.selectedTargetFrameContext;
  const selectedTargetIsCurrent = isSelectedSkeletonTargetCurrent(selectedTarget, selectionContext);
  const exactTargetFocus = resolveSelectedSkeletonTargetFocus(
    selectedTarget,
    selectionContext,
    videoWidth,
    videoHeight,
  );
  if (opts.showFocusDim && opts.selectedJointId && opts.selectedJointId !== '') {
    let focusX: number | undefined;
    let focusY: number | undefined;
    let focusR = 80;

    if (
      selectedTargetIsCurrent
      && selectedTarget
      && exactTargetFocus
    ) {
      // Exact target selection: spotlight, amber chrome and popover all share
      // one provenance-bound anchor. This matters especially for bones, feet,
      // wrists and ankles whose legacy focus region is much wider.
      focusX = exactTargetFocus.x;
      focusY = exactTargetFocus.y;
      focusR = selectedTarget.kind === 'bone' ? 72 : 55;
    } else switch (opts.selectedJointId) {
      case 'left_knee':   focusX = kneeL.x; focusY = kneeL.y; focusR = 65; break;
      case 'right_knee':  focusX = kneeR.x; focusY = kneeR.y; focusR = 65; break;
      case 'left_elbow':  focusX = elbowL.x; focusY = elbowL.y; focusR = 55; break;
      case 'right_elbow': focusX = elbowR.x; focusY = elbowR.y; focusR = 55; break;
      case 'spine_center': focusX = sternum.x; focusY = sternum.y; focusR = 70; break;
      case 'pelvis_core':  focusX = pelvisCenter.x; focusY = pelvisCenter.y; focusR = 65; break;
      case 'shoulder_line': {
        focusX = (shoulderL.x + shoulderR.x) / 2;
        focusY = (shoulderL.y + shoulderR.y) / 2;
        focusR = 85;
        break;
      }
      case 'head_epaulement': focusX = head.x; focusY = head.y; focusR = 50; break;
      case 'port_de_bras_arms': {
        focusX = (elbowL.x + elbowR.x) / 2;
        focusY = (elbowL.y + elbowR.y) / 2;
        focusR = 110;
        break;
      }
    }

    if (focusX !== undefined && focusY !== undefined) {
      const pxX = focusX * sx;
      const pxY = focusY * sy;
      const pxR = focusR * ((sx + sy) / 2);
      const canvasW = ctx.canvas.width;
      const canvasH = ctx.canvas.height;
      // Use the longest canvas diagonal to ensure full coverage
      const maxDist = Math.sqrt(canvasW * canvasW + canvasH * canvasH);

      ctx.save();
      // Pure radial gradient vignette – NO hard circle edge
      // Clear center → strong darken → very dark edges
      const vigGrad = ctx.createRadialGradient(pxX, pxY, pxR * 0.3, pxX, pxY, maxDist * 0.55);
      vigGrad.addColorStop(0,    'rgba(0,0,0,0)');       // clear center
      vigGrad.addColorStop(0.18, 'rgba(0,0,0,0)');       // still clear (smaller area)
      vigGrad.addColorStop(0.35, 'rgba(0,0,0,0.25)');    // start darken earlier
      vigGrad.addColorStop(0.55, 'rgba(0,0,0,0.50)');    // strong mid
      vigGrad.addColorStop(1,    'rgba(0,0,0,0.70)');    // very dark edges
      ctx.beginPath();
      ctx.rect(0, 0, canvasW, canvasH);
      ctx.fillStyle = vigGrad;
      ctx.fill();

      ctx.restore();
    }
  }

  // Static amber selection identifies the exact joint or complete bone. It is
  // deliberately separate from traffic-light color and semantic cue glow.
  if (selectedTargetIsCurrent && selectedTarget) {
    const definition = getSkeletonTarget(selectedTarget.targetId);
    if (definition && isSkeletonTargetGeometryUsable(sk, definition)) {
      const points = getSkeletonTargetPoints(sk, definition);
      ctx.save();
      ctx.globalAlpha = 1;
      if (definition.kind === 'joint') {
        drawCircle(ctx, points[0].x, points[0].y, 11, 'rgba(245,158,11,0.12)', sx, sy, COLOR_SELECTED, 3);
      } else {
        drawLine(ctx, points[0].x, points[0].y, points[1].x, points[1].y, 'rgba(0,0,0,0.72)', 10, sx, sy);
        drawLine(ctx, points[0].x, points[0].y, points[1].x, points[1].y, COLOR_SELECTED, 6, sx, sy);
      }
      ctx.restore();
    }
  }

  // ─── NICOLE-REFERENZLINIE ───
  // A saved teacher reference is a direction for this exact bone and video,
  // not a universal ideal or an automatic correctness verdict. It is therefore
  // cyan and dashed, never traffic-light green. The saved direction is anchored
  // to the current bone start and scaled to its current displayed length.
  if (isNicoleReferenceGuideCurrent(
    opts.nicoleReferenceGuide,
    selectedTarget,
    opts.nicoleReferenceFrameContext,
  )) {
    const definition = getSkeletonTarget(opts.nicoleReferenceGuide.targetId);
    if (definition?.kind === 'bone' && isSkeletonTargetGeometryUsable(sk, definition)) {
      const points = getSkeletonTargetPoints(sk, definition);
      const currentLength = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      if (Number.isFinite(currentLength) && currentLength > 0) {
        const targetX = points[0].x + opts.nicoleReferenceGuide.direction.x * currentLength;
        const targetY = points[0].y + opts.nicoleReferenceGuide.direction.y * currentLength;
        ctx.save();
        ctx.globalAlpha = 0.98;
        drawLine(ctx, points[0].x, points[0].y, targetX, targetY, 'rgba(0,0,0,0.72)', 9, sx, sy, [11, 7]);
        drawLine(ctx, points[0].x, points[0].y, targetX, targetY, '#22d3ee', 4.5, sx, sy, [11, 7]);
        const avgScale = (sx + sy) / 2;
        // The canvas backing store is DPR-scaled. Keep the label at a readable
        // CSS-equivalent size instead of treating 8 backing pixels as 8 CSS px.
        const cssWidth = ctx.canvas.getBoundingClientRect?.().width ?? ctx.canvas.width;
        const cssPixelRatio = cssWidth > 0 ? ctx.canvas.width / cssWidth : 1;
        const fontSize = Math.max(10 * cssPixelRatio, 8 * avgScale);
        const label = `Nicole · V${opts.nicoleReferenceGuide.versionNumber}`;
        ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
        const labelWidth = ctx.measureText(label).width;
        const margin = 6 * cssPixelRatio;
        const labelX = Math.max(margin, Math.min((targetX + 8) * sx, ctx.canvas.width - labelWidth - margin * 2));
        const labelY = Math.max(fontSize + margin, Math.min((targetY - 6) * sy, ctx.canvas.height - margin));
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.beginPath();
        ctx.roundRect(
          labelX - 4 * cssPixelRatio,
          labelY - fontSize,
          labelWidth + 8 * cssPixelRatio,
          fontSize + 5 * cssPixelRatio,
          4 * cssPixelRatio,
        );
        ctx.fill();
        ctx.fillStyle = '#22d3ee';
        ctx.fillText(label, labelX, labelY);
        ctx.restore();
      }
    }
  }

  // ─── GLOW-HIGHLIGHT FÜR SELEKTIERTE CUE-POINTS ───
  // Glow sitzt auf dem TATSÄCHLICH angeklickten Landmark, nicht auf der Region-Mitte.
  const selId = opts.selectedJointId;
  const glowPhase = opts.glowPulsePhase ?? 0;
  const trustedGlowType = mode === 'lehrer-ampel' && !pkt
    ? undefined
    : opts.glowType;
  const isGood = trustedGlowType === 'GOOD';

  if (selId && selId !== '' && trustedGlowType) {
    let glowX: number | undefined;
    let glowY: number | undefined;
    let glowRadius = 25;

    // PRIMARY: Use the actually clicked landmark for precise glow positioning
    const clickedIdx = opts.clickedLandmarkIndex;
    if (clickedIdx !== undefined && sk) {
      // Map landmark index → skeleton point (includes all clickable joints)
      const LANDMARK_TO_POINT: Record<number, { x: number; y: number } | null> = {
        0: head, 11: shoulderL, 12: shoulderR, 13: elbowL, 14: elbowR,
        15: wristL, 16: wristR, 23: pelvisL, 24: pelvisR,
        25: kneeL, 26: kneeR, 27: ankleL, 28: ankleR,
        29: footL ?? ankleL, 30: footR ?? ankleR,  // heel → use foot or ankle fallback
        31: footL ?? ankleL, 32: footR ?? ankleR,   // toe → use foot or ankle fallback
        100: sternum,  // synthetic spine/torso → glow on sternum
      };
      const point = LANDMARK_TO_POINT[clickedIdx];
      if (point) {
        glowX = point.x;
        glowY = point.y;
        // Scale radius by joint importance
        const largeJoints = new Set([23, 24, 25, 26]);
        const headJoints = new Set([0]);
        glowRadius = headJoints.has(clickedIdx) ? 26
                   : largeJoints.has(clickedIdx) ? 28
                   : 24;
      }
    }

    // FALLBACK: If no clickedLandmarkIndex, use the old region-center logic
    if (glowX === undefined) {
      switch (selId) {
        case 'left_knee':       glowX = kneeL.x; glowY = kneeL.y; glowRadius = 28; break;
        case 'right_knee':      glowX = kneeR.x; glowY = kneeR.y; glowRadius = 28; break;
        case 'left_elbow':      glowX = elbowL.x; glowY = elbowL.y; glowRadius = 24; break;
        case 'right_elbow':     glowX = elbowR.x; glowY = elbowR.y; glowRadius = 24; break;
        case 'spine_center':    glowX = sternum.x; glowY = sternum.y; glowRadius = 30; break;
        case 'pelvis_core':     glowX = pelvisCenter.x; glowY = pelvisCenter.y; glowRadius = 30; break;
        case 'shoulder_line':
          glowX = (shoulderL.x + shoulderR.x) / 2;
          glowY = (shoulderL.y + shoulderR.y) / 2;
          glowRadius = 35; break;
        case 'head_epaulement': glowX = head.x; glowY = head.y; glowRadius = 26; break;
        case 'port_de_bras_arms':
          drawGlowRing(ctx, elbowL.x, elbowL.y, 22, glowPhase, isGood, sx, sy);
          drawGlowRing(ctx, elbowR.x, elbowR.y, 22, glowPhase, isGood, sx, sy);
          break;
      }
    }

    if (glowX !== undefined && glowY !== undefined) {
      drawGlowRing(ctx, glowX, glowY, glowRadius, glowPhase, isGood, sx, sy);
    }
  }

  // ─── IDEAL-OVERLAY: Soll-Position als deutliche grüne Hilfslinie ───
  // Zeigt der Lehrerin/Schülerin, WIE die Position korrekt aussehen sollte.
  // Technik: dunkle Schattenlinie + helle grüne Linie für Kontrast auf jedem Hintergrund.
  const IDEAL_COLOR = '#22c55e';       // kräftiges grün
  const IDEAL_SHADOW = 'rgba(0,0,0,0.6)'; // dunkler Schatten dahinter
  const IDEAL_DASH = [14, 8];          // große gestrichelte Muster
  const IDEAL_WIDTH = 4.5;             // dick
  const IDEAL_SHADOW_WIDTH = 8;        // Schatten noch dicker
  const IDEAL_ALPHA = 0.95;

  /** Helper: zeichnet Label mit dunklem Hintergrund-Chip */
  const drawIdealLabel = (text: string, x: number, y: number) => {
    const avgS = (sx + sy) / 2;
    const fontSize = Math.max(14, 16 * avgS);
    ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
    const metrics = ctx.measureText(text);
    const pad = 5 * avgS;
    // Background pill
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    const rx = x - pad;
    const ry = y - fontSize * 0.8;
    const rw = metrics.width + pad * 2;
    const rh = fontSize + pad;
    ctx.beginPath();
    ctx.roundRect(rx, ry, rw, rh, 4 * avgS);
    ctx.fill();
    // Text
    ctx.fillStyle = IDEAL_COLOR;
    ctx.fillText(text, x, y);
  };

  /** Helper: zeichnet Linie mit dunklem Schatten für Kontrast */
  const drawIdealLine = (x1: number, y1: number, x2: number, y2: number) => {
    // Shadow layer (thick, dark)
    drawLine(ctx, x1, y1, x2, y2, IDEAL_SHADOW, IDEAL_SHADOW_WIDTH, sx, sy, IDEAL_DASH);
    // Bright green layer on top
    drawLine(ctx, x1, y1, x2, y2, IDEAL_COLOR, IDEAL_WIDTH, sx, sy, IDEAL_DASH);
  };

  const groundedGuide = opts.groundedAplombGuide;
  const groundedGuideFocusId = groundedGuide?.evidence.metricId === 'spine_tilt_aplomb'
    ? 'spine_center'
    : groundedGuide?.evidence.metricId === 'shoulder_horizontal'
      ? 'shoulder_line'
      : groundedGuide?.evidence.metricId === 'projected_hip_line_obliquity'
        ? 'pelvis_core'
        : null;
  if (
    opts.showIdealOverlay
    && opts.selectedJointId === groundedGuideFocusId
    && isGroundedTeacherGuideCurrent(
      groundedGuide,
      opts.groundedGuideFrameContext,
    )
  ) {
    ctx.save();
    ctx.globalAlpha = IDEAL_ALPHA;
    let labelX: number;
    let labelY: number;
    if (groundedGuide.kind === 'image_vertical') {
      drawIdealLine(pelvisCenter.x, head.y - 15, pelvisCenter.x, pelvisCenter.y + 15);
      labelX = (pelvisCenter.x + 18) * sx;
      labelY = ((head.y + pelvisCenter.y) / 2) * sy;
    } else {
      const anchor = groundedGuide.anchor === 'shoulder_center'
        ? {
          x: (shoulderL.x + shoulderR.x) / 2,
          y: (shoulderL.y + shoulderR.y) / 2,
        }
        : pelvisCenter;
      const sourceLength = groundedGuide.anchor === 'shoulder_center'
        ? Math.hypot(shoulderR.x - shoulderL.x, shoulderR.y - shoulderL.y)
        : Math.hypot(pelvisR.x - pelvisL.x, pelvisR.y - pelvisL.y);
      const halfLength = Math.max(35, sourceLength / 2);
      drawIdealLine(anchor.x - halfLength, anchor.y, anchor.x + halfLength, anchor.y);
      labelX = (anchor.x - halfLength) * sx;
      labelY = (anchor.y - 12) * sy;
    }
    drawIdealLabel(
      groundedGuide.label,
      labelX,
      labelY,
    );

    ctx.restore();
  }
}
