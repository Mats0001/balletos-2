import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Zap, Dumbbell, AlertTriangle, TrendingDown, CheckCircle, Copy, Check } from 'lucide-react';
import { JointKnowledge } from '../services/skeletonJointKnowledge';
import {
  isMeasurableVaganovaMeasurement,
  VaganovaFullAnalysis,
  VaganovaMeasurement
} from '../services/vaganovaAngleCalculator';
import type { GroundedTeacherDraft } from '../types/groundedTeacherDraft';
import type { NicoleProClaimV1, NicoleProDraftV1 } from '../types/nicoleProContent';
import type { SelectedSkeletonTarget, SkeletonTargetDefinition } from '../types/skeletonTarget';
import type { AnalysisContextEpochV1 } from '../services/analysisContextGuard';
import {
  NICOLE_PRO_LANDMARK_MODEL_V1,
  nicoleProDraftMatchesGroundedSelection,
  type NicoleProCaptureQuality,
} from '../services/nicoleProContentPlanner';

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
  onAddToCueManager?: () => boolean | void;
  onSaveNicoleReference?: () => boolean | void;
  nicoleReferenceVersion?: number;
  /** Live frame analysis – if provided, shows specific real-time measurements */
  vaganovaAnalysis?: VaganovaFullAnalysis | null;
  /** Landmark index for mapping to specific measurements */
  landmarkIndex: number;
  /** Exact-frame, provenance-gated teacher draft for the synthetic torso bone. */
  groundedTeacherDraft?: GroundedTeacherDraft;
  /** Validated, context-current Pro content for this exact Grounded frame. */
  nicoleProDraft?: NicoleProDraftV1 | null;
  nicoleProCaptureQuality?: NicoleProCaptureQuality | null;
  currentAnalysisContext?: AnalysisContextEpochV1 | null;
  /** Exact joint or bone selected from the canonical rendered geometry. */
  selectedTarget?: SkeletonTargetDefinition;
  /** Immutable frame identity captured with the selection. */
  selectedTargetIdentity?: SelectedSkeletonTarget | null;
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
const LIVE_MEASUREMENT_KEYS: Record<number, Array<keyof VaganovaFullAnalysis>> = {
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

function getLiveMeasurements(
  idx: number,
  va: VaganovaFullAnalysis | null | undefined
): Array<{ key: string; m: VaganovaMeasurement }> {
  if (!va) return [];
  const pick = (key: keyof VaganovaFullAnalysis): { key: string; m: VaganovaMeasurement } | null => {
    const m = va[key] as VaganovaMeasurement | null;
    return m ? { key, m } : null;
  };
  const keys = LIVE_MEASUREMENT_KEYS[idx] ?? [];
  return keys.map(k => pick(k)).filter(Boolean) as Array<{ key: string; m: VaganovaMeasurement }>;
}

function statusColor(status?: string) {
  if (status === 'ERROR') return '#ff453a';
  if (status === 'WARNING') return '#ffd60a';
  if (status === 'CORRECT') return '#30d158';
  return 'rgba(255,255,255,0.4)';
}

function formatValue(m: VaganovaMeasurement) {
  if (!isMeasurableVaganovaMeasurement(m)) return '–';
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
  onSaveNicoleReference,
  nicoleReferenceVersion,
  vaganovaAnalysis,
  landmarkIndex,
  groundedTeacherDraft,
  nicoleProDraft,
  nicoleProCaptureQuality,
  currentAnalysisContext,
  selectedTarget,
  selectedTargetIdentity,
}) => {
  const color = REGION_COLORS[knowledge.region] ?? '#c084fc';
  const liveMeasurements = getLiveMeasurements(landmarkIndex, vaganovaAnalysis);
  const expectedMeasurementKeys = LIVE_MEASUREMENT_KEYS[landmarkIndex] ?? [];
  const [copied, setCopied] = useState(false);
  const isGroundedTarget = selectedTarget
    ? Boolean(selectedTarget.metricAdapter)
    : landmarkIndex === 100;
  const readyGroundedDraft = isGroundedTarget
    && groundedTeacherDraft?.kind === 'ready'
    && (selectedTarget
      ? selectedTarget.metricAdapter === groundedTeacherDraft.evidence.metricId
        && selectedTarget.focusId === groundedTeacherDraft.target
      : groundedTeacherDraft.evidence.metricId === 'spine_tilt_aplomb'
        && groundedTeacherDraft.target === 'spine_center')
    ? groundedTeacherDraft
    : null;
  const blockedGroundedDraft = isGroundedTarget && groundedTeacherDraft?.kind === 'blocked'
    ? groundedTeacherDraft
    : null;
  const blockedGroundedMessage = blockedGroundedDraft?.message
    ?? 'Für diesen Zeitpunkt liegt noch kein abgesicherter Lehrerentwurf vor.';
  const readyNicoleProDraft = readyGroundedDraft
    && nicoleProDraftMatchesGroundedSelection({
      grounded: readyGroundedDraft,
      pro: nicoleProDraft ?? null,
      currentContext: currentAnalysisContext ?? null,
      selectedTarget: selectedTargetIdentity ?? null,
      captureQuality: nicoleProCaptureQuality ?? null,
      landmarkModel: NICOLE_PRO_LANDMARK_MODEL_V1,
    })
    ? nicoleProDraft
    : null;
  const proClaimsById = new Map(readyNicoleProDraft?.claims.map(claim => [claim.claimId, claim]) ?? []);
  const proClaims = (section: keyof NicoleProDraftV1['sections']): NicoleProClaimV1[] => (
    readyNicoleProDraft?.sections[section].map(claimId => proClaimsById.get(claimId)).filter(
      (claim): claim is NicoleProClaimV1 => Boolean(claim),
    ) ?? []
  );
  const signalLabel = readyNicoleProDraft?.evidence[0].teacherSignal.state === 'strong_attention'
    ? 'Rot'
    : readyNicoleProDraft?.evidence[0].teacherSignal.state === 'attention'
      ? 'Gelb'
      : 'Grün';
  const certaintyLabel = readyNicoleProDraft?.evidence[0].teacherSignal.certainty === 'supported'
    ? 'durchgezogen · Signal stabil'
    : readyNicoleProDraft?.evidence[0].teacherSignal.certainty === 'uncertain'
      ? 'fein gepunktet · Signal unsicher'
      : 'Punktpaare · Signal schwach';
  const measurementStatusLabel = readyNicoleProDraft?.evidence[0].measurementStatus === 'experimental'
    ? 'Messung experimentell'
    : readyNicoleProDraft?.evidence[0].measurementStatus === 'limited'
      ? 'Messung eingeschränkt'
      : readyNicoleProDraft?.evidence[0].measurementStatus === 'validated'
        ? 'Messung validiert'
        : 'Messung nicht verfügbar';
  const uncertaintyLabel = readyNicoleProDraft?.evidence[0].uncertainty.kind === 'not_characterized'
    ? 'Messunsicherheit nicht bestimmt'
    : readyNicoleProDraft?.evidence[0].uncertainty.kind === 'validated_mdc'
      ? 'Validierte Änderungsschwelle hinterlegt'
      : 'Geschätzter Messbereich hinterlegt';

  const handleCopyAll = useCallback(() => {
    if (readyNicoleProDraft) {
      const text = (section: keyof NicoleProDraftV1['sections']) => proClaims(section).map(claim => claim.text).join('\n');
      const hypotheses = proClaims('hypotheses');
      const hypothesisText = hypotheses.map((claim, index) => `${index + 1}. ${claim.text}`).join('\n');
      const testText = proClaims('differentiationTests').map(claim => {
        const relatedNumbers = claim.relatedClaimIds
          .map(id => hypotheses.findIndex(hypothesis => hypothesis.claimId === id) + 1)
          .filter(index => index > 0);
        return `Test zu Hypothese ${relatedNumbers.join(', ')}: ${claim.text}`;
      }).join('\n');
      const evidence = readyNicoleProDraft.evidence[0];
      navigator.clipboard.writeText([
        `${selectedTarget?.label ?? knowledge.name} · NICOLE-PRO · KI-ARBEITSFASSUNG`, '',
        `STATUS: Ampel ${signalLabel} · ${certaintyLabel} · ${measurementStatusLabel} · ${uncertaintyLabel}`,
        'NUR INTERN: Nicht für Lernende oder Eltern freigegeben.', '',
        `BEFUND:\n${text('finding')}`, '',
        `BIOMECHANISCHE EINORDNUNG:\n${text('interpretation')}`, '',
        `MÖGLICHE ERKLÄRUNGEN:\n${hypothesisText}`, '',
        `SO PRÜFST DU ES:\n${testText}`, '',
        `ZIEL & ÜBEN:\n${text('targetAndPractice')}`, '',
        `BILDSPRACHE:\n${text('metaphor')}`, '',
        `MESSDETAILS:\n${text('measurementDetails')}`, '',
        `PROVENIENZ: Frame ${(evidence.mediaTimeUs / 1_000_000).toFixed(3)}s · Quelle ${evidence.sourceId} · Policy ${evidence.policyVersion}`,
        `Kontext ${evidence.analysisContextFingerprint}@${evidence.analysisContextGeneration} · Modell ${evidence.landmarkQuality.modelId}@${evidence.landmarkQuality.modelVersion}`,
        `Artifact ${evidence.analysisArtifactId} · Planner ${readyNicoleProDraft.plannerId}@${readyNicoleProDraft.plannerVersion} · Validator ${readyNicoleProDraft.validatorVersion}`,
      ].join('\n')).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
      return;
    }
    if (readyGroundedDraft) {
      const sections = readyGroundedDraft.sections;
      navigator.clipboard.writeText([
        `${selectedTarget?.label ?? knowledge.name} · KI-ENTWURF – NICOLE PRÜFT`,
        '',
        `WAS WIR SEHEN: ${sections.what}`,
        '',
        `WARUM DAS TECHNISCH WICHTIG SEIN KANN: ${sections.whyConditional}`,
        '',
        `ZIELBILD FÜR NICOLES PRÜFUNG: ${sections.goalConditional}`,
        '',
        `ÜBEN & VERBESSERN: ${sections.practiceForTeacherReview}`,
        '',
        `METAPHER / BILD: ${sections.metaphor}`,
        '',
        `TECHNIK FÜR NICOLE: ${sections.technical}`,
        '',
        `GRENZEN: ${sections.limitations}`,
      ].join('\n')).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
      return;
    }
    if (selectedTarget) return;

    const parts: string[] = [
      `${knowledge.name} · ${knowledge.region.toUpperCase()} · VAGANOVA`,
      '',
    ];
    if (liveMeasurements.length > 0) {
      parts.push('LIVE-MESSUNG:');
      liveMeasurements.forEach(({ m }) => {
        const norm = isMeasurableVaganovaMeasurement(m) && m.norm ? ` | ${m.norm}` : '';
        parts.push(`  ${m.label}: ${formatValue(m)}${norm}`);
      });
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
  }, [knowledge, liveMeasurements, readyGroundedDraft, readyNicoleProDraft, selectedTarget]);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const W = Math.min(280, Math.max(220, window.innerWidth - 16));

  // ── POSITION: überlagert den Video-Content ──────────────────────────────────
  // right: 356px = rechtes Panel (340px) + 16px Abstand — BLEIBT über dem Video
  // Das Popover überlagert bewusst den Video-Content (wie ein Overlay)
  const desktopPopoverRight = 356; // px vom rechten Viewport-Rand
  const popoverRight = Math.min(desktopPopoverRight, Math.max(8, window.innerWidth - W - 8));
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
  const hasConfirmedCorrect = vaganovaAnalysis !== null
    && vaganovaAnalysis !== undefined
    && expectedMeasurementKeys.length > 0
    && expectedMeasurementKeys.every(key => {
      const measurement = vaganovaAnalysis[key];
      return isMeasurableVaganovaMeasurement(measurement) && measurement.status === 'CORRECT';
    });
  const isNeutral = !hasError && !hasWarning && !hasConfirmedCorrect;
  const connectorColor = selectedTarget ? '#f59e0b' : hasError ? '#ff453a' : hasWarning ? '#ffd60a' : color;
  const findingColor = hasError ? '#ff453a' : hasWarning ? '#ffd60a' : hasConfirmedCorrect ? '#30d158' : 'rgba(255,255,255,0.5)';
  const findingBackground = hasError ? 'rgba(255,69,58,0.1)' : hasWarning ? 'rgba(255,214,10,0.08)' : hasConfirmedCorrect ? 'rgba(48,209,88,0.07)' : 'rgba(255,255,255,0.04)';
  const findingBorder = hasError ? 'rgba(255,69,58,0.3)' : hasWarning ? 'rgba(255,214,10,0.25)' : hasConfirmedCorrect ? 'rgba(48,209,88,0.2)' : 'rgba(255,255,255,0.12)';

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
          borderStyle: 'solid',
          borderWidth: '1px 1px 1px 3px',
          borderColor: `${color}50 ${color}50 ${color}50 ${connectorColor}`,
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
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>{selectedTarget?.label ?? knowledge.name}</div>
              <div style={{ fontSize: '9px', fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                {selectedTarget
                  ? `${selectedTarget.kind === 'bone' ? 'Bone' : 'Gelenk'} · ${selectedTargetIdentity?.frameStatus === 'exact_cache_frame' ? 'exakter Analyseframe' : selectedTargetIdentity?.frameStatus === 'pending_exact_frame' ? 'Analyseframe wird gebunden' : 'neutral ausgewählt'}`
                  : `${knowledge.region} · Vaganova`}
              </div>
            </div>
          </div>
          {/* Copy + Close buttons */}
          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
            <button
              onClick={handleCopyAll}
              title="Inhalt in Zwischenablage kopieren"
              disabled={(Boolean(selectedTarget) || isGroundedTarget) && !readyGroundedDraft}
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
        {!selectedTarget && liveMeasurements.length > 0 && (
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

        {readyNicoleProDraft ? (
          <div style={{ padding: '8px 10px 16px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(192,132,252,0.09)', border: '1px solid rgba(192,132,252,0.3)', borderRadius: '8px', padding: '7px 9px' }}>
              <div style={{ fontSize: '9px', fontWeight: 900, color: '#d8b4fe', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                Nicole-Pro · KI-Arbeitsfassung
              </div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>
                Ampel {signalLabel} · {certaintyLabel} · intern · Nicole prüft
              </div>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.4 }}>
                {measurementStatusLabel} · {uncertaintyLabel}
              </div>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.48)', lineHeight: 1.4 }}>
                Keine Ausgabe an Lernende oder Eltern ohne separate Freigabe.
              </div>
            </div>
            <Section icon={<span style={{ fontSize: '9px' }}>👁</span>} label="Befund" color={color} highlight>
              {proClaims('finding').map(claim => <span key={claim.claimId} style={{ display: 'block', marginBottom: '4px' }}>{claim.text}</span>)}
            </Section>
            <Section icon={<Zap size={9} />} label="Biomechanische Einordnung" color={color}>
              {proClaims('interpretation').map(claim => <span key={claim.claimId}>{claim.text}</span>)}
            </Section>
            <Section icon={<span style={{ fontSize: '9px' }}>◇</span>} label="Mögliche Erklärungen" color="#ffd60a">
              {proClaims('hypotheses').map((claim, index) => (
                <span key={claim.claimId} style={{ display: 'block', marginBottom: '5px' }}>{index + 1}. {claim.text}</span>
              ))}
            </Section>
            <Section icon={<span style={{ fontSize: '9px' }}>✓</span>} label="So prüfst du es" color="#64d2ff">
              {proClaims('differentiationTests').map(claim => {
                const relatedNumbers = claim.relatedClaimIds
                  .map(id => proClaims('hypotheses').findIndex(hypothesis => hypothesis.claimId === id) + 1)
                  .filter(index => index > 0);
                return (
                  <span key={claim.claimId} style={{ display: 'block', marginBottom: '5px' }}>
                    Test zu Hypothese {relatedNumbers.join(', ')}: {claim.text}
                  </span>
                );
              })}
            </Section>
            <Section icon={<Dumbbell size={9} />} label="Ziel & Üben" color="#30d158">
              {proClaims('targetAndPractice').map(claim => {
                const label = claim.type === 'teaching_target' ? 'Ziel'
                  : claim.type === 'immediate_cue' ? 'Sofort-Cue'
                    : claim.type === 'practice' ? 'Übung' : 'Sichtbarer Erfolg';
                return <span key={claim.claimId} style={{ display: 'block', marginBottom: '5px' }}><strong>{label}:</strong> {claim.text}</span>;
              })}
            </Section>
            <Section icon={<span style={{ fontSize: '9px' }}>✨</span>} label="Bildsprache" color="#c084fc">
              {proClaims('metaphor').map(claim => <span key={claim.claimId}>{claim.text}</span>)}
            </Section>
            <details style={{ background: 'rgba(100,210,255,0.045)', border: '1px solid rgba(100,210,255,0.18)', borderRadius: '8px', padding: '7px 9px' }}>
              <summary style={{ cursor: 'pointer', fontSize: '9px', fontWeight: 900, color: '#64d2ff', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Messdetails & Provenienz
              </summary>
              <div style={{ marginTop: '7px', fontSize: '9.5px', color: 'rgba(255,255,255,0.66)', lineHeight: 1.55 }}>
                {proClaims('measurementDetails').map(claim => <span key={claim.claimId} style={{ display: 'block', marginBottom: '5px' }}>{claim.text}</span>)}
                <span style={{ display: 'block', fontFamily: 'monospace', color: 'rgba(255,255,255,0.42)' }}>
                  Frame {(readyNicoleProDraft.evidence[0].mediaTimeUs / 1_000_000).toFixed(3)}s · {readyNicoleProDraft.evidence[0].metricId} · {readyNicoleProDraft.evidence[0].definitionVersion} · {readyNicoleProDraft.evidence[0].measurementStatus}
                </span>
                <span style={{ display: 'block', fontFamily: 'monospace', color: 'rgba(255,255,255,0.42)' }}>
                  Gate {readyNicoleProDraft.evidence[0].captureQuality} · Metrik-Confidence {readyNicoleProDraft.evidence[0].metricInputConfidence === null ? 'n/a' : `${Math.round(readyNicoleProDraft.evidence[0].metricInputConfidence * 100)}%`} · Landmark-Sichtbarkeit {readyNicoleProDraft.evidence[0].landmarkQuality.score === null ? 'n/a' : `${Math.round(readyNicoleProDraft.evidence[0].landmarkQuality.score * 100)}%`}
                </span>
                <span style={{ display: 'block', fontFamily: 'monospace', color: 'rgba(255,255,255,0.42)', overflowWrap: 'anywhere' }}>
                  Modell {readyNicoleProDraft.evidence[0].landmarkQuality.modelId}@{readyNicoleProDraft.evidence[0].landmarkQuality.modelVersion} · Artifact {readyNicoleProDraft.evidence[0].analysisArtifactId}
                </span>
                <span style={{ display: 'block', fontFamily: 'monospace', color: 'rgba(255,255,255,0.42)', overflowWrap: 'anywhere' }}>
                  Quelle {readyNicoleProDraft.evidence[0].sourceId} · Policy {readyNicoleProDraft.evidence[0].policyVersion}
                </span>
                <span style={{ display: 'block', fontFamily: 'monospace', color: 'rgba(255,255,255,0.42)', overflowWrap: 'anywhere' }}>
                  Kontext {readyNicoleProDraft.evidence[0].analysisContextFingerprint}@{readyNicoleProDraft.evidence[0].analysisContextGeneration} · Planner {readyNicoleProDraft.plannerId}@{readyNicoleProDraft.plannerVersion} · Validator {readyNicoleProDraft.validatorVersion}
                </span>
              </div>
            </details>
          </div>
        ) : readyGroundedDraft ? (
          <div style={{ padding: '8px 10px 16px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,214,10,0.08)', border: '1px solid rgba(255,214,10,0.25)', borderRadius: '8px', padding: '7px 9px' }}>
              <span aria-hidden="true" style={{ color: '#ffd60a', fontSize: '11px' }}>✦</span>
              <div>
                <div style={{ fontSize: '8px', fontWeight: 900, color: '#ffd60a', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                  KI-Entwurf · Nicole prüft
                </div>
                <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.58)', lineHeight: 1.4 }}>
                  Noch nicht für Lernende oder Eltern freigegeben.
                </div>
              </div>
            </div>
            <Section icon={<span style={{ fontSize: '9px' }}>👁</span>} label="Was wir sehen" color={color} highlight>
              {readyGroundedDraft.sections.what}
            </Section>
            <Section icon={<Zap size={9} />} label="Warum das technisch wichtig sein kann" color={color}>
              {readyGroundedDraft.sections.whyConditional}
            </Section>
            <Section icon={<span style={{ fontSize: '9px' }}>◎</span>} label="Zielbild für Nicoles Prüfung" color="#34d399">
              {readyGroundedDraft.sections.goalConditional}
            </Section>
            <Section icon={<Dumbbell size={9} />} label="Üben & verbessern" color="#30d158">
              {readyGroundedDraft.sections.practiceForTeacherReview}
            </Section>
            <Section icon={<span style={{ fontSize: '9px' }}>✨</span>} label="Metapher / Bild" color="#c084fc">
              {readyGroundedDraft.sections.metaphor}
            </Section>
            <Section icon={<span style={{ fontSize: '9px' }}>📐</span>} label="Technik für Nicole" color="#64d2ff">
              {readyGroundedDraft.sections.technical}
              {selectedTarget?.metricScopeLabel ? (
                <span style={{ display: 'block', marginTop: '4px', color: 'rgba(255,255,255,0.52)' }}>
                  Messbereich: {selectedTarget.metricScopeLabel}. Das exakt ausgewählte Segment bleibt davon getrennt.
                </span>
              ) : null}
            </Section>
            <Section icon={<AlertTriangle size={9} />} label="Grenzen & Prüffragen" color="#ffd60a">
              {readyGroundedDraft.sections.limitations}
            </Section>
          </div>
        ) : selectedTarget || isGroundedTarget ? (
          <div style={{ padding: '8px 10px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '9px 10px' }}>
              <span aria-hidden="true" style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', lineHeight: 1 }}>○</span>
              <div>
                <div style={{ fontSize: '8px', fontWeight: 900, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '4px' }}>
                  {isGroundedTarget ? 'Noch keine gesicherte Frame-Evidenz' : 'Ziel ausgewählt · noch keine automatische Bewertung'}
                </div>
                <div style={{ fontSize: '9.5px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                  {isGroundedTarget
                    ? blockedGroundedMessage
                    : `${selectedTarget?.label ?? knowledge.name} ist als eigenständiges ${selectedTarget?.kind === 'bone' ? 'Segment' : 'Gelenk'} ausgewählt. Für diese Region ist noch kein freigegebener Exact-Frame-Adapter aktiv.`}
                </div>
                <div style={{ fontSize: '8.5px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.45, marginTop: '6px' }}>
                  Keine Bewertung, Ursache, Übung oder Leitlinie wird aus fehlender Evidenz abgeleitet.
                </div>
                {selectedTargetIdentity?.frameStatus === 'exact_cache_frame' && (
                  <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.32)', lineHeight: 1.4, marginTop: '6px', fontFamily: 'monospace' }}>
                    Frame {(selectedTargetIdentity.mediaTimeUs / 1_000_000).toFixed(3)}s · {selectedTargetIdentity.targetId}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
        /* BODY – knowledge sections: pädagogisch priorisiert */
        <div style={{ padding: '8px 10px 16px', display: 'flex', flexDirection: 'column', gap: '7px' }}>

          {/* 1️⃣ WAS IST FALSCH – klar, direkt, vorne */}
          <div style={{ display: 'flex', gap: '5px', alignItems: 'flex-start', background: findingBackground, border: `1px solid ${findingBorder}`, borderRadius: '8px', padding: '7px 9px' }}>
            {isNeutral
              ? <span aria-hidden="true" style={{ color: findingColor, fontSize: '11px', flexShrink: 0 }}>○</span>
              : <AlertTriangle size={11} style={{ color: findingColor, flexShrink: 0, marginTop: '1px' }} />}
            <div style={{ fontSize: '10px', color: '#ffffff', lineHeight: 1.5, fontWeight: 600 }}>
              <span style={{ fontSize: '8px', fontWeight: 800, color: findingColor, textTransform: 'uppercase', letterSpacing: '0.7px', display: 'block', marginBottom: '2px' }}>
                {hasError ? '⚠ Typischer Fehler hier' : hasWarning ? '⚠ Achtung' : hasConfirmedCorrect ? '✓ Richtig ausgeführt' : '○ Nicht automatisch bewertet'}
              </span>
              {knowledge.commonMistake}
            </div>
          </div>

          {/* 2️⃣ PÄDAGOGISCHER KONTEXT ODER BEGRÜNDUNG */}
          <Section icon={<Zap size={9} />} label={isNeutral ? 'Pädagogischer Kontext' : 'Warum ist das problematisch?'} color={color} highlight>
            {knowledge.howAndWhy}
          </Section>

          {/* 3️⃣ NÄCHSTER SCHRITT – bei neutraler Evidenz nur nach Nicoles Urteil */}
          <Section icon={<Dumbbell size={9} />} label={knowledge.exerciseTitle} color="#30d158">
            {knowledge.exercise}
          </Section>

          {/* 4️⃣ VAGANOVA-STANDARD – als Referenz, nicht als Leadin */}
          <Section icon={<span style={{ fontSize: '9px' }}>📐</span>} label="Vaganova-Standard" color={color}>
            {knowledge.vaganovaRule}
          </Section>

        </div>
        )}

        {/* FOOTER */}
        <div style={{ padding: '7px 10px', borderTop: `1px solid ${color}18`, display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {onAddToCueManager && (
            <button onClick={() => { if (onAddToCueManager() !== false) onClose(); }}
              style={{ flex: 1, background: `linear-gradient(135deg, ${color}25 0%, ${color}12 100%)`, border: `1px solid ${color}45`, color, borderRadius: '6px', padding: '5px 7px', fontSize: '9px', fontWeight: 800, cursor: 'pointer' }}>
              {readyGroundedDraft ? 'Als Nicole-Entwurf übernehmen' : '+ Zum Cue-Manager'}
            </button>
          )}
          {onSaveNicoleReference && (
            <button
              onClick={() => { onSaveNicoleReference(); }}
              style={{
                flex: '1 1 100%',
                background: 'linear-gradient(135deg, rgba(34,211,238,0.18) 0%, rgba(34,211,238,0.08) 100%)',
                border: '1px solid rgba(34,211,238,0.42)',
                color: '#22d3ee',
                borderRadius: '6px',
                padding: '6px 7px',
                fontSize: '9px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {nicoleReferenceVersion
                ? `Neue Nicole-Referenzversion speichern · aktuell V${nicoleReferenceVersion}`
                : 'Diesen Bone als Nicole-Referenzlinie speichern'}
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
  children: React.ReactNode;
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
