import React, { useState, useRef, useEffect } from 'react';
import { Activity, Camera, SplitSquareVertical, Layers, Sliders, Play, Pause, Send, Sparkles, Upload, AlertTriangle, CheckCircle, ZoomIn, ZoomOut, Maximize2, Minimize2, Box, ListVideo, ChevronRight, Plus, Edit2, Trash2, Save, X, RotateCcw, Volume2, Compass, Eye, Activity as PulseIcon, Disc, BookOpen, Zap } from 'lucide-react';
import { JetztWichtigInspector } from './JetztWichtigInspector';
import { JetztWichtigInspectorData, FeedbackObject } from '../types';
import { videoStore, StoredVideoItem } from '../services/videoStore';
import { realMediaPipePose, PoseLandmark, PoseResultsData } from '../services/realMediaPipePose';
import { vaganovaPoseEngine } from '../services/vaganovaPoseEngine';
import { vaganovaEvidenceEngine } from '../services/vaganovaEvidenceEngine';
import { vaganovaMotionClassifier, MotionClassificationResult } from '../services/vaganovaMotionClassifier';
import { vaganova3DKinematics, ReconstructedSkeleton } from '../services/vaganova3DKinematics';
import { vaganovaPreAnalyzer, VaganovaCuePoint } from '../services/vaganovaPreAnalyzer';
import { vaganovaKineticAI } from '../services/vaganovaKineticAI';
import { vaganovaCurriculumEngine, VaganovaCurriculumReport } from '../services/vaganovaCurriculumEngine';
import { vaganovaFrameCache } from '../services/vaganovaFrameCache';
import { vaganovaAngleCalculator, VaganovaFullAnalysis } from '../services/vaganovaAngleCalculator';
import { vaganovaArmAnalyzer } from '../services/vaganovaArmAnalyzer';
import { vaganovaFootAnalyzer } from '../services/vaganovaFootAnalyzer';
import { renderSkeletonToCanvas, CanvasRenderOptions } from '../services/skeletonCanvasRenderer';
import { VaganovaCurriculumModal } from './VaganovaCurriculumModal';
import { BUILD_POLICY } from '../config/buildPolicy';

interface VideoAnalyzerProps {
  onVaganovaAnalysis?: (va: VaganovaFullAnalysis | null) => void;
}

