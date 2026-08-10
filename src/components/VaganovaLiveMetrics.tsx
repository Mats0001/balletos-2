import React from 'react';
import { VaganovaFullAnalysis, VaganovaMeasurement } from '../services/vaganovaAngleCalculator';

interface Props {
  vaganovaAnalysis: VaganovaFullAnalysis | null;
  isPlie?: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  CORRECT: '#30d158',
  WARNING: '#ffd60a',
  ERROR:   '#ff453a',
};

const MetricRow: React.FC<{ m: VaganovaMeasurement | null; label?: string }> = ({ m, label }) => {
  if (!m) return null;
  const color = STATUS_COLOR[m.status ?? 'CORRECT'] ?? '#30d158';
  const icon  = m.status === 'CORRECT' ? '✓' : m.status === 'WARNING' ? '⚠' : '✗';
  const displayLabel = label ?? m.label;
  const displayVal = m.unit === 'deg'
    ? `${Math.round(m.value)}°`
    : m.unit === 'ratio'
    ? `${m.value > 0 ? '+' : ''}${m.value.toFixed(1)}%`
    : `${Math.round(m.value)}`;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
        <span style={{ fontSize: '11px', color, fontWeight: 700, minWidth: '12px' }}>{icon}</span>
        <span style={{ fontSize: '11px', color: '#c8c8d8', lineHeight: '1.3' }}>{displayLabel}</span>
      </div>
      <div style={{
        fontSize: '12px', fontWeight: 800, color,
        background: `${color}18`, border: `1px solid ${color}44`,
        borderRadius: '8px', padding: '2px 8px', marginLeft: '8px',
        fontFamily: 'monospace', letterSpacing: '0.5px'
      }}>
        {displayVal}
      </div>
    </div>
  );
};

const SectionHeader: React.FC<{ label: string }> = ({ label }) => (
  <div style={{
    fontSize: '9px', fontWeight: 800, color: '#a881bd',
    textTransform: 'uppercase', letterSpacing: '1.2px',
    marginTop: '10px', marginBottom: '4px',
  }}>
    {label}
  </div>
);

export const VaganovaLiveMetrics: React.FC<Props> = ({ vaganovaAnalysis: va, isPlie }) => {
  if (!va) return (
    <div style={{ fontSize: '11px', color: '#888', padding: '8px 0', textAlign: 'center' }}>
      Warte auf Skeleton-Daten…
    </div>
  );

  return (
    <div style={{ fontSize: '11px' }}>
      <SectionHeader label="Kopf / Hals" />
      <MetricRow m={va.headTilt} label="Kopfneigung" />

      <SectionHeader label="Schulter" />
      <MetricRow m={va.shoulderSymmetry} label="Horizontalität" />
      <MetricRow m={va.shoulderElevationL} label="Elevation links" />
      <MetricRow m={va.shoulderElevationR} label="Elevation rechts" />

      <SectionHeader label="Arme · Port de Bras" />
      <MetricRow m={va.armLineQualityL} label="Arm-Linie links" />
      <MetricRow m={va.armLineQualityR} label="Arm-Linie rechts" />

      <SectionHeader label="Rumpf · Aplomb" />
      <MetricRow m={va.spineTilt}  label="Wirbelsäule (Aplomb)" />
      <MetricRow m={va.pelvicTilt} label="Becken-Neigung" />

      <SectionHeader label={isPlie ? 'Beine · Plié (FPPA)' : 'Beine · Stand'} />
      <MetricRow m={va.knieFlexionL}  label="Knieflexion links" />
      <MetricRow m={va.knieFlexionR}  label="Knieflexion rechts" />
      <MetricRow m={va.valgusDriftL}  label="Valgus-Drift links" />
      <MetricRow m={va.valgusDriftR}  label="Valgus-Drift rechts" />

      <SectionHeader label="Turnout · En Dehors" />
      <MetricRow m={va.turnoutL} label="Turnout links" />
      <MetricRow m={va.turnoutR} label="Turnout rechts" />

      {isPlie && (
        <div style={{
          marginTop: '8px', padding: '6px 10px',
          background: 'rgba(255,214,10,0.08)', border: '1px solid rgba(255,214,10,0.25)',
          borderRadius: '8px', fontSize: '10px', color: '#ffd60a', lineHeight: '1.4'
        }}>
          ⚠ Plié: Valgus-Drift biomechanisch unvermeidbar (NIH: Ø30°). Knie über Mittelfuß?
        </div>
      )}
    </div>
  );
};
