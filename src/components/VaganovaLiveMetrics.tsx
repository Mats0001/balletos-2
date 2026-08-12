import React, { useState } from 'react';
import {
  isMeasurableVaganovaMeasurement,
  VaganovaFullAnalysis,
  VaganovaMeasurement,
  MeasurementClass
} from '../services/vaganovaAngleCalculator';
import { AgeGroup } from '../types';

interface Props {
  vaganovaAnalysis: VaganovaFullAnalysis | null;
  isPlie?: boolean;
  effectiveAgeGroup: AgeGroup; // resolved outside – passed in by RightInspectorPanel
}

// ─── Zielwerte-Tabelle ────────────────────────────────────────────────────────
type AgeTargets = { minis: number; kids: number; teens: number; pro: number };

const TARGETS: Record<string, AgeTargets> = {
  turnout:         { minis: 55,  kids: 70,  teens: 85,  pro: 90  },
  armLine:         { minis: 150, kids: 158, teens: 165, pro: 168 },
  knieFlexionDemi: { minis: 60,  kids: 70,  teens: 80,  pro: 90  },
  knieFlexionGrand:{ minis: 90,  kids: 100, teens: 110, pro: 120 },
  shoulderHoriz:   { minis: 175, kids: 178, teens: 180, pro: 180 },
  shoulderElev:    { minis: 5,   kids: 4,   teens: 3,   pro: 2   },
  headTilt:        { minis: 8,   kids: 5,   teens: 3,   pro: 2   },
  spineTilt:       { minis: 5,   kids: 3,   teens: 2,   pro: 1   },
};

// Erwachsene = interpolated between Teens and Masterclass
const ERWACHSENE_TARGETS: Record<string, number> = {
  turnout: 88, armLine: 166, knieFlexionDemi: 85, knieFlexionGrand: 115,
  shoulderHoriz: 180, shoulderElev: 2, headTilt: 2, spineTilt: 1,
};

const getTarget = (key: keyof typeof TARGETS, group: AgeGroup): number => {
  if (group === 'ERWACHSENE') return ERWACHSENE_TARGETS[key] ?? -1;
  const row = TARGETS[key];
  if (!row) return -1;
  switch (group) {
    case 'MINIS':       return row.minis;
    case 'KIDS':        return row.kids;
    case 'TEENS':       return row.teens;
    case 'MASTERCLASS': return row.pro;
    default:            return row.pro;
  }
};

// ─── Status / Badge config ────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  CORRECT: '#30d158',
  WARNING: '#ffd60a',
  ERROR:   '#ff453a',
};

