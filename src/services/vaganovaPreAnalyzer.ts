// ─────────────────────────────────────────────────────────────────────────────
// VaganovaPreAnalyzer – Cue-Point Management Service
//
// ⚠️  AUDIT FIX (2026-08-10): Previous version faked AI analysis by switching
//     on video filename and returning fabricated angle values (14°, 88°, 8°)
//     as if they were real measurements. This has been corrected:
//
//     - DEMO_FIXTURE cue points exist only for two known demo videos
//       and are clearly tagged { isDemoFixture: true, dataSource: 'DEMO_FIXTURE' }
//     - For any unknown video: getCuePoints() returns [] (no fabricated data)
//     - Teachers add real cue points manually via addCuePoint()
//     - All teacher-created data is tagged dataSource: 'TEACHER_CREATED'
//
//     This service does NOT perform frame analysis or biomechanical measurement.
// ─────────────────────────────────────────────────────────────────────────────

export interface VaganovaCuePoint {
  id: string;
  timeSeconds: number;
  timecodeStr: string;
  poseName: string;
  status: 'GOOD' | 'CORRECTION' | 'WARNING';
  scorePercent?: number;        // Only set by teacher, never auto-generated
  headline: string;
  cueMetaphor: string;
  jointFocusId: string;
  isCustom?: boolean;
  isEdited?: boolean;
  isDemoFixture?: boolean;      // TRUE = demo placeholder, NOT a real measurement
  dataSource?: 'TEACHER_CREATED' | 'DEMO_FIXTURE';
}

// ─────────────────────────────────────────────────────────────────────────────
// DEMO FIXTURES – Example cue points for two known demo videos
// These are NOT measurements. They are teacher-authored example annotations
// for UI demonstration purposes only.
// ─────────────────────────────────────────────────────────────────────────────
const DEMO_FIXTURES: Record<string, VaganovaCuePoint[]> = {
  'IMG_2272': [
    {
      id: 'demo-1-grand-plie',
      timeSeconds: 0.8,
      timecodeStr: '00:00.800',
      poseName: 'Grand Plié 2. Position (Ansatz)',
      status: 'GOOD',
      headline: 'Perfekte Beckenaufrichtung (Vaganova 2. Pos)',
      cueMetaphor: '"Lendenwirbel lang und neutral wie eine Perlenkette halten."',
      jointFocusId: 'pelvis_core',
      isDemoFixture: true,
      dataSource: 'DEMO_FIXTURE',
    },
    {
      id: 'demo-2-plie-tiefpunkt',
      timeSeconds: 2.5,
      timecodeStr: '00:02.500',
      poseName: 'Plié Tiefpunkt (Fersen am Boden)',
      status: 'CORRECTION',
      headline: 'Rechtes Knie – Ausrichtung über Zehenspitze prüfen',
      cueMetaphor: '"Die Knie ziehen aktiv zurück zur hinteren Raumdiagonale."',
      jointFocusId: 'right_knee',
      isDemoFixture: true,
      dataSource: 'DEMO_FIXTURE',
    },
  ],
};

function getDemoFixtureKey(videoUrl: string): string | null {
  for (const key of Object.keys(DEMO_FIXTURES)) {
    if (videoUrl.includes(key)) return key;
  }
  return null;
}

export class VaganovaPreAnalyzerService {
  private getStorageKey(videoUrl: string): string {
    // v2_ prefix to avoid collisions with old fabricated data in localStorage
    return `balletos_cuepoints_v2_${encodeURIComponent(videoUrl)}`;
  }

  /**
   * Returns cue points for a video.
   * Priority: 1) Teacher-saved data, 2) DEMO_FIXTURE for known demos, 3) []
   */
  public getCuePoints(videoUrl: string): VaganovaCuePoint[] {
    try {
      const stored = localStorage.getItem(this.getStorageKey(videoUrl));
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('[VaganovaPreAnalyzer] Storage read error:', e);
    }

    const fixtureKey = getDemoFixtureKey(videoUrl);
    if (fixtureKey) {
      return DEMO_FIXTURES[fixtureKey];
    }

    // Unknown video: no fabricated data. Teacher must add cue points manually.
    return [];
  }

  public saveCuePoints(videoUrl: string, points: VaganovaCuePoint[]): void {
    try {
      localStorage.setItem(this.getStorageKey(videoUrl), JSON.stringify(points));
    } catch (e) {
      console.warn('[VaganovaPreAnalyzer] Storage write error:', e);
    }
  }

  public addCuePoint(videoUrl: string, newCue: Omit<VaganovaCuePoint, 'id'>): VaganovaCuePoint[] {
    const points = this.getCuePoints(videoUrl);
    const cue: VaganovaCuePoint = {
      ...newCue,
      id: `teacher-${Date.now()}`,
      isCustom: true,
      dataSource: 'TEACHER_CREATED',
    };
    const updated = [...points, cue].sort((a, b) => a.timeSeconds - b.timeSeconds);
    this.saveCuePoints(videoUrl, updated);
    return updated;
  }

  public updateCuePoint(videoUrl: string, cueId: string, updates: Partial<VaganovaCuePoint>): VaganovaCuePoint[] {
    const points = this.getCuePoints(videoUrl);
    const updated = points.map(p => {
      if (p.id === cueId) {
        return { ...p, ...updates, isEdited: true, dataSource: 'TEACHER_CREATED' as const };
      }
      return p;
    });
    this.saveCuePoints(videoUrl, updated);
    return updated;
  }

  public deleteCuePoint(videoUrl: string, cueId: string): VaganovaCuePoint[] {
    const points = this.getCuePoints(videoUrl);
    const updated = points.filter(p => p.id !== cueId);
    this.saveCuePoints(videoUrl, updated);
    return updated;
  }

  public resetToDefaults(videoUrl: string): VaganovaCuePoint[] {
    try { localStorage.removeItem(this.getStorageKey(videoUrl)); } catch (e) {}
    const fixtureKey = getDemoFixtureKey(videoUrl);
    return fixtureKey ? DEMO_FIXTURES[fixtureKey] : [];
  }
}

export const vaganovaPreAnalyzer = new VaganovaPreAnalyzerService();
