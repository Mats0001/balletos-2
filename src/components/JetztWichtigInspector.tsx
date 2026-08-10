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
        <div style={{
          background: 'linear-gradient(135deg, #a881bd 0%, #8b5a8b 100%)',
          color: '#ffffff',
          fontSize: '10px',
          fontWeight: 800,
          padding: '4px 10px',
          borderRadius: '8px',
          letterSpacing: '0.5px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <Sparkles size={12} /> JETZT WICHTIG
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#ffffff', fontFamily: 'Montserrat' }}>
            {data.studentName} · <span style={{ color: '#c084fc' }}>{data.exerciseName}</span>
          </div>
          <div style={{ fontSize: '11px', color: '#ff453a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <AlertCircle size={12} /> {dictatedText ? `Diktat: "${dictatedText}"` : data.findingHeadline}
          </div>
        </div>
      </div>

      {/* Right Section: Action Controls (Fully Wired STT & Apply) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* STT Dictation Button */}
        <button
          onClick={handleToggleDictation}
          style={{
            background: isListening ? 'rgba(255, 69, 58, 0.3)' : 'rgba(255, 255, 255, 0.05)',
            border: isListening ? '1px solid #ff453a' : '1px solid rgba(255, 255, 255, 0.15)',
            color: isListening ? '#ff453a' : '#ffffff',
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '10px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease'
          }}
        >
          {isListening ? <MicOff size={12} className="animate-pulse" /> : <Mic size={12} />}
          <span>{isListening ? 'Zuhören...' : 'Diktieren (STT)'}</span>
        </button>

        {/* Übernehmen Button */}
        <button
          onClick={handleApply}
          style={{
            background: isApplied ? 'linear-gradient(135deg, #30d158 0%, #248a3d 100%)' : 'linear-gradient(135deg, #a881bd 0%, #8b5a8b 100%)',
            color: '#ffffff',
            border: 'none',
            padding: '6px 14px',
            borderRadius: '8px',
            fontSize: '10px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 0 12px rgba(168,129,189,0.4)',
            transition: 'all 0.2s ease'
          }}
        >
          <CheckCircle2 size={12} />
          <span>{isApplied ? 'Übernommen ✓' : 'Übernehmen'}</span>
        </button>
      </div>
    </div>
  );
};
