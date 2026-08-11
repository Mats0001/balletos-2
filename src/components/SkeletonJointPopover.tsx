import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Zap, Dumbbell, AlertTriangle, TrendingDown, CheckCircle, Copy, Check } from 'lucide-react';
import { JointKnowledge } from '../services/skeletonJointKnowledge';
import { VaganovaFullAnalysis, VaganovaMeasurement } from '../services/vaganovaAngleCalculator';

interface Props {
  knowledge: JointKnowledge;
  /** Joint X in parent container coords */
  jointX: number;
  /** Joint Y in parent container coords */
  jointY: number;
  /** Left offset of the actual video render area within the container */
  videoLeft: number;
  containerHeight: number;
  onClose: () => void;
  onAddToCueManager?: () => void;
  /** Live frame analysis – if provided, shows specific real-time measurements */
  vaganovaAnalysis?: VaganovaFullAnalysis | null;
  /** Landmark index for mapping to specific measurements */
  landmarkIndex: number;
}

const REGION_COLORS: Record<string, string> = {
  head: '#a78bfa',
  torso: '#60a5fa',
  arm: '#34d399',
  hip: '#fb923c',
  leg: '#c084fc',
  foot: '#f472b6',
};

/** Maps landmark index to relevant VaganovaFullAnalysis fields */
function getLiveMeasurements(
  idx: number,
  va: VaganovaFullAnalysis | null | undefined
): Array<{ key: string; m: VaganovaMeasurement }> {
  if (!va) return [];
  const pick = (key: keyof VaganovaFullAnalysis): { key: string; m: VaganovaMeasurement } | null => {
    const m = va[key] as VaganovaMeasurement | null;
    return m ? { key, m } : null;
  };
  const MAP: Record<number, Array<keyof VaganovaFullAnalysis>> = {
    0:  ['headTilt', 'plumbDeviation'],
    11: ['shoulderSymmetry', 'shoulderElevationL', 'epaulement'],
    12: ['shoulderSymmetry', 'shoulderElevationR', 'epaulement'],
    13: ['armLineQualityL', 'portDeBrasL'],
    14: ['armLineQualityR', 'portDeBrasR'],
    15: ['armLineQualityL', 'portDeBrasL'],
    16: ['armLineQualityR', 'portDeBrasR'],
    23: ['pelvicTilt', 'turnoutL', 'spineTilt'],
    24: ['pelvicTilt', 'turnoutR', 'spineTilt'],
    25: ['knieFlexionL', 'valgusDriftL', 'turnoutL'],
    26: ['knieFlexionR', 'valgusDriftR', 'turnoutR'],
    27: ['knieFlexionL', 'valgusDriftL'],
    28: ['knieFlexionR', 'valgusDriftR'],
    29: ['knieFlexionL', 'turnoutL'],
    30: ['knieFlexionR', 'turnoutR'],
    31: ['turnoutL', 'knieFlexionL'],
    32: ['turnoutR', 'knieFlexionR'],
  };
  const keys = MAP[idx] ?? [];
  return keys.map(k => pick(k)).filter(Boolean) as Array<{ key: string; m: VaganovaMeasurement }>;
}

function statusColor(status?: string) {
  if (status === 'ERROR') return '#ff453a';
  if (status === 'WARNING') return '#ffd60a';
  if (status === 'CORRECT') return '#30d158';
  return 'rgba(255,255,255,0.4)';
}

function formatValue(m: VaganovaMeasurement) {
  if (m.measurement_class === 'not_measurable') return '–';
  const v = Math.abs(m.value);
  if (m.unit === 'deg' || m.unit === 'delta_deg') return `${v.toFixed(1)}°`;
  if (m.unit === 'ratio') return v.toFixed(2);
  return v.toFixed(1);
}