export const VideoAnalyzer: React.FC<VideoAnalyzerProps> = ({ onVaganovaAnalysis }) => {
  // Video Controls State
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [showSkeleton, setShowSkeleton] = useState<boolean>(true);
  const [showAngleArcs, setShowAngleArcs] = useState<boolean>(true);
  const [showMotionTrails, setShowMotionTrails] = useState<boolean>(true);
  const [showCoG, setShowCoG] = useState<boolean>(true);
  // Overlay-Modus (Berater-kompatibel + Nicole-freundlich)
  // 'anatomisch'   = nur Körperregionen-Farben, kein Urteil (Berater-Sprint0)
  // 'lehrer-ampel' = Ampelfarben aus Rohwerten (display-only, nicht validiert)
  // 'lehrbuch'     = monochromes weiß, keine Ablenkung
  const [overlayMode, setOverlayMode] = useState<'anatomisch' | 'lehrer-ampel' | 'lehrbuch'>('lehrer-ampel');
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

  // AI & TEACHER EDITABLE CUE-POINTS STATE
  const [cuePoints, setCuePoints] = useState<VaganovaCuePoint[]>(
    vaganovaPreAnalyzer.getCuePoints(selectedDevVideoUrl)
  );

  // VIDEO SCRUBBER STATE
  const [videoDuration, setVideoDuration] = useState<number>(5.0);
  const [currentPlayTime, setCurrentPlayTime] = useState<number>(0);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);

  // EDIT MODAL / INLINE FORM STATE
  const [editingCueId, setEditingCueId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ poseName: string; headline: string; cueMetaphor: string; status: 'GOOD' | 'CORRECTION' }>({
    poseName: '',
    headline: '',
    cueMetaphor: '',
    status: 'GOOD'
  });

  // VAGANOVA CURRICULUM MODAL STATE
  const [isCurriculumModalOpen, setIsCurriculumModalOpen] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const refVideoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isProcessingRef = useRef<boolean>(false);
  const processingStartTimeRef = useRef<number>(0);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const videoPanelRef = useRef<HTMLDivElement>(null); // Outer panel: Video + Canvas + Scrubber
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
        setIndexingStatusStr(`Pre-Scan Frame ${step}/${total} (${percent}%)`);
      }
    );

    setIsPreIndexing(false);
    setIsEngineReady(true);
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
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
      status: 'CORRECTION',
      scorePercent: 85,
      headline: `Eigene Lehrernotiz an ${timecodeStr}`,
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
      status: cue.status === 'CORRECTION' ? 'CORRECTION' : 'GOOD'
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
  const COLOR_BAD = '#ff453a';  // Rot = FALSCH
  const COLOR_WARN = '#ffd700'; // Gelb = SELEKTIERT

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
        {/* Left: Video Selector & Option 1 Pre-Scan Button */}
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

          {/* Overlay-Modus Selector (3-stufig: Anatomisch / Lehrer-Ampel / Lehrbuch) */}
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
                  onClick={() => { setOverlayMode('lehrer-ampel'); setShowOverlayMenu(false); }}
                  style={{
                    width: '100%', textAlign: 'left', background: overlayMode === 'lehrer-ampel' ? 'rgba(48,209,88,0.15)' : 'transparent',
                    color: '#fff', border: 'none', borderRadius: '7px', padding: '8px 10px',
                    cursor: 'pointer', fontSize: '11px', marginBottom: '3px'
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: '2px' }}>🚦 Lehrer-Ampel</div>
                  <div style={{ opacity: 0.6, fontSize: '9px' }}>Grün/Rot/Gelb aus Rohwerten. Für Nicole als Unterrichtshilfe. Nicht validiert – kein Scoring.</div>
                </button>
                {/* Mode 2: Anatomisch */}
                <button
                  id="overlay-anatomisch"
                  onClick={() => { setOverlayMode('anatomisch'); setShowOverlayMenu(false); }}
                  style={{
                    width: '100%', textAlign: 'left', background: overlayMode === 'anatomisch' ? 'rgba(100,130,255,0.15)' : 'transparent',
                    color: '#fff', border: 'none', borderRadius: '7px', padding: '8px 10px',
                    cursor: 'pointer', fontSize: '11px', marginBottom: '3px'
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: '2px' }}>🎨 Anatomisch</div>
                  <div style={{ opacity: 0.6, fontSize: '9px' }}>Körperregionen-Farben. Cyan=Wirbel, Violett=Arm, Indigo=Bein. Kein Urteil.</div>
                </button>
                {/* Mode 3: Lehrbuch */}
                <button
                  id="overlay-lehrbuch"
                  onClick={() => { setOverlayMode('lehrbuch'); setShowOverlayMenu(false); }}
                  style={{
                    width: '100%', textAlign: 'left', background: overlayMode === 'lehrbuch' ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: '#fff', border: 'none', borderRadius: '7px', padding: '8px 10px',
                    cursor: 'pointer', fontSize: '11px'
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: '2px' }}>📖 Lehrbuch</div>
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
            }}>

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

                {/* Option 1 Pre-Indexing Progress Overlay Bar */}
                {isPreIndexing && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(10,8,14,0.92)', backdropFilter: 'blur(10px)', zIndex: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                    <Zap size={36} color="#30d158" style={{ filter: 'drop-shadow(0 0 12px rgba(48,209,88,0.8))' }} />
                    <div className="font-montserrat" style={{ fontSize: '14px', fontWeight: 800, color: '#ffffff', letterSpacing: '0.5px' }}>
                      ⚡ Option 1 Pre-Scan: {indexingStatusStr}
                    </div>
                    <div style={{ width: '280px', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)' }}>
                      <div style={{ width: `${indexingProgress}%`, height: '100%', background: 'linear-gradient(90deg, #30d158, #c084fc)', transition: 'width 0.15s ease' }}></div>
                    </div>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>Ruckelfreier 60 FPS RAM-Puffer wird erstellt...</span>
                  </div>
                )}

                {/* 🎨 CANVAS SKELETON OVERLAY – 60fps direct rendering */}
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


              {/* Status Badge */}
              {showSkeleton && !isEngineReady && !isPreIndexing && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(10, 8, 14, 0.85)', backdropFilter: 'blur(10px)', border: '1px solid rgba(192, 132, 252, 0.4)', padding: '10px 20px', borderRadius: '12px', color: '#ffffff', fontSize: '11px', fontWeight: 700, zIndex: 30, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={16} className="animate-spin" color="#c084fc" />
                  <span>MediaPipe Pose Engine wird am Video-Stream initialisiert...</span>
                </div>
              )}



            </div>

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
              style={{
                background: 'linear-gradient(135deg, #a881bd 0%, #8b5a8b 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '10px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                boxShadow: '0 0 10px rgba(168,129,189,0.4)'
              }}
            >
              <Plus size={12} /> Marker
            </button>
          </div>

          {/* Cue Points List */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
            {cuePoints.map((cue) => {
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

                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <button
                        onClick={() => setEditForm({ ...editForm, status: 'GOOD' })}
                        style={{ background: editForm.status === 'GOOD' ? 'rgba(48,209,88,0.4)' : 'transparent', color: '#fff', border: '1px solid #30d158', padding: '2px 8px', borderRadius: '6px', fontSize: '9px', cursor: 'pointer' }}
                      >
                        🟢 GUT
                      </button>
                      <button
                        onClick={() => setEditForm({ ...editForm, status: 'CORRECTION' })}
                        style={{ background: editForm.status === 'CORRECTION' ? 'rgba(255,69,58,0.4)' : 'transparent', color: '#fff', border: '1px solid #ff453a', padding: '2px 8px', borderRadius: '6px', fontSize: '9px', cursor: 'pointer' }}
                      >
                        🔴 KORREKTUR
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

              return (
                <div
                  key={cue.id}
                  onClick={() => handleSeekToCuePoint(cue)}
                  style={{
                    background: isSelected ? 'rgba(192, 132, 252, 0.18)' : 'rgba(255, 255, 255, 0.03)',
                    border: isSelected
                      ? '1px solid #c084fc'
                      : (cue.status === 'CORRECTION' ? '1px solid rgba(255, 69, 58, 0.4)' : '1px solid rgba(48, 209, 88, 0.3)'),
                    borderRadius: '10px',
                    padding: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '10px', fontFamily: 'monospace', fontWeight: 800, color: '#c084fc', background: 'rgba(192,132,252,0.15)', padding: '2px 6px', borderRadius: '4px' }}>
                        {cue.timecodeStr}
                      </span>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#ffffff' }}>
                        {cue.poseName} {cue.isCustom ? '✏️' : ''}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{
                        fontSize: '9px',
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: '6px',
                        background: cue.status === 'CORRECTION' ? 'rgba(255, 69, 58, 0.2)' : 'rgba(48, 209, 88, 0.2)',
                        color: cue.status === 'CORRECTION' ? COLOR_BAD : COLOR_GOOD,
                        border: cue.status === 'CORRECTION' ? '1px solid rgba(255, 69, 58, 0.4)' : '1px solid rgba(48, 209, 88, 0.4)'
                      }}>
                        {cue.status === 'CORRECTION' ? '🔴 KORREKTUR' : '🟢 GUT'}
                      </span>

                      <button
                        onClick={(e) => handleStartEdit(cue, e)}
                        title="Bearbeiten"
                        style={{ background: 'transparent', border: 'none', color: '#c084fc', cursor: 'pointer', padding: '2px' }}
                      >
                        <Edit2 size={11} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteCuePoint(cue.id, e)}
                        title="Löschen"
                        style={{ background: 'transparent', border: 'none', color: '#ff453a', cursor: 'pointer', padding: '2px' }}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>

                  <div style={{ fontSize: '11px', fontWeight: 700, color: cue.status === 'CORRECTION' ? '#ff453a' : '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {cue.status === 'CORRECTION' ? <AlertTriangle size={12} /> : <CheckCircle size={12} color="#30d158" />}
                    <span>{cue.headline}</span>
                  </div>

                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.85)', fontStyle: 'italic', background: 'rgba(0,0,0,0.4)', padding: '8px 10px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span>💡 "{cue.cueMetaphor}"</span>

                    <button
                      onClick={(e) => handleSpeakCueMetaphor(cue.cueMetaphor, e)}
                      style={{
                        alignSelf: 'flex-start',
                        background: 'linear-gradient(135deg, rgba(192, 132, 252, 0.3) 0%, rgba(139, 90, 139, 0.3) 100%)',
                        border: '1px solid rgba(192, 132, 252, 0.5)',
                        color: '#c084fc',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '9px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Volume2 size={11} /> 🔊 KI-Sprach-Cue anhören
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', fontSize: '9px', fontWeight: 700, color: '#c084fc', marginTop: '2px' }}>
                    <span>Frame (Slow-Mo 0.25x) anspringen</span>
                    <ChevronRight size={10} />
                  </div>
                </div>
              );
            })}
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
