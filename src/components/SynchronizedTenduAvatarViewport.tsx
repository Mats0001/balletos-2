import React, { memo, useEffect, useMemo, useState } from 'react';
import { heuristicBaseState, heuristicColor, heuristicEvidenceStrength } from '../types/teacherHeuristic';
import type { SkeletonPointId } from '../types/skeletonTarget';
import {
  isMotionAvatarExercise,
  motionAvatarReference,
  motionAvatarPhaseOrder,
  resolveTechnicalMotionAvatarFrame,
} from '../services/technicalMotionAvatar';
import { buildMotionTeachingFeedback } from '../services/tenduTeachingFeedback';
import type { TeacherPhaseAnalysis } from '../services/teacherPhaseAnalysis';
import { projectCanonicalFrameToSkeleton } from '../services/canonicalMotionAvatar';
import {
  projectVideoSkeletonToAvatar,
  referenceToLiveTransform,
  transformAvatarPoint,
  transformAvatarSkeleton,
} from '../services/liveAvatarOverlay';
import type { AttemptProgressPoint, StudentAttemptSnapshot } from '../services/studentAttemptHistory';
import type { KinematicPoint, ReconstructedSkeleton } from '../services/vaganova3DKinematics';

type AvatarViewMode = 'avatar' | 'overlay' | 'before_after';
export type AvatarLoopRange = Readonly<{ startMs: number; endMs: number; label: string }>;

interface Props {
  analysis: TeacherPhaseAnalysis | null;
  isPlaying: boolean;
  currentTimeMs: number;
  getCurrentTimeMs: () => number;
  liveSkeleton?: ReconstructedSkeleton | null;
  videoWidth?: number;
  videoHeight?: number;
  previousAttempt?: StudentAttemptSnapshot | null;
  progressCurve?: readonly AttemptProgressPoint[];
  onLoopRangeChange?: (range: AvatarLoopRange | null) => void;
}

const BONES: readonly [SkeletonPointId, SkeletonPointId][] = Object.freeze([
  ['head', 'neck'], ['shoulderL', 'shoulderR'], ['neck', 'sternum'], ['sternum', 'navel'],
  ['navel', 'pelvisCenter'], ['shoulderL', 'elbowL'], ['elbowL', 'wristL'],
  ['shoulderR', 'elbowR'], ['elbowR', 'wristR'], ['pelvisL', 'pelvisR'],
  ['pelvisL', 'kneeL'], ['kneeL', 'ankleL'], ['ankleL', 'footL'],
  ['pelvisR', 'kneeR'], ['kneeR', 'ankleR'], ['ankleR', 'footR'],
]);

const BLOCKED_COPY = Object.freeze({
  analysis_missing: 'Bewegungsanalyse wird vorbereitet …',
  recording_gate: 'Aufnahme korrigieren: Erst danach wird der technische Vergleich eingeblendet.',
  unsupported_exercise: 'Der technische Linienavatar ist für Tendu, Passé, Jeté und Changement verfügbar.',
  outside_phase: 'Noch kein vollständiges Phasenfenster dieser Bewegung erkannt.',
  reference_missing: 'Die technische Bewegungsquelle ist für dieses Phasenfenster nicht verfügbar.',
});

const SHORT_PHASE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  departure: 'Start', extension: 'Abstr.', full_extension: 'Streck', return: 'Rückweg', closure: 'Schluss',
  preparation: 'Start', lift: 'Anheben', placement: 'Position', lower: 'Absenken', finish: 'Schluss',
  brush: 'Abstr.', release: 'Lösen', takeoff: 'Absprung', flight: 'Flug', landing: 'Landung',
});

function pointIsUsable(point: KinematicPoint | null | undefined): point is KinematicPoint {
  return Boolean(point) && Number.isFinite(point!.x) && Number.isFinite(point!.y) && point!.isPredicted !== true;
}

const SkeletonLines: React.FC<Readonly<{
  skeleton: ReconstructedSkeleton | null;
  stroke: string;
  width: number;
  opacity?: number;
  dash?: string;
  testId?: string;
}>> = ({ skeleton, stroke, width, opacity = 1, dash, testId }) => skeleton ? (
  <g data-testid={testId} fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} opacity={opacity} vectorEffect="non-scaling-stroke">
    {BONES.map(([from, to]) => {
      const fromPoint = skeleton[from];
      const toPoint = skeleton[to];
      return pointIsUsable(fromPoint) && pointIsUsable(toPoint)
        ? <line key={`${from}-${to}`} x1={fromPoint.x} y1={fromPoint.y} x2={toPoint.x} y2={toPoint.y} />
        : null;
    })}
  </g>
) : null;

