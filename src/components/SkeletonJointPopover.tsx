import React, { useEffect } from 'react';
import { X, BookOpen, Zap, Dumbbell, AlertTriangle } from 'lucide-react';
import { JointKnowledge } from '../services/skeletonJointKnowledge';

interface Props {
  knowledge: JointKnowledge;
  /** Raw click X in the full parent container coordinate space */
  jointX: number;
  /** Raw click Y in the full parent container coordinate space */
  jointY: number;
  containerWidth: number;
  containerHeight: number;
  onClose: () => void;
  onAddToCueManager?: () => void;
}

const REGION_COLORS: Record<string, string> = {
  head: '#a78bfa',
  torso: '#60a5fa',
  arm: '#34d399',
  hip: '#fb923c',
  leg: '#c084fc',
  foot: '#f472b6',
};

export const SkeletonJointPopover: React.FC<Props> = ({
  knowledge,
  jointX,
  jointY,
  containerWidth,
  containerHeight,
  onClose,
  onAddToCueManager,
}) => {
  const color = REGION_COLORS[knowledge.region] ?? '#c084fc';

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const W = 266;
  const H_EST = 390;

  // ── POSITION: always LEFT of the video, vertically centred on the joint ──
  const popoverLeft = 4;
  let popoverTop = jointY - H_EST / 2;
  // Clamp vertically
  popoverTop = Math.max(4, Math.min(containerHeight - H_EST - 4, popoverTop));

  // ── SVG CONNECTOR ─────────────────────────────────────────────────────────
  // Arrow tail: right edge of popover, at its vertical centre
  const tailX = popoverLeft + W + 2;
  const tailY = popoverTop + H_EST / 2;
  // Arrow head: the joint pixel, with a small dot radius offset
  const headX = jointX;
  const headY = jointY;

  // Cubic bezier control points for a gentle S-curve
  const cp1X = tailX + (headX - tailX) * 0.45;
  const cp1Y = tailY;
  const cp2X = tailX + (headX - tailX) * 0.55;
  const cp2Y = headY;

  // Compute angle of line at arrowhead for the triangle rotation
  const dx = headX - cp2X;
  const dy = headY - cp2Y;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  return (
    <>
      {/* SVG connector – full-container overlay */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 999,
          overflow: 'visible',
        }}
      >
        <defs>
          <marker
            id={`arrow-${knowledge.region}`}
            markerWidth="8"
            markerHeight="8"
            refX="4"
            refY="4"
            orient="auto"
          >
            <path
              d="M 0 1 L 8 4 L 0 7 Z"
              fill={color}
              opacity="0.9"
            />
          </marker>
        </defs>

        {/* Glow shadow path (wider, blur effect) */}
        <path
          d={`M ${tailX} ${tailY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${headX} ${headY}`}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeOpacity="0.12"
          strokeLinecap="round"
        />
        {/* Main dashed line */}
        <path
          d={`M ${tailX} ${tailY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${headX - 8} ${headY}`}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeOpacity="0.85"
          strokeDasharray="5 4"
          strokeLinecap="round"
          markerEnd={`url(#arrow-${knowledge.region})`}
        />
        {/* Dot at tail (popover attachment point) */}
        <circle cx={tailX} cy={tailY} r="3" fill={color} opacity="0.6" />
        {/* Pulsing ring at joint */}
        <circle cx={headX} cy={headY} r="8" fill="none" stroke={color} strokeWidth="1.5" opacity="0.5">
          <animate attributeName="r" values="6;13;6" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
        </circle>
        {/* Static inner dot */}
        <circle cx={headX} cy={headY} r="4" fill={color} opacity="0.9" />
      </svg>

      {/* POPOVER CARD */}
      <div
        style={{
          position: 'absolute',
          left: `${popoverLeft}px`,
          top: `${popoverTop}px`,
          width: `${W}px`,
          zIndex: 1000,
          background: 'rgba(10,6,18,0.96)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          border: `1px solid ${color}55`,
          borderRight: `3px solid ${color}`,
          borderRadius: '14px',
          boxShadow: `0 8px 40px rgba(0,0,0,0.75), 0 0 0 1px ${color}18, inset 0 1px 0 rgba(255,255,255,0.06)`,
          overflow: 'hidden',
          animation: 'popoverSlideIn 0.2s cubic-bezier(0.34,1.4,0.64,1)',
          pointerEvents: 'all',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Glow accent top */}
        <div style={{
          position: 'absolute', top: 0, left: '25%', right: '25%', height: '1px',
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          opacity: 0.8,
        }} />

        {/* Right-edge glow line matching arrow attachment */}
        <div style={{
          position: 'absolute', right: 0, top: '30%', bottom: '30%', width: '3px',
          background: `linear-gradient(180deg, transparent, ${color}, transparent)`,
        }} />

        {/* HEADER */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '11px 13px 9px',
          borderBottom: `1px solid ${color}25`,
          background: `linear-gradient(135deg, ${color}1a 0%, transparent 100%)`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{ fontSize: '18px' }}>{knowledge.emoji}</span>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>
                {knowledge.name}
              </div>
              <div style={{ fontSize: '9px', fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                {knowledge.region} · Vaganova
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', borderRadius: '6px', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <X size={12} />
          </button>
        </div>

        {/* BODY */}
        <div style={{ padding: '10px 13px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '310px', overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: `${color}40 transparent` }}>

          {/* a) Anatomie */}
          <Section icon={<BookOpen size={10} />} label="Was ist hier zu sehen?" color={color}>
            {knowledge.anatomyNote}
          </Section>

          {/* b) Vaganova Regel */}
          <Section icon={<span style={{ fontSize: '10px' }}>📐</span>} label="Vaganova-Standard" color={color}>
            {knowledge.vaganovaRule}
          </Section>

          {/* c) Wie & Warum */}
          <Section icon={<Zap size={10} />} label="Wie & Warum" color={color} highlight>
            {knowledge.howAndWhy}
          </Section>

          {/* Typischer Fehler */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.2)', borderRadius: '8px', padding: '6px 8px' }}>
            <AlertTriangle size={10} style={{ color: '#ff453a', flexShrink: 0, marginTop: '1px' }} />
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.45 }}>
              <span style={{ fontWeight: 800, color: '#ff6b61', marginRight: '4px' }}>Typischer Fehler:</span>
              {knowledge.commonMistake}
            </div>
          </div>

          {/* d) Übung */}
          <Section icon={<Dumbbell size={10} />} label={knowledge.exerciseTitle} color="#30d158">
            {knowledge.exercise}
          </Section>
        </div>

        {/* FOOTER */}
        <div style={{ padding: '8px 13px', borderTop: `1px solid ${color}20`, display: 'flex', gap: '6px' }}>
          {onAddToCueManager && (
            <button
              onClick={() => { onAddToCueManager(); onClose(); }}
              style={{
                flex: 1, background: `linear-gradient(135deg, ${color}30 0%, ${color}15 100%)`,
                border: `1px solid ${color}50`, color, borderRadius: '7px', padding: '5px 8px',
                fontSize: '9px', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.3px',
              }}
            >
              + Zum Cue-Manager
            </button>
          )}
          <button
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', borderRadius: '7px', padding: '5px 10px', fontSize: '9px', fontWeight: 700, cursor: 'pointer' }}
          >
            Schliessen
          </button>
        </div>

        <style>{`
          @keyframes popoverSlideIn {
            from { opacity: 0; transform: translateX(-10px) scale(0.96); }
            to   { opacity: 1; transform: translateX(0) scale(1); }
          }
        `}</style>
      </div>
    </>
  );
};

interface SectionProps {
  icon: React.ReactNode;
  label: string;
  color: string;
  children: string;
  highlight?: boolean;
}

const Section: React.FC<SectionProps> = ({ icon, label, color, children, highlight }) => (
  <div style={{
    background: highlight ? `${color}0f` : 'rgba(255,255,255,0.03)',
    border: highlight ? `1px solid ${color}30` : '1px solid rgba(255,255,255,0.06)',
    borderRadius: '8px', padding: '7px 9px',
  }}>
    <div style={{ fontSize: '8px', fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
      {icon} {label}
    </div>
    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
      {children}
    </div>
  </div>
);
