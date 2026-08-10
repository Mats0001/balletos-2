import React, { useState } from 'react';
import { Sparkles, Mic, MicOff, Share2, CheckCircle2, Home } from 'lucide-react';
import { AgeGroup, MetaphorFeedback, HomeTask } from '../types';

interface Props {
  selectedAgeGroup: AgeGroup;
  onAgeGroupChange: (group: AgeGroup) => void;
  exerciseName: string;
}

export const MetaphorCoach: React.FC<Props> = ({
  selectedAgeGroup,
  onAgeGroupChange,
  exerciseName
}) => {
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceNoteText, setVoiceNoteText] = useState<string>('');
  const [exportedSuccess, setExportedSuccess] = useState(false);

  const feedbackData: Record<AgeGroup, MetaphorFeedback> = {
    MINIS: {
      exerciseId: 'plie_1',
      ageGroup: 'MINIS',
      whatWentWell: [
        'Stolzer Rücken wie ein majestätischer Schwan',
        'Füße sind schon ganz lieb in der 1. Position'
      ],
      whatToImprove: [
        'Knie beugen sich noch ein bisschen nach vorne statt zur Seite'
      ],
      nicoleSpeechPrompt: '👑 "Stell dir vor, deine Knie sind zwei Schwanenflügel, die sich ganz weit nach außen zur Wand hin öffnen wollen!"',
      studentFocus: 'Schwanenflügel (Knie zur Seite öffnen)',
      homeTasks: [
        {
          id: 'h1',
          title: 'Schwanen-Knie im Sitzen',
          duration: '2 Min.',
          description: 'Setze dich wie ein Schneider auf den Boden, lege die Fußsohlen zusammen und breite sanft die Schwanenflügel aus.',
          metaphorTip: 'Flügel ganz weit aufmachen!'
        }
      ]
    },
    KIDS: {
      exerciseId: 'plie_1',
      ageGroup: 'KIDS',
      whatWentWell: [
        'Kniebeugung geht gleichmäßig nach außen über die Zehen',
        'Oberkörper bleibt aufrecht ohne Verkippung im Becken'
      ],
      whatToImprove: [
        'Arme sacken in der 1. Position nach unten ab'
      ],
      nicoleSpeechPrompt: '🥚 "Halt unter beiden Armbeugen ein kostbares rohes Schwanenei fest! Wenn du die Ellbogen hängen lässt, geht das Ei kaputt!"',
      studentFocus: 'Runde sanfte Ellbogen halten (Keine geknickten Handgelenke)',
      homeTasks: [
        {
          id: 'h3',
          title: 'Runder Arme-Ball im Stehen',
          duration: '3 Min.',
          description: 'Umarme vor dem Bauch einen riesigen imaginären Wasserball. Halte die Ellbogen oben!',
          metaphorTip: 'Wasserball darf nicht zerdrückt werden.'
        }
      ]
    },
    TEENS: {
      exerciseId: 'plie_1',
      ageGroup: 'TEENS',
      whatWentWell: [
        'Gute Tiefe im Demi-Plié ohne Anheben der Fersen',
        'Stabile Rumpf-Aufrichtung und Beckenkontrolle'
      ],
      whatToImprove: [
        'Ausdrehung (Turnout) wird im Aufstehen leicht nach innen verlassen'
      ],
      nicoleSpeechPrompt: '🔄 "Drehe die Oberschenkel ab den Hüftgelenken nach außen aus, als ob zwei Spiralfedern deine Beine nach hinten aufrollen!"',
      studentFocus: 'Permanenter Turnout-Zug von den Oberschenkeln bis zu den Fersen',
      homeTasks: [
        {
          id: 'h4',
          title: 'Theraband Turnout Rotations-Übung',
          duration: '4 Min.',
          description: 'Nutze das grüne Theraband für kontrollierte Außendrehung aus dem Hüftgelenk im Liegen.',
          metaphorTip: 'Fokus auf Gluteus Medius Ansteuerung.'
        }
      ]
    },
    MASTERCLASS: {
      exerciseId: 'plie_1',
      ageGroup: 'MASTERCLASS',
      whatWentWell: [
        'Perfect 90° turnout alignment from hips to first position heels',
        'Flawless pelvic neutrality and spinal elongation during descent'
      ],
      whatToImprove: [
        'Minor micro-instability in right ankle arch during accent transitions'
      ],
      nicoleSpeechPrompt: '📐 "Maintain active engagement of deep lateral rotators and press firmly through the 1st and 5th metatarsal heads to stabilize the tarsal arch."',
      studentFocus: 'Subtalar joint alignment & plantar engagement during dynamic weight shifts',
      homeTasks: [
        {
          id: 'h5',
          title: 'Ankle Arch Proprioception & Intrinsic Foot Strengthening',
          duration: '5 Min.',
          description: 'Towel curls and single-leg balance on unstable foam surface maintaining en dehors 1st position.',
          metaphorTip: 'Maximize calcaneal alignment.'
        }
      ]
    }
  };

  const currentFeedback = feedbackData[selectedAgeGroup];

  const handleToggleVoiceRecording = () => {
    if (!isRecordingVoice) {
      setIsRecordingVoice(true);
      setTimeout(() => {
        setVoiceNoteText('Fersen in der 1. Position noch enger zusammenhalten und die Ellbogen schwebend tragen.');
        setIsRecordingVoice(false);
      }, 2500);
    } else {
      setIsRecordingVoice(false);
    }
  };

  const handleExportHomeCard = () => {
    setExportedSuccess(true);
    setTimeout(() => setExportedSuccess(false), 3500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
      {/* Age Group Mauve Control Bar */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div className="floating-dock" style={{ display: 'flex', gap: '4px', padding: '4px' }}>
          {(['MINIS', 'KIDS', 'TEENS', 'MASTERCLASS'] as AgeGroup[]).map(group => {
            const labels: Record<AgeGroup, string> = {
              MINIS: 'Minis (3-5 J.)',
              KIDS: 'Kids (6-10 J.)',
              TEENS: 'Teens (11-15 J.)',
              MASTERCLASS: 'Masterclass (Profi)'
            };
            const isSelected = selectedAgeGroup === group;
            return (
              <button
                key={group}
                onClick={() => onAgeGroupChange(group)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '30px',
                  border: 'none',
                  background: isSelected ? 'linear-gradient(135deg, #a881bd 0%, #8b5a8b 100%)' : 'transparent',
                  color: '#ffffff',
                  fontWeight: isSelected ? 800 : 600,
                  fontSize: '12px',
                  fontFamily: 'var(--font-montserrat)',
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: isSelected ? '0 4px 16px rgba(168, 129, 189, 0.4)' : 'none'
                }}
              >
                {labels[group]}
              </button>
            );
          })}
        </div>
      </div>

      {/* SINGLE HERO METAPHOR CARD (CLEAR VISUAL CENTER - APPLE GLASS) */}
      <div className="monolith-card" style={{ padding: '52px 48px', display: 'flex', flexDirection: 'column', gap: '32px', textAlign: 'center' }}>
        <div className="font-montserrat" style={{ fontSize: '11px', textTransform: 'uppercase', color: '#a881bd', fontWeight: 800, letterSpacing: '2px' }}>
          ✨ KI-SPRACHBILD-EMPFEHLUNG FÜR NICOLE
        </div>

        {/* Montserrat Bold Hero Quote */}
        <h2 className="font-montserrat" style={{ fontSize: '26px', fontWeight: 800, color: '#ffffff', lineHeight: '1.4', maxWidth: '900px', margin: '0 auto', letterSpacing: '-0.02em' }}>
          {currentFeedback.nicoleSpeechPrompt}
        </h2>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
          <div className="font-montserrat" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', padding: '8px 20px', borderRadius: '30px', fontSize: '12px', color: '#ffffff' }}>
            🎯 <strong>Fokus:</strong> {currentFeedback.studentFocus}
          </div>
        </div>

        {/* Dictation & Export Actions */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', paddingTop: '20px', borderTop: '1px solid var(--glass-border)' }}>
          <button onClick={handleToggleVoiceRecording} className="btn-monolith-secondary">
            {isRecordingVoice ? <MicOff size={15} color="#ff453a" /> : <Mic size={15} color="#a881bd" />}
            <span>{isRecordingVoice ? 'Aufnahme Stoppen...' : 'Sprachnotiz Diktieren'}</span>
          </button>

          <button onClick={handleExportHomeCard} className="btn-monolith">
            <Share2 size={15} /> Mitgabe nach Hause (Digitales Kärtchen)
          </button>
        </div>

        {voiceNoteText && (
          <div style={{ color: '#c8a2c8', fontSize: '13px', fontWeight: 600 }}>
            🎤 Aufnahme: "{voiceNoteText}"
          </div>
        )}

        {exportedSuccess && (
          <div style={{ color: '#c8a2c8', fontSize: '13px', fontWeight: 700 }}>
            ✓ Digitales Kärtchen erfolgreich an Schüler-App gesendet!
          </div>
        )}
      </div>

      {/* Supporting Strengths & Home Practice Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        <div className="monolith-card" style={{ padding: '28px' }}>
          <div className="font-montserrat" style={{ fontSize: '12px', fontWeight: 700, color: '#f3effa', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={15} color="#c8a2c8" /> Positives Lob:
          </div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-sub)' }}>
            {currentFeedback.whatWentWell.map((pt, i) => (
              <li key={i}>• {pt}</li>
            ))}
          </ul>
        </div>

        <div className="monolith-card" style={{ padding: '28px' }}>
          <div className="font-montserrat" style={{ fontSize: '12px', fontWeight: 700, color: '#a881bd', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Home size={15} /> Hometraining für Zuhause:
          </div>
          {currentFeedback.homeTasks.map((t: HomeTask) => (
            <div key={t.id} style={{ fontSize: '13px', color: 'var(--text-sub)' }}>
              <strong>{t.title} ({t.duration}):</strong> {t.description}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
