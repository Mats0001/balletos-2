import React, { useState } from 'react';
import { JetztWichtigInspectorData } from '../types';
import { CheckCircle2, Check, AlertCircle } from 'lucide-react';


interface Props {
  data: JetztWichtigInspectorData;
  onApplyDictation?: (text: string) => void;
}

export const JetztWichtigInspector: React.FC<Props> = ({ data, onApplyDictation }) => {
  const [isListening, setIsListening] = useState<boolean>(false);
  const [dictatedText, setDictatedText] = useState<string>('');
  const [isApplied, setIsApplied] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState<boolean>(false);

  // WebSpeech Speech-to-Text Dictation Handler
  const handleToggleDictation = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Spracherkennung (STT) wird in diesem Browser nicht unterstützt. Bitte benutze Chrome.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'de-DE';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
      setIsApplied(false);
    };

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join('');
      setDictatedText(transcript);
    };

    recognition.onerror = (event: any) => {
      console.warn("STT Error:", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const handleApply = () => {
    setIsApplied(true);
    if (onApplyDictation && dictatedText) {
      onApplyDictation(dictatedText);
    }
    setTimeout(() => setIsApplied(false), 2000);
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(20, 16, 28, 0.95) 0%, rgba(10, 8, 14, 0.98) 100%)',
      border: '1px solid rgba(192, 132, 252, 0.3)',
      borderRadius: '14px',
      padding: '10px 18px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)'
    }}>
      {/* Left Section: Student & Pose Headline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>


        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#ffffff', fontFamily: 'Montserrat' }}>
            {data.studentName} · <span style={{ color: '#c084fc' }}>{data.exerciseName}</span>
          </div>
          <div style={{ fontSize: '11px', color: '#ff453a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <AlertCircle size={12} /> {dictatedText ? `Diktat: "${dictatedText}"` : data.findingHeadline}
          </div>
        </div>
      </div>

      {/* Right: Icon-only Übernehmen – dezent, Hover bringt Farbe */}
      <button
        onClick={handleApply}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        title={isApplied ? 'Gespeichert' : 'Befund übernehmen'}
        style={{
          background: isApplied
            ? 'rgba(48,209,88,0.15)'
            : isHovered
            ? 'rgba(192,132,252,0.2)'
            : 'transparent',
          color: isApplied ? '#30d158' : isHovered ? '#c084fc' : 'rgba(255,255,255,0.35)',
          border: `1px solid ${isApplied ? 'rgba(48,209,88,0.4)' : isHovered ? 'rgba(192,132,252,0.4)' : 'rgba(255,255,255,0.12)'}`,
          width: '28px',
          height: '28px',
          borderRadius: '8px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'all 0.2s ease'
        }}
      >
        {isApplied ? <Check size={14} /> : <CheckCircle2 size={14} />}
      </button>
    </div>
  );
};
