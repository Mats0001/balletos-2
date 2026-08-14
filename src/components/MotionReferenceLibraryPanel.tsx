import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, FlaskConical, History, LockKeyhole, UserRound, X } from 'lucide-react';
import type { MotionReferenceLibraryEntry } from '../services/motionReferenceLibrary';
import { buildStudentProgressSummaries, type StudentAttemptSnapshot } from '../services/studentAttemptHistory';
import type { NicoleReferenceLineRecord } from '../types/nicoleReferenceLine';

type LibraryTab = 'nicole' | 'technical' | 'attempts';
type ExerciseFilter = 'all' | 'plie' | 'tendu' | 'passe' | 'jete' | 'changement';
type ViewFilter = 'all' | 'frontal' | 'profile';

interface MotionReferenceLibraryPanelProps {
  open: boolean;
  onClose: () => void;
  currentExerciseId: string;
  currentVideoSourceId: string;
  nicoleRecords: readonly NicoleReferenceLineRecord[];
  technicalSources: readonly MotionReferenceLibraryEntry[];
  attempts: readonly StudentAttemptSnapshot[];
}

const EXERCISE_OPTIONS: readonly Readonly<{ id: ExerciseFilter; label: string }>[] = Object.freeze([
  { id: 'all', label: 'Alle Übungen' },
  { id: 'plie', label: 'Plié' },
  { id: 'tendu', label: 'Tendu' },
  { id: 'passe', label: 'Passé' },
  { id: 'jete', label: 'Jeté' },
  { id: 'changement', label: 'Changement' },
]);

const PHASE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  setup: 'Ausgang', descent: 'Abwärtsbewegung', bottom: 'Tiefster Punkt', ascent: 'Aufwärtsbewegung', finish: 'Abschluss',
  departure: 'Abstreichen', extension: 'Streckung', full_extension: 'Volle Streckung', return: 'Rückweg', closure: 'Schluss',
});

function sourceExercise(entry: MotionReferenceLibraryEntry): ExerciseFilter | null {
  if (entry.exerciseId) return entry.exerciseId;
  const match = entry.id.match(/^dryad-(tendu|passe|jete|changement)-/);
  return (match?.[1] as ExerciseFilter | undefined) ?? null;
}

function sourceName(sourceId: string): string {
  const clean = sourceId.split('?')[0];
  return decodeURIComponent(clean.split('/').pop() || sourceId);
}

function productStatus(entry: MotionReferenceLibraryEntry): Readonly<{ label: string; color: string }> {
  if (entry.productStatus === 'technical_runtime_allowed') return { label: 'Technisch nutzbar', color: '#67e8f9' };
  if (entry.productStatus === 'internal_pilot_only') return { label: 'Nur interner Pilot', color: '#fbbf24' };
  if (entry.productStatus === 'license_required') return { label: 'Sonderlizenz erforderlich', color: '#fb7185' };
  return { label: 'Nicht freigegeben', color: '#fb7185' };
}

const panelCard: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '13px',
  background: 'rgba(255,255,255,0.035)',
  padding: '12px',
};

const badge = (color: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: '4px', borderRadius: '999px', padding: '3px 7px',
  border: `1px solid ${color}66`, color, background: `${color}16`, fontSize: '8px', fontWeight: 850,
  letterSpacing: '0.035em', textTransform: 'uppercase',
});

