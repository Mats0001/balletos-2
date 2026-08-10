import React from 'react';
import { Camera, Sparkles, Activity, Users, Smartphone, Tv, MapPin, User, Sliders, Feather } from 'lucide-react';
import { Location, AgeGroup } from '../types';

interface Props {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenTVMirror: () => void;
  selectedLocation: Location;
  onLocationChange: (loc: Location) => void;
  selectedAgeGroup: AgeGroup;
  onAgeGroupChange: (group: AgeGroup) => void;
  selectedStudent: string;
  onStudentChange: (student: string) => void;
}

export const Navbar: React.FC<Props> = ({
  activeTab,
  onTabChange,
  onOpenTVMirror,
  selectedLocation,
  onLocationChange,
  selectedAgeGroup,
  onAgeGroupChange,
  selectedStudent,
  onStudentChange
}) => {
  const tabs = [
    { id: 'cam', label: 'Saal-Kamera', icon: Camera },
    { id: 'metaphor', label: 'KI-Metaphern', icon: Sparkles },
    { id: 'analyzer', label: 'Video-Analyse', icon: Activity },
    { id: 'students', label: 'Schüler-Historie', icon: Users },
    { id: 'remote', label: 'Remote-Handy', icon: Smartphone }
  ];

  const studentsSSOT = [
    'Emma Berger (Minis)',
    'Clara Schulze (Kids)',
    'Sophie Mainz (Teens)',
    'Mia Hoffmann (Pro)'
  ];

  return (
    <aside className="side-nav">
      {/* Brand Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', paddingLeft: '4px' }}>
          <img
            src="/schoenewolf_swan_logo.png"
            alt="Schönewolf Ballettschule Logo"
            style={{
              height: '36px',
              width: 'auto',
              filter: 'drop-shadow(0 4px 12px rgba(168, 129, 189, 0.4))'
            }}
          />
          <div>
            <div className="font-montserrat" style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff', letterSpacing: '1px', textTransform: 'uppercase' }}>
              BALLETOS <span style={{ color: '#a881bd' }}>2.0</span>
            </div>
            <div className="font-montserrat" style={{ fontSize: '10px', color: 'var(--text-sub)', letterSpacing: '0.8px', textTransform: 'uppercase', fontWeight: 500 }}>
              Schönewolf Ballettschule
            </div>
          </div>
        </div>

        {/* Vertical Navigation Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '20px' }}>
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '9px 12px',
                  borderRadius: '14px',
                  border: 'none',
                  background: isActive ? 'linear-gradient(135deg, #a881bd 0%, #8b5a8b 100%)' : 'transparent',
                  color: '#ffffff',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '11px',
                  fontFamily: 'var(--font-montserrat)',
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  boxShadow: isActive ? '0 4px 16px rgba(168, 129, 189, 0.35)' : 'none'
                }}
              >
                <Icon size={15} color={isActive ? '#ffffff' : 'var(--text-sub)'} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Contextual Action Tile - Clean Aurora Vector Icons (No Emojis) */}
        <div style={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid var(--glass-border)', borderRadius: '16px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#a881bd', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <User size={12} color="#a881bd" /> Schülerin (SSOT)
          </div>
          <select
            value={selectedStudent}
            onChange={(e) => onStudentChange(e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(10, 8, 14, 0.8)',
              color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '10px',
              padding: '6px 8px',
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: 'Montserrat',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            {studentsSSOT.map(s => (
              <option key={s} value={s.split(' ')[0]} style={{ background: '#14121a' }}>{s}</option>
            ))}
          </select>
        </div>
      </div>

    </aside>
  );
};
