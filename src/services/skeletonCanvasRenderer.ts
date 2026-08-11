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
import { TEACHER_AMPEL_COLORS, NEUTRAL_MEASUREMENT_CLASSES } from '../config/buildPolicy';
import { TeacherOverlayPacket, heuristicColor, heuristicDash } from '../types/teacherHeuristic';

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
  /** Dim everything except the focused joint area (spotlight effect) */
  showFocusDim?: boolean;
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
  strokeWidth?: number
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
    ctx.stroke();
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
 * Draws a dashed circle (ring) in viewbox coordinates.
 */
function drawDashedCircle(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  r: number,
  color: string,
  width: number,
  sx: number, sy: number
) {
  const avgScale = (sx + sy) / 2;
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width * avgScale;
  ctx.setLineDash([3 * avgScale, 2 * avgScale]);
  ctx.globalAlpha = 0.8;
  ctx.arc(cx * sx, cy * sy, r * avgScale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1.0;
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
  // Packet aus opts – fehlt es im Lehrer-Modus, alles blocked
  const pkt = opts.overlayPacket;

  // Status → Farbe (nur aktiv in 'lehrer-ampel'-Modus)
  // WICHTIG: undefined/not_measurable = NEUTRAL (niemals automatisch Grün!)
  // (Berater PROJECT_DECISION 2026-08-10)
  const statusColor = (s?: string, measurementClass?: string): string => {
    if (mode !== 'lehrer-ampel') return mode === 'lehrbuch' ? '#e2e8f0' : COLOR_JOINT;
    // Neutrale Zustände: fehlende Evidenz darf NIEMALS Grün werden
    if (!s || s === undefined) return TEACHER_AMPEL_COLORS.NEUTRAL;
    if (measurementClass && NEUTRAL_MEASUREMENT_CLASSES.has(measurementClass as any))
      return TEACHER_AMPEL_COLORS.NEUTRAL;
    return s === 'CORRECT' ? TEACHER_AMPEL_COLORS.CORRECT
         : s === 'WARNING' ? TEACHER_AMPEL_COLORS.WARNING
         : s === 'ERROR'   ? TEACHER_AMPEL_COLORS.ERROR
         : TEACHER_AMPEL_COLORS.NEUTRAL;
  };

  /**
   * Holt Farbe aus TeacherOverlayPacket für einen Körperbereich.
   * Renderer berechnet KEINE Heuristik – nur Farb-Lookup.
   * Fehlt das Packet → NEUTRAL.
   */
  const packetColor = (key: keyof TeacherOverlayPacket): string => {
    if (mode !== 'lehrer-ampel' || !pkt) return mode === 'lehrbuch' ? '#e2e8f0' : COLOR_JOINT;
    const state = pkt[key];
    if (typeof state !== 'string') return TEACHER_AMPEL_COLORS.NEUTRAL;
    // Only heuristic state strings go through heuristicColor
    if (state === 'heuristic_match' || state === 'heuristic_attention' || state === 'heuristic_strong_attention' || state === 'blocked') {
      return heuristicColor(state);
    }
    return TEACHER_AMPEL_COLORS.NEUTRAL;
  };

  /** Strich-Muster für blockierte Bereiche */
  const packetDash = (key: keyof TeacherOverlayPacket): number[] => {
    if (mode !== 'lehrer-ampel' || !pkt) return [];
    const state = pkt[key];
    if (typeof state !== 'string') return [5, 4];
    if (state === 'heuristic_match' || state === 'heuristic_attention' || state === 'heuristic_strong_attention' || state === 'blocked') {
      return heuristicDash(state);
    }
    return [];
  };

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
  drawLine(ctx, head.x, head.y - 30, head.x, 950, 'rgba(255,255,255,0.45)', 2, sx, sy, [6, 6]);

  // ─── MOTION TRAILS ───
  if (opts.showMotionTrails) {
    // Tapering trails (comet tails)
    drawSVGPath(ctx, vaganovaKineticAI.getTaperingTrailPath('wristL', 10), 'rgba(192,132,252,0.5)', null, 0, sx, sy);
    drawSVGPath(ctx, vaganovaKineticAI.getTaperingTrailPath('wristR', 10), 'rgba(192,132,252,0.5)', null, 0, sx, sy);
    drawSVGPath(ctx, vaganovaKineticAI.getTaperingTrailPath('ankleL', 10), 'rgba(48,209,88,0.5)', null, 0, sx, sy);
    drawSVGPath(ctx, vaganovaKineticAI.getTaperingTrailPath('ankleR', 10), 'rgba(48,209,88,0.5)', null, 0, sx, sy);

    // Centerline spines
    drawSVGPath(ctx, vaganovaKineticAI.getTrailPath('wristL'), null, '#c084fc', 1.5, sx, sy, 0.6);
    drawSVGPath(ctx, vaganovaKineticAI.getTrailPath('wristR'), null, '#c084fc', 1.5, sx, sy, 0.6);
    drawSVGPath(ctx, vaganovaKineticAI.getTrailPath('ankleL'), null, '#30d158', 1.5, sx, sy, 0.6);
    drawSVGPath(ctx, vaganovaKineticAI.getTrailPath('ankleR'), null, '#30d158', 1.5, sx, sy, 0.6);

    // Trail endpoint nodes
    for (const [key, color] of [['wristL', '#c084fc'], ['wristR', '#c084fc'], ['ankleL', '#30d158'], ['ankleR', '#30d158']] as [string, string][]) {
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
    // 'blocked' → grau (fehlende Evidenz ist KEIN positiver Befund)
    const cogC = mode === 'lehrer-ampel'
      ? packetColor('cog')
      : COLOR_COG;
    const cogDash = mode === 'lehrer-ampel' ? packetDash('cog') : [];
    drawLine(ctx, cog.x, cog.y, cog.x, 950, cogC, 2.5, sx, sy, cogDash);
    drawCircle(ctx, cog.x, cog.y, 10,
      mode === 'lehrer-ampel' ? (cogC + '25').slice(0, 9) : 'rgba(167,139,250,0.25)',
      sx, sy, cogC, 3);
    drawCircle(ctx, cog.x, cog.y, 3, '#ffffff', sx, sy);
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
      const turnoutVal = va?.[turnoutKey];
      const turnoutConf = turnoutVal?.confidence ?? 0.7;
      const tColor = mode === 'lehrer-ampel'
        ? statusColor(turnoutVal?.status)
        : boneColor(COLOR_SPINE);
      ctx.beginPath();
      ctx.arc(anklePoint.x * sx, anklePoint.y * sy, 28 * avgS, Math.PI, 0);
      ctx.strokeStyle = tColor;
      ctx.lineWidth = 3 * avgS;
      ctx.globalAlpha = confidenceAlpha(turnoutConf) * 0.7;
      ctx.fillStyle = mode === 'lehrer-ampel'
        ? (turnoutVal?.status === 'CORRECT' ? 'rgba(48,209,88,0.12)' : 'rgba(255,214,10,0.10)')
        : 'rgba(226,232,240,0.06)';
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }
  }

  // ─── KOPF & HALS ───
  const headConf = opts.vaganovaAnalysis?.headTilt?.confidence;
  const headStatusC = statusColor(opts.vaganovaAnalysis?.headTilt?.status);
  const headC = mode === 'lehrer-ampel' ? headStatusC : boneColor(COLOR_HEAD);
  ctx.globalAlpha = confidenceAlpha(headConf);
  drawCircle(ctx, head.x, head.y, 18,
    mode === 'lehrer-ampel' ? 'rgba(192,132,252,0.15)' : 'rgba(192,132,252,0.18)', sx, sy,
    opts.selectedJointId === 'head_epaulement' ? selColor : headC, 2.5);
  drawLine(ctx, head.x, head.y, neck.x, neck.y, boneColor(COLOR_SPINE), 3.5, sx, sy);
  ctx.globalAlpha = 1.0;

  // ─── WIRBELSÄULE ───
  const spineConf = opts.vaganovaAnalysis?.spineTilt?.confidence;
  const spineC = mode === 'lehrer-ampel'
    ? statusColor(opts.vaganovaAnalysis?.spineTilt?.status)
    : boneColor(COLOR_SPINE);
  ctx.globalAlpha = confidenceAlpha(spineConf);
  drawLine(ctx, neck.x, neck.y, sternum.x, sternum.y, spineC, 4, sx, sy);
  drawLine(ctx, sternum.x, sternum.y, navel.x, navel.y, spineC, 4, sx, sy);
  drawLine(ctx, navel.x, navel.y, pelvisCenter.x, pelvisCenter.y, spineC, 4, sx, sy);
  drawCircle(ctx, neck.x, neck.y, 5.5, COLOR_JOINT, sx, sy);
  drawCircle(ctx, sternum.x, sternum.y, 5.5, COLOR_JOINT, sx, sy);
  drawCircle(ctx, navel.x, navel.y, 6.5, selColor, sx, sy);
  drawCircle(ctx, pelvisCenter.x, pelvisCenter.y, 7, COLOR_JOINT, sx, sy);
  ctx.globalAlpha = 1.0;

  // ─── ARME (violett / status im Lehrer-Ampel-Modus) ───
  const armLConf = opts.vaganovaAnalysis?.armLineQualityL?.confidence;
  const armRConf = opts.vaganovaAnalysis?.armLineQualityR?.confidence;
  const armLStatusC = statusColor(opts.vaganovaAnalysis?.armLineQualityL?.status);
  const armRStatusC = statusColor(opts.vaganovaAnalysis?.armLineQualityR?.status);
  const armLColor = opts.selectedJointId === 'port_de_bras_arms' ? selColor
    : mode === 'lehrer-ampel' ? armLStatusC : boneColor(COLOR_ARM);
  const armRColor = opts.selectedJointId === 'port_de_bras_arms' ? selColor
    : mode === 'lehrer-ampel' ? armRStatusC : boneColor(COLOR_ARM);

  // Schulterleiste
  const shConf = opts.vaganovaAnalysis?.shoulderSymmetry?.confidence;
  const shC = mode === 'lehrer-ampel'
    ? statusColor(opts.vaganovaAnalysis?.shoulderSymmetry?.status)
    : boneColor(COLOR_ARM);
  ctx.globalAlpha = confidenceAlpha(shConf);
  drawLine(ctx, shoulderL.x, shoulderL.y, shoulderR.x, shoulderR.y, shC, 3.5, sx, sy);
  drawCircle(ctx, shoulderL.x, shoulderL.y, 7, COLOR_JOINT, sx, sy);
  drawCircle(ctx, shoulderR.x, shoulderR.y, 7, COLOR_JOINT, sx, sy);
  ctx.globalAlpha = 1.0;

  // Linker Arm
  ctx.globalAlpha = confidenceAlpha(armLConf);
  drawLine(ctx, shoulderL.x, shoulderL.y, elbowL.x, elbowL.y, armLColor, 4.5, sx, sy);
  drawLine(ctx, elbowL.x, elbowL.y, wristL.x, wristL.y, armLColor, 4.5, sx, sy);
  // Rechter Arm
  ctx.globalAlpha = confidenceAlpha(armRConf);
  drawLine(ctx, shoulderR.x, shoulderR.y, elbowR.x, elbowR.y, armRColor, 4.5, sx, sy);
  drawLine(ctx, elbowR.x, elbowR.y, wristR.x, wristR.y, armRColor, 4.5, sx, sy);
  ctx.globalAlpha = 1.0;

  // Ellenbogen-Ringe
  const elbowC = boneColor(COLOR_ARM);
  ctx.globalAlpha = confidenceAlpha(armLConf ?? 0.8) * 0.85;
  drawDashedCircle(ctx, elbowL.x, elbowL.y, 18, mode === 'lehrer-ampel' ? armLStatusC : elbowC, 2, sx, sy);
  ctx.globalAlpha = confidenceAlpha(armRConf ?? 0.8) * 0.85;
  drawDashedCircle(ctx, elbowR.x, elbowR.y, 18, mode === 'lehrer-ampel' ? armRStatusC : elbowC, 2, sx, sy);
  ctx.globalAlpha = 1.0;

  // Gelenk-Dots
  drawCircle(ctx, elbowL.x, elbowL.y, 5.5, COLOR_JOINT, sx, sy);
  drawCircle(ctx, elbowR.x, elbowR.y, 5.5, COLOR_JOINT, sx, sy);
  drawCircle(ctx, wristL.x, wristL.y, 5.5, COLOR_JOINT, sx, sy);
  drawCircle(ctx, wristR.x, wristR.y, 5.5, COLOR_JOINT, sx, sy);

  // ─── ÉPAULEMENT: shoulder line only ───
  drawLine(ctx, shoulderL.x - 15, shoulderL.y, shoulderR.x + 15, shoulderR.y, COLOR_EPAULEMENT, 1.5, sx, sy, [6, 3]);

  // ─── TORSO RAHMEN ───
  // FIX 2026-08-11: Torso-Seitenlinien reagieren jetzt auf TeacherOverlayPacket.torsoAlignment
  // Vorher: boneColor(COLOR_SPINE) ignorierte den Lehrer-Ampel-Modus komplett (Issue 1.2)
  const torsoAlignC = mode === 'lehrer-ampel'
    ? packetColor('torsoAlignment')
    : boneColor(COLOR_SPINE);
  const torsoDash = mode === 'lehrer-ampel' ? packetDash('torsoAlignment') : [];
  const torsoConf = opts.vaganovaAnalysis?.spineTilt?.confidence;
  ctx.globalAlpha = confidenceAlpha(torsoConf) * 0.75;
  drawLine(ctx, shoulderL.x, shoulderL.y, pelvisL.x, pelvisL.y, torsoAlignC, 2.5, sx, sy, torsoDash);
  drawLine(ctx, shoulderR.x, shoulderR.y, pelvisR.x, pelvisR.y, torsoAlignC, 2.5, sx, sy, torsoDash);
  // Becken-Leiste
  const pelvisConf = opts.vaganovaAnalysis?.pelvicTilt?.confidence;
  const pelvisC = mode === 'lehrer-ampel'
    ? statusColor(opts.vaganovaAnalysis?.pelvicTilt?.status)
    : boneColor(COLOR_PELVIS);
  ctx.globalAlpha = confidenceAlpha(pelvisConf);
  drawLine(ctx, pelvisL.x, pelvisL.y, pelvisR.x, pelvisR.y, pelvisC, 4, sx, sy);
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
  ctx.globalAlpha = confidenceAlpha(legLConf);
  drawLine(ctx, pelvisL.x, pelvisL.y, kneeL.x, kneeL.y, legLC, 4.5, sx, sy, legLDash);
  drawLine(ctx, kneeL.x, kneeL.y, ankleL.x, ankleL.y, legLC, 4.5, sx, sy, legLDash);
  const kneeLSize = opts.selectedJointId === 'left_knee' ? 9 : 6.5;
  drawCircle(ctx, kneeL.x, kneeL.y, kneeLSize,
    opts.selectedJointId === 'left_knee' ? selColor : (mode === 'lehrer-ampel' ? legLC : COLOR_JOINT), sx, sy);
  ctx.globalAlpha = 1.0;

  // Rechtes Bein
  ctx.globalAlpha = confidenceAlpha(legRConf);
  drawLine(ctx, pelvisR.x, pelvisR.y, kneeR.x, kneeR.y, legRC, 4.5, sx, sy, legRDash);
  drawLine(ctx, kneeR.x, kneeR.y, ankleR.x, ankleR.y, legRC, 4.5, sx, sy, legRDash);
  const kneeRSize = opts.selectedJointId === 'right_knee' ? 9 : 6.5;
  drawCircle(ctx, kneeR.x, kneeR.y, kneeRSize,
    opts.selectedJointId === 'right_knee' ? selColor : (mode === 'lehrer-ampel' ? legRC : COLOR_JOINT), sx, sy);
  ctx.globalAlpha = 1.0;

  // ─── FUß-DOTS (aus TeacherOverlayPacket) ───
  // FIX 2026-08-11: Fuß-Dots kommen jetzt aus Packet, nicht mehr direkt aus FootAnalyzer (Issue 1.3)
  // footL/footR = 'blocked' → kein Dot (fehlende Evidenz = kein Urteil)
  const footLC = mode === 'lehrer-ampel' ? packetColor('footL') : boneColor(COLOR_LEG);
  const footRC = mode === 'lehrer-ampel' ? packetColor('footR') : boneColor(COLOR_LEG);
  if (footL && mode === 'lehrer-ampel' && pkt?.footL !== 'blocked') {
    drawCircle(ctx, ankleL.x, ankleL.y, 8, footLC, sx, sy, footLC, 2);
  }
  if (footR && mode === 'lehrer-ampel' && pkt?.footR !== 'blocked') {
    drawCircle(ctx, ankleR.x, ankleR.y, 8, footRC, sx, sy, footRC, 2);
  }

  // ─── SCHWERPUNKT-DOT ───
  // FIX 2026-08-11: WeightDist-Status wird nicht mehr direkt gerendet
  // CoG-Packet (projected_torso_center_proxy) kommt aus overlayPacket.cog (bereits oben gerendert)
  // Dieser separate WeightDist-Dot wurde entfernt – Doppeldarstellung vermieden

  // ─── FOCUS-DIM: Umgebung abdunkeln, Fokus-Bereich klar ───
  // Legt eine halbtransparente dunkle Schicht über das gesamte Bild
  // mit einem kreisförmigen "Fenster" um das selektierte Gelenk.
  if (opts.showFocusDim && opts.selectedJointId && opts.selectedJointId !== '') {
    let focusX: number | undefined;
    let focusY: number | undefined;
    let focusR = 80;

    switch (opts.selectedJointId) {
      case 'left_knee':   focusX = kneeL.x; focusY = kneeL.y; focusR = 65; break;
      case 'right_knee':  focusX = kneeR.x; focusY = kneeR.y; focusR = 65; break;
      case 'left_elbow':  focusX = elbowL.x; focusY = elbowL.y; focusR = 55; break;
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

  // ─── GLOW-HIGHLIGHT FÜR SELEKTIERTE CUE-POINTS ───
  // Rendering-Reihenfolge: Focus-Dim → Glow → Ideal-Overlay
  // Glow VOR Ideal-Overlay damit Labels nicht überdeckt werden.
  const selId = opts.selectedJointId;
  const glowPhase = opts.glowPulsePhase ?? 0;
  const isGood = opts.glowType === 'GOOD';

  if (selId && selId !== '') {
    let glowX: number | undefined;
    let glowY: number | undefined;
    let glowRadius = 25;

    switch (selId) {
      case 'left_knee':
        glowX = kneeL.x; glowY = kneeL.y;
        glowRadius = 28;
        break;
      case 'right_knee':
        glowX = kneeR.x; glowY = kneeR.y;
        glowRadius = 28;
        break;
      case 'left_elbow':
        glowX = elbowL.x; glowY = elbowL.y;
        glowRadius = 24;
        break;
      case 'spine_center':
        glowX = sternum.x; glowY = sternum.y;
        glowRadius = 30;
        break;
      case 'pelvis_core':
        glowX = pelvisCenter.x; glowY = pelvisCenter.y;
        glowRadius = 30;
        break;
      case 'shoulder_line':
        glowX = (shoulderL.x + shoulderR.x) / 2;
        glowY = (shoulderL.y + shoulderR.y) / 2;
        glowRadius = 35;
        break;
      case 'head_epaulement':
        glowX = head.x; glowY = head.y;
        glowRadius = 26;
        break;
      case 'port_de_bras_arms':
        drawGlowRing(ctx, elbowL.x, elbowL.y, 22, glowPhase, isGood, sx, sy);
        drawGlowRing(ctx, elbowR.x, elbowR.y, 22, glowPhase, isGood, sx, sy);
        break;
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

  if (opts.showIdealOverlay && opts.selectedJointId && opts.selectedJointId !== '') {
    ctx.save();
    ctx.globalAlpha = IDEAL_ALPHA;

    switch (opts.selectedJointId) {
      case 'left_knee': {
        // VAGANOVA/IADMS REFERENZ: Knie soll über dem 2./3. Metatarsal projizieren
        // Proxy: Mittelpunkt Knöchel↔Zeh ≈ 2. Metatarsal-Kopf
        // Vertikale Referenz von dort nach oben = "hier soll das Knie sein"
        const targetLX = footL ? (ankleL.x + footL.x) / 2 : ankleL.x;
        drawIdealLine(targetLX, kneeL.y - 20, targetLX, ankleL.y + 15);
        // Fuß-Markierung: kleiner Punkt am Referenzpunkt
        drawCircle(ctx, targetLX, ankleL.y + 5, 5, 'none', sx, sy, IDEAL_COLOR, 2.5);
        drawIdealLabel('Knie→Fuß', (targetLX + 18) * sx, ((kneeL.y + ankleL.y) / 2) * sy);
        break;
      }
      case 'right_knee': {
        const targetRX = footR ? (ankleR.x + footR.x) / 2 : ankleR.x;
        drawIdealLine(targetRX, kneeR.y - 20, targetRX, ankleR.y + 15);
        drawCircle(ctx, targetRX, ankleR.y + 5, 5, 'none', sx, sy, IDEAL_COLOR, 2.5);
        drawIdealLabel('Knie→Fuß', (targetRX + 18) * sx, ((kneeR.y + ankleR.y) / 2) * sy);
        break;
      }
      case 'spine_center': {
        // APLOMB: Lotlinie vertikal bei pelvisCenter.x
        // Kopf soll direkt darüber stehen (Vaganova Квадратност)
        drawIdealLine(pelvisCenter.x, head.y - 15, pelvisCenter.x, pelvisCenter.y + 15);
        drawIdealLabel('Lot', (pelvisCenter.x + 18) * sx, ((head.y + pelvisCenter.y) / 2) * sy);
        break;
      }
      case 'pelvis_core': {
        // BECKEN-WAAGE: ASIS-ASIS horizontal (Vaganova Quadratnost)
        const pelvisCenterY = (pelvisL.y + pelvisR.y) / 2;
        drawIdealLine(pelvisL.x - 25, pelvisCenterY, pelvisR.x + 25, pelvisCenterY);
        drawIdealLabel('Becken-Waage', (pelvisR.x + 30) * sx, pelvisCenterY * sy + 5);
        break;
      }
      case 'shoulder_line': {
        // SCHULTER-WAAGE: Akromion-Akromion horizontal
        const shCenterY = (shoulderL.y + shoulderR.y) / 2;
        drawIdealLine(shoulderL.x - 25, shCenterY, shoulderR.x + 25, shCenterY);
        drawIdealLabel('Schulter-Waage', (shoulderR.x + 30) * sx, shCenterY * sy + 5);
        break;
      }
      case 'left_elbow':
      case 'port_de_bras_arms': {
        // ALLONGÉ-BOGEN: Proportionaler Offset statt hardcodierter 8px
        const armLenL = Math.abs(wristL.y - shoulderL.y);
        const idealElbowLY = shoulderL.y + armLenL * 0.08;
        const idealElbowLX = (shoulderL.x + wristL.x) / 2;
        drawIdealLine(shoulderL.x, shoulderL.y, idealElbowLX, idealElbowLY);
        drawIdealLine(idealElbowLX, idealElbowLY, wristL.x, wristL.y);
        drawCircle(ctx, idealElbowLX, idealElbowLY, 10, 'none', sx, sy, IDEAL_COLOR, 3);
        if (opts.selectedJointId === 'port_de_bras_arms') {
          const armLenR = Math.abs(wristR.y - shoulderR.y);
          const idealElbowRY = shoulderR.y + armLenR * 0.08;
          const idealElbowRX = (shoulderR.x + wristR.x) / 2;
          drawIdealLine(shoulderR.x, shoulderR.y, idealElbowRX, idealElbowRY);
          drawIdealLine(idealElbowRX, idealElbowRY, wristR.x, wristR.y);
          drawCircle(ctx, idealElbowRX, idealElbowRY, 10, 'none', sx, sy, IDEAL_COLOR, 3);
        }
        break;
      }
      case 'head_epaulement': {
        // KOPF-LOT: Vertikale Becken→Kopf Achse
        drawIdealLine(pelvisCenter.x, head.y - 20, pelvisCenter.x, pelvisCenter.y);
        drawIdealLabel('Lot', (pelvisCenter.x + 18) * sx, ((head.y + pelvisCenter.y) / 2) * sy);
        break;
      }
    }

    ctx.restore();
  }
}
