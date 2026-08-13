export interface StoredVideoItem {
  id: string;
  title: string;
  url: string;
  topic: string;
  isCustomUpload?: boolean;
}

// Spontaneous studio analysis fixtures with known execution errors.
// They are never Nicole references or pedagogical gold standards.
export const defaultDevStudioVideos: StoredVideoItem[] = [
  { id: 'v1', title: '🩰 Nicole Studio Saal Clip 1 (IMG_2272.mp4)', url: '/videos/nicole_saal_1.mp4', topic: 'Saal Plié & Haltung' },
  { id: 'v2', title: '🩰 Nicole Studio Saal Clip 2 (IMG_2273.mp4)', url: '/videos/nicole_saal_2.mp4', topic: 'Port de Bras Ausführung' },
  { id: 'v3', title: '🩰 Nicole Studio Saal Clip 3 (IMG_2274.mp4)', url: '/videos/nicole_saal_3.mp4', topic: 'Plié 1. Position & Schwanenflügel' },
  { id: 'v4', title: '🩰 Nicole Studio Saal Clip 4 (IMG_2275.mp4)', url: '/videos/nicole_saal_4.mp4', topic: 'Port de Bras 2. Position' },
  { id: 'v5', title: '🩰 Nicole Studio Saal Clip 5 (IMG_2276.mp4)', url: '/videos/nicole_saal_5.mp4', topic: 'Zauberstern Balance & Drehung' },
  { id: 'v6', title: '🩰 Nicole Studio Saal Clip 6 (IMG_2277.mp4)', url: '/videos/nicole_saal_6.mp4', topic: 'Battement Tendu & Fuß-Linie' },
  { id: 'v7', title: '🩰 Nicole Studio Saal Clip 7 (IMG_2279.mp4)', url: '/videos/nicole_saal_7.mp4', topic: 'Passé Relevé Achse' },
  { id: 'v8', title: '🩰 Nicole Studio Saal Clip 8 (IMG_2280.mp4)', url: '/videos/nicole_saal_8.mp4', topic: 'Grand Plié 2. Position' },
  { id: 'v9', title: '🩰 Nicole Studio Saal Clip 9 (IMG_2281.mp4)', url: '/videos/nicole_saal_9.mp4', topic: 'Arabesque & Körperhaltung' }
];

const CUSTOM_TITLES_KEY = 'balletos_video_custom_titles';

class VideoStoreService {
  private customVideos: StoredVideoItem[] = [];
  /** Persistente benutzerdefinierte Titel (videoId → title) */
  private customTitles: Map<string, string>;

  constructor() {
    // Gespeicherte Titel aus localStorage laden
    this.customTitles = new Map();
    try {
      const stored = localStorage.getItem(CUSTOM_TITLES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, string>;
        for (const [k, v] of Object.entries(parsed)) {
          this.customTitles.set(k, v);
        }
      }
    } catch { /* noop */ }
  }

  private persistTitles() {
    try {
      const obj: Record<string, string> = {};
      this.customTitles.forEach((v, k) => { obj[k] = v; });
      localStorage.setItem(CUSTOM_TITLES_KEY, JSON.stringify(obj));
    } catch { /* noop */ }
  }

  public getAllVideos(): StoredVideoItem[] {
    const all = [...defaultDevStudioVideos, ...this.customVideos];
    // Benutzerdefinierte Titel anwenden
    return all.map(v => {
      const customTitle = this.customTitles.get(v.id);
      return customTitle ? { ...v, title: customTitle } : v;
    });
  }

  /**
   * Benennt ein Video um. Funktioniert für Default- und Upload-Videos.
   * Der Titel wird in localStorage persistiert.
   */
  public renameVideo(videoId: string, newTitle: string): void {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    this.customTitles.set(videoId, trimmed);
    this.persistTitles();
  }

  /**
   * Setzt den Titel eines Videos auf den Original-Titel zurück.
   */
  public resetTitle(videoId: string): void {
    this.customTitles.delete(videoId);
    this.persistTitles();
  }

  public addCustomVideo(file: File): StoredVideoItem {
    const objectUrl = URL.createObjectURL(file);
    const newVideo: StoredVideoItem = {
      id: `custom_${Date.now()}`,
      title: `📁 Upload: ${file.name}`,
      url: objectUrl,
      topic: 'Eigene Studio-Aufnahme',
      isCustomUpload: true
    };
    this.customVideos.unshift(newVideo);
    return newVideo;
  }
}

export const videoStore = new VideoStoreService();
