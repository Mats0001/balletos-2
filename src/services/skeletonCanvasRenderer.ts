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
  isPlie: boolean;
  vaganovaAnalysis: any; // From vaganovaAngleCalculator
  /** Darstellungsmodus:
   * 'lehrer-ampel' – Grün/Rot/Gelb aus Rohwerten (Nicole-Unterrichtshilfe, nicht validiert)
   * 'anatomisch'   – Farbe nach Körperregion, kein Urteil
   * 'lehrbuch'     – monochromes Weiß, maximale Klarheit
   */
  overlayMode?: 'lehrer-ampel' | 'anatomisch' | 'lehrbuch';
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

  // Status → Farbe (nur aktiv in 'lehrer-ampel'-Modus)
  const statusColor = (s?: string): string => {
    if (mode !== 'lehrer-ampel') return mode === 'lehrbuch' ? '#e2e8f0' : COLOR_JOINT;
    return s === 'CORRECT' ? '#30d158' : s === 'WARNING' ? '#ffd60a' : s === 'ERROR' ? '#ff453a' : '#30d158';
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
    const cogC = mode === 'lehrer-ampel' ? '#30d158' : COLOR_COG;
    drawLine(ctx, cog.x, cog.y, cog.x, 950, cogC, 2.5, sx, sy, [4, 4]);
    drawCircle(ctx, cog.x, cog.y, 10, mode === 'lehrer-ampel' ? 'rgba(48,209,88,0.25)' : 'rgba(167,139,250,0.25)', sx, sy, cogC, 3);
    drawCircle(ctx, cog.x, cog.y, 3, '#ffffff', sx, sy);
  }

  // ─── WINKEL-BÖGEN (Turnout) ───
  if (opts.showAngleArcs) {
    const avgS = (sx + sy) / 2;
    const turnoutPairs: Array<[KinematicPoint, string]> = [
      [ankleL, 'turnoutL'],
      [ankleR, 'turnoutR'],
    ];
    for (const [anklePoint, turnoutKey] of turnoutPairs) {
      const turnoutVal = opts.vaganovaAnalysis?.[turnoutKey];
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
  const torsoConf = opts.vaganovaAnalysis?.spineTilt?.confidence;
  ctx.globalAlpha = confidenceAlpha(torsoConf) * 0.75;
  drawLine(ctx, shoulderL.x, shoulderL.y, pelvisL.x, pelvisL.y, boneColor(COLOR_SPINE), 2.5, sx, sy);
  drawLine(ctx, shoulderR.x, shoulderR.y, pelvisR.x, pelvisR.y, boneColor(COLOR_SPINE), 2.5, sx, sy);
  // Becken-Leiste
  const pelvisConf = opts.vaganovaAnalysis?.pelvicTilt?.confidence;
  const pelvisC = mode === 'lehrer-ampel'
    ? statusColor(opts.vaganovaAnalysis?.pelvicTilt?.status)
    : boneColor(COLOR_PELVIS);
  ctx.globalAlpha = confidenceAlpha(pelvisConf);
  drawLine(ctx, pelvisL.x, pelvisL.y, pelvisR.x, pelvisR.y, pelvisC, 4, sx, sy);
  ctx.globalAlpha = 1.0;

  // ─── BEINE (indigo / status im Lehrer-Ampel-Modus) ───
  // Valgus-Ringe bleiben entfernt (Richtungsfehler abs()). Status zeigt nur Beinfarbe.
  const legLConf = opts.vaganovaAnalysis?.valgusDriftL?.confidence;
  const legRConf = opts.vaganovaAnalysis?.valgusDriftR?.confidence;
  const legLC = mode === 'lehrer-ampel'
    ? statusColor(opts.vaganovaAnalysis?.kneeFlexionL?.status ?? opts.vaganovaAnalysis?.valgusDriftL?.status)
    : boneColor(COLOR_LEG);
  const legRC = mode === 'lehrer-ampel'
    ? statusColor(opts.vaganovaAnalysis?.kneeFlexionR?.status ?? opts.vaganovaAnalysis?.valgusDriftR?.status)
    : boneColor(COLOR_LEG);

  // Linkes Bein
  ctx.globalAlpha = confidenceAlpha(legLConf);
  drawLine(ctx, pelvisL.x, pelvisL.y, kneeL.x, kneeL.y, legLC, 4.5, sx, sy);
  drawLine(ctx, kneeL.x, kneeL.y, ankleL.x, ankleL.y, legLC, 4.5, sx, sy);
  const kneeRSize = opts.selectedJointId === 'right_knee' ? 9 : 6.5;
  drawCircle(ctx, kneeL.x, kneeL.y, kneeRSize,
    opts.selectedJointId === 'right_knee' ? selColor : (mode === 'lehrer-ampel' ? legLC : COLOR_JOINT), sx, sy);
  ctx.globalAlpha = 1.0;

  // Rechtes Bein
  ctx.globalAlpha = confidenceAlpha(legRConf);
  drawLine(ctx, pelvisR.x, pelvisR.y, kneeR.x, kneeR.y, legRC, 4.5, sx, sy);
  drawLine(ctx, kneeR.x, kneeR.y, ankleR.x, ankleR.y, legRC, 4.5, sx, sy);
  const kneeLSize = opts.selectedJointId === 'left_knee' ? 11 : 8.5;
  drawCircle(ctx, kneeR.x, kneeR.y, kneeLSize,
    opts.selectedJointId === 'left_knee' ? selColor : (mode === 'lehrer-ampel' ? legRC : COLOR_JOINT), sx, sy);
  ctx.globalAlpha = 1.0;

  // ─── FUß-DOTS ───
  if (footL && footAlignment.left && footAlignment.left.type !== 'NEUTRAL') {
    const fc = mode === 'lehrer-ampel'
      ? (footAlignment.left.status === 'ERROR' ? '#ff453a' : '#ffd60a')
      : boneColor(COLOR_LEG);
    drawCircle(ctx, ankleL.x, ankleL.y, 8, fc, sx, sy);
  }
  if (footR && footAlignment.right && footAlignment.right.type !== 'NEUTRAL') {
    const fc = mode === 'lehrer-ampel'
      ? (footAlignment.right.status === 'ERROR' ? '#ff453a' : '#ffd60a')
      : boneColor(COLOR_LEG);
    drawCircle(ctx, ankleR.x, ankleR.y, 8, fc, sx, sy);
  }

  // ─── SCHWERPUNKT-DOT ───
  if (weightDist.status !== 'CORRECT') {
    const wc = mode === 'lehrer-ampel'
      ? (weightDist.status === 'ERROR' ? '#ff453a' : '#ffd60a')
      : COLOR_COG;
    ctx.globalAlpha = 0.65;
    drawCircle(ctx, cog.x, cog.y, 10,
      mode === 'lehrer-ampel' ? 'rgba(255,100,100,0.25)' : 'rgba(167,139,250,0.35)',
      sx, sy, wc, 2.5);
    ctx.globalAlpha = 1.0;
  }
}
