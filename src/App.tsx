import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { StudioCam } from './components/StudioCam';
import { StudioTVMirror } from './components/StudioTVMirror';
import { MetaphorCoach } from './components/MetaphorCoach';
import { VideoAnalyzer } from './components/VideoAnalyzer';
import { StudentPortal } from './components/StudentPortal';
import { RemotePortal } from './components/RemotePortal';
import { RightInspectorPanel } from './components/RightInspectorPanel';
import { AgeGroup, Location } from './types';
import { VaganovaFullAnalysis } from './services/vaganovaAngleCalculator';
import { IS_LAB_MODE, BUILD_POLICY } from './config/buildPolicy';

export const App: React.FC = () => {
  const [isTVMode, setIsTVMode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('cam');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<AgeGroup>('MINIS');
  const [exerciseName, setExerciseName] = useState<string>('Plié in der 1. Position');
  const [selectedLocation, setSelectedLocation] = useState<Location>('MAINZ');
  const [selectedStudent, setSelectedStudent] = useState<string>('Emma Berger');
  // Live Vaganova analysis – lifted from VideoAnalyzer so RightInspectorPanel can display it
  const [vaganovaAnalysis, setVaganovaAnalysis] = useState<VaganovaFullAnalysis | null>(null);
  const handleVaganovaAnalysis = useCallback((va: VaganovaFullAnalysis | null) => {
    setVaganovaAnalysis(va);
  }, []);
  const isPlie = exerciseName.toLowerCase().includes('pli');

  // Selected cue point – lifted so RightInspectorPanel can show KI detail
  const [selectedCue, setSelectedCue] = useState<import('./services/vaganovaPreAnalyzer').VaganovaCuePoint | null>(null);
  const handleSelectedCue = useCallback((cue: import('./services/vaganovaPreAnalyzer').VaganovaCuePoint | null) => {
    setSelectedCue(cue);
  }, []);

  // Check URL params for standalone TV mode window
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'tv') {
      setIsTVMode(true);
    }
  }, []);

  const handleOpenTVMirror = () => {
    const tvWindow = window.open(`${window.location.origin}${window.location.pathname}?mode=tv`, 'BalletOS_TV_Mirror', 'width=1280,height=720');
    if (!tvWindow) {
      setIsTVMode(true);
    }
  };

  if (isTVMode) {
    return <StudioTVMirror />;
  }

  return (
    <div className="app-container">
      {/* LAB-MODE BANNER (Berater 2026-08-10): Nicht wegklickbar, global im App-Root.
          Erscheint wenn VITE_LAB_MODE=true. Text klar: EXPERIMENTELL, kein validierter Score.
          Auch in Exporten sichtbar machen (Sprint 1 Step 9). */}
      {IS_LAB_MODE && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: 'rgba(239,68,68,0.95)', color: '#fff',
          padding: '6px 16px', fontSize: '11px', fontWeight: 800,
          textAlign: 'center', letterSpacing: '0.05em',
          borderBottom: '2px solid rgba(255,255,255,0.3)',
          userSelect: 'none', pointerEvents: 'none'
        }}>
          ⚠️ EXPERIMENTALMODUS – NICHT VALIDIERTE MESSWERTE – KEINE DIAGNOSE ODER SICHERHEITSBEWERTUNG
          &nbsp;&nbsp;|&nbsp;&nbsp;BUILD_POLICY v{BUILD_POLICY.policyVersion}
        </div>
      )}
      {/* Sleek Vertical Left Navigation with Context Tile */}
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenTVMirror={handleOpenTVMirror}
        selectedLocation={selectedLocation}
        onLocationChange={setSelectedLocation}
        selectedAgeGroup={selectedAgeGroup}
        onAgeGroupChange={setSelectedAgeGroup}
        selectedStudent={selectedStudent}
        onStudentChange={setSelectedStudent}
      />

      {/* Main 100vh Zero-Scroll Content Container */}
      <main style={{ flex: 1, minHeight: '100vh', height: '100dvh', overflow: 'hidden', padding: '16px', position: 'relative' }}>
        {activeTab === 'cam' && (
          <StudioCam
            selectedAgeGroup={selectedAgeGroup}
            exerciseName={exerciseName}
            onExerciseChange={setExerciseName}
            onOpenTVMirror={handleOpenTVMirror}
          />
        )}

        {activeTab === 'metaphor' && (
          <MetaphorCoach
            selectedAgeGroup={selectedAgeGroup}
            onAgeGroupChange={setSelectedAgeGroup}
            exerciseName={exerciseName}
          />
        )}

        {activeTab === 'analyzer' && (
          <VideoAnalyzer onVaganovaAnalysis={handleVaganovaAnalysis} onSelectedCue={handleSelectedCue} />
        )}

        {activeTab === 'students' && (
          <StudentPortal
            selectedLocation={selectedLocation}
            onLocationChange={setSelectedLocation}
          />
        )}

        {activeTab === 'remote' && (
          <RemotePortal />
        )}
      </main>

      {/* Permanent Right Inspector Panel (340px) */}
      <RightInspectorPanel
        selectedStudent={selectedStudent}
        selectedAgeGroup={selectedAgeGroup}
        exerciseName={exerciseName}
        vaganovaAnalysis={vaganovaAnalysis}
        isPlie={isPlie}
        selectedCue={selectedCue}
      />
    </div>
  );
};

export default App;
