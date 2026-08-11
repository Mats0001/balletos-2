/**
 * VaganovaIdbCache — Persistent IndexedDB storage for pre-scanned frame data.
 *
 * Cache key strategy:  `vaganova_v1_${filename}_${fileSizeBytes}`
 * - Filename  →  differentiates different video files
 * - FileSize  →  detects re-encoded / updated versions of the same filename
 * - "v1"      →  schema version; bump to "v2" to invalidate all caches on format change
 *
 * Data volume estimate:
 *   186 frames × 33 landmarks × 4 floats (x,y,z,vis) × 4 bytes ≈ ~100 KB per video
 *   IndexedDB can hold hundreds of MB → this is trivial.
 */

import { FrameEntry } from './frameInterpolator';

const DB_NAME    = 'balletos_vaganova_cache';
const DB_VERSION = 1;
const STORE_NAME = 'frame_scans';

interface IdbRecord {
  key:       string;       // cache key = `vaganova_v1_${filename}_${size}`
  frames:    FrameEntry[];
  fps:       number;
  duration:  number;
  savedAt:   number;       // epoch ms — for future TTL / eviction
  frameCount: number;
}

// ─── DB singleton ─────────────────────────────────────────────────────────────
let _db: IDBDatabase | null = null;

async function openDb(): Promise<IDBDatabase> {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      resolve(_db!);
    };
    req.onerror = () => reject(req.error);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────
export class VaganovaIdbCache {

  /**
   * Build cache key from video URL + optional File object.
   * For built-in /videos/*.mp4 URLs we use the URL path as stable key.
   * For uploaded files (blob: URLs) we use filename + size.
   */
  public buildKey(videoUrl: string, file?: File): string {
    if (file) {
      // Uploaded file: filename + size fingerprint
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      return `vaganova_v1_${safeName}_${file.size}`;
    }
    // Built-in video: use last path segment (e.g. "nicole_saal_1.mp4")
    const segment = videoUrl.split('/').pop() ?? videoUrl;
    return `vaganova_v1_${segment}`;
  }

  /** Load cached scan from IndexedDB. Returns null on miss. */
  public async load(key: string): Promise<{ frames: FrameEntry[]; fps: number; duration: number } | null> {
    try {
      const db    = await openDb();
      const tx    = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      return await new Promise((resolve, reject) => {
        const req = store.get(key);
        req.onsuccess = () => {
          const record = req.result as IdbRecord | undefined;
          if (!record || record.frames.length < 10) { resolve(null); return; }
          console.log(`[IdbCache] HIT  ${key} — ${record.frameCount} frames`);
          resolve({ frames: record.frames, fps: record.fps, duration: record.duration });
        };
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[IdbCache] load error', err);
      return null;
    }
  }

  /** Persist a completed scan to IndexedDB. Fire-and-forget (non-blocking). */
  public async save(
    key: string,
    frames: FrameEntry[],
    fps: number,
    duration: number
  ): Promise<void> {
    try {
      const db    = await openDb();
      const tx    = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: IdbRecord = { key, frames, fps, duration, savedAt: Date.now(), frameCount: frames.length };
      await new Promise<void>((resolve, reject) => {
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
      });
      console.log(`[IdbCache] SAVED ${key} — ${frames.length} frames`);
    } catch (err) {
      console.warn('[IdbCache] save error', err);
    }
  }

  /** List all stored keys with metadata (for a cache-management UI). */
  public async listAll(): Promise<{ key: string; frameCount: number; savedAt: number }[]> {
    try {
      const db    = await openDb();
      const tx    = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      return await new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => {
          const records = (req.result as IdbRecord[]).map(r => ({
            key: r.key, frameCount: r.frameCount, savedAt: r.savedAt,
          }));
          resolve(records);
        };
        req.onerror = () => reject(req.error);
      });
    } catch { return []; }
  }

  /** Delete a specific cached scan. */
  public async delete(key: string): Promise<void> {
    try {
      const db    = await openDb();
      const tx    = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      await new Promise<void>((resolve, reject) => {
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
      });
    } catch { /* ignore */ }
  }

  /** Wipe everything (e.g. user triggered "Cache leeren"). */
  public async clearAll(): Promise<void> {
    try {
      const db    = await openDb();
      const tx    = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      await new Promise<void>((resolve, reject) => {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
      });
      console.log('[IdbCache] cleared all');
    } catch { /* ignore */ }
  }
}

export const vaganovaIdbCache = new VaganovaIdbCache();
