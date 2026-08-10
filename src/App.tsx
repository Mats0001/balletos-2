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
          <VideoAnalyzer onVaganovaAnalysis={handleVaganovaAnalysis} />
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
      />
    </div>
  );
};

export default App;
