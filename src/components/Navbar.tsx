import React, { useState, useRef, useEffect } from 'react';
import { Camera, Sparkles, Activity, Users, Smartphone, MessageSquare, Send, Mic, MicOff, User } from 'lucide-react';
import { Location, AgeGroup } from '../types';

const NAV_TABS = Object.freeze([
  { id: 'cam', label: 'Saal-Kamera', mobileLabel: 'Kamera', icon: Camera },
  { id: 'metaphor', label: 'KI-Metaphern', mobileLabel: 'Metaphern', icon: Sparkles },
  { id: 'analyzer', label: 'Video-Analyse', mobileLabel: 'Analyse', icon: Activity },
  { id: 'students', label: 'Schüler-Historie', mobileLabel: 'Schüler', icon: Users },
  { id: 'remote', label: 'Remote-Handy', mobileLabel: 'Remote', icon: Smartphone },
]);

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
  // Chat State
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'NICOLE' | 'KI'; text: string }>>([{
    sender: 'KI',
    text: 'Aurora KI bereit. Knie-Fuss-Linie und Plié-Tiefe werden laufend geprüft.'
  }]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    const txt = inputText.trim();
    setChatMessages(prev => [...prev, { sender: 'NICOLE', text: txt }]);
    setInputText('');
    setTimeout(() => {
      setChatMessages(prev => [...prev, {
        sender: 'KI',
        text: `Notiz gespeichert: "${txt}" — wird an Schüler-App übermittelt.`
      }]);
    }, 800);
  };

  const handleVoice = () => {
    if (!isRecording) {
      setIsRecording(true);
      setTimeout(() => {
        setIsRecording(false);
        setChatMessages(prev => [
          ...prev,
          { sender: 'NICOLE', text: 'Knie-Fuss-Linie vor der Drehung über 2. Zeh kontrollieren.' },
          { sender: 'KI', text: 'Diktat als Unterrichtsnotiz übernommen.' }
        ]);
      }, 2000);
    } else {
      setIsRecording(false);
    }
  };
  const studentsSSOT = [
    'Emma Berger (Minis)',
    'Clara Schulze (Kids)',
    'Sophie Mainz (Teens)',
    'Mia Hoffmann (Pro)'
  ];

  return (
    <>
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
          {NAV_TABS.map(tab => {
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

      {/* KI-ASSISTENZ & SPRACHKONSOLE */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(10,8,14,0.6)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '16px',
        overflow: 'hidden',
        marginTop: '10px',
        minHeight: 0,
      }}>
        {/* Header */}
        <div style={{
          padding: '7px 12px',
          background: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          fontSize: '9px',
          fontWeight: 700,
          color: '#c8a2c8',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexShrink: 0,
        }}>
          <MessageSquare size={11} />
          KI-Assistenz · Diktat
        </div>

        {/* Messages */}
        <div style={{
          flex: 1,
          padding: '8px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(168,129,189,0.3) transparent',
        }}>
          {chatMessages.map((msg, i) => (
            <div
              key={i}
              style={{
                alignSelf: msg.sender === 'NICOLE' ? 'flex-end' : 'flex-start',
                background: msg.sender === 'NICOLE'
                  ? 'linear-gradient(135deg, #a881bd 0%, #7b4f8a 100%)'
                  : 'rgba(255,255,255,0.05)',
                color: '#ffffff',
                padding: '6px 10px',
                borderRadius: '10px',
                fontSize: '11px',
                lineHeight: 1.5,
                maxWidth: '92%',
              }}
            >
              <div style={{ fontSize: '8px', fontWeight: 800, color: msg.sender === 'NICOLE' ? 'rgba(255,255,255,0.65)' : '#c084fc', marginBottom: '2px', letterSpacing: '0.5px' }}>
                {msg.sender === 'NICOLE' ? 'NICOLE' : 'AURORA KI'}
              </div>
              {msg.text}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: '6px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          gap: '4px',
          alignItems: 'center',
          flexShrink: 0,
        }}>
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Frage an KI oder Diktat..."
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '10px',
              color: '#fff',
              padding: '5px 9px',
              fontSize: '11px',
              outline: 'none',
              fontFamily: 'Montserrat',
            }}
          />
          <button
            onClick={handleVoice}
            style={{ background: isRecording ? '#ff453a' : 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '8px', padding: '5px', cursor: 'pointer', flexShrink: 0 }}
          >
            {isRecording ? <MicOff size={12} color="#fff" /> : <Mic size={12} color="#a881bd" />}
          </button>
          <button
            onClick={handleSend}
            className="btn-monolith"
            style={{ padding: '5px 8px', fontSize: '10px', flexShrink: 0 }}
          >
            <Send size={10} />
          </button>
        </div>
      </div>
    </aside>
    <nav className="mobile-bottom-nav" aria-label="Mobile Hauptnavigation">
      {NAV_TABS.map(tab => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            aria-label={tab.label}
            aria-current={isActive ? 'page' : undefined}
            className="mobile-bottom-nav__item"
            onClick={() => onTabChange(tab.id)}
          >
            <Icon size={17} aria-hidden="true" />
            <span>{tab.mobileLabel}</span>
          </button>
        );
      })}
    </nav>
    </>
  );
};
