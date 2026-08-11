import React, { useState, useRef, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { AgeGroup } from '../types';
import { VaganovaFullAnalysis } from '../services/vaganovaAngleCalculator';
import { VaganovaLiveMetrics } from './VaganovaLiveMetrics';
import { VaganovaCuePoint } from '../services/vaganovaPreAnalyzer';

interface Props {
  selectedStudent: string;
  selectedAgeGroup: AgeGroup;
  exerciseName: string;
  vaganovaAnalysis?: VaganovaFullAnalysis | null;
  isPlie?: boolean;
  onSaveClassNote?: (note: string) => void;
  selectedCue?: VaganovaCuePoint | null;
}

// ─── Age group catalogue ──────────────────────────────────────────────────────
const AGE_GROUPS: { value: AgeGroup; label: string; short: string; years: string }[] = [
  { value: 'MINIS',       label: 'Minis',           short: 'Minis',   years: '4–7 J.'   },
  { value: 'KIDS',        label: 'Kids',            short: 'Kids',    years: '8–11 J.'  },
  { value: 'TEENS',       label: 'Teens',           short: 'Teens',   years: '12–16 J.' },
  { value: 'ERWACHSENE',  label: 'Fortgeschrittene', short: 'Fortg.', years: '17–25 J.' },
  { value: 'MASTERCLASS', label: 'Profi',           short: 'Profi',   years: 'Profi'    },
];

function meta(g: AgeGroup) {
  return AGE_GROUPS.find(m => m.value === g) ?? AGE_GROUPS[0];
}

// ─── GroupBadge — single chip next to LIVE ────────────────────────────────────
interface BadgeProps {
  activeGroup: AgeGroup;
  autoGroup: AgeGroup;
  onGroupChange: (g: AgeGroup) => void;
}

const GroupBadge: React.FC<BadgeProps> = ({ activeGroup, autoGroup, onGroupChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const m = meta(activeGroup);
  const isOverride = activeGroup !== autoGroup;

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      {/* The badge itself — same visual language as LIVE */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Altersgruppe / Norm wählen"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          fontSize: '9px', fontWeight: 700, fontFamily: 'Montserrat',
          letterSpacing: '0.5px',
          padding: '2px 8px 2px 6px',
          borderRadius: '8px',
          border: isOverride
            ? '1px solid rgba(168,129,189,0.5)'
            : '1px solid rgba(255,255,255,0.12)',
          background: isOverride
            ? 'rgba(168,129,189,0.18)'
            : 'rgba(255,255,255,0.07)',
          color: isOverride ? '#c8a2c8' : 'rgba(255,255,255,0.55)',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          lineHeight: 1,
        }}
      >
        {m.short}
        <span style={{
          fontSize: '7px',
          opacity: 0.6,
          marginLeft: '1px',
          transform: open ? 'rotate(180deg)' : 'none',
          display: 'inline-block',
          transition: 'transform 0.15s ease',
        }}>▾</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 5px)',
          right: 0,
          zIndex: 300,
          background: 'rgba(16,12,24,0.98)',
          border: '1px solid rgba(168,129,189,0.25)',
          borderRadius: '14px',
          padding: '6px',
          minWidth: '175px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(168,129,189,0.08)',
          backdropFilter: 'blur(24px)',
        }}>
          <div style={{ fontSize: '8px', fontWeight: 800, color: 'rgba(168,129,189,0.7)', textTransform: 'uppercase', letterSpacing: '1.2px', padding: '2px 8px 6px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: '4px' }}>
            Altersgruppe · Norm
          </div>

          {AGE_GROUPS.map(g => {
            const isActive = g.value === activeGroup;
            const isAuto  = g.value === autoGroup;
            const isProfi = g.value === 'MASTERCLASS';
            return (
              <button
                key={g.value}
                onClick={() => { onGroupChange(g.value); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '5px 10px',
                  background: isActive
                    ? (isProfi ? 'rgba(255,214,10,0.1)' : 'rgba(168,129,189,0.12)')
                    : 'transparent',
                  border: isActive
                    ? (isProfi ? '1px solid rgba(255,214,10,0.25)' : '1px solid rgba(168,129,189,0.25)')
                    : '1px solid transparent',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  marginBottom: '2px',
                  transition: 'all 0.1s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{
                      fontSize: '10px', fontWeight: 700, fontFamily: 'Montserrat',
                      color: isActive
                        ? (isProfi ? '#ffd60a' : '#c8a2c8')
                        : 'rgba(224,224,224,0.85)',
                    }}>
                      {g.label}
                    </div>
                    <div style={{ fontSize: '8px', color: 'rgba(107,114,128,0.8)', marginTop: '1px' }}>
                      {g.years}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                  {isActive && (
                    <span style={{ fontSize: '9px', color: isProfi ? '#ffd60a' : '#a881bd' }}>✓</span>
                  )}
                  {isAuto && (
                    <span style={{ fontSize: '7px', color: '#34d399', fontWeight: 700, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.2)', padding: '1px 4px', borderRadius: '4px' }}>
                      AUTO
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          {/* Reset to auto */}
          {isOverride && (
            <>
              <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '4px 4px 4px' }} />
              <button
                onClick={() => { onGroupChange(autoGroup); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                  width: '100%', padding: '5px',
                  background: 'rgba(52,211,153,0.07)',
                  border: '1px solid rgba(52,211,153,0.2)',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontSize: '9px', color: '#34d399', fontWeight: 700, fontFamily: 'Montserrat',
                }}
              >
                ↺ Auf Auto zurücksetzen ({meta(autoGroup).short})
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main Panel ───────────────────────────────────────────────────────────────
export const RightInspectorPanel: React.FC<Props> = ({
  selectedStudent,
  selectedAgeGroup,
  exerciseName,
  vaganovaAnalysis,
  isPlie,
}) => {
  const [activeGroup, setActiveGroup] = useState<AgeGroup>(selectedAgeGroup);

  // Sync when student changes
  useEffect(() => { setActiveGroup(selectedAgeGroup); }, [selectedAgeGroup]);

  return (
    <aside className="right-panel" style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflow: 'hidden' }}>
      {/* Panel Header */}
      <div style={{ paddingBottom: '12px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', flexShrink: 0 }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#a881bd', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Sparkles size={13} /> Pädagogik & KI-Cockpit
        </div>
        <div className="font-montserrat" style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff', marginTop: '2px' }}>
          {selectedStudent} <span style={{ color: '#c8a2c8', fontWeight: 500 }}>· {exerciseName}</span>
        </div>
      </div>

      {/* LIVE MESSWERTE section */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: '6px' }}>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <span style={{
            fontSize: '10px', fontWeight: 700, color: 'var(--text-sub)',
            textTransform: 'uppercase', letterSpacing: '0.8px', whiteSpace: 'nowrap',
          }}>
            Live-Messwerte
          </span>

          {/* LIVE badge */}
          <span style={{
            fontSize: '9px', background: 'rgba(48,209,88,0.15)', color: '#30d158',
            border: '1px solid rgba(48,209,88,0.3)', borderRadius: '6px',
            padding: '2px 6px', fontWeight: 700, letterSpacing: '0.5px',
            animation: 'pulse 2s infinite', whiteSpace: 'nowrap',
          }}>
            LIVE
          </span>

          {/* Group badge — sits right next to LIVE */}
          <GroupBadge
            activeGroup={activeGroup}
            autoGroup={selectedAgeGroup}
            onGroupChange={setActiveGroup}
          />
        </div>

        {/* Scrollable metrics */}
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          <div
            id="vaganova-metrics-scroll"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px',
              padding: '10px 12px',
              height: '100%',
              overflowY: 'auto',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(168,129,189,0.4) transparent',
            }}
          >
            <VaganovaLiveMetrics
              vaganovaAnalysis={vaganovaAnalysis ?? null}
              isPlie={isPlie}
              effectiveAgeGroup={activeGroup}
            />
          </div>
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '32px',
            background: 'linear-gradient(to top, rgba(14,10,20,0.9) 0%, transparent 100%)',
            borderRadius: '0 0 12px 12px', pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', bottom: '4px', left: '50%', transform: 'translateX(-50%)',
            fontSize: '9px', color: 'rgba(168,129,189,0.6)', pointerEvents: 'none', userSelect: 'none',
          }}>▾ scrollen</div>
        </div>
      </div>
    </aside>
  );
};
