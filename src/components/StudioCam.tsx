import React, { useRef, useState } from 'react';
import { Camera as CameraIcon, Tv, Radio, CheckCircle } from 'lucide-react';
import { TelestratorCanvas } from './TelestratorCanvas';
import { JetztWichtigInspector } from './JetztWichtigInspector';
import { TelestratorStroke, AgeGroup, JetztWichtigInspectorData } from '../types';

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
  const [strokes, setStrokes] = useState<TelestratorStroke[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState<boolean>(false);

  const exercises = [
    'Plié in der 1. Position',
    'Battement Tendu devant',
    'Arabesque en l’air',
    'Pirouette en dehors'
  ];

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
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setIsCameraActive(true);
      }
    } catch (e) {
      setIsCameraActive(true);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
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
              {exercises.map(ex => (
                <option key={ex} value={ex} style={{ background: '#14121a', color: '#fff' }}>{ex}</option>
              ))}
            </select>
          </div>

          <div className="floating-dock" style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={onOpenTVMirror} className="btn-monolith" style={{ padding: '6px 14px', fontSize: '10px' }}>
              <Tv size={13} /> Studio TV Sync
            </button>

            <button
              onClick={handleSnapshot}
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

              <div className="monolith-card" style={{ padding: '32px 48px', textAlign: 'center', maxWidth: '440px', backdropFilter: 'blur(40px)', background: 'rgba(20, 18, 26, 0.8)', zIndex: 10 }}>
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
              </div>
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