export const SynchronizedMotionAvatarViewport = memo(function SynchronizedMotionAvatarViewport({
  analysis,
  isPlaying,
  currentTimeMs,
  getCurrentTimeMs,
  liveSkeleton = null,
  videoWidth = 0,
  videoHeight = 0,
  previousAttempt = null,
  progressCurve = [],
  onLoopRangeChange,
}: Props) {
  const [clockMs, setClockMs] = useState(currentTimeMs);
  const [viewMode, setViewMode] = useState<AvatarViewMode>('avatar');
  const [loopPhaseId, setLoopPhaseId] = useState<string | null>(null);
  useEffect(() => setClockMs(currentTimeMs), [currentTimeMs]);
  useEffect(() => {
    if (!isPlaying) return undefined;
    let frameId = 0;
    let lastValue = -1;
    const tick = () => {
      const next = getCurrentTimeMs();
      if (Number.isFinite(next) && Math.abs(next - lastValue) >= 16) {
        lastValue = next;
        setClockMs(next);
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [getCurrentTimeMs, isPlaying]);
  useEffect(() => () => onLoopRangeChange?.(null), [onLoopRangeChange]);

  const resolution = resolveTechnicalMotionAvatarFrame(analysis, isPlaying ? clockMs : currentTimeMs);
  const mappedPhase = resolution.kind === 'mapped' ? resolution.phase : null;
  const feedback = buildMotionTeachingFeedback(analysis?.exerciseId ?? 'tendu', mappedPhase, { levelLabel: analysis?.levelLabel, direction: analysis?.direction ?? undefined });
  const reference = resolution.kind === 'mapped'
    ? resolution.reference
    : isMotionAvatarExercise(analysis?.exerciseId)
      ? motionAvatarReference(analysis.exerciseId)
      : null;
  const sourceLabels = reference?.sourceLabels ?? [];
  const phaseOrder = reference ? motionAvatarPhaseOrder(reference.exerciseId) : [];
  const mirrorX = resolution.kind === 'mapped' && resolution.mirrorX;
  const technicalFootPaths = useMemo(() => reference?.workingSides.map(side => ({
    side,
    points: reference.frames.flatMap(({ frame }) => {
      const skeleton = projectCanonicalFrameToSkeleton({ frame, width: 360, height: 360, paddingRatio: 0.08, sourceBounds: reference.projectionBounds, mirrorX });
      const point = side === 'left' ? skeleton.footL : skeleton.footR;
      return pointIsUsable(point) ? [{ x: point.x, y: point.y }] : [];
    }),
  })) ?? [], [mirrorX, reference]);
  const avatarSkeleton = resolution.kind === 'mapped'
    ? projectCanonicalFrameToSkeleton({ frame: resolution.frame, width: 360, height: 360, paddingRatio: 0.08, sourceBounds: resolution.reference.projectionBounds, mirrorX })
    : null;
  const projectedLiveSkeleton = useMemo(() => liveSkeleton
    ? projectVideoSkeletonToAvatar({ skeleton: liveSkeleton, videoWidth, videoHeight, width: 360, height: 360, padding: 10 })
    : null,
  [liveSkeleton, videoHeight, videoWidth]);
  const overlayTransform = avatarSkeleton && projectedLiveSkeleton
    ? referenceToLiveTransform(avatarSkeleton, projectedLiveSkeleton)
    : null;
  const alignedTechnicalSkeleton = avatarSkeleton && overlayTransform
    ? transformAvatarSkeleton(avatarSkeleton, overlayTransform)
    : null;
  const alignedFootPaths = overlayTransform
    ? technicalFootPaths.map(path => ({ ...path, points: path.points.map(point => transformAvatarPoint(point, overlayTransform)) }))
    : [];
  const phaseBase = mappedPhase ? heuristicBaseState(mappedPhase.displayState) : null;
  const phaseColor = phaseBase && mappedPhase ? heuristicColor(mappedPhase.displayState) : '#94a3b8';
  const isDotted = mappedPhase ? heuristicEvidenceStrength(mappedPhase.displayState) !== 'stable' : false;
  const canOverlay = Boolean(projectedLiveSkeleton && alignedTechnicalSkeleton);
  const canCompare = Boolean(previousAttempt && progressCurve.length > 0);

  const togglePhaseLoop = () => {
    if (!mappedPhase || !onLoopRangeChange) return;
    if (loopPhaseId === mappedPhase.id) {
      setLoopPhaseId(null);
      onLoopRangeChange(null);
      return;
    }
    setLoopPhaseId(mappedPhase.id);
    onLoopRangeChange(Object.freeze({ startMs: mappedPhase.startMs, endMs: mappedPhase.endMs, label: mappedPhase.label }));
  };

  return (
    <section
      data-testid="tendu-single-clock-avatar"
      data-avatar-state={resolution.kind}
      data-motion-id={analysis?.exerciseId ?? 'unknown'}
      data-reference-mirrored={mirrorX ? 'true' : 'false'}
      aria-label="Phasensynchroner technischer Bewegungs-Linienavatar"
      style={{
        position: 'relative', width: '100%', height: '100%', minHeight: 0, overflowX: 'hidden', overflowY: 'auto',
        borderLeft: '2px solid rgba(34,211,238,0.3)',
        background: 'radial-gradient(circle at 50% 38%, rgba(18,50,66,0.45), rgba(5,5,8,0.98) 70%)',
        color: '#f8fafc', display: 'grid', gridTemplateRows: 'auto minmax(100px,1fr) auto',
      }}
    >
      <header style={{ padding: '12px 14px 7px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#67e8f9', fontSize: 10, fontWeight: 900, letterSpacing: '.06em' }}>SINGLE-CLOCK · TECHNISCHER {analysis?.exerciseLabel?.toLocaleUpperCase('de-DE') ?? 'BEWEGUNGS'}-PILOT</div>
          <div className="tendu-avatar-subtitle" style={{ marginTop: 3, fontSize: 11, color: 'rgba(255,255,255,.6)' }}>{reference ? `Dryad-Kohorte aus ${reference.sourceSampleCount} Versuchen` : 'Technische Bewegungsquelle'} · BalletOS-eigener neutraler Linienkörper{mirrorX ? ' · für linke Arbeitsseite gespiegelt' : ''} · nicht Nicole-geprüft</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 7 }}>
            {([
              ['avatar', 'Avatar'], ['overlay', 'Overlay'], ['before_after', 'Vorher/Nachher'],
            ] as const).map(([id, label]) => {
              const disabled = id === 'overlay' ? !canOverlay : id === 'before_after' ? !canCompare : false;
              return <button key={id} disabled={disabled} onClick={() => setViewMode(id)} title={disabled ? (id === 'overlay' ? 'Live-Skeleton noch nicht verfügbar' : 'Noch kein vergleichbarer vorheriger Versuch') : undefined} style={{ border: `1px solid ${viewMode === id ? 'rgba(103,232,249,.55)' : 'rgba(255,255,255,.12)'}`, borderRadius: 7, padding: '3px 7px', background: viewMode === id ? 'rgba(34,211,238,.14)' : 'rgba(255,255,255,.035)', color: disabled ? 'rgba(255,255,255,.25)' : viewMode === id ? '#a5f3fc' : 'rgba(255,255,255,.6)', fontSize: 8, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer' }}>{label}</button>;
            })}
            <button disabled={!mappedPhase || !onLoopRangeChange} onClick={togglePhaseLoop} style={{ border: `1px solid ${loopPhaseId ? 'rgba(192,132,252,.55)' : 'rgba(255,255,255,.12)'}`, borderRadius: 7, padding: '3px 7px', background: loopPhaseId ? 'rgba(192,132,252,.16)' : 'rgba(255,255,255,.035)', color: !mappedPhase || !onLoopRangeChange ? 'rgba(255,255,255,.25)' : loopPhaseId ? '#d8b4fe' : 'rgba(255,255,255,.6)', fontSize: 8, fontWeight: 800, cursor: !mappedPhase || !onLoopRangeChange ? 'not-allowed' : 'pointer' }}>{loopPhaseId ? `Loop · ${mappedPhase?.label ?? ''}` : 'Phase loopen'}</button>
          </div>
        </div>
        <div className="tendu-avatar-clock" style={{ border: '1px solid rgba(148,163,184,.35)', borderRadius: 7, padding: '4px 7px', fontSize: 9, color: '#cbd5e1', whiteSpace: 'nowrap' }}>
          {isPlaying ? 'LIVE' : 'PAUSE'} · {(clockMs / 1000).toFixed(3)} s
        </div>
      </header>

      <div style={{ position: 'relative', minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {resolution.kind === 'mapped' && viewMode === 'before_after' && canCompare ? (
          <div data-testid="tendu-before-after" style={{ width: 'calc(100% - 28px)', display: 'grid', gap: 8, padding: '10px 14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              <div style={{ borderRadius: 9, padding: 9, background: 'rgba(148,163,184,.08)', border: '1px solid rgba(148,163,184,.2)' }}><div style={{ fontSize: 8, fontWeight: 900, color: '#cbd5e1' }}>VORHER</div><div style={{ marginTop: 3, fontSize: 10, fontWeight: 800 }}>{previousAttempt ? new Date(previousAttempt.capturedAt).toLocaleDateString('de-DE') : '–'}</div><div style={{ marginTop: 2, fontSize: 8, color: 'rgba(255,255,255,.48)' }}>{previousAttempt?.cycleCount ?? 0} gespeicherte Zyklen</div></div>
              <div style={{ borderRadius: 9, padding: 9, background: 'rgba(34,211,238,.08)', border: '1px solid rgba(34,211,238,.24)' }}><div style={{ fontSize: 8, fontWeight: 900, color: '#67e8f9' }}>HEUTE</div><div style={{ marginTop: 3, fontSize: 10, fontWeight: 800 }}>{analysis?.cycleCount ?? 0} analysierte Zyklen</div><div style={{ marginTop: 2, fontSize: 8, color: 'rgba(255,255,255,.48)' }}>gleiche Schülerin · gleiche Übung/Ansicht</div></div>
            </div>
            <div style={{ display: 'grid', gap: 5 }}>
              {progressCurve.map(point => {
                const width = Math.max(4, Math.round(Math.abs(point.score) * 50));
                const color = point.score > 0.08 ? '#30d158' : point.score < -0.08 ? '#ff9f0a' : '#94a3b8';
                return <div key={`${point.phaseId}-${point.label}`} style={{ display: 'grid', gridTemplateColumns: '68px 1fr 34px', gap: 6, alignItems: 'center', fontSize: 8 }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{point.label}</span><div style={{ height: 7, position: 'relative', borderRadius: 8, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}><div style={{ position: 'absolute', left: point.score >= 0 ? '50%' : `calc(50% - ${width}%)`, width: `${width}%`, height: '100%', background: color, borderRadius: 8 }} /></div><span style={{ color, textAlign: 'right', fontWeight: 850 }}>{point.score > .08 ? 'besser' : point.score < -.08 ? 'unruhiger' : 'ähnlich'}</span></div>;
              })}
            </div>
            <div style={{ fontSize: 7.5, color: 'rgba(255,255,255,.42)' }}>Messkurve aus Phasen, Fußbahn und Unruhe · keine gespeicherte oder erfundene Vorher‑Pose.</div>
          </div>
        ) : resolution.kind === 'mapped' && (viewMode !== 'overlay' || canOverlay) ? (
          <svg data-testid="tendu-technical-avatar-svg" data-view-mode={viewMode} viewBox="0 0 360 360" preserveAspectRatio="xMidYMid meet" style={{ width: '92%', height: '100%' }}>
            {viewMode === 'overlay' ? (
              <>
                <SkeletonLines skeleton={projectedLiveSkeleton} stroke="#f8fafc" width={2} opacity={0.9} testId="tendu-live-overlay-skeleton" />
                <SkeletonLines skeleton={alignedTechnicalSkeleton} stroke="#22d3ee" width={1.6} opacity={0.86} dash="4 4" testId="tendu-reference-overlay-skeleton" />
                {alignedFootPaths.map(path => <polyline key={path.side} points={path.points.map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke={phaseColor} strokeWidth="1.25" strokeLinecap="round" strokeDasharray={isDotted ? '1 6' : undefined} vectorEffect="non-scaling-stroke" opacity=".9" />)}
                <g fontSize="8" fontWeight="800"><text x="12" y="18" fill="#f8fafc">Live</text><text x="12" y="30" fill="#22d3ee">Technik · keine Sollreferenz</text></g>
              </>
            ) : (
              <>
                <SkeletonLines skeleton={avatarSkeleton} stroke="#e2e8f0" width={2.2} />
                <g fill="#071217" stroke={phaseColor} strokeWidth="1.8" vectorEffect="non-scaling-stroke">
                  {avatarSkeleton ? Object.entries(avatarSkeleton).map(([key, point]) => pointIsUsable(point) ? <circle key={key} cx={point.x} cy={point.y} r="3" /> : null) : null}
                </g>
                {technicalFootPaths.map(path => <polyline key={path.side} points={path.points.map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke={phaseColor} strokeWidth="1.25" strokeLinecap="round" strokeDasharray={isDotted ? '1 6' : undefined} vectorEffect="non-scaling-stroke" opacity=".9" />)}
              </>
            )}
          </svg>
        ) : resolution.kind === 'mapped' && viewMode === 'overlay' ? (
          <div role="status" style={{ maxWidth: 330, padding: 20, textAlign: 'center', color: '#cbd5e1', fontSize: 12, lineHeight: 1.5 }}>Live‑Skeleton für dieses Frame nicht ausreichend sichtbar. Der technische Avatar bleibt getrennt verfügbar.</div>
        ) : resolution.kind === 'blocked' ? (
          <div role="status" style={{ maxWidth: 330, padding: 20, textAlign: 'center', color: '#cbd5e1', fontSize: 13, lineHeight: 1.5 }}>
            {BLOCKED_COPY[resolution.reason]}
          </div>
        ) : (
          <div role="status" style={{ maxWidth: 330, padding: 20, textAlign: 'center', color: '#cbd5e1', fontSize: 12, lineHeight: 1.5 }}>Für Vorher/Nachher fehlt noch ein vergleichbarer gespeicherter Versuch.</div>
        )}
        {resolution.kind === 'mapped' ? (
          <div style={{ position: 'absolute', top: 4, right: 14, padding: '5px 8px', borderRadius: 8, border: `1px ${isDotted ? 'dotted' : 'solid'} ${phaseColor}`, background: 'rgba(2,6,23,.82)', color: phaseColor, fontSize: 10, fontWeight: 800 }}>
            {analysis && analysis.cycleCount > 1 ? `Zyklus ${resolution.phase.cycleIndex + 1}/${analysis.cycleCount} · ` : ''}
            {resolution.phase.label} · {Math.round(resolution.phaseProgress * 100)} %
          </div>
        ) : null}
      </div>

      <footer style={{ padding: '5px 8px 7px', borderTop: '1px solid rgba(148,163,184,.15)', background: 'rgba(2,6,23,.7)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 3, marginBottom: 5 }}>
          {phaseOrder.map(id => {
            const active = resolution.kind === 'mapped' && resolution.phase.id === id;
            const label = analysis?.phases.find(phase => phase.id === id)?.label ?? SHORT_PHASE_LABELS[id] ?? id;
            return <div key={id} title={label} style={{ minWidth: 0, overflow: 'hidden', borderRadius: 5, padding: '3px 2px', textAlign: 'center', fontSize: 7.5, fontWeight: active ? 900 : 600, background: active ? 'rgba(34,211,238,.18)' : 'rgba(255,255,255,.04)', color: active ? '#67e8f9' : 'rgba(255,255,255,.48)', border: active ? '1px solid rgba(34,211,238,.45)' : '1px solid transparent' }}>{SHORT_PHASE_LABELS[id] ?? label}</div>;
          })}
        </div>
        {feedback ? (
          <div className="tendu-rich-feedback" data-testid="tendu-rich-feedback" data-content-id={feedback.contentId} title={`Feedback-Bibliothek ${feedback.libraryVersion} · Nicole prüft`} style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 4 }}>
            {([['Was', feedback.what], ['Warum', feedback.why], ['Ziel', feedback.goal], ['Üben', feedback.practice], ['Metapher', feedback.metaphor]] as const).map(([label, value]) => (
              <div key={label} title={value} style={{ minWidth: 0, overflow: 'hidden', padding: '4px 5px', borderRadius: 5, background: 'rgba(255,255,255,.045)' }}>
                <div style={{ color: '#67e8f9', fontSize: 8, fontWeight: 900, textTransform: 'uppercase' }}>{label}</div>
                <div style={{ marginTop: 1, fontSize: 8, lineHeight: 1.2, color: 'rgba(255,255,255,.75)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{value}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,.48)' }}>{sourceLabels.join(' · ') || 'Technische Quelle · keine Sollreferenz'}</div>
        )}
      </footer>
    </section>
  );
});

/** Compatibility export for existing callers and tests. */
export const SynchronizedTenduAvatarViewport = SynchronizedMotionAvatarViewport;
