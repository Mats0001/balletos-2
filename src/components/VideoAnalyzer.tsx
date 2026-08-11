import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Activity, Camera, SplitSquareVertical, Layers, Sliders, Play, Pause, Send, Sparkles, Upload, AlertTriangle, CheckCircle, ZoomIn, ZoomOut, Maximize2, Minimize2, Box, ListVideo, ChevronRight, Plus, Edit2, Trash2, Save, X, RotateCcw, Volume2, Compass, Eye, Activity as PulseIcon, Disc, BookOpen, Zap, Pen, ArrowRight, Type, Eraser, ImageDown, FlaskConical, Undo2, Redo2 } from 'lucide-react';
import { AnnotationCanvas, AnnotationCanvasHandle, DrawingTool } from './AnnotationCanvas';
import { AnnotationLightbox, AnnotationEntry } from './AnnotationLightbox';
import { JetztWichtigInspector } from './JetztWichtigInspector';
import { JetztWichtigInspectorData, FeedbackObject } from '../types';
import { videoStore, StoredVideoItem } from '../services/videoStore';
import { realMediaPipePose, PoseLandmark, PoseResultsData } from '../services/realMediaPipePose';
import { vaganovaPoseEngine } from '../services/vaganovaPoseEngine';
import { vaganovaEvidenceEngine } from '../services/vaganovaEvidenceEngine';
import { vaganovaMotionClassifier, MotionClassificationResult } from '../services/vaganovaMotionClassifier';
import { vaganova3DKinematics, ReconstructedSkeleton } from '../services/vaganova3DKinematics';
import { vaganovaPreAnalyzer, VaganovaCuePoint, analyzeFrameCacheForHighlights, AutoAnalysisReport } from '../services/vaganovaPreAnalyzer';
import { vaganovaKineticAI } from '../services/vaganovaKineticAI';
import { vaganovaCurriculumEngine, VaganovaCurriculumReport } from '../services/vaganovaCurriculumEngine';
import { vaganovaFrameCache } from '../services/vaganovaFrameCache';
import { vaganovaAngleCalculator, VaganovaFullAnalysis } from '../services/vaganovaAngleCalculator';
import { vaganovaArmAnalyzer } from '../services/vaganovaArmAnalyzer';
import { vaganovaFootAnalyzer } from '../services/vaganovaFootAnalyzer';
import { renderSkeletonToCanvas, CanvasRenderOptions } from '../services/skeletonCanvasRenderer';
import { VaganovaCurriculumModal } from './VaganovaCurriculumModal';
import { BUILD_POLICY } from '../config/buildPolicy';
import { SkeletonJointPopover } from './SkeletonJointPopover';
import { getJointKnowledge, CLICKABLE_JOINT_INDICES } from '../services/skeletonJointKnowledge';

interface VideoAnalyzerProps {
  onVaganovaAnalysis?: (va: VaganovaFullAnalysis | null) => void;
  onSelectedCue?: (cue: VaganovaCuePoint | null) => void;
}

