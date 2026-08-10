// AnnotationCanvas – Drawing overlay for paused video frames
// Supports: pen (freehand), arrow, text label, eraser
// Exposed via forwardRef so parent can call clear() and getDataUrl()

import React, { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react';

export type DrawingTool = 'pen' | 'arrow' | 'eraser' | 'text';

export interface AnnotationCanvasHandle {
  clear: () => void;
  getDataUrl: () => string | null;
  hasStrokes: () => boolean;
}

interface Props {
  width: number;
  height: number;
  isActive: boolean;       // true = video paused → drawing enabled
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
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const strokesRef = useRef<Stroke[]>([]); // Ref mirror to avoid stale closure in imperative handle
    const currentStroke = useRef<Stroke | null>(null);
    const isDrawing = useRef(false);

    // Keep ref in sync with state
    useEffect(() => {
      strokesRef.current = strokes;
    }, [strokes]);

    // Expose handle methods to parent – use ref for hasStrokes to avoid stale closure
    useImperativeHandle(ref, () => ({
      clear: () => {
        strokesRef.current = [];
        setStrokes([]);
      },
      getDataUrl: () => canvasRef.current?.toDataURL('image/png') ?? null,
      hasStrokes: () => strokesRef.current.length > 0,
    }), []); // Empty deps – safe because we read from ref, not state

    // Re-render canvas whenever strokes change
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.width || !canvas.height) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const stroke of strokes) {
        if (!stroke || !stroke.points || stroke.points.length === 0) continue;
        ctx.save();
        ctx.strokeStyle = stroke.color;
        ctx.fillStyle = stroke.color;
        ctx.lineWidth = stroke.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = stroke.type === 'eraser' ? 'destination-out' : 'source-over';

        if (stroke.type === 'pen' || stroke.type === 'eraser') {
          ctx.beginPath();
          ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
          for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
          }
          ctx.stroke();
        } else if (stroke.type === 'arrow' && stroke.points.length >= 2) {
          const from = stroke.points[0];
          const to = stroke.points[stroke.points.length - 1];
          drawArrow(ctx, from, to, stroke.lineWidth);
        } else if (stroke.type === 'text' && stroke.text && stroke.points.length > 0) {
          ctx.font = `bold ${Math.max(14, stroke.lineWidth * 6)}px Inter, sans-serif`;
          ctx.globalCompositeOperation = 'source-over';
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 4;
          ctx.fillText(stroke.text, stroke.points[0].x, stroke.points[0].y);
          ctx.shadowBlur = 0;
        }
        ctx.restore();
      }
    }, [strokes]);

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

    const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
      if (!isActive) return;
      const pos = getPos(e);
      if (!pos) return;
      isDrawing.current = true;

      if (tool === 'text') {
        const text = window.prompt('Beschriftung eingeben:');
        if (text && text.trim()) {
          const newStroke: Stroke = { type: 'text', color, lineWidth, points: [pos], text: text.trim() };
          strokesRef.current = [...strokesRef.current, newStroke];
          setStrokes(prev => [...prev, newStroke]);
        }
        isDrawing.current = false;
        return;
      }

      const newStroke: Stroke = { type: tool, color, lineWidth, points: [pos] };
      currentStroke.current = newStroke;
      strokesRef.current = [...strokesRef.current, newStroke];
      setStrokes(prev => [...prev, newStroke]);
    };

    const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
      if (!isActive || !isDrawing.current || !currentStroke.current) return;
      const pos = getPos(e);
      if (!pos) return;

      // Mutate the current stroke's points array directly (avoids unnecessary re-renders during drag)
      currentStroke.current.points.push(pos);

      // Trigger re-render by replacing last stroke in state
      setStrokes(prev => {
        if (prev.length === 0) return prev;
        const updated = [...prev];
        updated[updated.length - 1] = { ...currentStroke.current! };
        return updated;
      });
    };

    const handlePointerUp = () => {
      isDrawing.current = false;
      currentStroke.current = null;
    };

    // Guard against zero dimensions (prevents blank canvas crash)
    const safeWidth = width > 0 ? width : 1;
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
            : tool === 'text' ? 'text'
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

// ── Util: Draw an arrow from→to ──────────────────────────────────────────────
function drawArrow(ctx: CanvasRenderingContext2D, from: Point, to: Point, lw: number) {
  const headLen = Math.max(16, lw * 5);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const angle = Math.atan2(dy, dx);

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - headLen * Math.cos(angle - Math.PI / 6), to.y - headLen * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - headLen * Math.cos(angle + Math.PI / 6), to.y - headLen * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}
