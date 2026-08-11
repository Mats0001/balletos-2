// AnnotationLightbox – Full-width 3-column viewer with integrated annotation tools
// Left: Thumbnail strip | Center: Image + drawing canvas + tool strip | Right: Sidebar

import React, { useEffect, useCallback, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Download, Mail, Copy, Check, Clock, FileText,
         Pen, ArrowRight, Type, Eraser, Undo2, Trash2, CheckSquare } from 'lucide-react';
import { AnnotationCanvas, AnnotationCanvasHandle, DrawingTool } from './AnnotationCanvas';

export interface AnnotationEntry {
  id: string;
  timeSeconds: number;
  timecodeStr: string;
  dataUrl: string;
  thumbnailUrl: string;
  caption?: string;
  note?: string;
  studentName?: string;
  createdAt: number;
}

interface Props {
  entries: AnnotationEntry[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onUpdateNote: (id: string, note: string) => void;
  onUpdateCaption: (id: string, caption: string) => void;
  onUpdateDataUrl: (id: string, dataUrl: string) => void;
  onSeekTo: (timeSeconds: number) => void;
}

function autoResizeEl(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function AutoTextarea({
  value, onChange, placeholder, style,
}: { value: string; onChange: (v: string) => void; placeholder: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { autoResizeEl(ref.current); }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => { onChange(e.target.value); autoResizeEl(e.target); }}
      placeholder={placeholder}
      style={{ width: '100%', boxSizing: 'border-box', resize: 'none', overflow: 'hidden', ...style }}
    />
  );
}

const COLORS = ['#ff453a', '#ffd60a', '#30d158', '#5ac8fa', '#ffffff'];
const TOOLS: { id: DrawingTool; label: string; icon: React.ReactNode }[] = [
  { id: 'pen',    label: 'Zeichnen',  icon: <Pen size={15} /> },
  { id: 'arrow',  label: 'Pfeil',     icon: <ArrowRight size={15} /> },
  { id: 'text',   label: 'Text',      icon: <Type size={15} /> },
  { id: 'eraser', label: 'Radierer',  icon: <Eraser size={15} /> },
];

export function AnnotationLightbox({
  entries, currentIndex, onClose, onNavigate,
  onUpdateNote, onUpdateCaption, onUpdateDataUrl, onSeekTo,
}: Props) {
  const entry = entries[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < entries.length - 1;
  const [copied, setCopied] = React.useState(false);

  // ── Annotation tool state ───────────────────────────────────────────────
  const [tool, setTool] = useState<DrawingTool>('arrow');
  const [color, setColor] = useState('#ff453a');
  const [lineWidth] = useState(3);
  const [annotating, setAnnotating] = useState(false); // canvas active
  const canvasRef = useRef<AnnotationCanvasHandle>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgRect, setImgRect] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { if (annotating) setAnnotating(false); else onClose(); }
    if (!annotating) {
      if (e.key === 'ArrowLeft' && hasPrev) onNavigate(currentIndex - 1);
      if (e.key === 'ArrowRight' && hasNext) onNavigate(currentIndex + 1);
    }
  }, [onClose, hasPrev, hasNext, currentIndex, onNavigate, annotating]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Measure image dimensions after load/resize
  const measureImg = useCallback(() => {
    const el = imgRef.current;
    if (!el) return;
    setImgRect({ w: el.offsetWidth, h: el.offsetHeight });
  }, []);

  useEffect(() => {
    window.addEventListener('resize', measureImg);
    return () => window.removeEventListener('resize', measureImg);
  }, [measureImg]);

  if (!entry) return null;

  // Burn annotations into PNG and update the entry
  const handleBurnIn = async () => {
    const annotCanvas = canvasRef.current;
    if (!annotCanvas || !annotCanvas.hasStrokes()) {
      setAnnotating(false);
      return;
    }
    const annotDataUrl = annotCanvas.getDataUrl();
    if (!annotDataUrl) return;

    const img = new Image();
    img.src = entry.dataUrl;
    await new Promise(r => (img.onload = r));

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    // Scale annotation layer to match image natural size
    const ann = new Image();
    ann.src = annotDataUrl;
    await new Promise(r => (ann.onload = r));
    ctx.drawImage(ann, 0, 0, canvas.width, canvas.height);

    const merged = canvas.toDataURL('image/png');
    onUpdateDataUrl(entry.id, merged);
    annotCanvas.clear();
    setAnnotating(false);
  };