export const VideoAnalyzer: React.FC<VideoAnalyzerProps> = ({ onVaganovaAnalysis, onSelectedCue }) => {
  // Video Controls State
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [showSkeleton, setShowSkeleton] = useState<boolean>(true);
  const [showAngleArcs, setShowAngleArcs] = useState<boolean>(true);
  const [showMotionTrails, setShowMotionTrails] = useState<boolean>(true);
  const [showCoG, setShowCoG] = useState<boolean>(true);
  // Overlay-Modus – wird pro Schülerin in localStorage gespeichert
  // 'anatomisch'   = nur Körperregionen-Farben, kein Urteil (Berater-Sprint0)
  // 'lehrer-ampel' = vollständige KI-Ampel für Nicole (PROJECT_DECISION 2026-08-10)
  // 'lehrbuch'     = monochromes weiß, keine Ablenkung
  const [overlayMode, setOverlayMode] = useState<'anatomisch' | 'lehrer-ampel' | 'lehrbuch'>('lehrer-ampel');
  const setOverlayModeWithSave = (videoUrl: string) => (m: 'anatomisch' | 'lehrer-ampel' | 'lehrbuch') => {
    setOverlayMode(m);
    try {
      const key = `balletos_overlay_mode_${videoUrl.split('/').pop() ?? 'default'}`;
      localStorage.setItem(key, m);
    } catch {}
  };
  const [showOverlayMenu, setShowOverlayMenu] = useState<boolean>(false);
  const [splitScreenMode, setSplitScreenMode] = useState<boolean>(false);
  const [selectedFrameTime, setSelectedFrameTime] = useState<string>('00:02.160');
  const [selectedJointId, setSelectedJointId] = useState<string>('left_knee');

  // OPTION 1 PRE-INDEXING ENGINE STATE
  const [isPreIndexing, setIsPreIndexing] = useState<boolean>(false);
  const [indexingProgress, setIndexingProgress] = useState<number>(0);
  const [indexingStatusStr, setIndexingStatusStr] = useState<string>('Bereite Frame-Lock vor...');

  // ZOOM & PAN ENGINE STATE
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isAutoCrop, setIsAutoCrop] = useState<boolean>(false);

  // Video Library State
  const [videoList, setVideoList] = useState<StoredVideoItem[]>(videoStore.getAllVideos());
  const [selectedDevVideoUrl, setSelectedDevVideoUrl] = useState<string>(videoList[0].url);

  // Dynamic MediaPipe Landmarks
  const [detectedLandmarks, setDetectedLandmarks] = useState<PoseLandmark[] | null>(null);
  const [detectedWorldLandmarks, setDetectedWorldLandmarks] = useState<PoseLandmark[] | null>(null);
  const [isEngineReady, setIsEngineReady] = useState<boolean>(false);
  const [analysisReport, setAnalysisReport] = useState<AutoAnalysisReport | null>(null);

  // AI & TEACHER EDITABLE CUE-POINTS STATE
  const [cuePoints, setCuePoints] = useState<VaganovaCuePoint[]>(
    vaganovaPreAnalyzer.getCuePoints(selectedDevVideoUrl)
  );

  // VIDEO SCRUBBER STATE
  const [videoDuration, setVideoDuration] = useState<number>(5.0);
  const [currentPlayTime, setCurrentPlayTime] = useState<number>(0);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const slowMoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // EDIT MODAL / INLINE FORM STATE
  const [editingCueId, setEditingCueId] = useState<string | null>(null);
  const [expandedCueIds, setExpandedCueIds] = useState<Set<string>>(new Set());
  const toggleCueExpanded = (id: string) =>
    setExpandedCueIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [editForm, setEditForm] = useState<{ poseName: string; headline: string; cueMetaphor: string; status: 'GOOD' | 'CORRECTION' | 'WARNING' }>({
    poseName: '',
    headline: '',
    cueMetaphor: '',
    status: 'GOOD'
  });

  // VAGANOVA CURRICULUM MODAL STATE
  const [isCurriculumModalOpen, setIsCurriculumModalOpen] = useState<boolean>(false);

  // ── ANNOTATION TOOL STATE ──────────────────────────────────────────────────
  // AnnotationEntry is imported from AnnotationLightbox (shared type)
  const STORAGE_KEY = `balletos_annotations_${selectedDevVideoUrl.split('/').pop()}`;

  const [annotationEntries, setAnnotationEntries] = useState<AnnotationEntry[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('pen');
  const [drawingColor, setDrawingColor] = useState<string>('#ff453a');
  const [drawingLineWidth, setDrawingLineWidth] = useState<number>(3);
  const [saveWithSkeleton, setSaveWithSkeleton] = useState<boolean>(true);
  const annotationCanvasRef = useRef<AnnotationCanvasHandle>(null);

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);
  const [lightboxIndex, setLightboxIndex] = useState<number>(0);

  // 🦴 Joint popover state
  const [jointPopover, setJointPopover] = useState<{
    landmarkIndex: number;
    pixelX: number;
    pixelY: number;
  } | null>(null);

  // Persist annotations to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(annotationEntries));
    } catch { /* quota exceeded – ignore */ }
  }, [annotationEntries, STORAGE_KEY]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const refVideoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isProcessingRef = useRef<boolean>(false);
  const processingStartTimeRef = useRef<number>(0);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const videoPanelRef = useRef<HTMLDivElement>(null); // Outer panel: Video + Canvas + Scrubber
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const annotationMergeCanvasRef = useRef<HTMLCanvasElement>(null); // Off-screen merge canvas

  // ── FRAME SYNC FOUNDATION (2026-08-10) ───────────────────────────────────
  // Each pose result is tagged with the exact video timestamp it came from.
  // Drawing only happens when the packet's mediaTimeUs matches the current frame.
  const latestPacketRef = useRef<import('../types/posePacket').PosePacket | null>(null);
  const streamEpochRef = useRef<number>(Date.now());
  const frameSeqRef = useRef<number>(0);
  const debugHudRef = useRef<import('../types/posePacket').FrameSyncDebugInfo>({
    inferenceMs: 0, poseAgeMs: 0, syncErrorMs: 0,
    droppedFrames: 0, skippedInferences: 0, usingRvfc: false,
  });
  // ─────────────────────────────────────────────────────────────────────────

  // 60fps ref-based data (bypasses React for smooth canvas drawing)
  const landmarksRef = useRef<PoseLandmark[] | null>(null);
  const worldLandmarksRef = useRef<PoseLandmark[] | null>(null);
  const lastStateUpdateRef = useRef<number>(0);
  const overlayBoundsRef = useRef<{ top: number; left: number; width: number; height: number } | null>(null);

  // ⚡ PERFORMANCE: Vaganova analysis runs at 15fps max, cached for 60fps canvas draw
  const lastAnalysisTimeRef = useRef<number>(0);
  const cachedAnalysisRef = useRef<{
    sk: ReturnType<typeof vaganova3DKinematics.solve>;
    motionCls: ReturnType<typeof vaganovaMotionClassifier.classify>;
    vagAn: ReturnType<typeof vaganovaAngleCalculator.analyzeFullFrame>;
    armPos: ReturnType<typeof vaganovaArmAnalyzer.classifyArmPosition>;
    elbowQ: ReturnType<typeof vaganovaArmAnalyzer.analyzeElbowQuality>;
    epaul: ReturnType<typeof vaganovaArmAnalyzer.analyzeEpaulement>;
    footAl: ReturnType<typeof vaganovaFootAnalyzer.analyzeSickleWing>;
    wDist: ReturnType<typeof vaganovaFootAnalyzer.analyzeWeightDistribution>;
    cogPt: { x: number; y: number };
    packetMediaTimeUs: number; // Track which packet this analysis belongs to
  } | null>(null);

  // Computed overlay bounds that exactly match the rendered video area
  const [overlayBounds, setOverlayBounds] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [videoAspectRatio, setVideoAspectRatio] = useState<number>(16/9);

  // Compute the actual rendered video area within its container
  // This accounts for object-fit:contain letterboxing/pillarboxing
  const computeOverlayBounds = () => {
    const video = videoRef.current;
    const container = videoContainerRef.current;
    if (!video || !container || !video.videoWidth || !video.videoHeight) return;

    // Use offsetWidth/offsetHeight instead of getBoundingClientRect().width/height
    // to avoid CSS-zoom/transform doubling the reported dimensions
    const containerW = container.offsetWidth;
    const containerH = container.offsetHeight;
    const videoAspect = video.videoWidth / video.videoHeight;
    setVideoAspectRatio(videoAspect);
    const containerAspect = containerW / containerH;

    let renderW: number, renderH: number, offsetX: number, offsetY: number;

    if (videoAspect > containerAspect) {
      // Video is wider than container → pillarboxing (black bars top/bottom)
      renderW = containerW;
      renderH = containerW / videoAspect;
      offsetX = 0;
      offsetY = (containerH - renderH) / 2;
    } else {
      // Video is taller than container → letterboxing (black bars left/right)
      renderH = containerH;
      renderW = containerH * videoAspect;
      offsetX = (containerW - renderW) / 2;
      offsetY = 0;
    }

    setOverlayBounds({ top: offsetY, left: offsetX, width: renderW, height: renderH });
    overlayBoundsRef.current = { top: offsetY, left: offsetX, width: renderW, height: renderH };
  };

  // Initialize MediaPipe Pose Engine on mount
  useEffect(() => {
    realMediaPipePose.initialize();
  }, []);

  // Recompute overlay bounds when video container resizes (window resize, panel toggle, split screen)
  useEffect(() => {
    const container = videoContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      computeOverlayBounds();
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  // ⚡ OPTION 1: PRE-INDEXING TRIGGER
  const triggerPreIndexingScan = async () => {
    if (!videoRef.current) return;

    setIsPreIndexing(true);
    setIndexingProgress(0);
    setIndexingStatusStr('Bereite 60 FPS Pre-Scan vor...');

    await vaganovaFrameCache.preIndexVideo(
      selectedDevVideoUrl,
      videoRef.current,
      (percent, step, total) => {
        setIndexingProgress(percent);
        setIndexingStatusStr(`Frame ${step}/${total} (${percent}%)`);
      }
    );

    setIsPreIndexing(false);
    setIsEngineReady(true);
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }

    // Auto-Analyse: KI-Cue-Points aus echten Frame-Daten generieren
    const { autoCuePoints, report } = analyzeFrameCacheForHighlights(selectedDevVideoUrl);
    if (autoCuePoints.length > 0) {
      // Bestehende Cue-Points behalten + KI-Points ergänzen (keine Duplikate)
      setCuePoints(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const newPoints = autoCuePoints.filter(p => !existingIds.has(p.id));
        const merged = [...prev, ...newPoints].sort((a, b) => a.timeSeconds - b.timeSeconds);
        // ⚠️ Sofort in localStorage persistieren, sonst verliert addCuePoint() die KI-Cues
        vaganovaPreAnalyzer.saveCuePoints(selectedDevVideoUrl, merged);
        return merged;
      });
    }
    setAnalysisReport(report);
  };

  // Auto-Scan: startet automatisch wenn Video geladen ist und kein Cache vorhanden
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const startScanIfNeeded = () => {
      if (vaganovaFrameCache.hasCache(selectedDevVideoUrl)) {
        setIsPreIndexing(false);
        setIsEngineReady(true);
      } else {
        // Automatisch starten – Nicole muss nichts tun
        triggerPreIndexingScan();
      }
    };

    if (v.readyState >= 1) {
      startScanIfNeeded();
    } else {
      v.addEventListener('loadedmetadata', startScanIfNeeded, { once: true });
      return () => v.removeEventListener('loadedmetadata', startScanIfNeeded);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDevVideoUrl]);

  // 🚀 60 FPS CANVAS-BASED RENDER LOOP
  // Landmarks are stored in refs (no React re-render per frame).
  // Canvas is drawn directly at 60fps. React state is throttled to ~4fps for side panels.
  useEffect(() => {
    let animId: number;
    let isActive = true;
    let lastProcessedTime = -1;

    // CRITICAL: Reset processing lock when effect restarts (e.g. clip change).
    // The previous effect's processFrame callback may never fire (isActive=false),
    // leaving isProcessingRef stuck at true and blocking all future live inference.
    isProcessingRef.current = false;

    // ── FRAME SYNC: Reset all pose state on video change ────────────────────
    const resetPoseState = () => {
      latestPacketRef.current = null;
      landmarksRef.current = null;
      worldLandmarksRef.current = null;
      cachedAnalysisRef.current = null;
      frameSeqRef.current = 0;
      streamEpochRef.current = Date.now();
      vaganovaPoseEngine.reset();
      // Clear canvas immediately
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    resetPoseState(); // Always reset on effect restart (video change)

    // Seek handler – clears stale skeleton immediately
    const handleSeeked = () => {
      latestPacketRef.current = null;
      cachedAnalysisRef.current = null;
      vaganovaPoseEngine.reset();
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    videoRef.current?.addEventListener('seeked', handleSeeked);
    // ────────────────────────────────────────────────────────────────────────

    const renderLoop = () => {
      if (!isActive) return;

      const v = videoRef.current;
      const canvas = canvasRef.current;

      if (v && v.readyState >= 2 && !isPreIndexing) {
        const curTime = v.currentTime || 0;
        const timeDelta = Math.abs(curTime - lastProcessedTime);
        const shouldProcess = !v.paused || timeDelta > 0.01;

        if (shouldProcess && timeDelta > 0.005) {
          lastProcessedTime = curTime;
          const inferenceStartMs = performance.now();
          const currentMediaTimeUs = curTime * 1_000_000;

          // 1. Try pulling from Pre-Indexed Cache
          const cached = vaganovaFrameCache.getFrame(selectedDevVideoUrl, curTime);
          if (cached) {
            // Cache hit: create a synthetic packet with this frame's timestamp
            const packet: import('../types/posePacket').PosePacket = {
              streamEpoch: streamEpochRef.current,
              frameSeq: frameSeqRef.current++,
              mediaTimeUs: currentMediaTimeUs,
              inferenceStartedAtMs: inferenceStartMs,
              inferenceEndedAtMs: performance.now(),
              resultKind: 'pose',
              landmarks: cached,
              avgVisibility: cached.reduce((s, l) => s + (l.visibility ?? 1), 0) / cached.length,
            };
            latestPacketRef.current = packet;
            landmarksRef.current = cached;

            // Throttled React state update for side panels (~4fps)
            const now = performance.now();
            if (now - lastStateUpdateRef.current > 250) {
              lastStateUpdateRef.current = now;
              setDetectedLandmarks(cached);
              setIsEngineReady(true);
            }
          } else if (!isProcessingRef.current || (performance.now() - processingStartTimeRef.current > 500)) {
            // 2. Live MediaPipe Inference – "latest frame wins"
            // Timeout guard: if isProcessingRef was stuck >500ms, force-reset
            isProcessingRef.current = true;
            processingStartTimeRef.current = inferenceStartMs;
            // Capture the mediaTimeUs for THIS frame so we can tag the result
            const capturedMediaTimeUs = currentMediaTimeUs;
            const capturedEpoch = streamEpochRef.current;
            const capturedSeq = frameSeqRef.current++;

            realMediaPipePose.processFrame(v, (data: PoseResultsData) => {
              isProcessingRef.current = false;
              const inferenceEndMs = performance.now();

              if (!isActive) return; // Effect cleaned up – discard

              if (data.landmarks && data.landmarks.length >= 33) {
                // ── FRAME SYNC: Single smoothing only (MediaPipe smoothLandmarks already active)
                // One-Euro filter removed from live path to eliminate double-smoothing lag
                const lmToUse = data.landmarks; // MediaPipe internal smoothing is sufficient

                const packet: import('../types/posePacket').PosePacket = {
                  streamEpoch: capturedEpoch,
                  frameSeq: capturedSeq,
                  mediaTimeUs: capturedMediaTimeUs,
                  inferenceStartedAtMs: inferenceStartMs,
                  inferenceEndedAtMs: inferenceEndMs,
                  resultKind: 'pose',
                  landmarks: lmToUse,
                  worldLandmarks: data.worldLandmarks,
                  avgVisibility: lmToUse.reduce((s, l) => s + (l.visibility ?? 1), 0) / lmToUse.length,
                };

                // Staleness check: discard if older than what we already have
                const existing = latestPacketRef.current;
                if (existing && packet.mediaTimeUs < existing.mediaTimeUs) {
                  debugHudRef.current.droppedFrames++;
                  return; // Stale result – discard
                }

                // Update debug HUD
                debugHudRef.current.inferenceMs = inferenceEndMs - inferenceStartMs;

                latestPacketRef.current = packet;
                landmarksRef.current = lmToUse;
                if (data.worldLandmarks) worldLandmarksRef.current = data.worldLandmarks;

                // Throttled React state update
                const now = performance.now();
                if (now - lastStateUpdateRef.current > 250) {
                  lastStateUpdateRef.current = now;
                  setDetectedLandmarks(lmToUse);
                  setDetectedWorldLandmarks(data.worldLandmarks || null);
                  setIsEngineReady(true);
                }
              } else {
                // no_pose result – clear stale skeleton
                latestPacketRef.current = null;
                landmarksRef.current = null;
              }
            }).catch(() => { isProcessingRef.current = false; });
          } else {
            debugHudRef.current.skippedInferences++;
          }
        }

          // ─── CANVAS DRAW ──────────────────────────────────────────────────
          // FRAME SYNC: Only draw if we have a packet and it's not stale.
          // Stale = packet is >1 video frame old vs current video time.
          const lm = landmarksRef.current;
          const canvas2 = canvasRef.current;
          // P0-g FIX (Berater 2026-08-10): Staleness must skip draw, NOT return from rAF callback.
          // The old 'return' broke the renderLoop and stopped requestAnimationFrame.
          let skipDraw = false;
          if (canvas2 && lm && showSkeleton) {
            // ── Staleness gate ──────────────────────────────────────────────
            const packet = latestPacketRef.current;
            const currentMediaTimeUs = (v.currentTime || 0) * 1_000_000;
            const TOLERANCE_US = 66_667; // ~2 frames at 30fps tolerance for live inference
            if (packet) {
              const ageUs = currentMediaTimeUs - packet.mediaTimeUs;
              debugHudRef.current.poseAgeMs = ageUs / 1000;
              if (ageUs > TOLERANCE_US && ageUs < 5_000_000) {
                // Stale: clear canvas only, continue loop
                debugHudRef.current.syncErrorMs = ageUs / 1000;
                const ctx2 = canvas2.getContext('2d');
                if (ctx2) ctx2.clearRect(0, 0, canvas2.width, canvas2.height);
                skipDraw = true; // Skip draw this frame, but DO NOT return
              } else {
                debugHudRef.current.syncErrorMs = 0;
              }
            }
            // ───────────────────────────────────────────────────────────────

            if (!skipDraw) {
              // Resize canvas to match actual pixel dimensions
              const bounds = overlayBoundsRef.current;
              if (bounds) {
                const dpr = window.devicePixelRatio || 1;
                const cw = Math.round(bounds.width * dpr);
                const ch = Math.round(bounds.height * dpr);
                if (canvas2.width !== cw || canvas2.height !== ch) {
                  canvas2.width = cw;
                  canvas2.height = ch;
                }
              }

              // ⚡ THROTTLED ANALYSIS: max 15fps (every ~67ms) – canvas draw uses cached result at 60fps
              const nowMs = performance.now();
              const ANALYSIS_INTERVAL_MS = 67; // ~15fps
              if (nowMs - lastAnalysisTimeRef.current >= ANALYSIS_INTERVAL_MS || !cachedAnalysisRef.current) {
                lastAnalysisTimeRef.current = nowMs;
                const sk2 = vaganova3DKinematics.solve(lm, worldLandmarksRef.current, v.videoWidth, v.videoHeight);
                const motionCls2 = vaganovaMotionClassifier.classify(lm);
                vaganovaKineticAI.updateTrails(sk2, v.currentTime || 0);
                const cogPt2 = vaganovaKineticAI.computeCenterOfGravity(sk2);
                const vagAn2 = vaganovaAngleCalculator.analyzeFullFrame(lm, v.videoWidth, v.videoHeight);
                const armPos2 = vaganovaArmAnalyzer.classifyArmPosition(sk2);
                const elbowQ2 = vaganovaArmAnalyzer.analyzeElbowQuality(sk2);
                const epaul2 = vaganovaArmAnalyzer.analyzeEpaulement(sk2);
                const footAl2 = vaganovaFootAnalyzer.analyzeSickleWing(sk2);
                const wDist2 = vaganovaFootAnalyzer.analyzeWeightDistribution(sk2, cogPt2.x);
                cachedAnalysisRef.current = {
                  sk: sk2, motionCls: motionCls2, cogPt: cogPt2,
                  vagAn: vagAn2, armPos: armPos2, elbowQ: elbowQ2,
                  epaul: epaul2, footAl: footAl2, wDist: wDist2,
                  packetMediaTimeUs: packet?.mediaTimeUs ?? 0,
                };
              }

              // Canvas draw always runs at 60fps using cached analysis
              const c = cachedAnalysisRef.current;
              if (c) {
                renderSkeletonToCanvas(canvas2, c.sk, c.cogPt, c.armPos, c.elbowQ, c.epaul, c.footAl, c.wDist, {
                  showSkeleton: showSkeleton,
                  showMotionTrails,
                  showCoG,
                  showAngleArcs,
                  selectedJointId,
                  isPlie: c.motionCls.isPlie,
                  vaganovaAnalysis: c.vagAn,
                  overlayMode
                }, v.videoWidth, v.videoHeight);
              }
            } // end !skipDraw

          } else if (canvas2 && !showSkeleton) {
            const ctx2 = canvas2.getContext('2d');
            if (ctx2) ctx2.clearRect(0, 0, canvas2.width, canvas2.height);
          }
      }

      if (isActive) {
        animId = requestAnimationFrame(renderLoop);
      }
    };

    animId = requestAnimationFrame(renderLoop);

    return () => {
      isActive = false;
      if (animId) cancelAnimationFrame(animId);
      videoRef.current?.removeEventListener('seeked', handleSeeked);
    };
  }, [selectedDevVideoUrl, isPreIndexing, showSkeleton, showMotionTrails, showCoG, showAngleArcs, selectedJointId, overlayMode]);

  // ── VIDEO TIME SYNC for Scrubber ─────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrentPlayTime(v.currentTime);
    const onDur  = () => { if (v.duration && isFinite(v.duration)) setVideoDuration(v.duration); };
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('durationchange', onDur);
    v.addEventListener('loadedmetadata', onDur);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('durationchange', onDur);
      v.removeEventListener('loadedmetadata', onDur);
    };
  }, [selectedDevVideoUrl]);



  // Trigger immediate frame detection on Video Pause or Seek
  const processStaticPausedFrame = () => {
    if (videoRef.current && videoRef.current.readyState >= 2) {
      const curTime = videoRef.current.currentTime || 0;
      const cached = vaganovaFrameCache.getFrame(selectedDevVideoUrl, curTime);

      if (cached) {
        const smoothed = vaganovaPoseEngine.smoothLandmarks(cached, curTime);
        if (smoothed) {
          landmarksRef.current = smoothed;
          setDetectedLandmarks(smoothed);
          setIsEngineReady(true);
        }
      } else {
        realMediaPipePose.processFrame(videoRef.current, (data: PoseResultsData) => {
          if (data.landmarks && data.landmarks.length >= 33) {
            const smoothed = vaganovaPoseEngine.smoothLandmarks(data.landmarks, curTime);
            if (smoothed) {
              landmarksRef.current = smoothed;
              setDetectedLandmarks(smoothed);
              setIsEngineReady(true);
              if (data.worldLandmarks) {
                worldLandmarksRef.current = data.worldLandmarks;
                setDetectedWorldLandmarks(data.worldLandmarks);
              }
            }
          }
        });
      }
    }
  };

  // Handle Custom Video Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const newVid = videoStore.addCustomVideo(file);
      // CRITICAL FIX: Clear the OLD video's cache, not the new one!
      // Previously this cleared newVid.url which doesn't have a cache yet
      vaganovaFrameCache.clear(selectedDevVideoUrl);
      setVideoList(videoStore.getAllVideos());
      setSelectedDevVideoUrl(newVid.url);
      setCuePoints(vaganovaPreAnalyzer.getCuePoints(newVid.url));
      vaganovaKineticAI.reset();
      vaganovaPoseEngine.reset();
      setIsPlaying(true);
    }
  };

  // Switch Dropdown Selection
  const handleVideoSelect = (url: string) => {
    realMediaPipePose.reset();
    vaganova3DKinematics.reset();
    vaganovaKineticAI.reset();
    vaganovaPoseEngine.reset();
    setDetectedLandmarks(null);
    setDetectedWorldLandmarks(null);
    setIsEngineReady(false);
    setSelectedDevVideoUrl(url);
    setCuePoints(vaganovaPreAnalyzer.getCuePoints(url));
    setIsPlaying(true);
  };

  // Interactive Cue-Point Seek & Auto Slow-Motion Handler
  const handleSeekToCuePoint = (cue: VaganovaCuePoint) => {
    if (videoRef.current) {
      videoRef.current.currentTime = cue.timeSeconds;
      if (refVideoRef.current) refVideoRef.current.currentTime = cue.timeSeconds;
      setSelectedFrameTime(cue.timecodeStr);
      setSelectedJointId(cue.jointFocusId);
      vaganovaKineticAI.reset();

      if (cue.status === 'CORRECTION') {
        setPlaybackSpeed(0.25);
        videoRef.current.playbackRate = 0.25;
      }

      processStaticPausedFrame();

      // Lift selected cue to right panel for KI detail view
      onSelectedCue?.(cue);
    }
  };

  // 🎬 Slow-Mo Clip: spielt 3 Sekunden (real) um den Cue-Point bei 0.25x ab, dann Stopp
  const handleSlowMoClip = (cue: VaganovaCuePoint) => {
    const vid = videoRef.current;
    if (!vid) return;

    const startAt = Math.max(0, cue.timeSeconds - 0.5); // 0.5s vor dem Cue-Point
    const endAt = cue.timeSeconds + 2.5;                // 3s Video-Fenster insgesamt

    if (slowMoTimerRef.current) clearTimeout(slowMoTimerRef.current);

    vid.currentTime = startAt;
    vid.playbackRate = 0.25;
    setPlaybackSpeed(0.25);
    vid.play();
    setIsPlaying(true);

    // Auto-Stopp nach 3 Echtzeit-Sekunden (= 12s Videoinhalt)
    slowMoTimerRef.current = setTimeout(() => {
      vid.pause();
      setIsPlaying(false);
      vid.playbackRate = 1;
      setPlaybackSpeed(1);
    }, 3000);

    // Oder sofort stoppen wenn Video-Zeitmarke erreicht
    const onTimeUpdate = () => {
      if (vid.currentTime >= endAt) {
        vid.pause();
        setIsPlaying(false);
        vid.playbackRate = 1;
        setPlaybackSpeed(1);
        if (slowMoTimerRef.current) clearTimeout(slowMoTimerRef.current);
        vid.removeEventListener('timeupdate', onTimeUpdate);
      }
    };
    vid.addEventListener('timeupdate', onTimeUpdate);
  };

  // 🦴 SKELETON JOINT CLICK – hit-test landmarks + bone segments
  // Uses generic HTMLElement so it works on the container div (events bubble from AnnotationCanvas)
  const handleSkeletonClick = (e: React.MouseEvent<HTMLElement>) => {
    if (!isPlaying === false) return; // only when paused
    const lm = landmarksRef.current;
    const bounds = overlayBounds;
    if (!lm || !bounds) { setJointPopover(null); return; }

    // Get click position relative to the canvas rect (the overlay area)
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Only consider clicks that are within the overlay bounds
    if (clickX < 0 || clickY < 0 || clickX > bounds.width || clickY > bounds.height) {
      setJointPopover(null);
      return;
    }

    // Helper: distance from point P to line segment A-B
    const distToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
      const dx = bx - ax; const dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) return Math.hypot(px - ax, py - ay);
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    };

    // Bone segments: [fromLandmark, toLandmark, representativeLandmark (for popover)]
    // representativeLandmark = the joint that is most pedagogically relevant for this bone
    const BONE_SEGMENTS: Array<[number, number, number]> = [
      [11, 12, 11],  // Schulterleiste → linke Schulter
      [11, 13, 13],  // L Oberarm → L Ellbogen
      [13, 15, 15],  // L Unterarm → L Handgelenk
      [12, 14, 14],  // R Oberarm → R Ellbogen
      [14, 16, 16],  // R Unterarm → R Handgelenk
      [23, 24, 23],  // Beckenleiste → L Hüfte
      [11, 23, 23],  // L Rumpf → L Hüfte
      [12, 24, 24],  // R Rumpf → R Hüfte
      [23, 25, 25],  // L Oberschenkel → L Knie
      [25, 27, 25],  // L Unterschenkel → L Knie
      [27, 29, 27],  // L Fuß → L Knöchel
      [29, 31, 31],  // L Zehe → L Zehenspitze
      [24, 26, 26],  // R Oberschenkel → R Knie
      [26, 28, 26],  // R Unterschenkel → R Knie
      [28, 30, 28],  // R Fuß → R Knöchel
      [30, 32, 32],  // R Zehe → R Zehenspitze
    ];

    // 1️⃣ Joint point hit-test (44px radius)
    let nearestIdx = -1;
    let minDist = 44;
    lm.forEach((landmark, idx) => {
      if (!CLICKABLE_JOINT_INDICES.has(idx)) return;
      if ((landmark.visibility ?? 1) < 0.3) return;
      const px = landmark.x * bounds.width;
      const py = landmark.y * bounds.height;
      const dist = Math.hypot(px - clickX, py - clickY);
      if (dist < minDist) { minDist = dist; nearestIdx = idx; }
    });

    // 2️⃣ Bone segment hit-test (20px tolerance) – only if no joint was closer
    if (nearestIdx < 0) {
      const SEG_TOLERANCE = 20;
      let bestSegDist = SEG_TOLERANCE;
      for (const [fromIdx, toIdx, repIdx] of BONE_SEGMENTS) {
        const a = lm[fromIdx]; const b = lm[toIdx];
        if (!a || !b) continue;
        if ((a.visibility ?? 1) < 0.3 || (b.visibility ?? 1) < 0.3) continue;
        const ax = a.x * bounds.width; const ay = a.y * bounds.height;
        const bx = b.x * bounds.width; const by = b.y * bounds.height;
        const d = distToSegment(clickX, clickY, ax, ay, bx, by);
        if (d < bestSegDist && getJointKnowledge(repIdx)) {
          bestSegDist = d;
          nearestIdx = repIdx;
        }
      }
    }

    if (nearestIdx >= 0 && getJointKnowledge(nearestIdx)) {
      // Snap popover anchor to the representative joint pixel position
      const repLm = lm[nearestIdx];
      const snapX = repLm ? repLm.x * bounds.width : clickX;
      const snapY = repLm ? repLm.y * bounds.height : clickY;
      setJointPopover({ landmarkIndex: nearestIdx, pixelX: snapX, pixelY: snapY });
      // Pause video for better exploration
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    } else {
      setJointPopover(null);
    }
  };

  // 🔊 WEBSPEECH KI-SPRACHSYNTHESIZER (NICOLE'S VOICE METAPHOR)
  const handleSpeakCueMetaphor = (metaphorText: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!('speechSynthesis' in window)) {
      alert('Sprachsynthese wird von diesem Browser nicht unterstützt.');
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(metaphorText);
    utterance.lang = 'de-DE';
    utterance.pitch = 1.1;
    utterance.rate = 0.95;

    window.speechSynthesis.speak(utterance);
  };

  // TEACHER CRUD: Add Cue-Point at current video playback position
  const handleAddCuePointAtCurrentFrame = () => {
    if (!videoRef.current) return;
    const timeSec = videoRef.current.currentTime || 0;
    const mins = Math.floor(timeSec / 60);
    const secs = (timeSec % 60).toFixed(3).padStart(6, '0');
    const timecodeStr = `0${mins}:${secs}`;

    const updated = vaganovaPreAnalyzer.addCuePoint(selectedDevVideoUrl, {
      timeSeconds: timeSec,
      timecodeStr,
      poseName: `${motionClass.detectedPoseName} Marker`,
      status: 'WARNING',  // Neu hinzugefügte Notizen zunächst als "besprechungswürdig"
      scorePercent: 85,
      headline: `Lehrernotiz an ${timecodeStr}`,
      cueMetaphor: 'Korrekturhinweis von Nicole eingeben...',
      jointFocusId: selectedJointId || 'pelvis_core'
    });

    setCuePoints(updated);
  };

  // TEACHER CRUD: Start Editing
  const handleStartEdit = (cue: VaganovaCuePoint, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCueId(cue.id);
    setEditForm({
      poseName: cue.poseName,
      headline: cue.headline,
      cueMetaphor: cue.cueMetaphor,
      status: (cue.status === 'CORRECTION' || cue.status === 'WARNING') ? cue.status : 'GOOD'
    });
  };

  // TEACHER CRUD: Save Edit
  const handleSaveEdit = (cueId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = vaganovaPreAnalyzer.updateCuePoint(selectedDevVideoUrl, cueId, {
      poseName: editForm.poseName,
      headline: editForm.headline,
      cueMetaphor: editForm.cueMetaphor,
      status: editForm.status
    });
    setCuePoints(updated);
    setEditingCueId(null);
  };

  // TEACHER CRUD: Delete Cue-Point
  const handleDeleteCuePoint = (cueId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Diesen Messpunkt wirklich löschen?')) {
      const updated = vaganovaPreAnalyzer.deleteCuePoint(selectedDevVideoUrl, cueId);
      setCuePoints(updated);
    }
  };

  // Zoom Presets
  const handleZoomChange = (level: number, autoCrop: boolean = false) => {
    setZoomLevel(level);
    setIsAutoCrop(autoCrop);
    setPanOffset({ x: 0, y: 0 });
  };



  // Toggle Play/Pause
  const handleTogglePlay = () => {
    const nextPlaying = !isPlaying;
    setIsPlaying(nextPlaying);
    if (videoRef.current) {
      if (!nextPlaying) {
        videoRef.current.pause();
        if (refVideoRef.current) refVideoRef.current.pause();
        processStaticPausedFrame();
      } else {
        videoRef.current.play().catch(() => {});
        if (refVideoRef.current) refVideoRef.current.play().catch(() => {});
      }
    }
  };

  // Fullscreen: ganzer Panel (Video + Canvas + Scrubber)
  const handleToggleFullscreen = () => {
    const panel = videoPanelRef.current;
    if (!panel) return;
    if (!document.fullscreenElement) {
      panel.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // \u2500\u2500 ANNOTATION: PNG-Export (merge video + skeleton + annotation) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const handleSaveAnnotation = () => {
    const video = videoRef.current;
    const skeletonCanvas = canvasRef.current;
    const annotDataUrl = annotationCanvasRef.current?.getDataUrl();
    if (!video || !overlayBounds) return;

    const W = overlayBounds.width;
    const H = overlayBounds.height;

    // 1. Off-screen merge canvas
    const merge = document.createElement('canvas');
    merge.width = W;
    merge.height = H;
    const ctx = merge.getContext('2d');
    if (!ctx) return;

    // 2. Draw video frame (cropped to overlay bounds)
    try {
      const vW = video.videoWidth;
      const vH = video.videoHeight;
      // letterbox offset in video coords
      const scaleX = W / vW;
      const scaleY = H / vH;
      const scale = Math.min(scaleX, scaleY);
      const srcW = W / scale;
      const srcH = H / scale;
      const srcX = (vW - srcW) / 2;
      const srcY = (vH - srcH) / 2;
      ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, W, H);
    } catch {
      ctx.fillStyle = '#050407';
      ctx.fillRect(0, 0, W, H);
    }

    // 3. Skeleton canvas overlay (optional)
    if (skeletonCanvas && saveWithSkeleton) {
      ctx.drawImage(skeletonCanvas, 0, 0, W, H);
    }

    // 4. Annotation overlay
    if (annotDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, W, H);
        finalize(merge, ctx);
      };
      img.src = annotDataUrl;
    } else {
      finalize(merge, ctx);
    }

    function finalize(merge: HTMLCanvasElement, _ctx: CanvasRenderingContext2D) {
      const dataUrl = merge.toDataURL('image/png');

      // Thumbnail (30% scale)
      const thumbW = Math.round(W * 0.3);
      const thumbH = Math.round(H * 0.3);
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = thumbW;
      thumbCanvas.height = thumbH;
      const tctx = thumbCanvas.getContext('2d');
      tctx?.drawImage(merge, 0, 0, thumbW, thumbH);
      const thumbnailUrl = thumbCanvas.toDataURL('image/png');

      const timeSec = video!.currentTime;
      const m = Math.floor(timeSec / 60);
      const s = (timeSec % 60).toFixed(3).padStart(6, '0');
      const timecodeStr = `${String(m).padStart(2, '0')}:${s}`;

      const entry: AnnotationEntry = {
        id: `ann-${Date.now()}`,
        timeSeconds: timeSec,
        timecodeStr,
        dataUrl,
        thumbnailUrl,
        studentName: (document.querySelector('.monolith-card select, select') as HTMLSelectElement | null)?.value ?? undefined,
        createdAt: Date.now(),
        note: '',
      };
      setAnnotationEntries(prev => {
        const updated = [...prev, entry];
        // Open lightbox showing the new entry
        setLightboxIndex(updated.length - 1);
        setLightboxOpen(true);
        return updated;
      });
      annotationCanvasRef.current?.clear();
    }
  };

  // Update note on a saved annotation
  const handleUpdateNote = (id: string, note: string) => {
    setAnnotationEntries(prev => prev.map(e => e.id === id ? { ...e, note } : e));
  };

  // Open lightbox at a specific entry index
  const handleOpenLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };


  // Sync isFullscreen state mit Browser-Event
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Speed Control
  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) videoRef.current.playbackRate = speed;
    if (refVideoRef.current) refVideoRef.current.playbackRate = speed;
  };

  // AUTOMATIC MOTION & PERSPECTIVE KI-CLASSIFIER
  const motionClass: MotionClassificationResult = vaganovaMotionClassifier.classify(detectedLandmarks);

  // 🦴 RECONSTRUCT 3D FORWARD KINEMATICS & TEMPORAL SKELETON
  const vw = videoRef.current?.videoWidth || 1000;
  const vh = videoRef.current?.videoHeight || 1000;
  const sk: ReconstructedSkeleton = vaganova3DKinematics.solve(detectedLandmarks, detectedWorldLandmarks, vw, vh);

  // Update Kinetic AI Trajectory & Center of Gravity
  const currentVidTime = videoRef.current ? videoRef.current.currentTime : 0;
  vaganovaKineticAI.updateTrails(sk, currentVidTime);
  const cog = vaganovaKineticAI.computeCenterOfGravity(sk);

  // Generate Vaganova Curriculum & Homework Report
  const curriculumReport: VaganovaCurriculumReport = vaganovaCurriculumEngine.generatePlan(6, motionClass.detectedPoseName, 14);

  // 📐 REAL-TIME VAGANOVA ANGLE ANALYSIS (replaces hardcoded values)
  // P0 FIX: Pass video dimensions for aspect-ratio-correct angle calculation
  const videoEl = videoRef.current;
  const vaganovaAnalysis = detectedLandmarks && videoEl
    ? vaganovaAngleCalculator.analyzeFullFrame(detectedLandmarks, videoEl.videoWidth || 1, videoEl.videoHeight || 1)
    : null;

  // 🔔 Notify parent (App.tsx) with latest analysis for RightInspectorPanel
  useEffect(() => {
    onVaganovaAnalysis?.(vaganovaAnalysis);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedLandmarks]);

  // 💪 VAGANOVA ARM POSITION & ÉPAULEMENT ANALYSIS
  const armPositions = vaganovaArmAnalyzer.classifyArmPosition(sk);
  const elbowQuality = vaganovaArmAnalyzer.analyzeElbowQuality(sk);
  const epaulement = vaganovaArmAnalyzer.analyzeEpaulement(sk);

  // 🦶 VAGANOVA FOOT ALIGNMENT ANALYSIS
  const footAlignment = vaganovaFootAnalyzer.analyzeSickleWing(sk);
  const footPointe = vaganovaFootAnalyzer.analyzePointe(sk);
  const weightDist = vaganovaFootAnalyzer.analyzeWeightDistribution(sk, cog.x);


  const kHead = sk.head;
  const kNeck = sk.neck;
  const kSternum = sk.sternum;
  const kNavel = sk.navel;
  const kPelvisCenter = sk.pelvisCenter;
  const kShoulderL = sk.shoulderL;
  const kShoulderR = sk.shoulderR;
  const kElbowL = sk.elbowL;
  const kElbowR = sk.elbowR;
  const kWristL = sk.wristL;
  const kWristR = sk.wristR;
  const kPelvisL = sk.pelvisL;
  const kPelvisR = sk.pelvisR;
  const kKneeL = sk.kneeL;
  const kKneeR = sk.kneeR;
  const kAnkleL = sk.ankleL;
  const kAnkleR = sk.ankleR;

  // Feedback Object
  const currentVideoObj = videoList.find(v => v.url === selectedDevVideoUrl) || videoList[0];
  const feedbackObj: FeedbackObject = vaganovaEvidenceEngine.buildFeedbackObject(
    'Emma Berger (6 J.)',
    currentVideoObj.topic,
    selectedFrameTime,
    detectedLandmarks,
    selectedJointId,
    false // P0-FIX (Berater 2026-08-10): teacherConfirmed NIEMALS hart als true – immer false bis explizite Bestätigung
  );

  const inspectorData: JetztWichtigInspectorData = {
    studentName: feedbackObj.studentName,
    exerciseName: `${motionClass.detectedPoseName} (${motionClass.detectedPerspective === 'FRONTAL' ? 'Frontal' : 'Profil-Seite'})`,
    timestampStr: feedbackObj.timestampStr,
    findingHeadline: feedbackObj.findingHeadline,
    whyRelevant: feedbackObj.whyRelevant,
    positiveNote: feedbackObj.positiveNote,
    uncertaintyNote: feedbackObj.uncertaintyNote,
    historyComparison: feedbackObj.historyComparison,
    nextCue: feedbackObj.nextCue,
    overallVerdict: feedbackObj.overallVerdict,
    homeworkStatus: feedbackObj.homework.status,
    homeworkBlockedReason: feedbackObj.homework.blockedReason
  };

  const COLOR_GOOD = '#30d158'; // Grün = RICHTIG
  const COLOR_BAD  = '#ff453a'; // Rot  = WIRKLICH FALSCH
  const COLOR_WARN = '#ff9f0a'; // Orange = besprechungswürdig

  // Gibt die Semantik-Farbe für einen Cue-Status zurück
  const cueColor = (status: 'GOOD' | 'CORRECTION' | 'WARNING') =>
    status === 'CORRECTION' ? COLOR_BAD
    : status === 'WARNING'  ? COLOR_WARN
    : COLOR_GOOD;

  // Border-Farbe (gedimmt) für den Karten-Rand
  const cueBorderColor = (status: 'GOOD' | 'CORRECTION' | 'WARNING') =>
    status === 'CORRECTION' ? 'rgba(255, 69, 58, 0.4)'
    : status === 'WARNING'  ? 'rgba(255, 159, 10, 0.4)'
    : 'rgba(48, 209, 88, 0.3)';

  // Hintergrund-Farbe (gedimmt) für Status-Badges
  const cueBgColor = (status: 'GOOD' | 'CORRECTION' | 'WARNING') =>
    status === 'CORRECTION' ? 'rgba(255, 69, 58, 0.15)'
    : status === 'WARNING'  ? 'rgba(255, 159, 10, 0.12)'
    : 'rgba(48, 209, 88, 0.15)';

  // Status-Label mit Icon
  const cueLabel = (status: 'GOOD' | 'CORRECTION' | 'WARNING') =>
    status === 'CORRECTION' ? '🔴 FEHLER'
    : status === 'WARNING'  ? '🟠 BEOB.'
    : '🟢 GUT';

  // Helper to render glowing trajectory comet nodes
  const renderTrailNodes = (type: 'wristL' | 'wristR' | 'ankleL' | 'ankleR', color: string) => {
    const pts = vaganovaKineticAI.getTrailPoints(type);
    if (!pts || pts.length === 0) return null;
    const len = pts.length;
    return pts.map((pt, i) => {
      const alpha = ((i + 1) / len);
      const radius = 3 + alpha * 4;
      return (
        <circle
          key={`${type}-pt-${i}`}
          cx={pt.x}
          cy={pt.y}
          r={radius}
          fill={color}
          opacity={alpha * 0.85}
        />
      );
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 'calc(100vh - 32px)', height: 'calc(100dvh - 32px)', overflow: 'hidden' }}>
      
      {/* Vaganova Curriculum & Homework Modal */}
      <VaganovaCurriculumModal
        isOpen={isCurriculumModalOpen}
        onClose={() => setIsCurriculumModalOpen(false)}
        report={curriculumReport}
        studentName="Emma Berger (6 J.)"
      />

      {/* 🖼 ANNOTATION LIGHTBOX */}
      {lightboxOpen && annotationEntries.length > 0 && (
        <AnnotationLightbox
          entries={annotationEntries}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
          onNavigate={setLightboxIndex}
          onUpdateNote={handleUpdateNote}
          onSeekTo={t => {
            if (videoRef.current) {
              videoRef.current.currentTime = t;
              videoRef.current.pause();
            }
          }}
        />
      )}

      {/* JETZT WICHTIG wurde nach unten verschoben – direkt unter das Video */}

      {/* Hidden File Input for Native Video Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={handleFileUpload}
        style={{ display: 'none' }}
      />

      {/* 2️⃣ CLEAN EXECUTIVE TOOLBAR DOCK */}
      <div style={{
        background: 'rgba(15, 12, 22, 0.95)',
        border: '1px solid rgba(192, 132, 252, 0.25)',
        borderRadius: '12px',
        padding: '6px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px'
      }}>
        {/* Left: Video Selector & KI-Analyse Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select
            value={selectedDevVideoUrl}
            onChange={(e) => handleVideoSelect(e.target.value)}
            style={{
              background: 'rgba(25, 20, 35, 0.9)',
              color: '#ffffff',
              border: '1px solid rgba(192, 132, 252, 0.3)',
              borderRadius: '10px',
              padding: '5px 10px',
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: 'Montserrat',
              outline: 'none',
              cursor: 'pointer',
              maxWidth: '200px'
            }}
          >
            {videoList.map(vid => (
              <option key={vid.id} value={vid.url} style={{ background: '#1c1c1e', color: '#fff' }}>
                {vid.title}
              </option>
            ))}
          </select>

          {/* Upload – Icon-Pill */}
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Video hochladen"
            style={{
              background: 'rgba(168,129,189,0.15)',
              color: '#c084fc',
              border: '1px solid rgba(168,129,189,0.35)',
              padding: '6px 14px',
              borderRadius: '10px',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              transition: 'all 0.18s ease'
            }}
          >
            <Upload size={12} /> Upload
          </button>

          {/* ⚡ Scan-Status Indicator (ersetzt den manuellen Button) */}
          {isPreIndexing && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'rgba(48,209,88,0.12)',
              border: '1px solid rgba(48,209,88,0.3)',
              borderRadius: '10px', padding: '5px 12px',
              fontSize: '10px', fontWeight: 700, color: '#30d158'
            }}>
              <span style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: '#30d158',
                animation: 'pulse 1s ease-in-out infinite',
                flexShrink: 0
              }} />
              Skelett-Analyse {indexingProgress}%
            </div>
          )}
        </div>

        {/* Mitte: Overlay-Toggles – modernes Chip-Design */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '3px 4px', border: '1px solid rgba(255,255,255,0.08)' }}>
          {/* CoG Lot */}
          <button
            onClick={() => setShowCoG(!showCoG)}
            title="CoG – Schwerpunkt-Lot anzeigen
