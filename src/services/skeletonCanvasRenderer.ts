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

// Colors
const COLOR_GOOD = '#30d158';
const COLOR_BAD = '#ff453a';
const COLOR_WARN = '#ffd700';
const COLOR_ARM_BADGE = '#c084fc';
const COLOR_EPAULEMENT = '#64d2ff';

export interface CanvasRenderOptions {
  showSkeleton: boolean;
  showMotionTrails: boolean;
  showCoG: boolean;
  showAngleArcs: boolean;
  selectedJointId: string;
  isPlie: boolean;
  vaganovaAnalysis: any; // From vaganovaAngleCalculator
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

  // Helper: map Vaganova status to skeleton color
  const statusToColor = (s?: string) =>
    s === 'CORRECT' ? COLOR_GOOD :
    s === 'WARNING' ? '#ffd60a' :
    s === 'ERROR' ? COLOR_BAD : COLOR_GOOD;

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
    drawLine(ctx, cog.x, cog.y, cog.x, 950, COLOR_GOOD, 2.5, sx, sy, [4, 4]);
    drawCircle(ctx, cog.x, cog.y, 10, 'rgba(48,209,88,0.3)', sx, sy, COLOR_GOOD, 3);
    drawCircle(ctx, cog.x, cog.y, 3, '#ffffff', sx, sy);
  }

  // ─── ANGLE ARCS ───
  if (opts.showAngleArcs) {
    const avgS = (sx + sy) / 2;
    // Turnout arcs: BOTH ankles
    const turnoutPairs: Array<[KinematicPoint, string]> = [
      [ankleL, 'turnoutL'],
      [ankleR, 'turnoutR'],
    ];
    for (const [anklePoint, turnoutKey] of turnoutPairs) {
      const turnoutVal = opts.vaganovaAnalysis?.[turnoutKey];
      const turnoutColor = turnoutVal?.status === 'CORRECT' ? COLOR_GOOD :
        turnoutVal?.status === 'WARNING' ? '#ffd60a' : COLOR_BAD;
      ctx.beginPath();
      ctx.arc(anklePoint.x * sx, anklePoint.y * sy, 28 * avgS, Math.PI, 0);
      ctx.strokeStyle = turnoutColor;
      ctx.lineWidth = 3 * avgS;
      ctx.fillStyle = turnoutVal?.status === 'CORRECT'
        ? 'rgba(48,209,88,0.12)' : 'rgba(255,214,10,0.12)';
      ctx.fill();
      ctx.stroke();
    }
  }

  // ─── HEAD & CERVICAL NECK AXIS ───
  const headStatus = opts.vaganovaAnalysis?.headTilt?.status;
  const headRingColor = statusToColor(headStatus);
  drawCircle(ctx, head.x, head.y, 18, 'rgba(48,209,88,0.2)', sx, sy,
    opts.selectedJointId === 'head_epaulement' ? COLOR_WARN : headRingColor,
    opts.selectedJointId === 'head_epaulement' ? 4 : 2.5);
  drawLine(ctx, head.x, head.y, neck.x, neck.y, headRingColor, 3.5, sx, sy);

  // ─── SPINE ───
  const spineColor = statusToColor(opts.vaganovaAnalysis?.spineTilt?.status);
  drawLine(ctx, neck.x, neck.y, sternum.x, sternum.y, spineColor, 4, sx, sy);
  drawLine(ctx, sternum.x, sternum.y, navel.x, navel.y, spineColor, 4, sx, sy);
  drawLine(ctx, navel.x, navel.y, pelvisCenter.x, pelvisCenter.y, spineColor, 4, sx, sy);
  drawCircle(ctx, neck.x, neck.y, 5.5, spineColor, sx, sy);
  drawCircle(ctx, sternum.x, sternum.y, 5.5, spineColor, sx, sy);
  drawCircle(ctx, navel.x, navel.y, 6.5, COLOR_WARN, sx, sy);
  drawCircle(ctx, pelvisCenter.x, pelvisCenter.y, 7, spineColor, sx, sy);

  // ─── ARMS: Color from Vaganova armLineQuality status ───
  const armLStatus = opts.vaganovaAnalysis?.armLineQualityL?.status;
  const armRStatus = opts.vaganovaAnalysis?.armLineQualityR?.status;
  const armLColor = opts.selectedJointId === 'port_de_bras_arms' ? COLOR_WARN : statusToColor(armLStatus);
  const armRColor = opts.selectedJointId === 'port_de_bras_arms' ? COLOR_WARN : statusToColor(armRStatus);

  // Shoulder bar: color from shoulderSymmetry Vaganova status
  const shSymStatus = opts.vaganovaAnalysis?.shoulderSymmetry?.status;
  const shBarColor = statusToColor(shSymStatus);

  // Shoulder elevation dots: color from shoulderElevation status
  const shElevLColor = statusToColor(opts.vaganovaAnalysis?.shoulderElevationL?.status);
  const shElevRColor = statusToColor(opts.vaganovaAnalysis?.shoulderElevationR?.status);

  // Shoulder bar
  drawLine(ctx, shoulderL.x, shoulderL.y, shoulderR.x, shoulderR.y, shBarColor, 3.5, sx, sy);
  // Shoulder elevation dots (larger to indicate elevation quality)
  drawCircle(ctx, shoulderL.x, shoulderL.y, 7, shElevLColor, sx, sy);
  drawCircle(ctx, shoulderR.x, shoulderR.y, 7, shElevRColor, sx, sy);

  // Left arm
  drawLine(ctx, shoulderL.x, shoulderL.y, elbowL.x, elbowL.y, armLColor, 4, sx, sy);
  drawLine(ctx, elbowL.x, elbowL.y, wristL.x, wristL.y, armLColor, 4, sx, sy);
  // Right arm
  drawLine(ctx, shoulderR.x, shoulderR.y, elbowR.x, elbowR.y, armRColor, 4, sx, sy);
  drawLine(ctx, elbowR.x, elbowR.y, wristR.x, wristR.y, armRColor, 4, sx, sy);

  // Elbow rings (use arm line status for consistent coloring)
  const elbowLColor = armLStatus === 'ERROR' ? COLOR_BAD : armLStatus === 'WARNING' ? '#ffd60a' :
    (elbowQuality.left.roundnessStatus === 'CORRECT' ? COLOR_GOOD : elbowQuality.left.roundnessStatus === 'WARNING' ? '#ffd60a' : COLOR_BAD);
  const elbowRColor = armRStatus === 'ERROR' ? COLOR_BAD : armRStatus === 'WARNING' ? '#ffd60a' :
    (elbowQuality.right.roundnessStatus === 'CORRECT' ? COLOR_GOOD : elbowQuality.right.roundnessStatus === 'WARNING' ? '#ffd60a' : COLOR_BAD);
  drawDashedCircle(ctx, elbowL.x, elbowL.y, 18, elbowLColor, 2, sx, sy);
  drawDashedCircle(ctx, elbowR.x, elbowR.y, 18, elbowRColor, 2, sx, sy);

  // Joint dots
  drawCircle(ctx, elbowL.x, elbowL.y, 5, elbowLColor, sx, sy);
  drawCircle(ctx, elbowR.x, elbowR.y, 5, elbowRColor, sx, sy);
  drawCircle(ctx, wristL.x, wristL.y, 5, armLColor, sx, sy);
  drawCircle(ctx, wristR.x, wristR.y, 5, armRColor, sx, sy);

  // ARM POSITION: Color-coded wrist dots only (labels removed → side panel)
  const wristLColor = armPositions.leftLabel.includes('Position') ? COLOR_GOOD : '#ffd60a';
  const wristRColor = armPositions.rightLabel.includes('Position') ? COLOR_GOOD : '#ffd60a';

  // ─── ÉPAULEMENT: shoulder line only (label removed → side panel) ───
  drawLine(ctx, shoulderL.x - 15, shoulderL.y, shoulderR.x + 15, shoulderR.y, COLOR_EPAULEMENT, 1.5, sx, sy, [6, 3]);

  // ─── TORSO FRAME ───
  drawLine(ctx, shoulderL.x, shoulderL.y, pelvisL.x, pelvisL.y, spineColor, 3, sx, sy);
  drawLine(ctx, shoulderR.x, shoulderR.y, pelvisR.x, pelvisR.y, spineColor, 3, sx, sy);
  const pelvisBarColor = statusToColor(opts.vaganovaAnalysis?.pelvicTilt?.status);
  drawLine(ctx, pelvisL.x, pelvisL.y, pelvisR.x, pelvisR.y, pelvisBarColor, 4, sx, sy);

  // ─── LEGS ───
  // Valgus status drives leg colors (independent L and R)
  const valgusLStatus = opts.vaganovaAnalysis?.valgusDriftL?.status;
  const valgusRStatus = opts.vaganovaAnalysis?.valgusDriftR?.status;
  const legLColor = statusToColor(valgusLStatus);
  const legRColor = statusToColor(valgusRStatus);

  // Left leg
  drawLine(ctx, pelvisL.x, pelvisL.y, kneeL.x, kneeL.y, legLColor, 4, sx, sy);
  drawLine(ctx, kneeL.x, kneeL.y, ankleL.x, ankleL.y, legLColor, 4, sx, sy);
  const kneeRSize = opts.selectedJointId === 'right_knee' ? 9 : 6.5;
  const kneeRColor = opts.selectedJointId === 'right_knee' ? COLOR_WARN : legLColor;
  drawCircle(ctx, kneeL.x, kneeL.y, kneeRSize, kneeRColor, sx, sy);

  // Right leg
  drawLine(ctx, pelvisR.x, pelvisR.y, kneeR.x, kneeR.y, legRColor, 4, sx, sy);
  drawLine(ctx, kneeR.x, kneeR.y, ankleR.x, ankleR.y, legRColor, 4, sx, sy);
  const kneeLSize = opts.selectedJointId === 'left_knee' ? 11 : 8.5;
  const kneeLColor = opts.selectedJointId === 'left_knee' ? COLOR_WARN : legRColor;
  drawCircle(ctx, kneeR.x, kneeR.y, kneeLSize, kneeLColor, sx, sy);

  // ─── VALGUS RINGS: BOTH knees (not just right) ───
  const valgusLVal = opts.vaganovaAnalysis?.valgusDriftL?.value ?? 0;
  const valgusRVal = opts.vaganovaAnalysis?.valgusDriftR?.value ?? 0;
  if (valgusLVal > 5) {
    drawDashedCircle(ctx, kneeL.x, kneeL.y, 28, valgusLVal > 10 ? COLOR_BAD : '#ffd60a', 2.5, sx, sy);
  }
  if (valgusRVal > 5) {
    drawDashedCircle(ctx, kneeR.x, kneeR.y, 28, valgusRVal > 10 ? COLOR_BAD : '#ffd60a', 2.5, sx, sy);
  }

  // ─── FOOT ALIGNMENT: Color-coded ankle dots only (labels removed → side panel) ───
  if (footL && footAlignment.left && footAlignment.left.type !== 'NEUTRAL') {
    const fc = footAlignment.left.status === 'ERROR' ? COLOR_BAD : '#ffd60a';
    drawCircle(ctx, ankleL.x, ankleL.y, 8, fc, sx, sy);
  }
  if (footR && footAlignment.right && footAlignment.right.type !== 'NEUTRAL') {
    const fc = footAlignment.right.status === 'ERROR' ? COLOR_BAD : '#ffd60a';
    drawCircle(ctx, ankleR.x, ankleR.y, 8, fc, sx, sy);
  }

  // WEIGHT DISTRIBUTION: Color-coded CoG dot only (label removed → side panel)
  if (weightDist.status !== 'CORRECT') {
    const wc = weightDist.status === 'ERROR' ? COLOR_BAD : '#ffd60a';
    drawCircle(ctx, cog.x, cog.y, 10, wc, sx, sy);
  }
}
