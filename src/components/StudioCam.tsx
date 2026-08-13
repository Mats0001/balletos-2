import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Tv, Radio, CheckCircle, AlertTriangle } from 'lucide-react';
import { TelestratorCanvas } from './TelestratorCanvas';
import { JetztWichtigInspector } from './JetztWichtigInspector';
import { TelestratorStroke, AgeGroup, JetztWichtigInspectorData } from '../types';
import { realMediaPipePose } from '../services/realMediaPipePose';
import { calculateFrameImageQuality } from '../services/teacherPhaseAnalysis';
import {
  evaluateLiveRecordingPreflight,
  type LivePreflightObservation,
} from '../services/liveRecordingPreflight';
import { selectableMotionEntries } from '../services/motionRegistry';

interface Props {
  selectedAgeGroup: AgeGroup;
  exerciseName: string;
  onExerciseChange: (name: string) => void;
  onOpenTVMirror: () => void;
}

export const StudioCam: React.FC<Props> = ({
  selectedAgeGroup,
  exerciseName,
  onExerciseChange,
  onOpenTVMirror
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [preflightObservations, setPreflightObservations] = useState<readonly LivePreflightObservation[]>([]);
  const preflightCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previousLumaRef = useRef<Uint8Array | null>(null);
  const [strokes, setStrokes] = useState<TelestratorStroke[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState<boolean>(false);
  const livePreflight = useMemo(() => evaluateLiveRecordingPreflight({
    observations: preflightObservations,
    exerciseLabel: exerciseName,
  }), [exerciseName, preflightObservations]);

  useEffect(() => {
    if (!isCameraActive) return;
    let cancelled = false;
    void realMediaPipePose.initialize();
    const sample = async () => {
      const video = videoRef.current;
      if (cancelled || !video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
      const canvas = preflightCanvasRef.current ?? document.createElement('canvas');
      preflightCanvasRef.current = canvas;
      canvas.width = 160;
      canvas.height = Math.max(90, Math.round(160 * video.videoHeight / video.videoWidth));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const qualityResult = calculateFrameImageQuality(
        image.data, canvas.width, canvas.height, previousLumaRef.current,
      );
      previousLumaRef.current = qualityResult.luma;
      await realMediaPipePose.processFrame(video, results => {
        if (cancelled) return;
        setPreflightObservations(previous => Object.freeze([
          ...previous.slice(-15),
          Object.freeze({
            atMs: performance.now(),
            landmarks: Object.freeze(results.landmarks.map(point => Object.freeze({ ...point }))),
            sharpnessScore: qualityResult.quality.sharpnessScore,
            cameraMotionScore: qualityResult.quality.backgroundMotionScore,
          }),
        ]));
      });
    };
    const timer = window.setInterval(() => { void sample(); }, 280);
    void sample();
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [isCameraActive]);

  const exercises = selectableMotionEntries();

  const inspectorData: JetztWichtigInspectorData = {
    studentName: 'Emma Berger',
    exerciseName: exerciseName,
    timestampStr: '00:02.160',
    findingHeadline: 'Links: Knie-Fuß-Linie auffällig',
    whyRelevant: 'Knie driftet leicht nach innen, während der Oberkörper stabil bleibt.',
    positiveNote: 'Drehachse bleibt weitgehend lesbar.',
    uncertaintyNote: 'Fußspitze in einzelnen Frames verdeckt (Gated).',
    historyComparison: 'wiederkehrend - Oberkörper stabiler',
    nextCue: 'Linkes Knie über zweitem Zeh halten, bevor die Drehung startet.'
  };

  const handleStrokesChange = (newStrokes: TelestratorStroke[]) => {
    setStrokes(newStrokes);
    try {
      const bc = new BroadcastChannel('balletos_tv_mirror_channel');
      bc.postMessage({
        type: 'SYNC_TV_STATE',
        exerciseName,
        ageGroup: selectedAgeGroup,
        badge: selectedAgeGroup === 'MINIS' ? 'Schwanen-Flügel Ausrichtung' : 'En Dehors Turnout 90°',
        strokes: newStrokes
      });
      bc.close();
    } catch (e) {
      console.warn('BroadcastChannel error:', e);
    }
  };

  const startCamera = async () => {
    try {
      setCameraError(null);
      setPreflightObservations([]);
      previousLumaRef.current = null;
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraActive(true);
      }
    } catch {
      setIsCameraActive(false);
      setCameraError('Kamera konnte nicht geöffnet werden. Bitte Browserfreigabe und Kameraverbindung prüfen.');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setPreflightObservations([]);
    previousLumaRef.current = null;
    realMediaPipePose.reset();
  };

  const handleSnapshot = () => {
    setSavedSnapshot(true);
    setTimeout(() => setSavedSnapshot(false), 3000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 'calc(100vh - 32px)', height: 'calc(100dvh - 32px)', overflow: 'hidden' }}>
      {/* ZERO FRICTION COMPACT INSPECTOR BAR */}
      <JetztWichtigInspector data={inspectorData} />

      {/* SINGLE DOMINANT MONOLITHIC VIEWPORT (Fills 100vh Space Cleanly) */}
      <div className="monolith-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
        
        {/* Floating Top Glass Controls Dock */}
        <div style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          right: '16px',
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pointerEvents: 'none'
        }}>
          <div className="floating-dock" style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 16px' }}>
            <span className="font-montserrat" style={{ fontSize: '11px', fontWeight: 700, color: '#ffffff', letterSpacing: '1px', textTransform: 'uppercase' }}>
              SAAL-KAMERA
            </span>
            <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.15)' }} />
            <select
              value={exerciseName}
              onChange={(e) => onExerciseChange(e.target.value)}
              style={{
                background: 'transparent',
                color: '#c8a2c8',
                border: 'none',
                fontWeight: 600,
                fontSize: '12px',
                fontFamily: 'var(--font-montserrat)',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {exercises.map(entry => (
                <option key={entry.id} value={entry.label} style={{ background: '#14121a', color: '#fff' }}>
                  {entry.label}{entry.phaseEngineStatus === 'technical_phase_pilot' ? ' · Phasenpilot' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="floating-dock" style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={onOpenTVMirror} className="btn-monolith" style={{ padding: '6px 14px', fontSize: '10px' }}>
              <Tv size={13} /> Studio TV Sync
            </button>

            <button
              onClick={handleSnapshot}
              disabled={!isCameraActive || livePreflight.status === 'checking' || livePreflight.status === 'needs_correction'}
              title={!isCameraActive ? 'Zuerst Kamera starten' : livePreflight.headline}
              className="btn-monolith-secondary"
              style={{
                padding: '6px 14px',
                fontSize: '10px',
                color: '#f3effa',
                borderColor: 'rgba(255, 255, 255, 0.18)',
                background: 'rgba(255, 255, 255, 0.05)'
              }}
            >
              <CheckCircle size={13} color="#c8a2c8" /> Clip Sichern
            </button>
          </div>
        </div>

        {/* Real Camera Stream or Schwan Watermark Atmosphere */}
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
          <video
            ref={videoRef}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: isCameraActive ? 'block' : 'none' }}
            muted
            playsInline
          />

          {!isCameraActive && (
            <div style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: '#0a0810',
              backgroundImage: 'radial-gradient(circle at 50% 40%, rgba(168, 129, 189, 0.18) 0%, transparent 65%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <img
                src="/schoenewolf_swan_logo.png"
                alt="Schönewolf Swan Background Watermark"
                style={{
                  position: 'absolute',
                  width: '380px',
                  maxHeight: '55%',
                  opacity: 0.15,
                  filter: 'drop-shadow(0 0 40px rgba(168,129,189,0.4))',
                  pointerEvents: 'none'
                }}
              />

              <div className="monolith-card" style={{ padding: '32px 48px', textAlign: 'center', maxWidth: '440px', backdropFilter: 'blur(40px)', background: 'rgba(20, 18, 26, 0.8)', zIndex: 25 }}>
                <img src="/schoenewolf_swan_logo.png" alt="Schönewolf Swan Logo" style={{ height: '48px', width: 'auto', margin: '0 auto 14px auto', filter: 'drop-shadow(0 4px 16px rgba(168,129,189,0.5))' }} />
                
                <h2 className="font-montserrat" style={{ fontSize: '17px', fontWeight: 700, color: '#ffffff', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '4px' }}>
                  STUDIO VIEWPORT BEREIT
                </h2>
                
                <p className="font-montserrat" style={{ fontSize: '11px', color: '#c8a2c8', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: '20px' }}>
                  Schönewolf Ballettschule
                </p>

                <p style={{ fontSize: '12px', color: 'var(--text-sub)', marginBottom: '20px', lineHeight: '1.5' }}>
                  Aktivierte Live-Kamera überträgt Haltung & Freihand-Zeichnungen direkt auf den Studio TV.
                </p>

                <button onClick={startCamera} className="btn-monolith" style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
                  <Radio size={14} /> Live-Kamera Starten
                </button>
                {cameraError && (
                  <div role="alert" style={{ marginTop: 12, color: '#fca5a5', fontSize: 10, lineHeight: 1.4 }}>
                    {cameraError}
                  </div>
                )}
              </div>
            </div>
          )}

          {isCameraActive && (
            <div data-testid="live-recording-preflight" style={{
              position: 'absolute', left: 18, bottom: 18, zIndex: 35, width: 'min(390px, calc(100% - 36px))',
              padding: '10px 12px', borderRadius: 13, backdropFilter: 'blur(16px)',
              background: 'rgba(10,8,16,.88)',
              border: livePreflight.status === 'ready' ? '1px solid rgba(48,209,88,.65)'
                : livePreflight.status === 'needs_correction' ? '1px solid rgba(255,159,10,.75)'
                  : '1px solid rgba(103,232,249,.5)',
              color: '#fff', pointerEvents: 'auto', boxShadow: '0 12px 34px rgba(0,0,0,.45)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 900, color: livePreflight.status === 'needs_correction' ? '#ffb45c' : livePreflight.status === 'ready' ? '#86efac' : '#a5f3fc' }}>
                  {livePreflight.status === 'needs_correction' ? <AlertTriangle size={12} style={{ verticalAlign: -2, marginRight: 5 }} /> : null}
                  {livePreflight.headline}
                </div>
                {livePreflight.status === 'checking' ? (
                  <span style={{ fontSize: 8, opacity: .65 }}>{Math.round(livePreflight.progress * 100)} %</span>
                ) : (
                  <button onClick={stopCamera} style={{ border: 0, background: 'transparent', color: '#cbd5e1', fontSize: 8, cursor: 'pointer' }}>Kamera stoppen</button>
                )}
              </div>
              <div style={{ marginTop: 5, fontSize: 8, color: 'rgba(255,255,255,.68)', lineHeight: 1.35 }}>{livePreflight.nextAction}</div>
              <div style={{ marginTop: 7, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px' }}>
                {livePreflight.checks.map(item => (
                  <div key={item.id} title={item.detail} style={{ minWidth: 0, fontSize: 7.5, color: item.state === 'pass' ? '#bbf7d0' : item.state === 'note' ? '#fde68a' : '#fdba74' }}>
                    {item.state === 'pass' ? '✓' : item.state === 'note' ? '··' : '!'} {item.label}
                  </div>
                ))}
              </div>
              {livePreflight.status === 'ready_with_notes' && (
                <div style={{ marginTop: 6, fontSize: 7.5, color: '#fde68a' }}>
                  Start bleibt möglich. Diese Hinweise schwächen später nur die Evidenzdarstellung.
                </div>
              )}
            </div>
          )}

          {/* Telestrator Drawing Layer */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
            <TelestratorCanvas
              width={1400}
              height={620}
              onStrokesChange={handleStrokesChange}
            />
          </div>
        </div>

        {savedSnapshot && (
          <div style={{
            position: 'absolute',
            bottom: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 40,
            background: 'linear-gradient(135deg, #a881bd 0%, #8b5a8b 100%)',
            color: '#ffffff',
            padding: '8px 20px',
            borderRadius: '30px',
            fontWeight: 700,
            fontSize: '11px',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            boxShadow: '0 8px 30px rgba(168, 129, 189, 0.5)'
          }}>
            ✓ CLIP GESICHERT!
          </div>
        )}
      </div>
    </div>
  );
};
