// AnnotationLightbox – Full-size viewer for saved annotation PNGs
// Features: navigation, editable note, download, clipboard, email

import React, { useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Download, Mail, Copy, Check, Clock } from 'lucide-react';

export interface AnnotationEntry {
  id: string;
  timeSeconds: number;
  timecodeStr: string;
  dataUrl: string;       // Full PNG
  thumbnailUrl: string;  // Small preview
  note?: string;         // Teacher note
  studentName?: string;
  createdAt: number;
}

interface Props {
  entries: AnnotationEntry[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onUpdateNote: (id: string, note: string) => void;
  onSeekTo: (timeSeconds: number) => void;
}

export function AnnotationLightbox({ entries, currentIndex, onClose, onNavigate, onUpdateNote, onSeekTo }: Props) {
  const entry = entries[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < entries.length - 1;
  const [copied, setCopied] = React.useState(false);

  // ESC closes
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowLeft' && hasPrev) onNavigate(currentIndex - 1);
    if (e.key === 'ArrowRight' && hasNext) onNavigate(currentIndex + 1);
  }, [onClose, hasPrev, hasNext, currentIndex, onNavigate]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!entry) return null;

  const handleCopyToClipboard = async () => {
    try {
      const blob = await (await fetch(entry.dataUrl)).blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: copy URL
      await navigator.clipboard.writeText(entry.dataUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(`BalletOS Annotation – ${entry.studentName ?? 'Schülerin'} @ ${entry.timecodeStr}`);
    const body = encodeURIComponent(
      `Vaganova-Analyse Annotation\n` +
      `Schülerin: ${entry.studentName ?? '–'}\n` +
      `Zeitstempel: ${entry.timecodeStr}\n` +
      (entry.note ? `\nNotiz: ${entry.note}\n` : '') +
      `\nDas annotierte Bild wurde als PNG gespeichert.`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = entry.dataUrl;
    a.download = `balletos_annotation_${entry.timecodeStr.replace(':', '-')}.png`;
    a.click();
  };

  return (
    // Backdrop
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(5,4,7,0.92)',
        backdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.15s ease',
      }}
    >
      {/* Modal panel */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex', flexDirection: 'column', gap: '0',
          background: 'rgba(20,17,30,0.98)',
          border: '1px solid rgba(192,132,252,0.25)',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(192,132,252,0.1)',
          maxWidth: '90vw',
          maxHeight: '92vh',
          width: 'fit-content',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Clock size={13} color="#a881bd" />
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#c084fc', fontFamily: 'monospace' }}>
              {entry.timecodeStr}
            </span>
            {entry.studentName && (
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>
                · {entry.studentName}
              </span>
            )}
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>
              {currentIndex + 1} / {entries.length}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', padding: '4px', borderRadius: '6px', display: 'flex' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Image + Navigation */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {/* Prev arrow */}
          <button
            onClick={() => hasPrev && onNavigate(currentIndex - 1)}
            disabled={!hasPrev}
            style={{
              position: 'absolute', left: '10px', zIndex: 2,
              background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%',
              width: '36px', height: '36px', cursor: hasPrev ? 'pointer' : 'default',
              color: hasPrev ? '#fff' : 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          ><ChevronLeft size={20} /></button>

          <img
            src={entry.dataUrl}
            alt={`Annotation @ ${entry.timecodeStr}`}
            style={{
              maxHeight: '60vh',
              maxWidth: '80vw',
              objectFit: 'contain',
              display: 'block',
            }}
          />

          {/* Next arrow */}
          <button
            onClick={() => hasNext && onNavigate(currentIndex + 1)}
            disabled={!hasNext}
            style={{
              position: 'absolute', right: '10px', zIndex: 2,
              background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%',
              width: '36px', height: '36px', cursor: hasNext ? 'pointer' : 'default',
              color: hasNext ? '#fff' : 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          ><ChevronRight size={20} /></button>
        </div>

        {/* Footer: Note + Actions */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', flexDirection: 'column', gap: '10px',
          flexShrink: 0,
        }}>
          {/* Editable note */}
          <textarea
            value={entry.note ?? ''}
            onChange={e => onUpdateNote(entry.id, e.target.value)}
            placeholder="Notiz zur Annotation (z.B. Knie-Ausrichtung naechste Woche fokussieren)..."
            rows={2}
            style={{
              width: '100%', resize: 'vertical',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(192,132,252,0.2)',
              borderRadius: '8px', padding: '8px 10px',
              color: 'rgba(255,255,255,0.85)', fontSize: '11px', lineHeight: 1.5,
              fontFamily: 'Inter, sans-serif',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Seek to frame */}
            <button
              onClick={() => { onSeekTo(entry.timeSeconds); onClose(); }}
              style={actionBtn('#a881bd')}
            >
              <Clock size={13} /> Frame anspringen
            </button>

            {/* Download */}
            <button onClick={handleDownload} style={actionBtn('rgba(255,255,255,0.15)')}>
              <Download size={13} /> Download
            </button>

            {/* Clipboard */}
            <button onClick={handleCopyToClipboard} style={actionBtn(copied ? '#30d158' : 'rgba(255,255,255,0.15)')}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Kopiert!' : 'Clipboard'}
            </button>

            {/* Email */}
            <button onClick={handleEmail} style={actionBtn('rgba(255,255,255,0.15)')}>
              <Mail size={13} /> E-Mail
            </button>
          </div>

          {/* Thumbnail navigation strip */}
          {entries.length > 1 && (
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
              {entries.map((e, i) => (
                <div
                  key={e.id}
                  onClick={() => onNavigate(i)}
                  style={{
                    flexShrink: 0, cursor: 'pointer', borderRadius: '5px', overflow: 'hidden',
                    border: i === currentIndex ? '2px solid #c084fc' : '2px solid rgba(255,255,255,0.1)',
                    opacity: i === currentIndex ? 1 : 0.6,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <img src={e.thumbnailUrl} alt={e.timecodeStr} style={{ display: 'block', height: '40px', width: 'auto' }} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
    </div>
  );
}

function actionBtn(bg: string) {
  return {
    display: 'flex', alignItems: 'center', gap: '5px',
    padding: '6px 12px', borderRadius: '8px', border: 'none',
    background: bg, color: '#fff', fontSize: '11px', fontWeight: 600,
    cursor: 'pointer', transition: 'opacity 0.15s ease',
    whiteSpace: 'nowrap' as const,
  };
}
