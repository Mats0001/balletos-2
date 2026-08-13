import React, { memo, useEffect, useMemo, useState } from 'react';
import { heuristicBaseState, heuristicColor, heuristicEvidenceStrength } from '../types/teacherHeuristic';
import { TENDU_PHASE_ORDER } from '../types/canonicalMotion';
import type { SkeletonPointId } from '../types/skeletonTarget';
import {
  resolveTenduPilotFrame,
  TENDU_PHASE_LABELS,
  TENDU_PILOT_REFERENCE,
  tenduPilotSourceLabels,
} from '../services/tenduPilotReference';
import { buildTenduTeachingFeedback } from '../services/tenduTeachingFeedback';
import type { TeacherPhaseAnalysis } from '../services/teacherPhaseAnalysis';
import { projectCanonicalFrameToSkeleton } from '../services/canonicalMotionAvatar';
import type { KinematicPoint } from '../services/vaganova3DKinematics';

interface Props {
  analysis: TeacherPhaseAnalysis | null;
  isPlaying: boolean;
  currentTimeMs: number;
  getCurrentTimeMs: () => number;
}

const BONES: readonly [SkeletonPointId, SkeletonPointId][] = Object.freeze([
  ['head', 'neck'], ['shoulderL', 'shoulderR'], ['neck', 'sternum'], ['sternum', 'navel'],
  ['navel', 'pelvisCenter'], ['shoulderL', 'elbowL'], ['elbowL', 'wristL'],
  ['shoulderR', 'elbowR'], ['elbowR', 'wristR'], ['pelvisL', 'pelvisR'],
  ['pelvisL', 'kneeL'], ['kneeL', 'ankleL'], ['ankleL', 'footL'],
  ['pelvisR', 'kneeR'], ['kneeR', 'ankleR'], ['ankleR', 'footR'],
]);

const BLOCKED_COPY = Object.freeze({
  analysis_missing: 'Tendu-Analyse wird vorbereitet …',
  recording_gate: 'Aufnahme korrigieren: Erst danach wird der technische Vergleich eingeblendet.',
  not_tendu: 'Für den technischen Linienavatar bitte Tendu auswählen.',
  outside_phase: 'Noch kein vollständiges Tendu-Phasenfenster erkannt.',
});

const SHORT_PHASE_LABELS = Object.freeze({
  departure: 'Start', extension: 'Abstr.', full_extension: 'Streck', return: 'Rückweg', closure: 'Schluss',
});

function pointIsUsable(point: KinematicPoint | null | undefined): point is KinematicPoint {
  return Boolean(point) && Number.isFinite(point!.x) && Number.isFinite(point!.y) && point!.isPredicted !== true;
}

