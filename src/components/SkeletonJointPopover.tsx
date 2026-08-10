import React, { useEffect, useRef } from 'react';
import { X, BookOpen, Zap, Dumbbell, AlertTriangle } from 'lucide-react';
import { JointKnowledge } from '../services/skeletonJointKnowledge';

interface Props {
  knowledge: JointKnowledge;
  pixelX: number;
  pixelY: number;
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
  pixelX,
  pixelY,
  containerWidth,
  containerHeight,
  onClose,
  onAddToCueManager,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const color = REGION_COLORS[knowledge.region] ?? '#c084fc';

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Position: default above-left the click point, clamp to container
  const W = 272;
  const H_EST = 380; // estimated height
  let left = pixelX - W / 2;
  let top = pixelY - H_EST - 18;

  // Clamp horizontally
  left = Math.max(6, Math.min(containerWidth - W - 6, left));
  // If would go above container, show below
  if (top < 6) top = pixelY + 20;
  // Clamp vertically bottom
  if (top + H_EST > containerHeight - 6) top = containerHeight - H_EST - 6;

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        width: `${W}px`,
        zIndex: 1000,
        background: 'rgba(10,6,18,0.95)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid ${color}55`,
        borderRadius: '14px',
        boxShadow: `0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px ${color}22, inset 0 1px 0 rgba(255,255,255,0.06)`,
        overflow: 'hidden',
        animation: 'popoverIn 0.15s cubic-bezier(0.34,1.56,0.64,1)',
        pointerEvents: 'all',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Glow accent top */}
      <div style={{
        position: 'absolute', top: 0, left: '30%', right: '30%', height: '1px',
        background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        opacity: 0.7,
      }} />

      {/* HEADER */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '11px 13px 9px',
        borderBottom: `1px solid ${color}25`,
        background: `linear-gradient(135deg, ${color}18 0%, transparent 100%)`,
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
      <div style={{ padding: '10px 13px', display: 'flex', flexDirection: 'column', gap: '9px', maxHeight: '320px', overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: `${color}40 transparent` }}>

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
          Schließen
        </button>
      </div>

      <style>{`
        @keyframes popoverIn {
          from { opacity: 0; transform: scale(0.9) translateY(6px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
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