export const MotionReferenceLibraryPanel: React.FC<MotionReferenceLibraryPanelProps> = ({
  open,
  onClose,
  currentExerciseId,
  currentVideoSourceId,
  nicoleRecords,
  technicalSources,
  attempts,
}) => {
  const normalizedCurrentExercise = EXERCISE_OPTIONS.some(option => option.id === currentExerciseId)
    ? currentExerciseId as ExerciseFilter
    : 'all';
  const [tab, setTab] = useState<LibraryTab>('nicole');
  const [exercise, setExercise] = useState<ExerciseFilter>(normalizedCurrentExercise);
  const [view, setView] = useState<ViewFilter>('all');

  useEffect(() => {
    setExercise(normalizedCurrentExercise);
  }, [normalizedCurrentExercise]);

  const filteredNicole = useMemo(() => nicoleRecords.filter(record => {
    const binding = record.versions.find(version => version.versionId === record.currentVersionId)?.phaseBinding;
    if (!binding) return exercise === 'all' && view === 'all';
    return (exercise === 'all' || binding.exerciseId === exercise)
      && (view === 'all' || binding.perspectivePlane === view);
  }), [exercise, nicoleRecords, view]);

  const filteredTechnical = useMemo(() => technicalSources.filter(entry => {
    const sourceMotion = sourceExercise(entry);
    return exercise === 'all' || sourceMotion === null || sourceMotion === exercise;
  }), [exercise, technicalSources]);

  const filteredAttempts = useMemo(() => attempts.filter(attempt => (
    (exercise === 'all' || attempt.exerciseId === exercise)
    && (view === 'all'
      || (view === 'frontal' && attempt.perspective === 'FRONTAL')
      || (view === 'profile' && (attempt.perspective === 'PROFILE_LEFT' || attempt.perspective === 'PROFILE_RIGHT')))
  )), [attempts, exercise, view]);
  const progressSummaries = useMemo(
    () => buildStudentProgressSummaries(filteredAttempts),
    [filteredAttempts],
  );

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cross-Video-Referenzbibliothek"
      style={{ position: 'fixed', inset: 0, zIndex: 10020, background: 'rgba(4,3,8,0.78)', backdropFilter: 'blur(10px)', display: 'grid', placeItems: 'center', padding: '16px' }}
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section style={{ width: 'min(940px, calc(100vw - 24px))', maxHeight: 'min(820px, calc(100dvh - 24px))', overflow: 'hidden', display: 'flex', flexDirection: 'column', borderRadius: '20px', border: '1px solid rgba(103,232,249,0.25)', background: 'linear-gradient(150deg, rgba(22,18,31,0.99), rgba(10,12,18,0.99))', boxShadow: '0 28px 90px rgba(0,0,0,0.58)', color: '#fff' }}>
        <header style={{ padding: '17px 18px 13px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 850 }}><BookOpen size={17} color="#67e8f9" /> Referenzbibliothek</div>
            <div style={{ marginTop: '5px', color: 'rgba(255,255,255,0.52)', fontSize: '10px', lineHeight: 1.5 }}>Nicole‑Referenzen, technische Bewegungsdaten und Schülerverläufe bleiben fachlich getrennt.</div>
          </div>
          <button aria-label="Referenzbibliothek schließen" onClick={onClose} style={{ border: 0, background: 'rgba(255,255,255,0.07)', color: '#fff', width: '30px', height: '30px', borderRadius: '9px', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={15} /></button>
        </header>

        <div style={{ padding: '11px 18px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          {([
            ['nicole', 'Nicole‑Referenzen', UserRound, nicoleRecords.length],
            ['technical', 'Technische Quellen', FlaskConical, technicalSources.length],
            ['attempts', 'Schülerverlauf', History, attempts.length],
          ] as const).map(([id, label, Icon, count]) => (
            <button key={id} onClick={() => setTab(id)} aria-pressed={tab === id} style={{ border: `1px solid ${tab === id ? 'rgba(103,232,249,0.5)' : 'rgba(255,255,255,0.1)'}`, background: tab === id ? 'rgba(103,232,249,0.13)' : 'rgba(255,255,255,0.035)', color: tab === id ? '#a5f3fc' : 'rgba(255,255,255,0.65)', borderRadius: '10px', padding: '7px 10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', fontWeight: 800, cursor: 'pointer' }}><Icon size={12} />{label}<span style={{ opacity: 0.55 }}>{count}</span></button>
          ))}
          <div style={{ flex: 1 }} />
          <select aria-label="Übung filtern" value={exercise} onChange={event => setExercise(event.target.value as ExerciseFilter)} style={{ background: '#17141f', color: '#fff', border: '1px solid rgba(255,255,255,0.13)', borderRadius: '9px', padding: '7px 9px', fontSize: '9px' }}>{EXERCISE_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
          <select aria-label="Ansicht filtern" value={view} onChange={event => setView(event.target.value as ViewFilter)} style={{ background: '#17141f', color: '#fff', border: '1px solid rgba(255,255,255,0.13)', borderRadius: '9px', padding: '7px 9px', fontSize: '9px' }}><option value="all">Alle Ansichten</option><option value="frontal">Frontal</option><option value="profile">Profil</option></select>
        </div>

        <div style={{ overflowY: 'auto', padding: '15px 18px 20px', display: 'grid', gap: '10px' }}>
          {tab === 'nicole' && (filteredNicole.length > 0 ? filteredNicole.map(record => {
            const current = record.versions.find(version => version.versionId === record.currentVersionId) ?? record.versions[record.versions.length - 1]!;
            const binding = current.phaseBinding;
            const isCurrentVideo = record.videoSourceId === currentVideoSourceId;
            return <article key={record.recordId} style={panelCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div><div style={{ fontSize: '12px', fontWeight: 850 }}>{record.targetId.replace(/^bone\./, '').replace(/_/g, ' ')}</div><div style={{ marginTop: '3px', color: 'rgba(255,255,255,0.48)', fontSize: '9px' }}>{sourceName(record.videoSourceId)} · {Math.round(current.sourceMediaTimeUs / 1000)} ms</div></div>
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}><span style={badge('#22d3ee')}><LockKeyhole size={9} /> Nicole geprüft · V{current.versionNumber}</span>{isCurrentVideo && <span style={badge('#c084fc')}>Aktuelles Video</span>}</div>
              </div>
              <div style={{ marginTop: '9px', display: 'flex', gap: '7px', flexWrap: 'wrap', color: 'rgba(255,255,255,0.68)', fontSize: '9px' }}>{binding ? <><span>{binding.exerciseId === 'plie' ? 'Plié' : 'Tendu'}</span><span>·</span><span>{PHASE_LABELS[binding.phaseId] ?? binding.phaseId}</span><span>·</span><span>{binding.perspectivePlane === 'frontal' ? 'Frontal' : 'Profil'}</span><span>·</span><span>{binding.levelLabel}</span></> : <span>Legacy‑Linie ohne Phasenbindung · nur im Ursprungsvideo</span>}</div>
            </article>;
          }) : <EmptyState text="Für diesen Filter ist noch keine von Nicole freigegebene Referenzlinie gespeichert." />)}

          {tab === 'technical' && (filteredTechnical.length > 0 ? filteredTechnical.map(entry => {
            const status = productStatus(entry);
            return <article key={entry.id} style={panelCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <div><div style={{ fontSize: '12px', fontWeight: 850 }}>{entry.label}</div><div style={{ marginTop: '3px', color: 'rgba(255,255,255,0.48)', fontSize: '9px' }}>{entry.sourceKind.replace(/_/g, ' ')} · {entry.rightsLabel}</div></div>
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}><span style={badge('#a3a3a3')}>Technik · keine Sollreferenz</span><span style={badge(status.color)}>{status.label}</span></div>
              </div>
              <div style={{ marginTop: '9px', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>{entry.technicalUse.map(use => <span key={use} style={{ borderRadius: '7px', background: 'rgba(255,255,255,0.055)', padding: '4px 7px', color: 'rgba(255,255,255,0.66)', fontSize: '8px' }}>{use}</span>)}</div>
              {entry.id === 'balletmoves-ii' && <div style={{ marginTop: '9px', color: '#fbbf24', fontSize: '9px' }}>Ein kontrollierter Rechner · keine Cloud-/Teamweitergabe · keine Produktintegration ohne Sonderlizenz.</div>}
              {entry.id === 'gold-pilot-plie-video-20260814' && <div style={{ marginTop: '9px', color: '#fbbf24', fontSize: '9px' }}>Hashverifizierter technischer Handoff · Plié-Zuordnung aus Quelltext, fachlich ungeprüft · keine Nicole‑Referenz · Video bleibt bis zur Rechte- und Releaseprüfung außerhalb des Produktbundles.</div>}
              {entry.sourceUrl.startsWith('http') && <a href={entry.sourceUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '9px', color: '#67e8f9', fontSize: '9px' }}>Quelle öffnen ↗</a>}
            </article>;
          }) : <EmptyState text="Für diesen Filter ist keine technische Quelle registriert." />)}

          {tab === 'attempts' && (filteredAttempts.length > 0 ? <>
            {progressSummaries.length > 0 && <section aria-label="Fortschrittszusammenfassungen" style={{ display: 'grid', gap: '10px' }}>
              {progressSummaries.map(summary => {
                const trend = summary.phaseTrend === 'improved'
                  ? { label: 'Heute stabiler', color: '#30d158' }
                  : summary.phaseTrend === 'needs_more_attention'
                    ? { label: 'Heute unruhiger', color: '#ff9f0a' }
                    : { label: 'Ähnlicher Verlauf', color: '#67e8f9' };
                const steadiness = summary.steadinessTrend === 'steadier'
                  ? 'Fußbahn ruhiger'
                  : summary.steadinessTrend === 'more_restless'
                    ? 'Fußbahn unruhiger'
                    : summary.steadinessTrend === 'similar'
                      ? 'Fußbahn ähnlich ruhig'
                      : 'Fußbahn nicht vergleichbar';
                return <article key={summary.summaryId} style={{ ...panelCard, borderColor: `${trend.color}55`, background: `linear-gradient(135deg, ${trend.color}12, rgba(255,255,255,0.025))` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                    <div><div style={{ fontSize: '12px', fontWeight: 900 }}>{summary.studentLabel} · {summary.exerciseLabel}</div><div style={{ marginTop: '3px', color: 'rgba(255,255,255,0.5)', fontSize: '9px' }}>Heute {new Date(summary.latestCapturedAt).toLocaleDateString('de-DE')} ↔ vorher {new Date(summary.previousCapturedAt).toLocaleDateString('de-DE')} · {summary.attemptCount} vergleichbare Versuche</div></div>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}><span style={badge(trend.color)}><History size={9} /> {trend.label}</span>{summary.provisional && <span style={badge('#fbbf24')}>Evidenzhinweis</span>}</div>
                  </div>
                  <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(135px,1fr))', gap: '6px' }}>
                    <ProgressFact label="Phasen" value={`${summary.comparablePhaseCount} vergleichbar`} />
                    <ProgressFact label="Bewegungsruhe" value={steadiness} />
                    <ProgressFact label="Fußbahn-Länge" value={summary.footPathDeltaPercent === null ? 'nicht vergleichbar' : `${summary.footPathDeltaPercent > 0 ? '+' : ''}${summary.footPathDeltaPercent}% verändert`} />
                    <ProgressFact label="Unruhe" value={summary.jitterDeltaPercent === null ? 'nicht vergleichbar' : `${summary.jitterDeltaPercent > 0 ? '+' : ''}${summary.jitterDeltaPercent}%`} />
                  </div>
                  <div style={{ marginTop: '8px', color: 'rgba(255,255,255,0.43)', fontSize: '8px', lineHeight: 1.45 }}>Vergleich nur bei gleicher Schülerin, Übung, Stufe, Ansicht, Seite, Richtung und Policy · keine Sollreferenz und keine Prozentnote.</div>
                </article>;
              })}
            </section>}
            <div style={{ marginTop: progressSummaries.length > 0 ? '5px' : 0, color: 'rgba(255,255,255,0.42)', fontSize: '8px', fontWeight: 850, letterSpacing: '.04em', textTransform: 'uppercase' }}>Gespeicherte Versuche</div>
            {filteredAttempts.slice().sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt)).map(attempt => (
              <article key={attempt.attemptId} style={panelCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}><div><div style={{ fontSize: '12px', fontWeight: 850 }}>{attempt.studentLabel} · {attempt.exerciseLabel}</div><div style={{ marginTop: '3px', color: 'rgba(255,255,255,0.48)', fontSize: '9px' }}>{new Date(attempt.capturedAt).toLocaleString('de-DE')} · {sourceName(attempt.sourceId)}</div></div><span style={badge('#c084fc')}>Fortschrittsvergleich · keine Referenz</span></div>
                <div style={{ marginTop: '9px', color: 'rgba(255,255,255,0.68)', fontSize: '9px' }}>{attempt.cycleCount} Zyklus{attempt.cycleCount === 1 ? '' : 'sen'} · {attempt.phases.length} Phasenmessungen · {attempt.gateStatus === 'ready' ? 'Aufnahme stabil' : 'mit Evidenzhinweisen'}</div>
              </article>
            ))}
          </> : <EmptyState text="Noch kein passender Schülervergleich gespeichert. Schülerverläufe werden niemals als Sollreferenz verwendet." />)}
        </div>
      </section>
    </div>,
    document.body,
  );
};

const EmptyState: React.FC<{ text: string }> = ({ text }) => <div style={{ ...panelCard, padding: '26px', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: '10px', lineHeight: 1.6 }}>{text}</div>;

const ProgressFact: React.FC<{ label: string; value: string }> = ({ label, value }) => <div style={{ borderRadius: '8px', padding: '7px 8px', background: 'rgba(255,255,255,0.045)', minWidth: 0 }}><div style={{ color: 'rgba(255,255,255,0.42)', fontSize: '7px', fontWeight: 850, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div><div style={{ marginTop: '2px', color: 'rgba(255,255,255,0.8)', fontSize: '9px', fontWeight: 750 }}>{value}</div></div>;