export const SynchronizedTenduAvatarViewport = memo(function SynchronizedTenduAvatarViewport({
  analysis,
  isPlaying,
  currentTimeMs,
  getCurrentTimeMs,
}: Props) {
  const [clockMs, setClockMs] = useState(currentTimeMs);
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

  const resolution = resolveTenduPilotFrame(analysis, isPlaying ? clockMs : currentTimeMs);
  const mappedPhase = resolution.kind === 'mapped' ? resolution.phase : null;
  const feedback = buildTenduTeachingFeedback(mappedPhase);
  const sourceLabels = useMemo(() => tenduPilotSourceLabels(), []);
  const technicalFootPath = useMemo(() => TENDU_PILOT_REFERENCE.clip.frames.flatMap(frame => {
    const point = projectCanonicalFrameToSkeleton({ frame, width: 360, height: 360, paddingRatio: 0.08 }).footR;
    return pointIsUsable(point) ? [`${point.x},${point.y}`] : [];
  }).join(' '), []);
  const avatarSkeleton = resolution.kind === 'mapped'
    ? projectCanonicalFrameToSkeleton({ frame: resolution.frame, width: 360, height: 360, paddingRatio: 0.08 })
    : null;
  const phaseBase = mappedPhase ? heuristicBaseState(mappedPhase.displayState) : null;
  const phaseColor = phaseBase && mappedPhase ? heuristicColor(mappedPhase.displayState) : '#94a3b8';
  const isDotted = mappedPhase ? heuristicEvidenceStrength(mappedPhase.displayState) !== 'stable' : false;

  return (
    <section
      data-testid="tendu-single-clock-avatar"
      data-avatar-state={resolution.kind}
      aria-label="Phasensynchroner technischer Tendu-Linienavatar"
      style={{
        position: 'relative', width: '100%', height: '100%', minHeight: 0, overflowX: 'hidden', overflowY: 'auto',
        borderLeft: '2px solid rgba(34,211,238,0.3)',
        background: 'radial-gradient(circle at 50% 38%, rgba(18,50,66,0.45), rgba(5,5,8,0.98) 70%)',
        color: '#f8fafc', display: 'grid', gridTemplateRows: 'auto minmax(100px,1fr) auto',
      }}
    >
      <header style={{ padding: '12px 14px 7px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#67e8f9', fontSize: 10, fontWeight: 900, letterSpacing: '.06em' }}>SINGLE-CLOCK · TECHNISCHER TENDU-PILOT</div>
          <div className="tendu-avatar-subtitle" style={{ marginTop: 3, fontSize: 11, color: 'rgba(255,255,255,.6)' }}>Dryad-Median aus 100 Versuchen + neutraler BalletOS-Linienkörper · nicht Nicole-geprüft</div>
        </div>
        <div className="tendu-avatar-clock" style={{ border: '1px solid rgba(148,163,184,.35)', borderRadius: 7, padding: '4px 7px', fontSize: 9, color: '#cbd5e1', whiteSpace: 'nowrap' }}>
          {isPlaying ? 'LIVE' : 'PAUSE'} · {(clockMs / 1000).toFixed(3)} s
        </div>
      </header>

      <div style={{ position: 'relative', minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {resolution.kind === 'mapped' ? (
          <svg data-testid="tendu-technical-avatar-svg" viewBox="0 0 360 360" preserveAspectRatio="xMidYMid meet" style={{ width: '92%', height: '100%' }}>
            <g fill="none" stroke="#e2e8f0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
              {BONES.map(([from, to]) => {
                const fromPoint = avatarSkeleton?.[from];
                const toPoint = avatarSkeleton?.[to];
                return pointIsUsable(fromPoint) && pointIsUsable(toPoint) ? (
                  <line key={`${from}-${to}`} x1={fromPoint.x} y1={fromPoint.y} x2={toPoint.x} y2={toPoint.y} />
                ) : null;
              })}
            </g>
            <g fill="#071217" stroke={phaseColor} strokeWidth="1.8" vectorEffect="non-scaling-stroke">
              {avatarSkeleton ? Object.entries(avatarSkeleton).map(([key, point]) => pointIsUsable(point) ? <circle key={key} cx={point.x} cy={point.y} r="3" /> : null) : null}
            </g>
            <polyline
              points={technicalFootPath}
              fill="none" stroke={phaseColor} strokeWidth="1.25" strokeLinecap="round"
              strokeDasharray={isDotted ? '1 6' : undefined}
              vectorEffect="non-scaling-stroke"
              opacity=".9"
            />
          </svg>
        ) : (
          <div role="status" style={{ maxWidth: 330, padding: 20, textAlign: 'center', color: '#cbd5e1', fontSize: 13, lineHeight: 1.5 }}>
            {BLOCKED_COPY[resolution.reason]}
          </div>
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
          {TENDU_PHASE_ORDER.map(id => {
            const active = resolution.kind === 'mapped' && resolution.phase.id === id;
            return <div key={id} title={TENDU_PHASE_LABELS[id]} style={{ minWidth: 0, overflow: 'hidden', borderRadius: 5, padding: '3px 2px', textAlign: 'center', fontSize: 7.5, fontWeight: active ? 900 : 600, background: active ? 'rgba(34,211,238,.18)' : 'rgba(255,255,255,.04)', color: active ? '#67e8f9' : 'rgba(255,255,255,.48)', border: active ? '1px solid rgba(34,211,238,.45)' : '1px solid transparent' }}>{SHORT_PHASE_LABELS[id]}</div>;
          })}
        </div>
        {feedback ? (
          <div className="tendu-rich-feedback" data-testid="tendu-rich-feedback" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 4 }}>
            {([['Was', feedback.what], ['Warum', feedback.why], ['Ziel', feedback.goal], ['Üben', feedback.practice], ['Metapher', feedback.metaphor]] as const).map(([label, value]) => (
              <div key={label} title={value} style={{ minWidth: 0, overflow: 'hidden', padding: '4px 5px', borderRadius: 5, background: 'rgba(255,255,255,.045)' }}>
                <div style={{ color: '#67e8f9', fontSize: 8, fontWeight: 900, textTransform: 'uppercase' }}>{label}</div>
                <div style={{ marginTop: 1, fontSize: 8, lineHeight: 1.2, color: 'rgba(255,255,255,.75)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{value}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,.48)' }}>{sourceLabels.join(' · ') || TENDU_PILOT_REFERENCE.clip.label}</div>
        )}
      </footer>
    </section>
  );
});