export const SkeletonJointPopover: React.FC<Props> = ({
  knowledge,
  jointX,
  jointY,
  videoLeft,
  containerHeight,
  onClose,
  onAddToCueManager,
  vaganovaAnalysis,
  landmarkIndex,
}) => {
  const color = REGION_COLORS[knowledge.region] ?? '#c084fc';
  const liveMeasurements = getLiveMeasurements(landmarkIndex, vaganovaAnalysis);
  const [copied, setCopied] = useState(false);

  const handleCopyAll = useCallback(() => {
    const parts: string[] = [
      `${knowledge.name} · ${knowledge.region.toUpperCase()} · VAGANOVA`,
      '',
    ];
    if (liveMeasurements.length > 0) {
      parts.push('LIVE-MESSUNG:');
      liveMeasurements.forEach(({ m }) => parts.push(`  ${m.label}: ${formatValue(m)}${m.norm ? ' | ' + m.norm : ''}`));
      parts.push('');
    }
    parts.push(`BEFUND: ${knowledge.commonMistake}`);
    parts.push('');
    parts.push(`WARUM: ${knowledge.howAndWhy}`);
    parts.push('');
    parts.push(`${knowledge.exerciseTitle}: ${knowledge.exercise}`);
    parts.push('');
    parts.push(`VAGANOVA-STANDARD: ${knowledge.vaganovaRule}`);
    navigator.clipboard.writeText(parts.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [knowledge, liveMeasurements]);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const W = 280;

  // ── POSITION: überlagert den Video-Content ──────────────────────────────────
  // right: 356px = rechtes Panel (340px) + 16px Abstand — BLEIBT über dem Video
  // Das Popover überlagert bewusst den Video-Content (wie ein Overlay)
  const popoverRight = 356; // px vom rechten Viewport-Rand
  let popoverTop = Math.max(8, jointY - 120);
  const maxTop = containerHeight - 200;
  popoverTop = Math.min(popoverTop, maxTop);

  // ── SVG CONNECTOR ─────────────────────────────────
  // Schwanz startet an der LINKEN Seite des Popovers (zur Mitte des Videos)
  const popoverLeft = window.innerWidth - popoverRight - W;
  const tailX = popoverLeft - 2;  // linke Kante des Popovers
  const tailY = Math.max(popoverTop + 20, Math.min(popoverTop + 380, jointY));
  const headX = jointX;
  const headY = jointY;
  // Bezier: Kurve von tailX (rechts des Videos) nach headX (Joint im Video)
  const gap = tailX - headX;  // positiv, da Popover rechts vom Video
  const cp1X = tailX - gap * 0.4;
  const cp1Y = tailY;
  const cp2X = tailX - gap * 0.4;
  const cp2Y = headY;

  // Dominant live status for connector colour
  const hasError = liveMeasurements.some(({ m }) => m.status === 'ERROR');
  const hasWarning = liveMeasurements.some(({ m }) => m.status === 'WARNING');
  const connectorColor = hasError ? '#ff453a' : hasWarning ? '#ffd60a' : color;

  return createPortal(
    <>
      {/* SVG connector – position:fixed, full viewport */}
      <svg
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          pointerEvents: 'none',
          zIndex: 9998,
          overflow: 'visible',
        }}
      >
        <defs>
          <marker id={`arrowhead-${landmarkIndex}`} markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
            <path d="M 0 1 L 8 4 L 0 7 Z" fill={connectorColor} opacity="0.9" />
          </marker>
        </defs>
        {/* glow */}
        <path d={`M ${tailX} ${tailY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${headX} ${headY}`}
          fill="none" stroke={connectorColor} strokeWidth="7" strokeOpacity="0.1" strokeLinecap="round" />
        {/* dashed line */}
        <path d={`M ${tailX} ${tailY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${headX - 7} ${headY}`}
          fill="none" stroke={connectorColor} strokeWidth="1.5" strokeOpacity="0.85"
          strokeDasharray="5 4" strokeLinecap="round" markerEnd={`url(#arrowhead-${landmarkIndex})`} />
        {/* tail dot */}
        <circle cx={tailX} cy={tailY} r="3" fill={connectorColor} opacity="0.6" />
        {/* pulsing joint ring */}
        <circle cx={headX} cy={headY} r="8" fill="none" stroke={connectorColor} strokeWidth="1.5" opacity="0.5">
          <animate attributeName="r" values="6;14;6" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.7;0;0.7" dur="2s" repeatCount="indefinite" />
        </circle>
        {/* static joint dot */}
        <circle cx={headX} cy={headY} r="4.5" fill={connectorColor} opacity="0.95" />
      </svg>

      {/* POPOVER CARD – zwischen Video und rechtem Panel, überdeckt NIE die Live-Messwerte */}
      <div
        className="skeleton-popover-scroll"
        style={{
          position: 'fixed',
          right: `${popoverRight}px`,
          top: `${popoverTop}px`,
          width: `${W}px`,
          maxHeight: `calc(100vh - ${popoverTop + 16}px)`,
          overflowX: 'hidden',
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: `${color}60 rgba(255,255,255,0.05)`,
          zIndex: 9999,
          background: 'rgba(8,4,18,0.97)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: `1px solid ${color}50`,
          borderLeft: `3px solid ${connectorColor}`,
          borderRadius: '14px',
          boxShadow: `0 8px 40px rgba(0,0,0,0.9), 0 0 0 1px ${color}18, inset 0 1px 0 rgba(255,255,255,0.06)`,
          animation: 'popoverSlideInRight 0.24s cubic-bezier(0.34,1.4,0.64,1)',
          pointerEvents: 'all',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* top glow */}
        <div style={{ position: 'absolute', top: 0, left: '20%', right: '20%', height: '1px', background: `linear-gradient(90deg, transparent, ${color}, transparent)`, opacity: 0.9 }} />

        {/* HEADER */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px 8px', borderBottom: `1px solid ${color}20`, background: `linear-gradient(135deg, ${color}18 0%, transparent 100%)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
            <span style={{ fontSize: '17px', flexShrink: 0 }}>{knowledge.emoji}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>{knowledge.name}</div>
              <div style={{ fontSize: '9px', fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                {knowledge.region} · Vaganova
              </div>
            </div>
          </div>
          {/* Copy + Close buttons */}
          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
            <button
              onClick={handleCopyAll}
              title="Inhalt in Zwischenablage kopieren"
              style={{ background: copied ? 'rgba(48,209,88,0.2)' : 'rgba(255,255,255,0.07)', border: 'none', color: copied ? '#30d158' : 'rgba(255,255,255,0.55)', cursor: 'pointer', borderRadius: '6px', width: '26px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s ease' }}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
            </button>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.55)', cursor: 'pointer', borderRadius: '6px', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <X size={11} />
            </button>
          </div>
        </div>

        {/* LIVE FRAME ANALYSIS – top priority block when data available */}
        {liveMeasurements.length > 0 && (
          <div style={{ margin: '8px 10px 0', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <div style={{ fontSize: '8px', fontWeight: 800, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.9px', marginBottom: '2px' }}>
              ⚡ Aktueller Frame · Live-Messung
            </div>
            {liveMeasurements.map(({ key, m }) => {
              const sc = statusColor(m.status);
              const isError = m.status === 'ERROR';
              const isMeasurable = m.measurement_class !== 'not_measurable';
              return (
                <div key={key} style={{ background: isError ? 'rgba(255,69,58,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${sc}35`, borderRadius: '8px', padding: '6px 9px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMeasurable ? '3px' : 0 }}>
                    <span style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.65)' }}>{m.label}</span>
                    {isMeasurable && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 900, color: sc, fontFamily: 'monospace' }}>
                          {formatValue(m)}
                        </span>
                        {m.status === 'ERROR' && <TrendingDown size={11} color="#ff453a" />}
                        {m.status === 'WARNING' && <span style={{ fontSize: '10px' }}>⚠️</span>}
                        {m.status === 'CORRECT' && <CheckCircle size={11} color="#30d158" />}
                      </div>
                    )}
                  </div>
                  {isMeasurable && m.norm && (
                    <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.35 }}>
                      Standard: {m.norm}
                    </div>
                  )}
                  {!isMeasurable && m.not_measurable_reason && (
                    <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>
                      {m.not_measurable_reason}
                    </div>
                  )}
                  {isError && (
                    <div style={{ fontSize: '9px', color: '#ff6b61', fontWeight: 700, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <AlertTriangle size={9} /> Korrektur erforderlich
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* BODY – knowledge sections: pädagogisch priorisiert */}
        <div style={{ padding: '8px 10px 16px', display: 'flex', flexDirection: 'column', gap: '7px' }}>

          {/* 1️⃣ WAS IST FALSCH – klar, direkt, vorne */}
          <div style={{ display: 'flex', gap: '5px', alignItems: 'flex-start', background: hasError ? 'rgba(255,69,58,0.1)' : hasWarning ? 'rgba(255,214,10,0.08)' : 'rgba(48,209,88,0.07)', border: `1px solid ${hasError ? 'rgba(255,69,58,0.3)' : hasWarning ? 'rgba(255,214,10,0.25)' : 'rgba(48,209,88,0.2)'}`, borderRadius: '8px', padding: '7px 9px' }}>
            <AlertTriangle size={11} style={{ color: hasError ? '#ff453a' : hasWarning ? '#ffd60a' : '#30d158', flexShrink: 0, marginTop: '1px' }} />
            <div style={{ fontSize: '10px', color: '#ffffff', lineHeight: 1.5, fontWeight: 600 }}>
              <span style={{ fontSize: '8px', fontWeight: 800, color: hasError ? '#ff453a' : hasWarning ? '#ffd60a' : '#30d158', textTransform: 'uppercase', letterSpacing: '0.7px', display: 'block', marginBottom: '2px' }}>
                {hasError ? '⚠ Typischer Fehler hier' : hasWarning ? '⚠ Achtung' : '✓ Richtig ausgeführt'}
              </span>
              {knowledge.commonMistake}
            </div>
          </div>

          {/* 2️⃣ WARUM IST DAS FALSCH */}
          <Section icon={<Zap size={9} />} label="Warum ist das problematisch?" color={color} highlight>
            {knowledge.howAndWhy}
          </Section>

          {/* 3️⃣ SO KORRIGIEREN */}
          <Section icon={<Dumbbell size={9} />} label={knowledge.exerciseTitle} color="#30d158">
            {knowledge.exercise}
          </Section>

          {/* 4️⃣ VAGANOVA-STANDARD – als Referenz, nicht als Leadin */}
          <Section icon={<span style={{ fontSize: '9px' }}>📐</span>} label="Vaganova-Standard" color={color}>
            {knowledge.vaganovaRule}
          </Section>

        </div>

        {/* FOOTER */}
        <div style={{ padding: '7px 10px', borderTop: `1px solid ${color}18`, display: 'flex', gap: '5px' }}>
          {onAddToCueManager && (
            <button onClick={() => { onAddToCueManager(); onClose(); }}
              style={{ flex: 1, background: `linear-gradient(135deg, ${color}25 0%, ${color}12 100%)`, border: `1px solid ${color}45`, color, borderRadius: '6px', padding: '5px 7px', fontSize: '9px', fontWeight: 800, cursor: 'pointer' }}>
              + Zum Cue-Manager
            </button>
          )}
          <button onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.45)', borderRadius: '6px', padding: '5px 9px', fontSize: '9px', fontWeight: 700, cursor: 'pointer' }}>
            Schliessen
          </button>
        </div>

        <style>{`
          @keyframes popoverSlideInRight {
            from { opacity: 0; transform: translateX(20px) scale(0.96); }
            to   { opacity: 1; transform: translateX(0)   scale(1); }
          }
          /* Webkit Scrollbar – passend zum Dark Theme */
          .skeleton-popover-scroll::-webkit-scrollbar { width: 4px; }
          .skeleton-popover-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); border-radius: 2px; }
          .skeleton-popover-scroll::-webkit-scrollbar-thumb { background: ${color}55; border-radius: 2px; }
          .skeleton-popover-scroll::-webkit-scrollbar-thumb:hover { background: ${color}99; }
        `}</style>
      </div>
    </>
  , document.body);
};

interface SectionProps {
  icon: React.ReactNode;
  label: string;
  color: string;
  children: string;
  highlight?: boolean;
}

const Section: React.FC<SectionProps> = ({ icon, label, color, children, highlight }) => (
  <div style={{ background: highlight ? `${color}0e` : 'rgba(255,255,255,0.025)', border: highlight ? `1px solid ${color}28` : '1px solid rgba(255,255,255,0.05)', borderRadius: '7px', padding: '6px 8px' }}>
    <div style={{ fontSize: '8px', fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
      {icon} {label}
    </div>
    <div style={{ fontSize: '9.5px', color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>
      {children}
    </div>
  </div>
);
