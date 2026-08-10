import React, { useRef, useState, useEffect } from 'react';
import { Palette, RotateCcw, Trash2, Pencil } from 'lucide-react';
import { TelestratorStroke } from '../types';

interface Props {
  width: number;
  height: number;
  onStrokesChange?: (strokes: TelestratorStroke[]) => void;
  readOnly?: boolean;
}

export const TelestratorCanvas: React.FC<Props> = ({
  width,
  height,
  onStrokesChange,
  readOnly = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState<string>('#f59e0b'); // Gold default
  const [lineWidth, setLineWidth] = useState<number>(4);
  const [strokes, setStrokes] = useState<TelestratorStroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<{ x: number; y: number }[]>([]);

  const colors = [
    { name: 'Gold', hex: '#f59e0b' },
    { name: 'Smaragd', hex: '#10b981' },
    { name: 'Schildkröten-Cyan', hex: '#06b6d4' },
    { name: 'Rubin-Rot', hex: '#f43f5e' },
    { name: 'Weiß', hex: '#ffffff' }
  ];

  // Redraw canvas when strokes change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // Draw all saved strokes
    strokes.forEach(stroke => {
      if (stroke.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    });

    // Draw active stroke
    if (currentStroke.length >= 2) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(currentStroke[0].x, currentStroke[0].y);
      for (let i = 1; i < currentStroke.length; i++) {
        ctx.lineTo(currentStroke[i].x, currentStroke[i].y);
      }
      ctx.stroke();
    }
  }, [strokes, currentStroke, width, height, color, lineWidth]);

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    let clientX = 0;
    let clientY = 0;

    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    setIsDrawing(true);
    const coords = getCoordinates(e);
    setCurrentStroke([coords]);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || readOnly) return;
    const coords = getCoordinates(e);
    setCurrentStroke(prev => [...prev, coords]);
  };

  const stopDrawing = () => {
    if (!isDrawing || readOnly) return;
    setIsDrawing(false);
    if (currentStroke.length >= 2) {
      const newStrokes = [...strokes, { color, lineWidth, points: currentStroke }];
      setStrokes(newStrokes);
      if (onStrokesChange) onStrokesChange(newStrokes);
    }
    setCurrentStroke([]);
  };

  const handleUndo = () => {
    const updated = strokes.slice(0, -1);
    setStrokes(updated);
    if (onStrokesChange) onStrokesChange(updated);
  };

  const handleClear = () => {
    setStrokes([]);
    if (onStrokesChange) onStrokesChange([]);
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          touchAction: 'none',
          cursor: readOnly ? 'default' : 'crosshair',
          zIndex: 10
        }}
      />

      {!readOnly && (
        <div style={{
          position: 'absolute',
          bottom: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          background: 'rgba(18, 18, 23, 0.9)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '30px',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontSize: '13px', fontWeight: 600 }}>
            <Pencil size={16} color="#f59e0b" />
            <span>Nicole's Telestrator:</span>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            {colors.map(c => (
              <button
                key={c.hex}
                onClick={() => setColor(c.hex)}
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: c.hex,
                  border: color === c.hex ? '2px solid white' : '1px solid transparent',
                  cursor: 'pointer',
                  transform: color === c.hex ? 'scale(1.2)' : 'scale(1)',
                  transition: 'all 0.15s ease'
                }}
                title={c.name}
              />
            ))}
          </div>

          <div style={{ width: '1px', height: '20px', backgroundColor: 'rgba(255,255,255,0.15)' }} />

          <button
            onClick={handleUndo}
            disabled={strokes.length === 0}
            style={{
              background: 'transparent',
              border: 'none',
              color: strokes.length === 0 ? '#475569' : '#f8fafc',
              cursor: strokes.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              fontWeight: 500
            }}
            title="Rückgängig"
          >
            <RotateCcw size={14} />
          </button>

          <button
            onClick={handleClear}
            disabled={strokes.length === 0}
            style={{
              background: 'transparent',
              border: 'none',
              color: strokes.length === 0 ? '#475569' : '#f43f5e',
              cursor: strokes.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              fontWeight: 500
            }}
            title="Alle Zeichnungen löschen"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
};