  const handleCopyToClipboard = async () => {
    try {
      const blob = await (await fetch(entry.dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      await navigator.clipboard.writeText(entry.dataUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(`BalletOS - ${entry.studentName ?? 'Schuolerin'} @ ${entry.timecodeStr}`);
    const body = encodeURIComponent(
      `Vaganova Annotation\nSchuelerin: ${entry.studentName ?? '-'}\nZeitstempel: ${entry.timecodeStr}\n` +
      (entry.caption ? `\nBildunterschrift: ${entry.caption}\n` : '') +
      (entry.note ? `\nNotiz: ${entry.note}\n` : '')
    );
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = entry.dataUrl;
    a.download = `balletos_${entry.timecodeStr.replace(/[:.]/g, '-')}.png`;
    a.click();
  };

  const taBase: React.CSSProperties = {
    background: 'rgba(168,129,189,0.08)',
    border: '1px solid rgba(168,129,189,0.25)',
    borderRadius: '9px', padding: '8px 10px',
    color: 'rgba(255,255,255,0.88)', fontSize: '11.5px', lineHeight: 1.6,
    fontFamily: 'Inter, system-ui, sans-serif', outline: 'none',
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(4,3,8,0.96)',
        backdropFilter: 'blur(20px)',
        display: 'flex', flexDirection: 'column',
        animation: 'fadeIn 0.15s ease',
      }}
    >
      {/* TOP BAR */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 20px',
          background: 'rgba(20,17,30,0.98)',
          borderBottom: '1px solid rgba(192,132,252,0.15)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(192,132,252,0.12)', borderRadius: '8px', padding: '4px 10px' }}>
            <Clock size={12} color="#a881bd" />
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#c084fc', fontFamily: 'monospace' }}>{entry.timecodeStr}</span>
          </div>
          {entry.studentName && (
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>{entry.studentName}</span>
          )}
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.06)', borderRadius: '6px', padding: '3px 8px' }}>
            {currentIndex + 1} / {entries.length}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button onClick={() => hasPrev && onNavigate(currentIndex - 1)} disabled={!hasPrev} style={navBtnStyle(hasPrev)}>
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => hasNext && onNavigate(currentIndex + 1)} disabled={!hasNext} style={navBtnStyle(hasNext)}>
            <ChevronRight size={16} />
          </button>
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)', margin: '0 6px' }} />
          <button
            onClick={onClose}
            style={{ background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.25)', borderRadius: '8px', cursor: 'pointer', color: 'rgba(255,69,58,0.8)', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700 }}
          >
            <X size={13} /> ESC
          </button>
        </div>
      </div>

      {/* MAIN 3-COLUMN BODY */}
      <div
        onClick={e => e.stopPropagation()}
        style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}
      >
        {/* LEFT: Thumbnail Filmstrip */}
        {entries.length > 1 && (
          <div style={{
            width: '92px', flexShrink: 0,
            background: 'rgba(10,8,16,0.98)',
            borderRight: '1px solid rgba(255,255,255,0.06)',
            overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px',
            padding: '10px 8px',
            scrollbarWidth: 'thin', scrollbarColor: 'rgba(192,132,252,0.3) transparent',
          }}>
            {entries.map((e, i) => (
              <div key={e.id} onClick={() => onNavigate(i)} title={e.timecodeStr}
                style={{
                  flexShrink: 0, cursor: 'pointer', borderRadius: '7px', overflow: 'hidden',
                  border: i === currentIndex ? '2px solid #c084fc' : '2px solid rgba(255,255,255,0.07)',
                  opacity: i === currentIndex ? 1 : 0.45,
                  transition: 'all 0.15s ease',
                  boxShadow: i === currentIndex ? '0 0 10px rgba(192,132,252,0.35)' : 'none',
                }}
              >
                <img src={e.thumbnailUrl} alt={e.timecodeStr} style={{ display: 'block', width: '74px', height: 'auto' }} />
                <div style={{ fontSize: '8px', fontWeight: 700, color: i === currentIndex ? '#c084fc' : 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '3px 2px', fontFamily: 'monospace', background: 'rgba(0,0,0,0.6)' }}>
                  {e.timecodeStr.slice(0, 8)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CENTER: Image + Canvas + Tool Strip */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          minWidth: 0, background: 'radial-gradient(ellipse at center, rgba(20,15,35,0.6) 0%, rgba(4,3,8,0.9) 100%)',
        }}>
          {/* ── ANNOTATION TOOL STRIP ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 12px',
            background: 'rgba(14,11,22,0.95)',
            borderBottom: '1px solid rgba(192,132,252,0.1)',
            flexShrink: 0,
          }}>
            {/* Activate/Deactivate annotation mode */}
            {!annotating ? (
              <button
                onClick={() => setAnnotating(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'rgba(192,132,252,0.15)', border: '1px solid rgba(192,132,252,0.35)',
                  borderRadius: '8px', padding: '5px 12px',
                  color: '#c084fc', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                }}
              >
                <Pen size={13} /> Bild annotieren
              </button>
            ) : (
              <>
                {/* Tool buttons */}
                {TOOLS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTool(t.id)}
                    title={t.label}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: '32px', height: '32px', borderRadius: '7px',
                      border: tool === t.id ? '1px solid rgba(192,132,252,0.6)' : '1px solid rgba(255,255,255,0.1)',
                      background: tool === t.id ? 'rgba(192,132,252,0.2)' : 'rgba(255,255,255,0.05)',
                      color: tool === t.id ? '#c084fc' : 'rgba(255,255,255,0.6)',
                      cursor: 'pointer',
                    }}
                  >
                    {t.icon}
                  </button>
                ))}

                {/* Color dots */}
                <div style={{ display: 'flex', gap: '4px', marginLeft: '4px' }}>
                  {COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      style={{
                        width: '18px', height: '18px', borderRadius: '50%',
                        background: c, border: color === c ? '2px solid #fff' : '2px solid transparent',
                        cursor: 'pointer', flexShrink: 0,
                        boxShadow: color === c ? '0 0 6px rgba(255,255,255,0.5)' : 'none',
                      }}
                    />
                  ))}
                </div>

                <div style={{ flex: 1 }} />

                {/* Undo */}
                <button
                  onClick={() => canvasRef.current?.undo()}
                  title="Rückgängig"
                  style={iconBtn}
                >
                  <Undo2 size={14} />
                </button>

                {/* Clear */}
                <button
                  onClick={() => { canvasRef.current?.clear(); }}
                  title="Alles löschen"
                  style={iconBtn}
                >
                  <Trash2 size={14} />
                </button>

                {/* Burn in */}
                <button
                  onClick={handleBurnIn}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    background: 'rgba(48,209,88,0.18)', border: '1px solid rgba(48,209,88,0.4)',
                    borderRadius: '8px', padding: '5px 11px',
                    color: '#30d158', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  <CheckSquare size={13} /> Einbrennen
                </button>

                {/* Cancel */}
                <button
                  onClick={() => { canvasRef.current?.clear(); setAnnotating(false); }}
                  style={{ ...iconBtn, color: 'rgba(255,69,58,0.7)' }}
                >
                  <X size={14} />
                </button>
              </>
            )}
          </div>

          {/* ── IMAGE + CANVAS WRAPPER ── */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: '20px 60px' }}>
            {/* Prev arrow */}
            {hasPrev && !annotating && (
              <button
                onClick={() => onNavigate(currentIndex - 1)}
                style={{ position: 'absolute', left: '12px', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: '46px', height: '46px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              ><ChevronLeft size={22} /></button>
            )}

            {/* Image + Canvas stack */}
            <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', maxHeight: '100%' }}>
              <img
                ref={imgRef}
                src={entry.dataUrl}
                alt={`Annotation @ ${entry.timecodeStr}`}
                onLoad={measureImg}
                style={{
                  maxHeight: 'calc(100vh - 200px)', maxWidth: '100%',
                  display: 'block', borderRadius: '8px',
                  boxShadow: '0 20px 80px rgba(0,0,0,0.85), 0 0 0 1px rgba(192,132,252,0.08)',
                  userSelect: 'none',
                  outline: annotating ? '2px solid rgba(192,132,252,0.4)' : 'none',
                }}
              />
              {/* Canvas overlay – exact same size as rendered image */}
              {annotating && imgRect.w > 0 && (
                <div style={{ position: 'absolute', inset: 0, borderRadius: '8px', overflow: 'hidden' }}>
                  <AnnotationCanvas
                    ref={canvasRef}
                    width={imgRect.w}
                    height={imgRect.h}
                    isActive={annotating}
                    tool={tool}
                    color={color}
                    lineWidth={lineWidth}
                  />
                </div>
              )}
            </div>

            {/* Next arrow */}
            {hasNext && !annotating && (
              <button
                onClick={() => onNavigate(currentIndex + 1)}
                style={{ position: 'absolute', right: '12px', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: '46px', height: '46px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              ><ChevronRight size={22} /></button>
            )}
          </div>
        </div>

        {/* RIGHT: Sidebar */}
        <div style={{
          width: '300px', flexShrink: 0,
          background: 'rgba(14,11,22,0.99)',
          borderLeft: '1px solid rgba(192,132,252,0.12)',
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(192,132,252,0.2) transparent',
        }}>
          <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Caption */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '9px', fontWeight: 800, color: '#a881bd', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '5px' }}>
                <FileText size={10} /> Bildunterschrift
              </div>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', marginBottom: '7px', lineHeight: 1.4 }}>
                Wird im exportierten PNG eingebrannt.
              </div>
              <AutoTextarea
                key={`cap-${entry.id}`}
                value={entry.caption ?? ''}
                onChange={v => onUpdateCaption(entry.id, v)}
                placeholder="Bildunterschrift eingeben..."
                style={taBase}
              />
            </div>

            <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)' }} />

            {/* Note */}
            <div>
              <div style={{ fontSize: '9px', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '7px' }}>
                ✏ Lehrnotiz (intern)
              </div>
              <AutoTextarea
                key={`note-${entry.id}`}
                value={entry.note ?? ''}
                onChange={v => onUpdateNote(entry.id, v)}
                placeholder="Interne Notiz (nicht im PNG)..."
                style={{ ...taBase, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(192,132,252,0.15)', color: 'rgba(255,255,255,0.7)' }}
              />
            </div>

            <div style={{ flex: 1, minHeight: '8px' }} />
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)' }} />

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              <button
                onClick={() => { onSeekTo(entry.timeSeconds); onClose(); }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(168,129,189,0.4)', background: 'rgba(168,129,189,0.18)', color: '#c084fc', fontSize: '12px', fontWeight: 700, cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}
              >
                <Clock size={13} /> Frame anspringen
              </button>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={handleDownload} style={{ flex: 1, ...smallBtn }}>
                  <Download size={12} /> Download
                </button>
                <button onClick={handleCopyToClipboard} style={{ flex: 1, ...smallBtn, color: copied ? '#30d158' : 'rgba(255,255,255,0.65)' }}>
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Kopiert!' : 'Clipboard'}
                </button>
              </div>
              <button onClick={handleEmail} style={{ ...smallBtn, width: '100%', justifyContent: 'center' }}>
                <Mail size={12} /> Per E-Mail senden
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}

function navBtnStyle(enabled: boolean): React.CSSProperties {
  return {
    background: enabled ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
    width: '34px', height: '34px',
    cursor: enabled ? 'pointer' : 'default',
    color: enabled ? '#fff' : 'rgba(255,255,255,0.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
}

const iconBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: '32px', height: '32px', borderRadius: '7px',
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)',
  cursor: 'pointer',
};

const smallBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
  padding: '7px 8px', borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.65)',
  fontSize: '11px', fontWeight: 600, cursor: 'pointer', boxSizing: 'border-box',
};