↑ zeigt ob der Körperschwerpunkt
  über der Standfläche liegt"
            style={{
              background: showCoG ? 'rgba(48,209,88,0.18)' : 'transparent',
              color: showCoG ? '#30d158' : 'rgba(255,255,255,0.45)',
              border: 'none',
              padding: '5px 11px',
              borderRadius: '9px',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '4px',
              transition: 'all 0.15s ease'
            }}
          >
            <Disc size={12} />
          </button>

          {/* Trajektorien */}
          <button
            onClick={() => setShowMotionTrails(!showMotionTrails)}
            title="Trajektorien – Bewegungspfade
↑ zeigt Gelenk-Bewegungsspuren
  der letzten Frames"
            style={{
              background: showMotionTrails ? 'rgba(192,132,252,0.18)' : 'transparent',
              color: showMotionTrails ? '#c084fc' : 'rgba(255,255,255,0.45)',
              border: 'none',
              padding: '5px 11px',
              borderRadius: '9px',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '4px',
              transition: 'all 0.15s ease'
            }}
          >
            <PulseIcon size={12} />
          </button>

          {/* AR-Winkel */}
          <button
            onClick={() => setShowAngleArcs(!showAngleArcs)}
            title="Winkel – Gelenk-Winkelbögen
↑ visuelle Bogen-Darstellung
  der gemessenen Winkel"
            style={{
              background: showAngleArcs ? 'rgba(255,214,10,0.15)' : 'transparent',
              color: showAngleArcs ? '#ffd60a' : 'rgba(255,255,255,0.45)',
              border: 'none',
              padding: '5px 11px',
              borderRadius: '9px',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '4px',
              transition: 'all 0.15s ease'
            }}
          >
            <Compass size={12} />
          </button>
        </div>

        {/* Rechts: View Controls – Chip-Gruppe */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '3px 4px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            onClick={() => handleZoomChange(1.0, false)}
            style={{
              background: zoomLevel === 1.0 && !isAutoCrop ? 'linear-gradient(135deg, #a881bd 0%, #8b5a8b 100%)' : 'transparent',
              color: '#ffffff',
              border: 'none',
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            1.0x
          </button>

          <button
            onClick={() => setSplitScreenMode(!splitScreenMode)}
            title="Split-Screen"
            style={{
              background: splitScreenMode ? 'rgba(192,132,252,0.18)' : 'transparent',
              color: splitScreenMode ? '#c084fc' : 'rgba(255,255,255,0.45)',
              border: 'none',
              padding: '5px 11px',
              borderRadius: '9px',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            Split
          </button>

          {/* Overlay-Modus Selector – PROJECT_DECISION 2026-08-10: volle Ampel freigegeben */}
          <div style={{ position: 'relative' }}>
            <button
              id="overlay-mode-btn"
              onClick={() => setShowOverlayMenu(!showOverlayMenu)}
              style={{
                background: overlayMode === 'lehrer-ampel'
                  ? 'linear-gradient(135deg, rgba(48,209,88,0.25) 0%, rgba(255,69,58,0.15) 100%)'
                  : overlayMode === 'anatomisch'
                  ? 'rgba(100,130,255,0.2)'
                  : 'rgba(255,255,255,0.08)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '10px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                whiteSpace: 'nowrap'
              }}
            >
              {overlayMode === 'lehrer-ampel' && <span style={{ fontSize: '10px' }}>🚦</span>}
              {overlayMode === 'anatomisch' && <span style={{ fontSize: '10px' }}>🎨</span>}
              {overlayMode === 'lehrbuch' && <span style={{ fontSize: '10px' }}>📖</span>}
              {overlayMode === 'lehrer-ampel' ? 'Lehrer-Ampel' : overlayMode === 'anatomisch' ? 'Anatomisch' : 'Lehrbuch'}
              {overlayMode === 'lehrer-ampel' && (
                <span
                  aria-label="Experimenteller Lehrer-Modus. Die Ampelfarben sind KI-Vorschläge auf Basis teilweise nicht validierter Vergleichsregeln. Nicole entscheidet über ihre fachliche Verwendung."
                  title="Experimenteller Lehrer-Modus. Die Ampelfarben sind KI-Vorschläge auf Basis teilweise nicht validierter Vergleichsregeln. Nicole entscheidet über ihre fachliche Verwendung."
                  role="img"
                  style={{ display: 'flex', alignItems: 'center', opacity: 0.8, color: '#ffd60a' }}
                >
                  <FlaskConical size={11} />
                </span>
              )}
              <span style={{ opacity: 0.6 }}>▾</span>
            </button>
            {showOverlayMenu && (
              <div style={{
                position: 'absolute', top: '110%', right: 0, zIndex: 200,
                background: '#1e1b2e', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '10px', padding: '6px', minWidth: '220px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
              }}>
                {/* Mode 1: Lehrer-Ampel */}
                <button
                  id="overlay-lehrer-ampel"
                  onClick={() => { setOverlayModeWithSave(selectedDevVideoUrl)('lehrer-ampel'); setShowOverlayMenu(false); }}
                  style={{
                    width: '100%', textAlign: 'left', background: overlayMode === 'lehrer-ampel' ? 'rgba(48,209,88,0.15)' : 'transparent',
                    color: '#fff', border: 'none', borderRadius: '7px', padding: '8px 10px',
                    cursor: 'pointer', fontSize: '11px', marginBottom: '3px'
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🚦 Lehrer-Ampel
                    <FlaskConical size={11} color="#ffd60a" />
                    {overlayMode === 'lehrer-ampel' && <span style={{ fontSize: '8px', color: '#30d158', marginLeft: 'auto' }}>⭐ Gespeichert</span>}
                  </div>
                  <div style={{ opacity: 0.65, fontSize: '9px', lineHeight: 1.4 }}>
                    Vollständige KI-Ampelheuristik. Grün/Gelb/Rot nach Vaganova. Nicole entscheidet über jeden Vorschlag. Fehlende Evidenz → Grau.
                  </div>
                </button>
                {/* Mode 2: Anatomisch */}
                <button
                  id="overlay-anatomisch"
                  onClick={() => { setOverlayModeWithSave(selectedDevVideoUrl)('anatomisch'); setShowOverlayMenu(false); }}
                  style={{
                    width: '100%', textAlign: 'left', background: overlayMode === 'anatomisch' ? 'rgba(100,130,255,0.15)' : 'transparent',
                    color: '#fff', border: 'none', borderRadius: '7px', padding: '8px 10px',
                    cursor: 'pointer', fontSize: '11px', marginBottom: '3px'
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🎨 Anatomisch
                    {overlayMode === 'anatomisch' && <span style={{ fontSize: '8px', color: '#30d158', marginLeft: 'auto' }}>⭐ Gespeichert</span>}
                  </div>
                  <div style={{ opacity: 0.6, fontSize: '9px' }}>Körperregionen-Farben. Cyan=Wirbel, Violett=Arm, Indigo=Bein. Kein Urteil.</div>
                </button>
                {/* Mode 3: Lehrbuch */}
                <button
                  id="overlay-lehrbuch"
                  onClick={() => { setOverlayModeWithSave(selectedDevVideoUrl)('lehrbuch'); setShowOverlayMenu(false); }}
                  style={{
                    width: '100%', textAlign: 'left', background: overlayMode === 'lehrbuch' ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: '#fff', border: 'none', borderRadius: '7px', padding: '8px 10px',
                    cursor: 'pointer', fontSize: '11px'
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📖 Lehrbuch
                    {overlayMode === 'lehrbuch' && <span style={{ fontSize: '8px', color: '#30d158', marginLeft: 'auto' }}>⭐ Gespeichert</span>}
                  </div>
                  <div style={{ opacity: 0.6, fontSize: '9px' }}>Monochromes Skelett ohne Farbe. Maximale Klarheit für Erklärungen.</div>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => setShowSkeleton(!showSkeleton)}
            style={{
              background: showSkeleton ? 'rgba(192, 132, 252, 0.2)' : 'transparent',
              color: showSkeleton ? '#c084fc' : 'var(--text-sub)',
              border: showSkeleton ? '1px solid rgba(192, 132, 252, 0.4)' : '1px solid rgba(255,255,255,0.1)',
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            {showSkeleton ? 'Skelett' : 'Aus'}
          </button>
        </div>
      </div>

      {/* 3️⃣ MAIN VIDEO ANALYZER WORKSPACE WITH INTERACTIVE TEACHER CUE-POINT SIDEBAR */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 360px', gap: '12px', minHeight: 0, overflow: 'hidden' }}>
        
        {/* LEFT PANEL: UNCLUTTERED MAIN VIDEO VIEWPORT */}
        <div ref={videoPanelRef} className="monolith-card" style={{ display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', padding: 0, background: isFullscreen ? '#000' : undefined }}>
          
          {/* ── ANNOTATION ROW: Thumbnails | Video | Tool Strip ── */}
          <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

            {/* LEFT: Annotation Thumbnail Strip */}
            <div style={{
              width: annotationEntries.length > 0 ? '72px' : '0px',
              transition: 'width 0.3s ease',
              overflow: 'hidden',
              flexShrink: 0,
              background: 'rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              padding: annotationEntries.length > 0 ? '8px 5px' : '0',
              overflowY: 'auto',
            }}>
              {annotationEntries.map((entry, idx) => (
                <div
                  key={entry.id}
                  onClick={() => handleOpenLightbox(idx)}
                  title={`${entry.timecodeStr}${entry.note ? ' · ' + entry.note.slice(0, 40) : ''}`}
                  style={{
                    cursor: 'pointer',
                    borderRadius: '5px',
                    overflow: 'hidden',
                    border: '1px solid rgba(192,132,252,0.35)',
                    flexShrink: 0,
                    position: 'relative',
                    transition: 'border-color 0.15s ease',
                  }}
                >
                  <img src={entry.thumbnailUrl} alt={entry.timecodeStr} style={{ display: 'block', width: '100%', height: 'auto' }} />
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    background: 'rgba(0,0,0,0.8)',
                    fontSize: '7px', fontWeight: 800, color: '#c084fc',
                    textAlign: 'center', padding: '2px',
                    fontFamily: 'monospace',
                  }}>
                    {entry.timecodeStr}
                  </div>
                  {/* Note indicator */}
                  {entry.note && (
                    <div style={{ position: 'absolute', top: 3, left: 3, width: '7px', height: '7px', borderRadius: '50%', background: '#30d158', boxShadow: '0 0 4px #30d158' }} />
                  )}
                  {/* Expand hint on hover via title – lightbox icon */}
                  <div style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.55)', borderRadius: '3px', padding: '1px 3px', fontSize: '9px', color: 'rgba(255,255,255,0.7)' }}>
                    🔍
                  </div>
                </div>
              ))}
              {annotationEntries.length > 0 && (
                <div style={{ fontSize: '7px', color: 'rgba(255,255,255,0.3)', textAlign: 'center', paddingTop: '4px' }}>
                  {annotationEntries.length} PNG{annotationEntries.length > 1 ? 's' : ''}
                </div>
              )}
            </div>

            {/* CENTER: Video Grid */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: splitScreenMode ? '1fr 1fr' : '1fr', gap: '2px', backgroundColor: '#000000', position: 'relative', overflow: 'hidden' }}>
            
            {/* VIEWPORT 1: HD BALLET VIDEO STREAM (NATIVE RELATIVE OVERLAY WRAP) */}
            <div ref={videoContainerRef} style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              overflow: 'hidden',
              background: '#050407',
              transform: `scale(${zoomLevel}) translate(${panOffset.x}%, ${panOffset.y}%)`,
              transformOrigin: 'center center',
              transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
              onClick={!isPlaying ? handleSkeletonClick : undefined}
            >

                <video
                  ref={videoRef}
                  key={selectedDevVideoUrl}
                  src={selectedDevVideoUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  onLoadedData={() => {
                    realMediaPipePose.reset();
                    vaganova3DKinematics.reset();
                    vaganovaKineticAI.reset();
                    vaganovaPoseEngine.reset();
                    computeOverlayBounds();
                    processStaticPausedFrame();
                  }}
                  onSeeked={processStaticPausedFrame}
                  onPause={processStaticPausedFrame}
                  style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
                />

                {/* Clean Watermark Logo */}
                <img
                  src="/schoenewolf_swan_logo.png"
                  alt="Swan Logo"
                  style={{ position: 'absolute', top: '20px', left: '20px', width: '60px', opacity: 0.25, pointerEvents: 'none' }}
                />

                {/* KI-Analyse Progress Overlay */}
                {isPreIndexing && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', background: 'rgba(5,4,7,0.88)', zIndex: 40, backdropFilter: 'blur(4px)' }}>
                    <Zap size={32} color="#30d158" style={{ filter: 'drop-shadow(0 0 8px #30d158)' }} />
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#ffffff', letterSpacing: '0.5px' }}>
                      ⚡ KI-Analyse: {indexingStatusStr}
                    </div>
                    <div style={{ width: '240px', height: '5px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${indexingProgress}%`, background: 'linear-gradient(90deg, #30d158, #a881bd)', borderRadius: '3px', transition: 'width 0.3s ease' }} />
                    </div>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.55)' }}>Alle Frames werden analysiert – dauert ca. 30 Sekunden</span>
                  </div>
                )}

                {/* 🎨 CANVAS SKELETON OVERLAY – 60fps direct rendering, pointerEvents always none */}
                <canvas
                  ref={canvasRef}
                  style={{
                    position: 'absolute',
                    top: overlayBounds ? `${overlayBounds.top}px` : 0,
                    left: overlayBounds ? `${overlayBounds.left}px` : 0,
                    width: overlayBounds ? `${overlayBounds.width}px` : '100%',
                    height: overlayBounds ? `${overlayBounds.height}px` : '100%',
                    pointerEvents: 'none',
                    zIndex: 25
                  }}
                />

                {/* 🎨 ANNOTATION DRAWING CANVAS – above skeleton, receives drawing events */}
                {overlayBounds && overlayBounds.width > 0 && overlayBounds.height > 0 && (
                  <AnnotationCanvas
                    ref={annotationCanvasRef}
                    width={overlayBounds.width}
                    height={overlayBounds.height}
                    isActive={!isPlaying}
                    tool={drawingTool}
                    color={drawingColor}
                    lineWidth={drawingLineWidth}
                  />
                )}
                {/* 🦴 Joint popover is rendered OUTSIDE this overflow:hidden div – see below */}

              {/* Status Badge */}
              {showSkeleton && !isEngineReady && !isPreIndexing && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(10, 8, 14, 0.85)', backdropFilter: 'blur(10px)', border: '1px solid rgba(192, 132, 252, 0.4)', padding: '10px 20px', borderRadius: '12px', color: '#ffffff', fontSize: '11px', fontWeight: 700, zIndex: 30, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={16} className="animate-spin" color="#c084fc" />
                  <span>MediaPipe Pose Engine wird am Video-Stream initialisiert...</span>
                </div>
              )}



            </div>{/* end videoContainerRef */}

            {/* 🦴 JOINT KNOWLEDGE POPOVER – position:fixed, outside all overflow:hidden containers */}
            {jointPopover && overlayBounds && (() => {
              const knowledge = getJointKnowledge(jointPopover.landmarkIndex);
              if (!knowledge) return null;
              // Compute viewport coords from the skeleton canvas bounding rect
              const canvasRect = canvasRef.current?.getBoundingClientRect();
              if (!canvasRect) return null;
              const vpJointX = canvasRect.left + jointPopover.pixelX;
              const vpJointY = canvasRect.top + jointPopover.pixelY;
              return (
                <SkeletonJointPopover
                  knowledge={knowledge}
                  jointX={vpJointX}
                  jointY={vpJointY}
                  videoLeft={canvasRect.left}
                  containerHeight={window.innerHeight}
                  vaganovaAnalysis={vaganovaAnalysis}
                  landmarkIndex={jointPopover.landmarkIndex}
                  onClose={() => setJointPopover(null)}
                />
              );
            })()}

            {/* VIEWPORT 2: MASTER REFERENCE (SPLIT-SCREEN) */}
            {splitScreenMode && (
              <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderLeft: '2px solid rgba(168,129,189,0.5)' }}>
                
                <video
                  ref={refVideoRef}
                  src="/videos/nicole_saal_5.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
                <div style={{ position: 'absolute', top: '20px', right: '16px', background: 'linear-gradient(135deg, #a881bd 0%, #8b5a8b 100%)', padding: '4px 10px', borderRadius: '8px', fontSize: '10px', fontWeight: 700, color: '#fff' }}>
                  VAGANOVA MASTER REFERENZ (100%)
                </div>

              </div>
            )}

          </div>

            {/* RIGHT: Annotation Tool Strip (visible when paused) */}
            <div style={{
              width: !isPlaying ? '52px' : '0px',
              transition: 'width 0.3s ease',
              overflow: 'hidden',
              flexShrink: 0,
              background: 'rgba(10,8,14,0.9)',
              borderLeft: !isPlaying ? '1px solid rgba(192,132,252,0.2)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              padding: !isPlaying ? '10px 6px' : '0',
            }}>
              {/* Pause indicator */}
              <div style={{ fontSize: '8px', fontWeight: 800, color: '#a881bd', letterSpacing: '0.5px', marginBottom: '4px', textAlign: 'center' }}>
                ✏️
              </div>

              {/* Tool buttons */}
              {([
                { tool: 'pen' as DrawingTool, icon: <Pen size={14} />, label: 'Stift' },
                { tool: 'arrow' as DrawingTool, icon: <ArrowRight size={14} />, label: 'Pfeil' },
                { tool: 'text' as DrawingTool, icon: <Type size={14} />, label: 'Text' },
                { tool: 'eraser' as DrawingTool, icon: <Eraser size={14} />, label: 'Radierer' },
              ] as const).map(({ tool: t, icon, label }) => (
                <button
                  key={t}
                  onClick={() => setDrawingTool(t)}
                  title={label}
                  style={{
                    width: '36px', height: '36px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    background: drawingTool === t ? 'rgba(192,132,252,0.3)' : 'rgba(255,255,255,0.06)',
                    color: drawingTool === t ? '#c084fc' : 'rgba(255,255,255,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: drawingTool === t ? '0 0 0 1px rgba(192,132,252,0.5)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >{icon}</button>
              ))}

              {/* Undo / Redo */}
              {[
                { label: 'Rückgängig', icon: <Undo2 size={14} />, action: () => annotationCanvasRef.current?.undo(), enabled: annotationCanvasRef.current?.canUndo() ?? false },
                { label: 'Wiederholen', icon: <Redo2 size={14} />, action: () => annotationCanvasRef.current?.redo(), enabled: annotationCanvasRef.current?.canRedo() ?? false },
              ].map(({ label, icon, action, enabled }) => (
                <button
                  key={label}
                  onClick={action}
                  title={label}
                  style={{
                    width: '36px', height: '36px', borderRadius: '8px', border: 'none',
                    cursor: enabled ? 'pointer' : 'not-allowed',
                    background: 'rgba(255,255,255,0.06)',
                    color: enabled ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: enabled ? 1 : 0.35,
                    transition: 'all 0.15s ease',
                  }}
                >{icon}</button>
              ))}

              <div style={{ width: '30px', height: '1px', background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />

              {/* Color swatches */}
              {['#ff453a', '#ff9f0a', '#ffd60a', '#30d158', '#64d2ff', '#c084fc', '#ffffff'].map(c => (
                <button
                  key={c}
                  onClick={() => setDrawingColor(c)}
                  title={c}
                  style={{
                    width: '22px', height: '22px', borderRadius: '50%', border: 'none', cursor: 'pointer',
                    background: c,
                    outline: drawingColor === c ? `2px solid #fff` : '2px solid transparent',
                    outlineOffset: '2px',
                    transition: 'outline 0.15s ease',
                    flexShrink: 0,
                  }}
                />
              ))}

              <div style={{ width: '30px', height: '1px', background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />

              {/* Line width */}
              {[2, 4, 7].map(w => (
                <button
                  key={w}
                  onClick={() => setDrawingLineWidth(w)}
                  title={`Stärke ${w}`}
                  style={{
                    width: '36px', height: '20px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                    background: drawingLineWidth === w ? 'rgba(192,132,252,0.3)' : 'rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ width: '18px', height: `${w}px`, background: drawingColor, borderRadius: `${w}px` }} />
                </button>
              ))}

              <div style={{ width: '30px', height: '1px', background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />

              {/* Skeleton toggle */}
              <button
                onClick={() => setSaveWithSkeleton(v => !v)}
                title={saveWithSkeleton ? 'Skelett ausblenden beim Speichern' : 'Skelett einblenden beim Speichern'}
                style={{
                  width: '36px', height: '36px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  background: saveWithSkeleton ? 'rgba(48,209,88,0.18)' : 'rgba(255,255,255,0.06)',
                  color: saveWithSkeleton ? '#30d158' : 'rgba(255,255,255,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '14px',
                  transition: 'all 0.2s ease',
                  boxShadow: saveWithSkeleton ? '0 0 6px rgba(48,209,88,0.3)' : 'none',
                }}
              >🦴</button>

              {/* Save PNG */}
              <button
                onClick={handleSaveAnnotation}
                title="Als PNG speichern"
                style={{
                  width: '36px', height: '36px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #a881bd 0%, #8b5a8b 100%)',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 8px rgba(168,129,189,0.5)',
                }}
              ><ImageDown size={14} /></button>

              {/* Clear */}
              <button
                onClick={() => annotationCanvasRef.current?.clear()}
                title="Zeichnung löschen"
                style={{
                  width: '36px', height: '36px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  background: 'rgba(255,69,58,0.15)',
                  color: '#ff453a', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              ><X size={14} /></button>
            </div>

          </div>{/* end ANNOTATION ROW flex */}

          {/* JETZT WICHTIG – direkt unter Video, keine separate Zeile nötig */}
          <JetztWichtigInspector data={inspectorData} />

          {/* BOTTOM TIMELINE & CONTROLS DOCK */}
          <div style={{ padding: '10px 18px', background: 'rgba(10, 8, 14, 0.95)', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <button
                onClick={handleTogglePlay}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #a881bd 0%, #8b5a8b 100%)',
                  border: 'none',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                {isPlaying ? <Pause size={16} fill="#ffffff" /> : <Play size={16} fill="#ffffff" style={{ marginLeft: '2px' }} />}
              </button>

              {/* ── LIVE SCRUBBER mit Cue-Point-Diamonds ───────────────── */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', padding: '0 4px' }}>
                {/* Zeit-Labels */}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#c084fc', fontWeight: 700 }}>
                    {String(Math.floor(currentPlayTime / 60)).padStart(2,'0')}:{(currentPlayTime % 60).toFixed(3).padStart(6,'0')}
                  </span>
                  <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)' }}>
                    {String(Math.floor(videoDuration / 60)).padStart(2,'0')}:{(videoDuration % 60).toFixed(3).padStart(6,'0')}
                  </span>
                </div>
                {/* Track + Cue-Diamonds */}
                <div style={{ position: 'relative', height: '24px', display: 'flex', alignItems: 'center' }}>
                  {/* Hintergrund-Track */}
                  <div style={{
                    position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)',
                    height: '4px', background: 'rgba(255,255,255,0.12)', borderRadius: '4px', overflow: 'visible'
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${videoDuration > 0 ? (currentPlayTime / videoDuration) * 100 : 0}%`,
                      background: 'linear-gradient(90deg, #c084fc 0%, #a855f7 100%)',
                      borderRadius: '4px',
                      transition: isScrubbing ? 'none' : 'width 0.1s linear'
                    }} />
                  </div>
                  {/* Cue-Point Diamonds */}
                  {cuePoints.map((cue) => {
                    const pct = videoDuration > 0 ? (cue.timeSeconds / videoDuration) * 100 : 0;
                    const isActive = Math.abs(currentPlayTime - cue.timeSeconds) < 0.35;
                    return (
                      <button
                        key={cue.id}
                        title={`${cue.timecodeStr} · ${cue.poseName}`}
                        onClick={() => handleSeekToCuePoint(cue)}
                        style={{
                          position: 'absolute',
                          left: `${pct}%`,
                          transform: 'translate(-50%, 0)',
                          width: isActive ? '13px' : '9px',
                          height: isActive ? '13px' : '9px',
                          background: cue.status === 'CORRECTION' ? '#ff453a' : '#30d158',
                          border: isActive ? '2px solid #fff' : '1.5px solid rgba(255,255,255,0.55)',
                          borderRadius: '2px',
                          rotate: '45deg',
                          cursor: 'pointer',
                          zIndex: 3,
                          transition: 'all 0.15s ease',
                          boxShadow: isActive ? (cue.status === 'CORRECTION' ? '0 0 8px #ff453a88' : '0 0 8px #30d15888') : 'none',
                          padding: 0
                        }}
                      />
                    );
                  })}
                  {/* Transparentes Scrub-Input über dem Track */}
                  <input
                    type="range"
                    min={0}
                    max={videoDuration || 5}
                    step={0.001}
                    value={currentPlayTime}
                    onMouseDown={() => {
                      setIsScrubbing(true);
                      // Sofort pausieren beim Anfassen
                      if (videoRef.current) videoRef.current.pause();
                      if (refVideoRef.current) refVideoRef.current.pause();
                      setIsPlaying(false);
                    }}
                    onMouseUp={() => {
                      setIsScrubbing(false);
                      // Bleibt pausiert – Play-Button startet neu
                      processStaticPausedFrame();
                    }}
                    onTouchStart={() => {
                      setIsScrubbing(true);
                      if (videoRef.current) videoRef.current.pause();
                      if (refVideoRef.current) refVideoRef.current.pause();
                      setIsPlaying(false);
                    }}
                    onTouchEnd={() => {
                      setIsScrubbing(false);
                      processStaticPausedFrame();
                    }}
                    onChange={(e) => {
                      const t = parseFloat(e.target.value);
                      setCurrentPlayTime(t);
                      if (videoRef.current) {
                        videoRef.current.currentTime = t;
                        if (refVideoRef.current) refVideoRef.current.currentTime = t;
                      }
                    }}
                    style={{
                      position: 'absolute', left: 0, right: 0, width: '100%',
                      opacity: 0, height: '24px', cursor: 'pointer', zIndex: 4,
                      margin: 0, padding: 0
                    }}
                  />

                </div>
              </div>

              <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.05)', padding: '2px', borderRadius: '8px' }}>
                {[0.25, 0.5, 1.0].map(sp => (
                  <button
                    key={sp}
                    onClick={() => handleSpeedChange(sp)}
                    style={{
                      background: playbackSpeed === sp ? 'linear-gradient(135deg, #a881bd 0%, #8b5a8b 100%)' : 'transparent',
                      color: '#ffffff',
                      border: 'none',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '10px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {sp}x
                  </button>
                ))}
              </div>

              {/* Vollbild-Button – sichtbarer */}
              <button
                onClick={handleToggleFullscreen}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(192,132,252,0.2)';
                  e.currentTarget.style.borderColor = 'rgba(192,132,252,0.7)';
                  e.currentTarget.style.color = '#c084fc';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(192,132,252,0.08)';
                  e.currentTarget.style.borderColor = 'rgba(192,132,252,0.35)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                }}
                title={isFullscreen ? 'Vollbild beenden (ESC)' : 'Vollbild – Video + Skelett'}
                style={{
                  background: 'rgba(192,132,252,0.08)',
                  border: '1px solid rgba(192,132,252,0.35)',
                  color: 'rgba(255,255,255,0.7)',
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 0.2s ease'
                }}
              >
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>

            </div>

          </div>

        </div>

        {/* RIGHT PANEL: INTERACTIVE TEACHER CUE-POINT MANAGER */}
        <div className="monolith-card" style={{ display: 'flex', flexDirection: 'column', padding: '16px', gap: '14px', background: 'rgba(10, 8, 14, 0.98)', border: '1px solid rgba(192, 132, 252, 0.3)', overflow: 'hidden' }}>
          
          {/* Header & Add Button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ListVideo size={18} color="#c084fc" />
              <div>
                <h3 className="font-montserrat" style={{ fontSize: '12px', fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>
                  Cue-Point Manager
                </h3>
                <p style={{ fontSize: '9px', color: 'var(--text-sub)', margin: 0 }}>
                  Nicole's Korrektur-Notizen
                </p>
              </div>
            </div>

            <button
              onClick={handleAddCuePointAtCurrentFrame}
              disabled={isPreIndexing}
              style={{
                background: isPreIndexing
                  ? 'rgba(168,129,189,0.15)'
                  : 'linear-gradient(135deg, #a881bd 0%, #8b5a8b 100%)',
                color: isPreIndexing ? 'rgba(255,255,255,0.3)' : '#ffffff',
                border: 'none',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '10px',
                fontWeight: 800,
                cursor: isPreIndexing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                boxShadow: isPreIndexing ? 'none' : '0 0 10px rgba(168,129,189,0.4)'
              }}
            >
              <Plus size={12} /> Marker
            </button>
          </div>

          {/* KI-ANALYSE-REPORT (erscheint nach Pre-Scan automatisch) */}
          {analysisReport && (
            <div style={{
              background: 'rgba(168,129,189,0.07)',
              border: '1px solid rgba(168,129,189,0.25)',
              borderRadius: '10px',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              {/* Report-Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, color: '#a881bd', letterSpacing: '0.5px' }}>
                  🤖 KI-ANALYSE-REPORT
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {analysisReport.strengths.length > 0 && (
                    <span style={{ fontSize: '9px', fontWeight: 700, color: '#30d158', background: 'rgba(48,209,88,0.12)', padding: '2px 7px', borderRadius: '6px' }}>
                      ✅ {analysisReport.strengths.length} Stärke{analysisReport.strengths.length > 1 ? 'n' : ''}
                    </span>
                  )}
                  {analysisReport.corrections.length > 0 && (
                    <span style={{ fontSize: '9px', fontWeight: 700, color: '#ff453a', background: 'rgba(255,69,58,0.12)', padding: '2px 7px', borderRadius: '6px' }}>
                      ⚠️ {analysisReport.corrections.length} Korrektur{analysisReport.corrections.length > 1 ? 'en' : ''}
                    </span>
                  )}
                </div>
              </div>

              {/* Stärken */}
              {analysisReport.strengths.length > 0 && (
                <div>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: '#30d158', marginBottom: '3px' }}>STÄRKEN</div>
                  {analysisReport.strengths.map((s, i) => (
                    <div key={i} style={{ fontSize: '10px', color: 'rgba(255,255,255,0.8)', display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span>• {s.label}</span>
                      <span style={{ color: '#30d158', fontWeight: 700 }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Korrekturen */}
              {analysisReport.corrections.length > 0 && (
                <div>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: '#ff453a', marginBottom: '3px' }}>KORREKTUREN</div>
                  {analysisReport.corrections.map((c, i) => (
                    <div key={i} style={{ fontSize: '10px', color: 'rgba(255,255,255,0.8)', display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span>• {c.label}</span>
                      <span style={{ color: '#ff453a', fontWeight: 700, fontFamily: 'monospace' }}>{c.timecode} · {c.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Footer */}
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '5px' }}>
                {analysisReport.framesAnalyzed} Frames analysiert · {analysisReport.durationSec.toFixed(1)}s Video
              </div>
            </div>
          )}

          {/* Cue Points List */}
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px', minHeight: 0, flex: 1 }}>

            {/* Loading-Placeholder während KI-Analyse */}
            {isPreIndexing ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: '12px', padding: '32px 16px', flex: 1
              }}>
                {/* Pulsing Zap */}
                <div style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>
                  <Zap size={28} color="#a881bd" style={{ filter: 'drop-shadow(0 0 6px #a881bd55)' }} />
                </div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 1.5 }}>
                  KI analysiert Video…
                </div>
                <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', textAlign: 'center', lineHeight: 1.6 }}>
                  Marker werden nach der Analyse<br />automatisch angezeigt.
                </div>
                {/* Shimmer Skeleton-Lines */}
                {[80, 65, 72].map((w, i) => (
                  <div key={i} style={{
                    height: '36px', borderRadius: '8px', width: `${w}%`,
                    background: 'linear-gradient(90deg, rgba(168,129,189,0.06) 0%, rgba(168,129,189,0.12) 50%, rgba(168,129,189,0.06) 100%)',
                    backgroundSize: '200% 100%',
                    animation: `shimmer 1.8s ease-in-out ${i * 0.2}s infinite`,
                    border: '1px solid rgba(168,129,189,0.1)'
                  }} />
                ))}
                <style>{`
                  @keyframes shimmer {
                    0%   { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                  }
                `}</style>
              </div>
            ) : cuePoints.map((cue) => {
              const isSelected = selectedFrameTime === cue.timecodeStr;
              const isEditing = editingCueId === cue.id;

              if (isEditing) {
                return (
                  <div
                    key={cue.id}
                    style={{
                      background: 'rgba(30, 20, 45, 0.95)',
                      border: '1px solid #c084fc',
                      borderRadius: '10px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: '#c084fc' }}>✏️ Marker bei {cue.timecodeStr} bearbeiten</span>
                      <button onClick={() => setEditingCueId(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}>
                        <X size={12} />
                      </button>
                    </div>

                    <input
                      type="text"
                      value={editForm.poseName}
                      onChange={e => setEditForm({ ...editForm, poseName: e.target.value })}
                      placeholder="Posen-Titel..."
                      style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '4px 8px', borderRadius: '6px', fontSize: '10px' }}
                    />

                    <input
                      type="text"
                      value={editForm.headline}
                      onChange={e => setEditForm({ ...editForm, headline: e.target.value })}
                      placeholder="Befund / Fehler..."
                      style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '4px 8px', borderRadius: '6px', fontSize: '10px' }}
                    />

                    <textarea
                      value={editForm.cueMetaphor}
                      onChange={e => setEditForm({ ...editForm, cueMetaphor: e.target.value })}
                      placeholder="Pädagogische Metapher..."
                      rows={2}
                      style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '4px 8px', borderRadius: '6px', fontSize: '10px' }}
                    />

                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => setEditForm({ ...editForm, status: 'GOOD' })}
                        style={{ background: editForm.status === 'GOOD' ? 'rgba(48,209,88,0.35)' : 'transparent', color: editForm.status === 'GOOD' ? '#30d158' : 'rgba(255,255,255,0.5)', border: '1px solid #30d158', padding: '2px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        🟢 GUT
                      </button>
                      <button
                        onClick={() => setEditForm({ ...editForm, status: 'WARNING' })}
                        style={{ background: editForm.status === 'WARNING' ? 'rgba(255,159,10,0.35)' : 'transparent', color: editForm.status === 'WARNING' ? '#ff9f0a' : 'rgba(255,255,255,0.5)', border: '1px solid #ff9f0a', padding: '2px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        🟠 BEOBACHTEN
                      </button>
                      <button
                        onClick={() => setEditForm({ ...editForm, status: 'CORRECTION' })}
                        style={{ background: editForm.status === 'CORRECTION' ? 'rgba(255,69,58,0.35)' : 'transparent', color: editForm.status === 'CORRECTION' ? '#ff453a' : 'rgba(255,255,255,0.5)', border: '1px solid #ff453a', padding: '2px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        🔴 FEHLER
                      </button>
                    </div>

                    <button
                      onClick={(e) => handleSaveEdit(cue.id, e)}
                      style={{ background: 'linear-gradient(135deg, #a881bd 0%, #8b5a8b 100%)', color: '#fff', border: 'none', padding: '6px', borderRadius: '6px', fontSize: '10px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginTop: '4px' }}
                    >
                      <Save size={12} /> Speichern
                    </button>
                  </div>
                );
              }

              const isExpanded = expandedCueIds.has(cue.id);

              return (
                <div
                  key={cue.id}
                  style={{
                    background: isSelected ? 'rgba(192, 132, 252, 0.18)' : 'rgba(255, 255, 255, 0.03)',
                    border: isSelected
                      ? '1px solid #c084fc'
                      : `1px solid ${cueBorderColor(cue.status)}`,
                    borderRadius: '10px',
                    overflow: 'hidden',
                    flexShrink: 0,
                    transition: 'border-color 0.2s ease, background 0.2s ease',
                    opacity: cue.provenance === 'nicole_rejected' ? 0.45 : 1,
                  }}
                >
                  {/* ─── ACCORDION HEADER (immer sichtbar) ─── */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '9px 12px',
                    }}
                  >
                    {/* Links: Chevron + Timecode + Name – klickbar fürs Akkordion */}
                    <div
                      onClick={() => { toggleCueExpanded(cue.id); handleSeekToCuePoint(cue); }}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1, cursor: 'pointer', userSelect: 'none' }}
                    >
                      {/* Chevron */}
                      <span style={{
                        fontSize: '9px', color: '#c084fc', opacity: 0.7,
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                        display: 'inline-block', flexShrink: 0
                      }}>▶</span>
                      <span style={{ fontSize: '10px', fontFamily: 'monospace', fontWeight: 800, color: '#c084fc', background: 'rgba(192,132,252,0.15)', padding: '2px 6px', borderRadius: '4px', flexShrink: 0 }}>
                        {cue.timecodeStr}
                      </span>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '1.2', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {cue.poseName.replace(/\s*\(KI erkannt\)/gi, '').replace(/\s*\(KI\s+\w+\)/gi, '')}{cue.isCustom ? ' ✏️' : ''}
                        {cue.provenance === 'ki_suggestion' && <span style={{ color: '#ffd60a', fontSize: '9px', flexShrink: 0 }}><FlaskConical size={9} style={{ display: 'inline', verticalAlign: 'middle' }} /></span>}
                        {cue.provenance === 'nicole_confirmed' && <span style={{ color: '#30d158', fontSize: '8px', flexShrink: 0 }}>✓</span>}
                        {cue.provenance === 'nicole_rejected' && <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '8px', flexShrink: 0 }}>✕</span>}
                      </span>
                    </div>
                    {/* Rechts: Status-Dot + Edit/Delete – eigener Klick-Bereich, kein Toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                      {/* Status-Dot: kompakter als Badge */}
                      <span
                        title={cueLabel(cue.status)}
                        style={{
                          display: 'inline-block',
                          width: '9px', height: '9px',
                          borderRadius: '50%',
                          background: cueColor(cue.status),
                          boxShadow: `0 0 5px ${cueColor(cue.status)}99`,
                          flexShrink: 0,
                        }}
                      />
                      <button onClick={(e) => handleStartEdit(cue, e)} title="Bearbeiten"
                        style={{ background: 'transparent', border: 'none', color: '#c084fc', cursor: 'pointer', padding: '2px' }}>
                        <Edit2 size={11} />
                      </button>
                      <button onClick={(e) => handleDeleteCuePoint(cue.id, e)} title="Löschen"
                        style={{ background: 'transparent', border: 'none', color: '#ff453a', cursor: 'pointer', padding: '2px' }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>

                  {/* ─── ACCORDION BODY (nur wenn aufgeklappt) ─── */}
                  {isExpanded && (
                    <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>

                  <div style={{ fontSize: '11px', fontWeight: 700, color: cueColor(cue.status), display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {cue.status === 'CORRECTION' ? <AlertTriangle size={12} color={COLOR_BAD} />
                     : cue.status === 'WARNING' ? <AlertTriangle size={12} color={COLOR_WARN} />
                     : <CheckCircle size={12} color={COLOR_GOOD} />}
                    <span>{cue.headline}</span>
                  </div>

                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.85)', fontStyle: 'italic', background: 'rgba(0,0,0,0.4)', padding: '8px 10px', borderRadius: '8px', marginTop: '2px' }}>
                    💡 "{cue.cueMetaphor}"
                  </div>

                  {/* KI-Note + Referenzbild (nur bei KI_AUTO Cue-Points) */}
                  {cue.dataSource === 'KI_AUTO' && cue.kiNote && (
                    <div style={{
                      background: 'rgba(168,129,189,0.07)',
                      border: '1px solid rgba(168,129,189,0.18)',
                      borderRadius: '7px', padding: '7px 10px',
                      marginTop: '2px',
                      display: 'flex', flexDirection: 'column', gap: '4px'
                    }}>
                      <div style={{ fontSize: '8px', fontWeight: 800, color: '#a881bd', letterSpacing: '0.6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        🤖 KI-ANALYSE
                        {cue.referenceImageKey && (
                          <span style={{ fontSize: '8px', color: 'rgba(192,132,252,0.6)', fontWeight: 600 }}>
                            · {cue.referenceImageKey.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.45 }}>
                        {cue.kiNote}
                      </div>
                    </div>
                  )}

                  {/* ── PROVENANCE: KI-Vorschlag Review-Buttons (PROJECT_DECISION 2026-08-10) ── */}
                  {cue.provenance === 'ki_suggestion' && (
                    <div style={{
                      background: 'rgba(255,214,10,0.06)',
                      border: '1px solid rgba(255,214,10,0.25)',
                      borderRadius: '8px', padding: '8px 10px', marginTop: '4px'
                    }}>
                      <div style={{ fontSize: '8px', fontWeight: 800, color: '#ffd60a', letterSpacing: '0.5px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <FlaskConical size={10} />
                        KI-VORSCHLAG – Nicoles Entscheidung ausstehend
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        <button onClick={(e) => { e.stopPropagation(); setCuePoints(prev => prev.map(c => c.id === cue.id ? { ...c, provenance: 'nicole_confirmed' as const } : c)); }}
                          style={{ background: 'rgba(48,209,88,0.2)', border: '1px solid rgba(48,209,88,0.5)', color: '#30d158', padding: '3px 8px', borderRadius: '5px', fontSize: '9px', fontWeight: 800, cursor: 'pointer' }}
                        >✓ Übernehmen</button>
                        <button onClick={(e) => { e.stopPropagation(); handleStartEdit(cue, e); }}
                          style={{ background: 'rgba(192,132,252,0.15)', border: '1px solid rgba(192,132,252,0.4)', color: '#c084fc', padding: '3px 8px', borderRadius: '5px', fontSize: '9px', fontWeight: 800, cursor: 'pointer' }}
                        >✏ Bearbeiten</button>
                        <button onClick={(e) => { e.stopPropagation(); setCuePoints(prev => prev.map(c => c.id === cue.id ? { ...c, provenance: 'nicole_rejected' as const } : c)); }}
                          style={{ background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.3)', color: '#ff453a', padding: '3px 8px', borderRadius: '5px', fontSize: '9px', fontWeight: 800, cursor: 'pointer' }}
                        >✕ Ablehnen</button>
                        <button onClick={(e) => { e.stopPropagation(); setCuePoints(prev => prev.map(c => c.id === cue.id ? { ...c, provenance: 'nicole_confirmed' as const, nicoleAction: 'strength' as const, status: 'GOOD' } : c)); }}
                          style={{ background: 'rgba(48,209,88,0.1)', border: '1px solid rgba(48,209,88,0.3)', color: 'rgba(255,255,255,0.7)', padding: '3px 8px', borderRadius: '5px', fontSize: '9px', cursor: 'pointer' }}
                        >⭐ Als Stärke</button>
                        <button onClick={(e) => { e.stopPropagation(); setCuePoints(prev => prev.map(c => c.id === cue.id ? { ...c, provenance: 'nicole_confirmed' as const, nicoleAction: 'correction' as const, status: 'CORRECTION' } : c)); }}
                          style={{ background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.3)', color: 'rgba(255,255,255,0.7)', padding: '3px 8px', borderRadius: '5px', fontSize: '9px', cursor: 'pointer' }}
                        >⚠ Als Korrektur</button>
                      </div>
                    </div>
                  )}

                  {/* Freigabe nach Nicole-Bestätigung */}
                  {(cue.provenance === 'nicole_confirmed' || cue.provenance === 'nicole_edited') && (
                    <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: '8px', color: '#30d158', fontWeight: 800 }}>✓ Bestätigt</span>
                      <button onClick={(e) => { e.stopPropagation(); setCuePoints(prev => prev.map(c => c.id === cue.id ? { ...c, learnerVisible: !c.learnerVisible } : c)); }}
                        style={{ background: cue.learnerVisible ? 'rgba(48,209,88,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${cue.learnerVisible ? 'rgba(48,209,88,0.5)' : 'rgba(255,255,255,0.15)'}`, color: cue.learnerVisible ? '#30d158' : 'rgba(255,255,255,0.45)', padding: '2px 7px', borderRadius: '5px', fontSize: '8px', fontWeight: 800, cursor: 'pointer' }}
                      >{cue.learnerVisible ? '👁 Lernende: an' : '👁 Für Lernende'}</button>
                      <button onClick={(e) => { e.stopPropagation(); setCuePoints(prev => prev.map(c => c.id === cue.id ? { ...c, parentVisible: !c.parentVisible } : c)); }}
                        style={{ background: cue.parentVisible ? 'rgba(48,209,88,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${cue.parentVisible ? 'rgba(48,209,88,0.5)' : 'rgba(255,255,255,0.15)'}`, color: cue.parentVisible ? '#30d158' : 'rgba(255,255,255,0.45)', padding: '2px 7px', borderRadius: '5px', fontSize: '8px', fontWeight: 800, cursor: 'pointer' }}
                      >{cue.parentVisible ? '👨‍👩‍👧 Eltern: an' : '👨‍👩‍👧 Für Eltern'}</button>
                    </div>
                  )}

                  {/* Abgelehnter Vorschlag – kollabiert, grau, zur Nachvollziehbarkeit */}
                  {cue.provenance === 'nicole_rejected' && (
                    <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.3)', fontWeight: 600, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>✕ Von Nicole abgelehnt</span>
                      <button onClick={(e) => { e.stopPropagation(); setCuePoints(prev => prev.map(c => c.id === cue.id ? { ...c, provenance: 'ki_suggestion' as const } : c)); }}
                        style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '8px', cursor: 'pointer' }}
                      >↩ Rückgängig</button>
                    </div>
                  )}

                    {/* Frame anspringen */}
                    <div
                      onClick={(e) => { e.stopPropagation(); handleSlowMoClip(cue); }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', fontSize: '9px', fontWeight: 700, color: '#c084fc', marginTop: '4px', cursor: 'pointer', userSelect: 'none' }}
                    >
                      <span>Frame (Slow-Mo 0.25x) anspringen</span>
                      <ChevronRight size={10} />
                    </div>

                  </div>)}{/* end isExpanded accordion body */}

                </div>
              );
            })}
            {!isPreIndexing && cuePoints.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '24px 16px', color: 'rgba(255,255,255,0.3)', fontSize: '10px', textAlign: 'center' }}>
                <ListVideo size={20} color="rgba(192,132,252,0.3)" />
                <span>Noch keine Marker.<br />Drücke <strong style={{color:'#c084fc'}}>+ Marker</strong> um einen anzulegen.</span>
              </div>
            )}
            {/* end isPreIndexing ternary – map above closes with }) */}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px' }}>
            <button
              onClick={() => setCuePoints(vaganovaPreAnalyzer.resetToDefaults(selectedDevVideoUrl))}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-sub)', fontSize: '9px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <RotateCcw size={10} /> KI-Standwerte zurücksetzen
            </button>
            
            {/* Hausaufgabe: nur wenn BUILD_POLICY erlaubt (Berater: harte Schranke) */}
            <button
              onClick={BUILD_POLICY.allowHomeworkGeneration ? () => setIsCurriculumModalOpen(true) : undefined}
              disabled={!BUILD_POLICY.allowHomeworkGeneration}
              title={!BUILD_POLICY.allowHomeworkGeneration
                ? 'Hausaufgaben-Generierung deaktiviert – DecisionGate + Mocap-Validierung ausstehend (BUILD_POLICY v' + BUILD_POLICY.policyVersion + ')'
                : 'Vaganova Lehrplan & Hausaufgaben generieren'}
              style={{
                background: BUILD_POLICY.allowHomeworkGeneration
                  ? 'linear-gradient(135deg, #c084fc 0%, #7e22ce 100%)'
                  : 'rgba(107,114,128,0.3)',
                color: BUILD_POLICY.allowHomeworkGeneration ? '#fff' : '#6b7280',
                border: BUILD_POLICY.allowHomeworkGeneration ? 'none' : '1px solid rgba(107,114,128,0.4)',
                padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 800,
                cursor: BUILD_POLICY.allowHomeworkGeneration ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', gap: '4px', opacity: BUILD_POLICY.allowHomeworkGeneration ? 1 : 0.55
              }}
            >
              <BookOpen size={11} /> Hausaufgabe {BUILD_POLICY.allowHomeworkGeneration ? '(AI)' : '(deaktiviert)'}
            </button>
          </div>

        </div>

      </div>

    </div>
  );
};
