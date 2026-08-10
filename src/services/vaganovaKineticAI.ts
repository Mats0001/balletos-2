import { ReconstructedSkeleton, KinematicPoint } from './vaganova3DKinematics';

export interface KineticPoint {
  x: number;
  y: number;
  time: number;
}

export class VaganovaKineticAIService {
  private trails: Map<string, KineticPoint[]> = new Map();
  private maxTrailDuration = 1.6; // 1.6s trail duration for graceful curves

  constructor() {
    this.trails.set('wristL', []);
    this.trails.set('wristR', []);
    this.trails.set('ankleL', []);
    this.trails.set('ankleR', []);
  }

  public reset(): void {
    this.trails.forEach((arr) => (arr.length = 0));
  }

  public updateTrails(sk: ReconstructedSkeleton | null, currentTime: number): void {
    if (!sk) return;

    this.addPoint('wristL', sk.wristL, currentTime);
    this.addPoint('wristR', sk.wristR, currentTime);
    this.addPoint('ankleL', sk.ankleL, currentTime);
    this.addPoint('ankleR', sk.ankleR, currentTime);
  }

  private addPoint(key: string, pt: KinematicPoint | null, currentTime: number): void {
    if (!pt) return;
    const list = this.trails.get(key);
    if (!list) return;

    const last = list[list.length - 1];

    // Reset trail if video seeked or jumped
    if (last && Math.abs(currentTime - last.time) > 0.4) {
      list.length = 0;
    }

    // Ignore single-frame teleport spikes (> 140px)
    if (last) {
      const dist = Math.hypot(pt.x - last.x, pt.y - last.y);
      if (dist > 140) return;
    }

    list.push({ x: pt.x, y: pt.y, time: currentTime });

    // Prune points older than maxTrailDuration
    while (list.length > 0 && currentTime - list[0].time > this.maxTrailDuration) {
      list.shift();
    }
  }

  public getTrailPoints(key: string): KineticPoint[] {
    return this.trails.get(key) || [];
  }

  /**
   * Generates a silky-smooth Catmull-Rom Cubic Spline SVG path (No sharp angles!)
   */
  public getTrailPath(key: string): string {
    const pts = this.trails.get(key);
    if (!pts || pts.length < 2) return '';

    if (pts.length === 2) {
      return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
    }

    let d = `M ${pts[0].x} ${pts[0].y}`;

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(i + 2, pts.length - 1)];

      // Catmull-Rom to Cubic Bézier conversion
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }

    return d;
  }

  /**
   * Generates a tapering "comet tail" SVG path (filled polygon).
   * The trail is widest at the current position and tapers to a point at the oldest.
   * This creates the premium smooth sweeping effect.
   */
  public getTaperingTrailPath(key: string, maxWidth: number = 8): string {
    const pts = this.trails.get(key);
    if (!pts || pts.length < 3) return '';

    const len = pts.length;
    const leftEdge: { x: number; y: number }[] = [];
    const rightEdge: { x: number; y: number }[] = [];

    for (let i = 0; i < len; i++) {
      const progress = i / (len - 1); // 0 = oldest (tip), 1 = newest (wide)
      const width = maxWidth * progress * progress; // Quadratic taper for elegant curve

      // Get tangent direction at this point
      let dx: number, dy: number;
      if (i === 0) {
        dx = pts[1].x - pts[0].x;
        dy = pts[1].y - pts[0].y;
      } else if (i === len - 1) {
        dx = pts[i].x - pts[i - 1].x;
        dy = pts[i].y - pts[i - 1].y;
      } else {
        dx = pts[i + 1].x - pts[i - 1].x;
        dy = pts[i + 1].y - pts[i - 1].y;
      }

      // Normal (perpendicular) vector
      const tangentLen = Math.sqrt(dx * dx + dy * dy);
      if (tangentLen < 0.001) continue;
      const nx = -dy / tangentLen;
      const ny = dx / tangentLen;

      leftEdge.push({
        x: pts[i].x + nx * width,
        y: pts[i].y + ny * width
      });
      rightEdge.push({
        x: pts[i].x - nx * width,
        y: pts[i].y - ny * width
      });
    }

    if (leftEdge.length < 2) return '';

    // Build filled polygon: forward along left edge, backward along right edge
    let d = `M ${leftEdge[0].x.toFixed(1)} ${leftEdge[0].y.toFixed(1)}`;
    for (let i = 1; i < leftEdge.length; i++) {
      d += ` L ${leftEdge[i].x.toFixed(1)} ${leftEdge[i].y.toFixed(1)}`;
    }
    for (let i = rightEdge.length - 1; i >= 0; i--) {
      d += ` L ${rightEdge[i].x.toFixed(1)} ${rightEdge[i].y.toFixed(1)}`;
    }
    d += ' Z';
    return d;
  }

  /**
   * Computes Center of Gravity (CoG)
   */
  public computeCenterOfGravity(sk: ReconstructedSkeleton | null): { x: number; y: number } {
    if (!sk) return { x: 500, y: 550 };
    const cx = (sk.sternum.x * 0.25 + sk.navel.x * 0.35 + sk.pelvisCenter.x * 0.4);
    const cy = (sk.sternum.y * 0.25 + sk.navel.y * 0.35 + sk.pelvisCenter.y * 0.4);
    return { x: cx, y: cy };
  }
}

export const vaganovaKineticAI = new VaganovaKineticAIService();
