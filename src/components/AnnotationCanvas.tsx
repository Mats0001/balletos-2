// AnnotationCanvas – Drawing overlay for paused video frames
// Architecture: strokesRef = source of truth, setState = render trigger only
// This avoids all stale-closure / React-batching race conditions.

import React, { useRef, useEffect, useImperativeHandle, forwardRef, useState, useCallback } from 'react';

export type DrawingTool = 'pen' | 'arrow' | 'eraser' | 'text';

export interface AnnotationCanvasHandle {
  clear: () => void;
  getDataUrl: () => string | null;
  hasStrokes: () => boolean;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

interface Props {
  width: number;
  height: number;
  isActive: boolean;
  tool: DrawingTool;
  color: string;
  lineWidth: number;
}

interface Point { x: number; y: number; }
interface Stroke {
  type: DrawingTool;
  color: string;
  lineWidth: number;
  points: Point[];
  text?: string;
}

export const AnnotationCanvas = forwardRef<AnnotationCanvasHandle, Props>(
  ({ width, height, isActive, tool, color, lineWidth }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // ── Source of truth lives in refs – no stale closure risk ──────────────
    const strokesRef = useRef<Stroke[]>([]);
    const redoStackRef = useRef<Stroke[]>([]);
    const currentPointsRef = useRef<Point[]>([]);
    const isDrawing = useRef(false);

    // Render trigger: incrementing this causes the useEffect to redraw
    const [tick, setTick] = useState(0);
    const forceRender = useCallback(() => setTick(t => t + 1), []);

    // ── Expose imperative handle ────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      clear: () => {
        strokesRef.current = [];
        redoStackRef.current = [];
        currentPointsRef.current = [];
        isDrawing.current = false;
        forceRender();
      },
      undo: () => {
        if (strokesRef.current.length === 0) return;
        const last = strokesRef.current[strokesRef.current.length - 1];
        strokesRef.current = strokesRef.current.slice(0, -1);
        redoStackRef.current = [...redoStackRef.current, last];
        forceRender();
      },
      redo: () => {
        if (redoStackRef.current.length === 0) return;
        const next = redoStackRef.current[redoStackRef.current.length - 1];
        redoStackRef.current = redoStackRef.current.slice(0, -1);
        strokesRef.current = [...strokesRef.current, next];
        forceRender();
      },
      canUndo: () => strokesRef.current.length > 0,
      canRedo: () => redoStackRef.current.length > 0,
      getDataUrl: () => canvasRef.current?.toDataURL('image/png') ?? null,
      hasStrokes: () => strokesRef.current.length > 0,
    }), [forceRender]);

    // ── Canvas redraw – reads directly from strokesRef ─────────────────────
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.width || !canvas.height) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw all completed strokes
      for (const stroke of strokesRef.current) {
        if (!stroke?.points?.length) continue;
        renderStroke(ctx, stroke);
      }

      // Draw current in-progress stroke (live preview)
      if (isDrawing.current && currentPointsRef.current.length > 0) {
        const liveStroke: Stroke = {
          type: tool,
          color,
          lineWidth,
          points: currentPointsRef.current,
        };
        renderStroke(ctx, liveStroke);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tick, width, height]);

    // ── Pointer helpers ─────────────────────────────────────────────────────
    const getPos = (e: React.MouseEvent | React.TouchEvent): Point | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      if ('touches' in e) {
        const touch = e.touches[0];
        if (!touch) return null;
        return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
      }
      return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    };

    // ── Event handlers ──────────────────────────────────────────────────────
    const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
      if (!isActive) return;
      const pos = getPos(e);
      if (!pos) return;

      if (tool === 'text') {
        const text = window.prompt('Beschriftung eingeben:');
        if (text?.trim()) {
          strokesRef.current = [
            ...strokesRef.current,
            { type: 'text', color, lineWidth, points: [pos], text: text.trim() },
          ];
          forceRender();
        }
        return;
      }

      isDrawing.current = true;
      currentPointsRef.current = [pos];
      forceRender();
    };

    const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
      if (!isActive || !isDrawing.current) return;
      const pos = getPos(e);
      if (!pos) return;
      currentPointsRef.current.push(pos);
      forceRender();
    };

    const handlePointerUp = () => {
      if (!isDrawing.current || currentPointsRef.current.length === 0) {
        isDrawing.current = false;
        return;
      }

      // Commit the finished stroke to the permanent list
      const finishedStroke: Stroke = {
        type: tool,
        color,
        lineWidth,
        points: [...currentPointsRef.current], // defensive copy
      };
      strokesRef.current = [...strokesRef.current, finishedStroke];
      redoStackRef.current = []; // new stroke clears redo history

      // Reset live stroke
      isDrawing.current = false;
      currentPointsRef.current = [];
      forceRender();
    };

    const safeWidth  = width  > 0 ? width  : 1;
    const safeHeight = height > 0 ? height : 1;

    return (
      <canvas
        ref={canvasRef}
        width={safeWidth}
        height={safeHeight}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
        style={{
          position: 'absolute',
          top: 0, left: 0,
          width: '100%', height: '100%',
          zIndex: 20,
          cursor: isActive
            ? tool === 'eraser' ? 'cell'
            : tool === 'text'   ? 'text'
            : 'crosshair'
            : 'default',
          pointerEvents: isActive ? 'auto' : 'none',
          touchAction: 'none',
        }}
      />
    );
  }
);

AnnotationCanvas.displayName = 'AnnotationCanvas';

// ── Render a single stroke onto a canvas context ─────────────────────────────
function renderStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle   = stroke.color;
  ctx.lineWidth   = stroke.lineWidth;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.globalCompositeOperation = stroke.type === 'eraser' ? 'destination-out' : 'source-over';

  if (stroke.type === 'pen' || stroke.type === 'eraser') {
    if (stroke.points.length < 2) {
      // Single dot
      ctx.beginPath();
      ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }
  } else if (stroke.type === 'arrow' && stroke.points.length >= 2) {
    const from = stroke.points[0];
    const to   = stroke.points[stroke.points.length - 1];
    drawArrow(ctx, from, to, stroke.lineWidth);
  } else if (stroke.type === 'text' && stroke.text && stroke.points.length > 0) {
    ctx.font = `bold ${Math.max(14, stroke.lineWidth * 6)}px Inter, sans-serif`;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur  = 5;
    ctx.fillText(stroke.text, stroke.points[0].x, stroke.points[0].y);
    ctx.shadowBlur  = 0;
  }

  ctx.restore();
}

// ── Arrow helper ──────────────────────────────────────────────────────────────
function drawArrow(ctx: CanvasRenderingContext2D, from: Point, to: Point, lw: number) {
  const headLen = Math.max(16, lw * 5);
  const angle   = Math.atan2(to.y - from.y, to.x - from.x);

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x,   to.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - headLen * Math.cos(angle - Math.PI / 6), to.y - headLen * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - headLen * Math.cos(angle + Math.PI / 6), to.y - headLen * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}
