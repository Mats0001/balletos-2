import React, { useEffect, useState } from 'react';
import { Tv, ShieldCheck } from 'lucide-react';
import { TelestratorCanvas } from './TelestratorCanvas';
import { TelestratorStroke } from '../types';

export const StudioTVMirror: React.FC = () => {
  const [exerciseName, setExerciseName] = useState<string>('Plié in der 1. Position');
  const [ageGroup, setAgeGroup] = useState<string>('Minis & Kids (3-7 J.)');
  const [badge, setBadge] = useState<string>('⭐ Schwanen-Königin');
  const [strokes, setStrokes] = useState<TelestratorStroke[]>([]);

  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('balletos_tv_mirror_channel');
      bc.onmessage = (event) => {
        if (event.data?.type === 'SYNC_TV_STATE') {
          if (event.data.exerciseName) setExerciseName(event.data.exerciseName);
          if (event.data.ageGroup) setAgeGroup(event.data.ageGroup);
          if (event.data.badge) setBadge(event.data.badge);
          if (event.data.strokes) setStrokes(event.data.strokes);
        }
      };
    } catch (e) {
      console.warn('BroadcastChannel not supported:', e);
    }

    return () => {
      if (bc) bc.close();
    };
  }, []);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      minHeight: '100vh',
      height: '100dvh',
      backgroundColor: '#060508',
      color: 'white',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Top TV Header Bar */}
      <div style={{
        padding: '20px 36px',
        background: 'rgba(18, 16, 24, 0.9)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(168, 129, 189, 0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <img src="/schoenewolf_swan_logo.png" alt="Schönewolf Logo" style={{ height: '36px', width: 'auto' }} />
          <span className="font-montserrat" style={{ fontSize: '20px', fontWeight: 800, color: '#ffffff', letterSpacing: '1px', textTransform: 'uppercase' }}>
            {exerciseName}
          </span>
          <span className="font-montserrat" style={{ fontSize: '12px', background: 'rgba(192, 132, 252, 0.15)', color: '#c084fc', border: '1px solid rgba(192, 132, 252, 0.3)', padding: '4px 14px', borderRadius: '14px', fontWeight: 700, textTransform: 'uppercase' }}>
            {ageGroup}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Soft Off-White / Gentle Mauve Live Sync Status */}
          <div className="font-montserrat" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f3effa', background: 'rgba(168, 129, 189, 0.15)', border: '1px solid rgba(168, 129, 189, 0.3)', padding: '8px 18px', borderRadius: '24px', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase' }}>
            <ShieldCheck size={18} color="#c8a2c8" />
            <span>LIVE SYNC MIT NICOL'S IPAD</span>
          </div>
        </div>
      </div>

      {/* Main Fullscreen View with Official Swan Atmosphere Watermark */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#08060c' }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(168, 129, 189, 0.15) 0%, transparent 70%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <img
            src="/schoenewolf_swan_logo.png"
            alt="Schönewolf Swan Background Watermark"
            style={{
              maxHeight: '65%',
              maxWidth: '65%',
              opacity: 0.18,
              filter: 'drop-shadow(0 0 50px rgba(168,129,189,0.5))'
            }}
          />
        </div>

        {/* Live Telestrator Overlay */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
          <TelestratorCanvas width={window.innerWidth} height={window.innerHeight - 80} readOnly={true} />
        </div>

        {/* Floating Motivation Badge */}
        <div style={{
          position: 'absolute',
          bottom: '40px',
          right: '40px',
          background: 'rgba(20, 18, 26, 0.88)',
          backdropFilter: 'blur(30px)',
          border: '1px solid rgba(168, 129, 189, 0.4)',
          borderRadius: '30px',
          padding: '20px 32px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          boxShadow: '0 16px 50px rgba(0,0,0,0.8)',
          zIndex: 20
        }}>
          <img src="/schoenewolf_swan_logo.png" alt="Schönewolf Logo" style={{ height: '44px', width: 'auto' }} />
          <div>
            <div className="font-montserrat" style={{ fontSize: '11px', textTransform: 'uppercase', color: '#c084fc', fontWeight: 800, letterSpacing: '1.5px' }}>Pädagogisches Lob</div>
            <div className="font-montserrat" style={{ fontSize: '20px', fontWeight: 800, color: '#ffffff', letterSpacing: '0.5px' }}>{badge}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
