import React, { useState } from 'react';
import { Sparkles, Check, AlertTriangle, MessageSquare, Send, Mic, MicOff, Cpu, BookOpen, ChevronRight } from 'lucide-react';
import { AgeGroup } from '../types';
import { VaganovaFullAnalysis } from '../services/vaganovaAngleCalculator';
import { VaganovaLiveMetrics } from './VaganovaLiveMetrics';
import { VaganovaCuePoint } from '../services/vaganovaPreAnalyzer';

interface Props {
  selectedStudent: string;
  selectedAgeGroup: AgeGroup;
  exerciseName: string;
  vaganovaAnalysis?: VaganovaFullAnalysis | null;
  isPlie?: boolean;
  onSaveClassNote?: (note: string) => void;
  selectedCue?: VaganovaCuePoint | null;
}

export const RightInspectorPanel: React.FC<Props> = ({
  selectedStudent,
  selectedAgeGroup,
  exerciseName,
  vaganovaAnalysis,
  isPlie,
  onSaveClassNote,
  selectedCue,
}) => {
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'NICOLE' | 'KI'; text: string }>>([
    {
      sender: 'KI',
      text: `Vaganova-Analyse für ${selectedStudent}: Knie-Fuß-Linie vor der Pirouette kontrollieren.`
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [avatarMode, setAvatarMode] = useState<'SKELETON' | '3D_AVATAR'>('SKELETON');

  const handleSendMessage = () => {
    if (!inputText.trim()) return;
    const userMsg = inputText;
    setChatMessages(prev => [...prev, { sender: 'NICOLE', text: userMsg }]);
    setInputText('');

    setTimeout(() => {
      setChatMessages(prev => [
        ...prev,
        {
          sender: 'KI',
          text: `Vaganova-Empfehlung für ${selectedStudent}: "Halte die Hüftgelenke in 90° En Dehors Außendrehung, bevor das Plié ansetzt."`
        }
      ]);
    }, 1000);
  };

  const handleToggleVoice = () => {
    if (!isRecording) {
      setIsRecording(true);
      setTimeout(() => {
        setIsRecording(false);
        setChatMessages(prev => [
          ...prev,
          { sender: 'NICOLE', text: 'Knie-Fuß-Linie vor der Drehung über 2. Zeh kontrollieren.' },
          { sender: 'KI', text: '✓ Diktat als Unterrichtsnotiz übernommen & an Schüler-App gesendet!' }
        ]);
      }, 2000);
    } else {
      setIsRecording(false);
    }
  };

  return (
    <aside className="right-panel" style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflow: 'hidden' }}>
      {/* Panel Header */}
      <div style={{ paddingBottom: '12px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#a881bd', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Sparkles size={13} /> PÄDAGOGIK & KI-COCKPIT
        </div>
        <div className="font-montserrat" style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff', marginTop: '2px' }}>
          {selectedStudent} <span style={{ color: '#c8a2c8', fontWeight: 500 }}>· {exerciseName}</span>
        </div>
      </div>

      {/* LIVE VAGANOVA MESSWERTE – fills available height */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minHeight: 0 }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          📐 VAGANOVA LIVE-MESSWERTE
          <span style={{ fontSize: '9px', background: 'rgba(48,209,88,0.15)', color: '#30d158', border: '1px solid rgba(48,209,88,0.3)', borderRadius: '6px', padding: '1px 6px', fontWeight: 700, animation: 'pulse 2s infinite' }}>LIVE</span>
        </div>
        {/* Scrollable metrics container with gradient scroll-indicator */}
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          <div
            id="vaganova-metrics-scroll"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px',
              padding: '10px 12px',
              height: '100%',
              overflowY: 'auto',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(168,129,189,0.4) transparent',
            }}
          >
            <VaganovaLiveMetrics vaganovaAnalysis={vaganovaAnalysis ?? null} isPlie={isPlie} />
          </div>
          {/* Scroll-fade indicator at bottom */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '32px',
            background: 'linear-gradient(to top, rgba(14,10,20,0.9) 0%, transparent 100%)',
            borderRadius: '0 0 12px 12px', pointerEvents: 'none'
          }} />
          <div style={{
            position: 'absolute', bottom: '4px', left: '50%', transform: 'translateX(-50%)',
            fontSize: '9px', color: 'rgba(168,129,189,0.6)', pointerEvents: 'none', userSelect: 'none'
          }}>▾ scrollen</div>
        </div>
      </div>

      {/* 📌 AUSGEWÄHLTER MARKER – KI-Detail (erscheint wenn Cue-Point angeklickt) */}
      {selectedCue && (
        <div style={{
          background: selectedCue.status === 'CORRECTION'
            ? 'rgba(255,69,58,0.08)' : 'rgba(48,209,88,0.08)',
          border: `1px solid ${selectedCue.status === 'CORRECTION' ? 'rgba(255,69,58,0.35)' : 'rgba(48,209,88,0.3)'}`,
          borderRadius: '12px', padding: '10px 12px',
          flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: '8px',
          animation: 'fadeIn 0.2s ease',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '9px', fontWeight: 800, color: selectedCue.status === 'CORRECTION' ? '#ff453a' : '#30d158', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {selectedCue.status === 'CORRECTION' ? <AlertTriangle size={10} /> : <Check size={10} />}
              {selectedCue.status === 'CORRECTION' ? 'Korrektur' : 'Stärke'} · {selectedCue.timecodeStr}
            </div>
            <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>
              {selectedCue.dataSource === 'KI_AUTO' ? '🤖 KI' : '👩‍🏫 Nicole'}
            </span>
          </div>

          {/* Pose name */}
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#fff' }}>
            {selectedCue.poseName}
          </div>

          {/* Headline */}
          <div style={{ fontSize: '10px', color: selectedCue.status === 'CORRECTION' ? '#ff6b61' : '#5ae088', fontWeight: 600 }}>
            {selectedCue.headline}
          </div>

          {/* Bildhafte Metapher */}
          <div style={{
            background: 'rgba(168,129,189,0.1)', border: '1px solid rgba(168,129,189,0.2)',
            borderRadius: '8px', padding: '8px 10px',
          }}>
            <div style={{ fontSize: '8px', fontWeight: 800, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '4px' }}>💡 Bildhafte Erklärung</div>
            <div style={{ fontSize: '11px', color: '#fff', fontStyle: 'italic', lineHeight: 1.45, fontWeight: 600 }}>
              {selectedCue.cueMetaphor}
            </div>
          </div>

          {/* KI-Note (nur bei KI_AUTO) */}
          {selectedCue.kiNote && (
            <div style={{
              background: 'rgba(255,255,255,0.04)', borderRadius: '7px', padding: '7px 10px',
            }}>
              <div style={{ fontSize: '8px', fontWeight: 800, color: '#a881bd', letterSpacing: '0.6px', marginBottom: '4px' }}>🤖 Messwert-Analyse</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.45 }}>
                {selectedCue.kiNote}
              </div>
            </div>
          )}

          {/* Wie besser machen */}
          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingTop: '2px' }}>
            Klick auf anderen Marker um diesen zu wechseln
          </div>
        </div>
      )}

      {/* KI-METAPHER – compact (nur wenn kein selectedCue) */}
      {!selectedCue && (
      <div style={{ background: 'rgba(168,129,189,0.10)', border: '1px solid rgba(168,129,189,0.3)', padding: '10px 12px', borderRadius: '12px', flexShrink: 0 }}>
        <div style={{ fontSize: '9px', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>💡 Metapher für Nicole:</div>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#ffffff', fontStyle: 'italic', lineHeight: '1.35' }}>
          "Knie sind Schwanenflügel – weit nach außen zur Wand!"
        </div>
      </div>
      )}

      {/* POSE AVATAR ENGINE – Akkordion */}
      <details
        style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid var(--glass-border)',
          borderRadius: '14px',
          overflow: 'hidden',
          flexShrink: 0
        }}
      >
        <summary
          style={{
            padding: '10px 12px',
            cursor: 'pointer',
            listStyle: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            userSelect: 'none'
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#f3effa', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Cpu size={13} color="#a881bd" /> Pose Avatar Engine
          </div>
          <span style={{
            fontSize: '9px', fontWeight: 700, letterSpacing: '0.5px',
            background: 'rgba(168,129,189,0.2)', color: '#c084fc',
            border: '1px solid rgba(168,129,189,0.3)',
            padding: '2px 8px', borderRadius: '10px'
          }}>
            {avatarMode === 'SKELETON' ? 'Vector 2D' : '3D Avatar'} ▾
          </span>
        </summary>
        <div style={{ padding: '8px 12px 12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => setAvatarMode(avatarMode === 'SKELETON' ? '3D_AVATAR' : 'SKELETON')}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, rgba(168,129,189,0.25) 0%, rgba(126,34,206,0.2) 100%)',
              border: '1px solid rgba(168,129,189,0.4)',
              color: '#fff', fontSize: '10px', fontWeight: 700,
              padding: '7px 12px', borderRadius: '10px', cursor: 'pointer',
              fontFamily: 'Montserrat', display: 'flex', alignItems: 'center', gap: '6px',
              justifyContent: 'center', transition: 'all 0.2s'
            }}
          >
            <Cpu size={11} />
            {avatarMode === 'SKELETON' ? 'Zu 3D Avatar wechseln' : 'Zu Vector 2D wechseln'}
          </button>
        </div>
      </details>

      {/* LIVE KI-CHAT & DIKTAT-KONSOLE */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(10, 8, 14, 0.8)', border: '1px solid var(--glass-border)', borderRadius: '16px', overflow: 'hidden', minHeight: '180px' }}>
        <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: '10px', fontWeight: 700, color: '#c8a2c8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <MessageSquare size={12} /> KI-Assistenz & Sprachkonsole
        </div>

        {/* Chat History */}
        <div style={{ flex: 1, padding: '10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {chatMessages.map((msg, i) => (
            <div
              key={i}
              style={{
                alignSelf: msg.sender === 'NICOLE' ? 'flex-end' : 'flex-start',
                background: msg.sender === 'NICOLE' ? 'linear-gradient(135deg, #a881bd 0%, #8b5a8b 100%)' : 'rgba(255,255,255,0.06)',
                color: '#ffffff',
                padding: '8px 12px',
                borderRadius: '12px',
                fontSize: '11px',
                lineHeight: '1.4',
                maxWidth: '90%'
              }}
            >
              <div style={{ fontSize: '9px', fontWeight: 700, color: msg.sender === 'NICOLE' ? '#ffffff' : '#c084fc', marginBottom: '2px' }}>
                {msg.sender === 'NICOLE' ? 'NICOLE' : 'AURORA KI'}
              </div>
              {msg.text}
            </div>
          ))}
        </div>

        {/* Chat Input Bar */}
        <div style={{ padding: '8px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Frage an KI oder Diktat..."
            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', padding: '6px 10px', fontSize: '11px', outline: 'none', fontFamily: 'Montserrat' }}
          />

          <button
            onClick={handleToggleVoice}
            style={{ background: isRecording ? '#ff453a' : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '10px', padding: '6px', cursor: 'pointer' }}
          >
            {isRecording ? <MicOff size={13} color="#fff" /> : <Mic size={13} color="#a881bd" />}
          </button>

          <button
            onClick={handleSendMessage}
            className="btn-monolith"
            style={{ padding: '6px 10px', fontSize: '10px' }}
          >
            <Send size={11} />
          </button>
        </div>
      </div>
    </aside>
  );
};
