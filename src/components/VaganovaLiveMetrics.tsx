import React from 'react';
import { VaganovaFullAnalysis, VaganovaMeasurement, MeasurementClass } from '../services/vaganovaAngleCalculator';

interface Props {
  vaganovaAnalysis: VaganovaFullAnalysis | null;
  isPlie?: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  CORRECT: '#30d158',
  WARNING: '#ffd60a',
  ERROR:   '#ff453a',
};

// Class badge config – epistemological transparency
const CLASS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  vaganova_relation:          { label: 'VR',  color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  pedagogical_nominal_angle:  { label: 'PED', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  research_observation:       { label: 'OBS', color: '#fb923c', bg: 'rgba(251,146,60,0.12)' },
  individual_baseline:        { label: 'BAS', color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
  validated_system_threshold: { label: 'VAL', color: '#f9a8d4', bg: 'rgba(249,168,212,0.12)' },
  // P0-c: proxy_unvalidated is the honest label for unvalidated thresholds
  proxy_unvalidated:          { label: 'PRX', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
  not_measurable:             { label: '—',   color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  // Fallback for any future/unknown class – never crash
  unknown:                    { label: '?',   color: '#6b7280', bg: 'rgba(107,114,128,0.08)' },
};

const MetricRow: React.FC<{ m: VaganovaMeasurement | null; label?: string }> = ({ m, label }) => {
  if (!m) return null;

  const displayLabel = label ?? m.label;
  const cls = m.measurement_class;
  // Safe lookup with fallback – prevents crash when new measurement_class values are added
  const badge = CLASS_BADGE[cls] ?? CLASS_BADGE['unknown'];

  // not_measurable: special compact display
  if (cls === 'not_measurable') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
        opacity: 0.6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flex: 1 }}>
          <span style={{ fontSize: '10px', color: '#6b7280', minWidth: '12px' }}>⊘</span>
          <span style={{ fontSize: '10px', color: '#9ca3af', fontStyle: 'italic' }}>{displayLabel}</span>
        </div>
        <span style={{
          fontSize: '8px', background: badge.bg, color: badge.color,
          border: `1px solid ${badge.color}44`, borderRadius: '4px',
          padding: '1px 5px', fontWeight: 700, letterSpacing: '0.5px'
        }}>nicht messbar</span>
      </div>
    );
  }

  // display_only classes (research_observation, pedagogical_nominal_angle, proxy_unvalidated)
  // have no status – show neutral indicator, NOT green 'CORRECT'
  const hasVerdict = m.status !== undefined;
  const color = hasVerdict ? (STATUS_COLOR[m.status!] ?? '#9ca3af') : '#9ca3af';
  const icon  = !hasVerdict ? '○'
    : m.status === 'CORRECT' ? '✓'
    : m.status === 'WARNING' ? '⚠'
    : m.status === 'ERROR'   ? '✗' : '○';

  // Format value
  let displayVal = '';
  if (m.unit === 'deg')         displayVal = `${Math.round(m.value)}°`;
  else if (m.unit === 'delta_deg') displayVal = `${m.value > 0 ? '+' : ''}${m.value.toFixed(1)}°Δ`;
  else if (m.unit === 'ratio')  displayVal = `${m.value > 0 ? '+' : ''}${m.value.toFixed(1)}%`;
  else                          displayVal = `${Math.round(m.value)}`;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: '10px', color, fontWeight: 700, minWidth: '12px', flexShrink: 0 }}>{icon}</span>
        <span style={{ fontSize: '10px', color: '#c8c8d8', lineHeight: '1.3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayLabel}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
        {/* Epistemological class badge */}
        <span title={cls} style={{
          fontSize: '7px', background: badge.bg, color: badge.color,
          border: `1px solid ${badge.color}44`, borderRadius: '4px',
          padding: '1px 4px', fontWeight: 700, letterSpacing: '0.5px', cursor: 'help'
        }}>{badge.label}</span>
        {/* Value chip */}
        <div style={{
          fontSize: '11px', fontWeight: 800, color,
          background: `${color}18`, border: `1px solid ${color}44`,
          borderRadius: '6px', padding: '1px 7px',
          fontFamily: 'monospace', letterSpacing: '0.5px', minWidth: '42px', textAlign: 'center'
        }}>
          {displayVal}
        </div>
      </div>
    </div>
  );
};

const SectionHeader: React.FC<{ label: string }> = ({ label }) => (
  <div style={{
    fontSize: '8px', fontWeight: 800, color: '#a881bd',
    textTransform: 'uppercase', letterSpacing: '1.2px',
    marginTop: '8px', marginBottom: '2px',
    display: 'flex', alignItems: 'center', gap: '4px'
  }}>
    {label}
  </div>
);

// Legend for class badges
const Legend: React.FC = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
    {(Object.entries(CLASS_BADGE) as [MeasurementClass, typeof CLASS_BADGE[MeasurementClass]][]).map(([key, b]) => (
      <span key={key} title={key} style={{
        fontSize: '7px', background: b.bg, color: b.color,
        border: `1px solid ${b.color}44`, borderRadius: '4px',
        padding: '1px 5px', fontWeight: 700, letterSpacing: '0.4px', cursor: 'help'
      }}>{b.label}</span>
    ))}
    <span style={{ fontSize: '7px', color: '#6b7280', alignSelf: 'center' }}>← Datenklasse (hover)</span>
  </div>
);

export const VaganovaLiveMetrics: React.FC<Props> = ({ vaganovaAnalysis: va, isPlie }) => {
  if (!va) return (
    <div style={{ fontSize: '11px', color: '#6b7280', padding: '8px 0', textAlign: 'center' }}>
      Warte auf Skeleton-Daten…
    </div>
  );

  return (
    <div style={{ fontSize: '11px' }}>
      <Legend />

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
      <MetricRow m={va.spineTilt}  label="Wirbelsäule" />
      <MetricRow m={va.pelvicTilt} label="Becken" />

      <SectionHeader label={isPlie ? 'Beine · Plié' : 'Beine · Stand'} />
      <MetricRow m={va.knieFlexionL}  label="Knieflexion links" />
      <MetricRow m={va.knieFlexionR}  label="Knieflexion rechts" />
      <MetricRow m={va.valgusDriftL}  label="Knie-Drift links" />
      <MetricRow m={va.valgusDriftR}  label="Knie-Drift rechts" />

      <SectionHeader label="Turnout · En Dehors" />
      <MetricRow m={va.turnoutL} label="Turnout links" />
      <MetricRow m={va.turnoutR} label="Turnout rechts" />

      <SectionHeader label="Gesamt" />
      <MetricRow m={va.plumbDeviation} label="Lotabweichung" />

      {isPlie && (
        <div style={{
          marginTop: '8px', padding: '6px 8px',
          background: 'rgba(255,214,10,0.06)', border: '1px solid rgba(255,214,10,0.2)',
          borderRadius: '6px', fontSize: '9px', color: '#ffd60a', lineHeight: '1.4'
        }}>
          ⚠ Plié: Knie-Drift zeigt nur <strong>relative Änderung</strong> zur Ausgangsposition (Asaeda 2024).
          Kein absoluter Valgus-Grenzwert aus Webcam.
        </div>
      )}
    </div>
  );
};
