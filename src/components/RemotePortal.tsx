import React, { useState } from 'react';
import { Smartphone, UploadCloud, ShieldCheck, CheckCircle2, Video, MessageCircle, Sparkles } from 'lucide-react';

export const RemotePortal: React.FC = () => {
  const [uploadedClip, setUploadedClip] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const handleSimulateUpload = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setUploadedClip(true);
    }, 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Remote Portal Header */}
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', padding: '10px', borderRadius: '12px', color: '#10b981' }}>
            <Smartphone size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#f8fafc' }}>Remote Handy-App & Hometraining-Upload</h2>
            <p style={{ fontSize: '13px', color: '#94a3b8' }}>Schülerinnen filmen sich Zuhause & erhalten automatisierte KI-Tipps (DSGVO-geschützt)</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '6px 14px', borderRadius: '20px', color: '#10b981', fontSize: '13px', fontWeight: 600 }}>
          <ShieldCheck size={16} />
          <span>Eltern-Einwilligung (DSGVO-Verifiziert)</span>
        </div>
      </div>

      {/* Main Smartphone Simulator Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* Phone Frame Simulator */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{
            width: '280px',
            height: '540px',
            background: '#121217',
            border: '4px solid #27272a',
            borderRadius: '40px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
          }}>
            {/* Phone Notch */}
            <div style={{ width: '100px', height: '18px', background: '#27272a', borderRadius: '10px', margin: '0 auto 16px auto' }} />

            {/* App UI inside simulator */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc', textAlign: 'center' }}>
                🩰 Aurora Remote Coach
              </div>

              {!uploadedClip ? (
                <div style={{
                  flex: 1,
                  border: '2px dashed rgba(245, 158, 11, 0.4)',
                  borderRadius: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '20px',
                  textAlign: 'center',
                  background: 'rgba(245, 158, 11, 0.05)'
                }}>
                  <UploadCloud size={40} color="#f59e0b" style={{ marginBottom: '12px' }} />
                  <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Hometraining Video hochladen</div>
                  <p style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '16px' }}>Filme z.B. 10 Sekunden Tendu oder Plié vor deinem Spiegel Zuhause.</p>

                  <button
                    onClick={handleSimulateUpload}
                    disabled={isProcessing}
                    style={{
                      background: '#f59e0b',
                      border: 'none',
                      color: '#000000',
                      padding: '10px 16px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {isProcessing ? '⚡ KI Analysiert...' : '📱 Clip Auswählen'}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ height: '180px', borderRadius: '12px', overflow: 'hidden', position: 'relative', background: '#000' }}>
                    <img src="https://images.unsplash.com/photo-1547153760-18fc86324498?auto=format&fit=crop&w=400&q=80" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', top: '8px', right: '8px', background: '#10b981', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px' }}>
                      ✓ KI Analysiert
                    </div>
                  </div>

                  {/* AI Feedback Card inside phone */}
                  <div style={{ background: 'rgba(26, 26, 36, 0.9)', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: '12px', padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f59e0b', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                      <Sparkles size={14} /> KI-Tipp für Zuhause:
                    </div>
                    <p style={{ fontSize: '11px', color: '#e2e8f0', lineHeight: '1.4' }}>
                      "Klasse Plié! Deine Fußspitzen bleiben schön ausgedreht. Achte beim Aufstehen darauf, dein Kronen-Seidenfaden oben zu halten!"
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Remote Dashboard Guidance */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700 }}>DSGVO & Datenschutz-Sicherheit</h3>
          <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.6' }}>
            Das Remote-Portal ermöglicht Schülerinnen das geschützte Hometraining. Die Eltern minderjähriger Schülerinnen unterzeichnen vorab die digitale Einwilligung direkt im Portal.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '14px', borderRadius: '12px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <CheckCircle2 size={20} color="#10b981" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>Verschlüsselte Video-Übertragung</div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>Clips werden nach der Analyse automatisch geschützt gespeichert.</div>
              </div>
            </div>

            <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '14px', borderRadius: '12px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <CheckCircle2 size={20} color="#10b981" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>Pädagogische KI-Inhaltsprüfung</div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>Empfehlungen verwenden stets wertschätzende Sprachbilder ohne Leistungsdruck.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
