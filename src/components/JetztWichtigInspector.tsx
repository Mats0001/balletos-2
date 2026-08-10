import React, { useState } from 'react';
import { JetztWichtigInspectorData } from '../types';
import { Sparkles, CheckCircle2, Mic, MicOff, AlertCircle } from 'lucide-react';

interface Props {
  data: JetztWichtigInspectorData;
  onApplyDictation?: (text: string) => void;
}

export const JetztWichtigInspector: React.FC<Props> = ({ data, onApplyDictation }) => {
  const [isListening, setIsListening] = useState<boolean>(false);
  const [dictatedText, setDictatedText] = useState<string>('');
  const [isApplied, setIsApplied] = useState<boolean>(false);

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

      {/* Right: clean action pill – STT wird später ergänzt */}
      <button
        onClick={handleApply}
        style={{
          background: isApplied
            ? 'linear-gradient(135deg, #30d158 0%, #248a3d 100%)'
            : 'linear-gradient(135deg, #c084fc 0%, #7e22ce 100%)',
          color: '#ffffff',
          border: 'none',
          padding: '6px 16px',
          borderRadius: '20px',
          fontSize: '10px',
          fontWeight: 800,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          boxShadow: isApplied ? '0 0 12px rgba(48,209,88,0.4)' : '0 0 12px rgba(192,132,252,0.4)',
          transition: 'all 0.25s ease',
          letterSpacing: '0.5px'
        }}
      >
        <CheckCircle2 size={12} />
        <span>{isApplied ? 'Gespeichert ✓' : 'Übernehmen'}</span>
      </button>
    </div>
  );
};