export const CLASS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  vaganova_relation:          { label: 'VR',  color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  pedagogical_nominal_angle:  { label: 'PED', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  research_observation:       { label: 'OBS', color: '#fb923c', bg: 'rgba(251,146,60,0.12)' },
  validated_system_threshold: { label: 'VAL', color: '#f9a8d4', bg: 'rgba(249,168,212,0.12)' },
  proxy_unvalidated:          { label: 'PRX', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
  not_measurable:             { label: '—',   color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  unknown:                    { label: '?',   color: '#6b7280', bg: 'rgba(107,114,128,0.08)' },
};

// ─── Format helpers ───────────────────────────────────────────────────────────
function formatVal(m: VaganovaMeasurement): string {
  if (!isMeasurableVaganovaMeasurement(m)) return '–';
  if (m.unit === 'deg')       return `${Math.round(m.value)}°`;
  if (m.unit === 'delta_deg') return `${m.value > 0 ? '+' : ''}${m.value.toFixed(1)}°Δ`;
  if (m.unit === 'ratio')     return `${m.value > 0 ? '+' : ''}${m.value.toFixed(1)}%`;
  return `${Math.round(m.value)}`;
}

function formatTarget(val: number, unit: string): string {
  if (unit === 'deg')       return `→${val}°`;
  if (unit === 'delta_deg') return `→0°Δ`;
  if (unit === 'ratio')     return `→${val}%`;
  return `→${val}`;
}

// ─── MetricRow ────────────────────────────────────────────────────────────────
interface MetricRowProps {
  m: VaganovaMeasurement | null;
  label?: string;
  targetKey?: keyof typeof TARGETS;
  showTargets: boolean;
  ageGroup: AgeGroup;
  hidden?: boolean; // filtered out by chip
}

const MetricRow: React.FC<MetricRowProps> = ({ m, label, targetKey, showTargets, ageGroup, hidden }) => {
  if (!m || hidden) return null;
  const displayLabel = label ?? m.label;
  const cls = m.measurement_class;
  const badge = CLASS_BADGE[cls] ?? CLASS_BADGE['unknown'];

  if (cls === 'not_measurable') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', opacity: 0.6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flex: 1 }}>
          <span style={{ fontSize: '10px', color: '#6b7280', minWidth: '12px' }}>⊘</span>
          <span style={{ fontSize: '10px', color: '#9ca3af', fontStyle: 'italic' }}>{displayLabel}</span>
        </div>
        <span style={{ fontSize: '8px', background: badge.bg, color: badge.color, border: `1px solid ${badge.color}44`, borderRadius: '4px', padding: '1px 5px', fontWeight: 700 }}>nicht messbar</span>
      </div>
    );
  }

  const hasVerdict = m.status !== undefined;
  const color = hasVerdict ? (STATUS_COLOR[m.status!] ?? '#9ca3af') : '#9ca3af';
  const icon  = !hasVerdict ? '○' : m.status === 'CORRECT' ? '✓' : m.status === 'WARNING' ? '⚠' : '✗';
  const displayVal = formatVal(m);
  const targetNum = (showTargets && targetKey) ? getTarget(targetKey, ageGroup) : -1;
  const showArrow = targetNum >= 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: '10px', color, fontWeight: 700, minWidth: '12px', flexShrink: 0 }}>{icon}</span>
        <span style={{ fontSize: '10px', color: '#c8c8d8', lineHeight: '1.3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayLabel}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
        <span title={cls} style={{ fontSize: '7px', background: badge.bg, color: badge.color, border: `1px solid ${badge.color}44`, borderRadius: '4px', padding: '1px 4px', fontWeight: 700, cursor: 'help' }}>{badge.label}</span>
        {/* Current value chip */}
        <div style={{
          fontSize: '11px', fontWeight: 800, color, fontFamily: 'monospace',
          background: `${color}18`, border: `1px solid ${color}44`,
          borderRadius: '6px', padding: '1px 7px', minWidth: '42px', textAlign: 'center',
        }}>
          {displayVal}
        </div>
        {/* Target chip — only when applicable */}
        {showArrow && (
          <div style={{
            fontSize: '10px', fontWeight: 600, color: 'rgba(200,200,220,0.65)',
            fontFamily: 'monospace',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '6px', padding: '1px 6px', minWidth: '38px', textAlign: 'center',
            whiteSpace: 'nowrap',
          }}>
            {formatTarget(targetNum, m.unit)}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Section Header ───────────────────────────────────────────────────────────
const SectionHeader: React.FC<{ label: string }> = ({ label }) => (
  <div style={{ fontSize: '8px', fontWeight: 800, color: '#a881bd', textTransform: 'uppercase', letterSpacing: '1.2px', marginTop: '8px', marginBottom: '2px' }}>
    {label}
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

// Filterable classes (not_measurable is display-only, not toggleable)
const FILTERABLE_CLASSES: MeasurementClass[] = [
  'vaganova_relation',
  'pedagogical_nominal_angle',
  'research_observation',
  'validated_system_threshold',
];

// Human-readable tooltip per class
const CLASS_TOOLTIP: Record<string, string> = {
  vaganova_relation:          'VR — Vaganova-Relation: pädagogische Normwinkel der Vaganova-Methode',
  pedagogical_nominal_angle:  'PED — Pädagogischer Nominalwinkel: altersgerechte Sollograde',
  research_observation:       'OBS — Forschungs-Beobachtung: empirische Referenzwerte',
  validated_system_threshold: 'VAL — Validierter Schwellenwert: biomechanisch geprüfter Grenzwert',
  proxy_unvalidated:          'PRX — Proxy (unvalidiert): Näherungswert, kein absoluter Standard',
};

export const VaganovaLiveMetrics: React.FC<Props> = ({ vaganovaAnalysis: va, isPlie, effectiveAgeGroup }) => {
  // All classes active by default
  const [activeFilters, setActiveFilters] = useState<Set<string>>(
    () => new Set(FILTERABLE_CLASSES)
  );

  const toggleFilter = (key: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        // Don't allow deactivating all — keep at least one
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Helper: is a MetricRow hidden (its class is filtered out)?
  const isHidden = (m: VaganovaMeasurement | null) => {
    if (!m) return false;
    if (!FILTERABLE_CLASSES.includes(m.measurement_class as MeasurementClass)) return false;
    return !activeFilters.has(m.measurement_class);
  };

  if (!va) return (
    <div style={{ fontSize: '11px', color: '#6b7280', padding: '8px 0', textAlign: 'center' }}>
      Warte auf Skeleton-Daten…
    </div>
  );

  return (
    <div style={{ fontSize: '11px' }}>
      {/* Filter Chips — clickable toggles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.08)', alignItems: 'center' }}>
        {(Object.entries(CLASS_BADGE) as [string, typeof CLASS_BADGE[string]][]).map(([key, b]) => {
          const isFilterable = FILTERABLE_CLASSES.includes(key as MeasurementClass);
          if (!isFilterable) return null; // — und ? weglassen
          const isActive = activeFilters.has(key);
          return (
            <button
              key={key}
              onClick={() => toggleFilter(key)}
              title={CLASS_TOOLTIP[key] ?? key}
              style={{
                fontSize: '7px',
                background: isActive ? b.bg : 'rgba(255,255,255,0.03)',
                color: isActive ? b.color : 'rgba(255,255,255,0.2)',
                border: `1px solid ${isActive ? b.color + '55' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: '4px',
                padding: '2px 5px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                userSelect: 'none',
                outline: 'none',
                lineHeight: 1.4,
              }}
            >
              {b.label}
            </button>
          );
        })}
        {/* Reset all */}
        {activeFilters.size < FILTERABLE_CLASSES.length && (
          <button
            onClick={() => setActiveFilters(new Set(FILTERABLE_CLASSES))}
            title="Alle Filter einblenden"
            style={{ fontSize: '7px', color: 'rgba(255,255,255,0.3)', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '2px 5px', cursor: 'pointer', fontWeight: 600 }}
          >
            alle
          </button>
        )}
      </div>

      <SectionHeader label="Kopf / Hals" />
      <MetricRow m={va.headTilt}           label="Kopfneigung"       targetKey="headTilt"          showTargets ageGroup={effectiveAgeGroup} hidden={isHidden(va.headTilt)} />

      <SectionHeader label="Schulter" />
      <MetricRow m={va.shoulderSymmetry}   label="Horizontalität"    targetKey="shoulderHoriz"     showTargets ageGroup={effectiveAgeGroup} hidden={isHidden(va.shoulderSymmetry)} />
      <MetricRow m={va.shoulderElevationL} label="Elevation links"   targetKey="shoulderElev"      showTargets ageGroup={effectiveAgeGroup} hidden={isHidden(va.shoulderElevationL)} />
      <MetricRow m={va.shoulderElevationR} label="Elevation rechts"  targetKey="shoulderElev"      showTargets ageGroup={effectiveAgeGroup} hidden={isHidden(va.shoulderElevationR)} />

      <SectionHeader label="Arme · Port de Bras" />
      <MetricRow m={va.armLineQualityL}    label="Arm-Linie links"   targetKey="armLine"           showTargets ageGroup={effectiveAgeGroup} hidden={isHidden(va.armLineQualityL)} />
      <MetricRow m={va.armLineQualityR}    label="Arm-Linie rechts"  targetKey="armLine"           showTargets ageGroup={effectiveAgeGroup} hidden={isHidden(va.armLineQualityR)} />

      <SectionHeader label="Rumpf · Aplomb" />
      <MetricRow m={va.spineTilt}          label="Wirbelsäule"       targetKey="spineTilt"         showTargets ageGroup={effectiveAgeGroup} hidden={isHidden(va.spineTilt)} />
      <MetricRow m={va.pelvicTilt}         label="Becken"            showTargets={false}           ageGroup={effectiveAgeGroup} hidden={isHidden(va.pelvicTilt)} />

      <SectionHeader label={isPlie ? 'Beine · Plié' : 'Beine · Stand'} />
      <MetricRow m={va.knieFlexionL}       label="Knieflexion links"  targetKey={isPlie ? 'knieFlexionDemi' : undefined} showTargets ageGroup={effectiveAgeGroup} hidden={isHidden(va.knieFlexionL)} />
      <MetricRow m={va.knieFlexionR}       label="Knieflexion rechts" targetKey={isPlie ? 'knieFlexionDemi' : undefined} showTargets ageGroup={effectiveAgeGroup} hidden={isHidden(va.knieFlexionR)} />
      <MetricRow m={va.valgusDriftL}       label="Knieachse links"     showTargets={false}          ageGroup={effectiveAgeGroup} hidden={isHidden(va.valgusDriftL)} />
      <MetricRow m={va.valgusDriftR}       label="Knieachse rechts"    showTargets={false}          ageGroup={effectiveAgeGroup} hidden={isHidden(va.valgusDriftR)} />

      <SectionHeader label="Turnout · En Dehors" />
      <MetricRow m={va.turnoutL}           label="Turnout links"     targetKey="turnout"           showTargets ageGroup={effectiveAgeGroup} hidden={isHidden(va.turnoutL)} />
      <MetricRow m={va.turnoutR}           label="Turnout rechts"    targetKey="turnout"           showTargets ageGroup={effectiveAgeGroup} hidden={isHidden(va.turnoutR)} />

      <SectionHeader label="Gesamt" />
      <MetricRow m={va.plumbDeviation}     label="Lotabweichung"     showTargets={false}           ageGroup={effectiveAgeGroup} hidden={isHidden(va.plumbDeviation)} />

      {isPlie && (
        <div style={{ marginTop: '8px', padding: '6px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', fontSize: '9px', color: 'rgba(255,255,255,0.55)', lineHeight: '1.4' }}>
          ○ Plié: Die projizierte Knieachse bleibt <strong>neutral und nicht messbar</strong>.
          Referenzframe, Perspektive, Spiegelung und Bewegungsphase sind noch nicht bestätigt.
        </div>
      )}
    </div>
  );
};
