import React from 'react';
import { VaganovaCurriculumReport } from '../services/vaganovaCurriculumEngine';
import { BookOpen, Sparkles, CheckCircle2, AlertTriangle, Send, X, Award, Target, Flame } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  report: VaganovaCurriculumReport;
  studentName: string;
}

export const VaganovaCurriculumModal: React.FC<Props> = ({ isOpen, onClose, report, studentName }) => {
  if (!isOpen) return null;

  const handleExportWhatsApp = () => {
    navigator.clipboard.writeText(report.whatsappMessageTemplate);
    alert('✓ Hausaufgaben-Text für WhatsApp wurde in die Zwischenablage kopiert!');
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(5, 4, 8, 0.85)',
      backdropFilter: 'blur(12px)',
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(22, 18, 32, 0.98) 0%, rgba(10, 8, 16, 0.99) 100%)',
        border: '1px solid rgba(192, 132, 252, 0.4)',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '620px',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)'
      }}>
        {/* Top Header Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'linear-gradient(135deg, #a881bd 0%, #8b5a8b 100%)', padding: '8px', borderRadius: '10px', color: '#fff' }}>
              <BookOpen size={20} />
            </div>
            <div>
              <h2 className="font-montserrat" style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                Vaganova KI-Hausaufgaben- & Lehrplan
              </h2>
              <span style={{ fontSize: '11px', color: '#c084fc', fontWeight: 700 }}>
                {report.curriculumLevelStr} · {studentName}
              </span>
            </div>
          </div>

          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', opacity: 0.7 }}>
            <X size={20} />
          </button>
        </div>

        {/* 1. Trajectory Score & Good Highlights */}
        <div style={{ background: 'rgba(48, 209, 88, 0.1)', border: '1px solid rgba(48, 209, 88, 0.3)', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#30d158', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Award size={16} /> Was heute fantastisch war:
            </span>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#30d158', background: 'rgba(48,209,88,0.2)', padding: '3px 8px', borderRadius: '6px' }}>
              {report.trajectoryScorePercent}% Fluidität
            </span>
          </div>

          {report.whatWasGood.map((good, idx) => (
            <div key={idx} style={{ fontSize: '11px', color: '#ffffff', fontWeight: 600 }}>
              {good}
            </div>
          ))}
        </div>

        {/* 2. Target Correction Focus */}
        <div style={{ background: 'rgba(255, 69, 58, 0.1)', border: '1px solid rgba(255, 69, 58, 0.3)', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: '#ff453a', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={16} /> Entwicklungs-Fokus für Zuhause:
          </span>
          <span style={{ fontSize: '11px', color: '#ffffff', fontWeight: 600 }}>
            {report.whatToCorrect}
          </span>
        </div>

        {/* 3. The Tailored Home Exercise (Metaphor & WIE-Anleitung) */}
        <div style={{ background: 'rgba(192, 132, 252, 0.12)', border: '1px solid rgba(192, 132, 252, 0.4)', borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#c084fc', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Target size={16} /> Hausaufgabe: {report.homeExercise.title}
            </span>
            <span style={{ fontSize: '10px', fontWeight: 800, color: '#ffffff', background: 'rgba(192, 132, 252, 0.3)', padding: '2px 8px', borderRadius: '6px' }}>
              {report.homeExercise.repsAndDuration}
            </span>
          </div>

          {/* Bildhafte Metapher */}
          <div style={{ background: 'rgba(0,0,0,0.4)', padding: '10px 12px', borderRadius: '8px', borderLeft: '3px solid #c084fc' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>
              💡 Bildhafte Vaganova-Metapher:
            </span>
            <span style={{ fontSize: '11px', color: '#ffffff', fontStyle: 'italic', fontWeight: 600 }}>
              "{report.homeExercise.metaphor}"
            </span>
          </div>

          {/* Exakte WIE-Anleitung */}
          <div>
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-sub)', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>
              📋 Exakte WIE-Anleitung:
            </span>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.9)', fontWeight: 500, lineHeight: '1.4' }}>
              {report.homeExercise.howToExecute}
            </span>
          </div>
        </div>

        {/* WhatsApp Parents Export Button */}
        <button
          onClick={handleExportWhatsApp}
          style={{
            background: 'linear-gradient(135deg, #30d158 0%, #248a3d 100%)',
            color: '#ffffff',
            border: 'none',
            padding: '12px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 0 20px rgba(48,209,88,0.4)',
            marginTop: '6px'
          }}
        >
          <Send size={16} /> Hausaufgaben-Karte für WhatsApp kopieren & senden
        </button>

      </div>
    </div>
  );
};
