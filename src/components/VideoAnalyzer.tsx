import React, { lazy, Suspense, useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Camera, SplitSquareVertical, Layers, Sliders, Play, Pause, Send, Sparkles, Upload, AlertTriangle, CheckCircle, ZoomIn, ZoomOut, Maximize2, Minimize2, Box, ListVideo, ChevronRight, Plus, Edit2, Trash2, Save, X, RotateCcw, Volume2, Compass, Eye, Activity as PulseIcon, Disc, BookOpen, Zap, Pen, ArrowRight, Type, Eraser, ImageDown, FlaskConical, Undo2, Redo2, RefreshCw, Hand } from 'lucide-react';
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
import { vaganovaPreAnalyzer, VaganovaCuePoint, analyzeFrameCacheForHighlights, AutoAnalysisReport, replaceAutoCuePoints, buildNeutralManualCueSuggestion, cueReviewContentFromPoint, findAddedCuePoint } from '../services/vaganovaPreAnalyzer';
import { vaganovaKineticAI } from '../services/vaganovaKineticAI';
import { vaganovaCurriculumEngine, VaganovaCurriculumReport } from '../services/vaganovaCurriculumEngine';
import { vaganovaFrameCache } from '../services/vaganovaFrameCache';
import { vaganovaIdbCache } from '../services/vaganovaIdbCache';
import { vaganovaAngleCalculator, VaganovaFullAnalysis } from '../services/vaganovaAngleCalculator';
import { vaganovaArmAnalyzer } from '../services/vaganovaArmAnalyzer';
import { vaganovaFootAnalyzer } from '../services/vaganovaFootAnalyzer';
import { renderSkeletonToCanvas, CanvasRenderOptions } from '../services/skeletonCanvasRenderer';
import { createBlockedPacket, TeacherOverlayPacket } from '../types/teacherHeuristic';
import { framePump, FrameTickEvent } from '../services/framePump';
import { overlayStabilizer } from '../services/overlayStabilizer';
import { clonePausedCacheLandmarks, findExactCachedPoseLandmarks, shouldRefreshAnalysisForPosePacket } from '../services/pausedTeacherOverlayEvidence';
import { capabilityTierManager, CapabilityManager } from '../services/capabilityTier';
import { isPoseAnalysisCurrent, isPoseCaptureCurrent, isPoseResultLatest, makeNoPosePacket, shouldHoldNeutralSkeleton } from '../types/posePacket';
import { VaganovaCurriculumModal } from './VaganovaCurriculumModal';
import { BUILD_POLICY, canGenerateLegacyUngroundedCues } from '../config/buildPolicy';
import { useUndoableAnnotations } from '../hooks/useUndoableAnnotations';
import { SkeletonJointPopover } from './SkeletonJointPopover';
import { getJointKnowledge } from '../services/skeletonJointKnowledge';
import { buildGroundedTeacherDraft, createBlockedGroundedTeacherDraft, findNearestExactPoseFrame, groundedTeacherDraftFingerprint } from '../services/groundedTeacherDraftEngine';
import type { GroundedGuideFrameContext, GroundedTeacherDraft } from '../types/groundedTeacherDraft';
import {
  createSelectedSkeletonTarget,
  findSkeletonTargetAtPoint,
  getSkeletonTarget,
  resolveSkeletonTargetAnchor,
} from '../services/skeletonTargetRegistry';
import type { GroundedMetricAdapterId, SelectedSkeletonTarget, SkeletonTargetFocusId, SkeletonTargetId } from '../types/skeletonTarget';
import { cueReviewAuditIsValid, cueReviewExpectedState, projectCueReviewAudit } from '../services/cueReviewAudit';
import type { CueReviewEditablePatch } from '../types/cueReviewAudit';
import {
  getNicoleReferenceLine,
  loadNicoleReferenceLines,
  nicoleReferencePhaseBindingIsValid,
  projectNicoleReferenceGuide,
  saveNicoleReferenceLine,
} from '../services/nicoleReferenceLine';
import type { NicoleReferenceLineGuide, NicoleReferencePhaseBinding } from '../types/nicoleReferenceLine';
import {
  compareNicolePhaseReferences,
  type NicolePhaseReferenceComparison,
} from '../services/nicolePhaseReferenceComparison';
import {
  analyzeTeacherPhases,
  findTeacherPhaseAtTime,
  phaseToOverlayPacket,
  type TeacherPhaseAnalysis,
} from '../services/teacherPhaseAnalysis';
import { heuristicColor, heuristicDash, heuristicEvidenceStrength } from '../types/teacherHeuristic';
import type { AvatarLoopRange } from './SynchronizedTenduAvatarViewport';
import { canCreateNicoleReferenceFromSource } from '../services/referenceSourcePolicy';
import {
  buildAttemptProgressCurve,
  comparePhaseWithAttempt,
  createStudentAttemptSnapshot,
  findPreviousComparableAttempt,
  studentAttemptHistory,
} from '../services/studentAttemptHistory';
import { MOTION_REGISTRY, resolveMotionRegistryEntry } from '../services/motionRegistry';
import { MOTION_REFERENCE_LIBRARY } from '../services/motionReferenceLibrary';
import { MotionReferenceLibraryPanel } from './MotionReferenceLibraryPanel';
import {
  analysisContextFingerprint,
  assessmentCapabilitiesForCurrentContext,
  assessmentValueForCurrentContext,
  bindAssessmentIfCurrent,
  createAnalysisContextEpoch,
  createAnalysisContextV1,
  sameAnalysisContextEpoch,
  type AnalysisContextEpochV1,
  type BoundAssessmentV1,
} from '../services/analysisContextGuard';

const SynchronizedMotionAvatarViewport = lazy(async () => {
  const module = await import('./SynchronizedTenduAvatarViewport');
  return { default: module.SynchronizedMotionAvatarViewport };
});

interface VideoAnalyzerProps {
  onVaganovaAnalysis?: (va: VaganovaFullAnalysis | null) => void;
  onSelectedCue?: (cue: VaganovaCuePoint | null) => void;
  exerciseName: string;
  onExerciseChange?: (exerciseName: string) => void;
  levelLabel: string;
  selectedStudent: string;
}

export const VideoAnalyzer: React.FC<VideoAnalyzerProps> = ({
  onVaganovaAnalysis,
  onSelectedCue,
  exerciseName,
  onExerciseChange,
  levelLabel,
  selectedStudent,
}) => {

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
  const overlayModeButtonRef = useRef<HTMLButtonElement>(null);
  const overlayMenuRef = useRef<HTMLDivElement>(null);
  const [overlayMenuPosition, setOverlayMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [splitScreenMode, setSplitScreenMode] = useState<boolean>(false);
  const [showReferenceLibrary, setShowReferenceLibrary] = useState<boolean>(false);
  const [selectedFrameTime, setSelectedFrameTime] = useState<string>('00:02.160');
  const [selectedJointId, setSelectedJointId] = useState<string>('');
  /** Index of the actually clicked landmark (for glow positioning on exact joint) */
  const [clickedLandmarkIndex, setClickedLandmarkIndex] = useState<number | undefined>(undefined);
  const [selectedSkeletonTarget, setSelectedSkeletonTarget] = useState<SelectedSkeletonTarget | null>(null);
  const updateSelectedSkeletonTarget = useCallback((target: SelectedSkeletonTarget | null) => {
    setSelectedSkeletonTarget(target);
  }, []);
  /** Packet/cue-backed glow; undefined keeps selections neutral. */
  const activeCueGlowTypeRef = useRef<CanvasRenderOptions['glowType']>(undefined);
  /** Toggle: Show ideal position overlay (green dashed guide lines) */
  const [showIdealOverlay, setShowIdealOverlay] = useState<boolean>(false);
  /** Nicole-owned bone reference, kept separate from the provisional 2D guide. */
  const [showNicoleReference, setShowNicoleReference] = useState<boolean>(false);
  const [nicoleReferenceGuide, setNicoleReferenceGuide] = useState<NicoleReferenceLineGuide | null>(null);
  /** Synchronous paint authority: interaction clears must win before the next rAF. */
  const nicoleReferenceRenderRef = useRef<Readonly<{
    show: boolean;
    guide: NicoleReferenceLineGuide | null;
  }>>({ show: false, guide: null });
  const updateNicoleReference = useCallback((guide: NicoleReferenceLineGuide | null, show: boolean) => {
    const visible = Boolean(guide) && show;
    nicoleReferenceRenderRef.current = Object.freeze({ show: visible, guide });
    setNicoleReferenceGuide(guide);
    setShowNicoleReference(visible);
  }, []);
  /** Toggle: Dim everything except focused joint (spotlight effect) */
  const [showFocusDim, setShowFocusDim] = useState<boolean>(true);
  /** Exact-frame teacher draft. It is deliberately not persisted or published. */
  const [groundedTeacherDraft, setGroundedTeacherDraft] = useState<GroundedTeacherDraft>(
    () => createBlockedGroundedTeacherDraft('target_not_selected'),
  );
  const groundedTeacherDraftRef = useRef<GroundedTeacherDraft>(groundedTeacherDraft);
  const groundedDraftPendingRef = useRef(false);
  const groundedSnapPendingRef = useRef(false);
  const groundedDraftTargetRef = useRef<Readonly<{
    metricAdapter: GroundedMetricAdapterId;
    focusId: SkeletonTargetFocusId;
  }> | null>(null);
  const skeletonTargetRebindRef = useRef<Readonly<{
    targetId: SkeletonTargetId;
    segmentT?: number;
  }> | null>(null);
  const updateGroundedTeacherDraft = useCallback((draft: GroundedTeacherDraft) => {
    if (
      groundedTeacherDraftFingerprint(groundedTeacherDraftRef.current)
      === groundedTeacherDraftFingerprint(draft)
    ) return;
    groundedTeacherDraftRef.current = draft;
    setGroundedTeacherDraft(draft);
  }, []);

  const clearSkeletonSelection = useCallback((
    reason: Parameters<typeof createBlockedGroundedTeacherDraft>[0] = 'target_not_selected',
    resetView: boolean = true,
  ) => {
    groundedDraftPendingRef.current = false;
    groundedSnapPendingRef.current = false;
    groundedDraftTargetRef.current = null;
    skeletonTargetRebindRef.current = null;
    activeCueGlowTypeRef.current = undefined;
    updateGroundedTeacherDraft(createBlockedGroundedTeacherDraft(reason));
    setJointPopover(null);
    updateSelectedSkeletonTarget(null);
    setSelectedJointId('');
    setClickedLandmarkIndex(undefined);
    setShowIdealOverlay(false);
    updateNicoleReference(null, false);
    if (resetView) {
      setZoomLevel(1);
      setPanOffset({ x: 0, y: 0 });
    }
  }, [updateGroundedTeacherDraft, updateNicoleReference, updateSelectedSkeletonTarget]);

  // OPTION 1 PRE-INDEXING ENGINE STATE
  const [isPreIndexing, setIsPreIndexing] = useState<boolean>(false);
  const [indexingProgress, setIndexingProgress] = useState<number>(0);
  const [indexingStatusStr, setIndexingStatusStr] = useState<string>('Bereite Frame-Lock vor...');
  const [loadedFromCache, setLoadedFromCache] = useState<boolean>(false);

  // ZOOM & PAN ENGINE STATE
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isAutoCrop, setIsAutoCrop] = useState<boolean>(false);

  const updateOverlayMenuPosition = useCallback(() => {
    const button = overlayModeButtonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const menuWidth = 270;
    const viewportMargin = 8;
    setOverlayMenuPosition({
      top: rect.top + rect.height * 1.1,
      left: Math.min(
        Math.max(viewportMargin, rect.right - menuWidth),
        window.innerWidth - menuWidth - viewportMargin
      ),
    });
  }, []);

  const closeOverlayMenu = useCallback((restoreFocus: boolean) => {
    setShowOverlayMenu(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => overlayModeButtonRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (!showOverlayMenu) return;

    updateOverlayMenuPosition();
    const focusFrame = window.requestAnimationFrame(() => {
      overlayMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    });
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (overlayMenuRef.current?.contains(target) || overlayModeButtonRef.current?.contains(target)) return;
      closeOverlayMenu(false);
    };
    window.addEventListener('resize', updateOverlayMenuPosition);
    window.addEventListener('scroll', updateOverlayMenuPosition, true);
    document.addEventListener('pointerdown', handleOutsidePointer, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('resize', updateOverlayMenuPosition);
      window.removeEventListener('scroll', updateOverlayMenuPosition, true);
      document.removeEventListener('pointerdown', handleOutsidePointer, true);
    };
  }, [closeOverlayMenu, showOverlayMenu, updateOverlayMenuPosition]);

  // Drag-to-pan: track mouse drag for panning when zoomed
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({ x: 0, y: 0, panX: 0, panY: 0 });

  // Video Library State
  const [videoList, setVideoList] = useState<StoredVideoItem[]>(videoStore.getAllVideos());
  const [selectedDevVideoUrl, setSelectedDevVideoUrl] = useState<string>(videoList[0].url);
  const selectedDevVideoUrlRef = useRef(selectedDevVideoUrl);
  useEffect(() => { selectedDevVideoUrlRef.current = selectedDevVideoUrl; }, [selectedDevVideoUrl]);
  // The visible exercise selector is the assessment authority. Video topics
  // may choose a helpful default on source switch, but may never silently
  // override Nicole's explicit selection.
  const effectiveExerciseLabel = exerciseName;
  const effectiveExerciseEntry = resolveMotionRegistryEntry(exerciseName);
  const effectiveExerciseId = effectiveExerciseEntry?.id ?? 'plie';
  const analysisContextIdentity = useMemo(() => effectiveExerciseEntry
    ? createAnalysisContextV1({
      sourceId: selectedDevVideoUrl,
      studentSelection: selectedStudent,
      exerciseId: effectiveExerciseEntry.id,
      levelSelection: levelLabel,
    })
    : null,
  [effectiveExerciseEntry, levelLabel, selectedDevVideoUrl, selectedStudent]);
  const analysisContextIdentityFingerprint = analysisContextIdentity
    ? analysisContextFingerprint(analysisContextIdentity)
    : null;
  const [analysisContextGeneration, setAnalysisContextGeneration] = useState(0);
  const analysisContextGenerationRef = useRef(0);
  const observedAnalysisContextFingerprintRef = useRef<string | null>(analysisContextIdentityFingerprint);
  const currentAnalysisContextEpoch = useMemo(() => (
    analysisContextIdentity
      && observedAnalysisContextFingerprintRef.current === analysisContextIdentityFingerprint
      ? createAnalysisContextEpoch(analysisContextIdentity, analysisContextGeneration)
      : null
  ), [analysisContextGeneration, analysisContextIdentity, analysisContextIdentityFingerprint]);
  const currentAnalysisContextEpochRef = useRef<AnalysisContextEpochV1 | null>(currentAnalysisContextEpoch);

  // Dynamic MediaPipe Landmarks
  const [detectedLandmarks, setDetectedLandmarks] = useState<PoseLandmark[] | null>(null);
  const [detectedWorldLandmarks, setDetectedWorldLandmarks] = useState<PoseLandmark[] | null>(null);
  const [isEngineReady, setIsEngineReady] = useState<boolean>(false);
  const [analysisReport, setAnalysisReport] = useState<AutoAnalysisReport | null>(null);
  const [boundTeacherPhaseAssessment, setBoundTeacherPhaseAssessment] = useState<BoundAssessmentV1<TeacherPhaseAnalysis> | null>(null);
  const [attemptHistoryRevision, setAttemptHistoryRevision] = useState(0);
  const [nicolePhaseComparisons, setNicolePhaseComparisons] = useState<readonly NicolePhaseReferenceComparison[]>([]);
  const [nicoleReferenceStorageRevision, setNicoleReferenceStorageRevision] = useState(0);
  const teacherPhaseAnalysisRef = useRef<TeacherPhaseAnalysis | null>(null);
  const teacherPhaseAnalysis = assessmentValueForCurrentContext(
    boundTeacherPhaseAssessment,
    currentAnalysisContextEpoch,
  );
  const assessmentCapabilities = assessmentCapabilitiesForCurrentContext(
    boundTeacherPhaseAssessment,
    currentAnalysisContextEpoch,
  );
  const clearTeacherPhaseAssessment = useCallback((keepCurrentReport = false) => {
    teacherPhaseAnalysisRef.current = null;
    setBoundTeacherPhaseAssessment(null);
    setNicolePhaseComparisons([]);
    if (!keepCurrentReport) setAnalysisReport(null);
    setSplitScreenMode(false);
  }, []);
  const publishTeacherPhaseAssessment = useCallback((
    analysis: TeacherPhaseAnalysis,
    startedFor: AnalysisContextEpochV1 | null,
  ): boolean => {
    const bound = bindAssessmentIfCurrent(startedFor, currentAnalysisContextEpochRef.current, analysis);
    if (!bound) return false;
    teacherPhaseAnalysisRef.current = analysis;
    setBoundTeacherPhaseAssessment(bound);
    return true;
  }, []);
  const assessmentRequestSequenceRef = useRef(0);
  const [assessmentRequest, setAssessmentRequest] = useState<Readonly<{
    requestId: number;
    context: AnalysisContextEpochV1;
  }> | null>(null);
  const requestTeacherPhaseAssessment = useCallback((requestedContext?: AnalysisContextEpochV1 | null): boolean => {
    const context = requestedContext ?? currentAnalysisContextEpochRef.current;
    if (!sameAnalysisContextEpoch(context, currentAnalysisContextEpochRef.current) || !context) return false;
    clearTeacherPhaseAssessment(true);
    setAssessmentRequest(Object.freeze({
      requestId: ++assessmentRequestSequenceRef.current,
      context,
    }));
    return true;
  }, [clearTeacherPhaseAssessment]);

  // A context change invalidates the old assessment permanently. Returning to
  // the same visible selection creates a new epoch; the old artifact cannot
  // silently become current again.
  useLayoutEffect(() => {
    if (observedAnalysisContextFingerprintRef.current !== analysisContextIdentityFingerprint) {
      const nextGeneration = analysisContextGenerationRef.current + 1;
      analysisContextGenerationRef.current = nextGeneration;
      observedAnalysisContextFingerprintRef.current = analysisContextIdentityFingerprint;
      const nextEpoch = analysisContextIdentity
        ? createAnalysisContextEpoch(analysisContextIdentity, nextGeneration)
        : null;
      currentAnalysisContextEpochRef.current = nextEpoch;
      setAnalysisContextGeneration(nextGeneration);
      setAssessmentRequest(null);
      clearTeacherPhaseAssessment();
      return;
    }
    currentAnalysisContextEpochRef.current = currentAnalysisContextEpoch;
    teacherPhaseAnalysisRef.current = teacherPhaseAnalysis;
  }, [
    analysisContextIdentity,
    analysisContextIdentityFingerprint,
    clearTeacherPhaseAssessment,
    currentAnalysisContextEpoch,
    teacherPhaseAnalysis,
  ]);

  const motionAvatarAvailable = effectiveExerciseId !== 'plie' && assessmentCapabilities.canUseAvatar;

  // AI & TEACHER EDITABLE CUE-POINTS STATE
  const [cuePoints, setCuePoints] = useState<VaganovaCuePoint[]>(
    vaganovaPreAnalyzer.getCuePoints(selectedDevVideoUrl)
  );

  // VIDEO SCRUBBER STATE
  const [videoDuration, setVideoDuration] = useState<number>(5.0);
  const [currentPlayTime, setCurrentPlayTime] = useState<number>(0);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const slowMoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preIndexRunRef = useRef(0);
  const staticFrameRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staticFrameRetryCountRef = useRef<number>(0);

  useEffect(() => () => {
    preIndexRunRef.current += 1;
    currentAnalysisContextEpochRef.current = null;
    teacherPhaseAnalysisRef.current = null;
  }, []);

  // EDIT MODAL / INLINE FORM STATE
  const [editingCueId, setEditingCueId] = useState<string | null>(null);
  const [expandedCueIds, setExpandedCueIds] = useState<Set<string>>(new Set());
  const [summaryOpen, setSummaryOpen] = useState<boolean>(true);
  const [summaryTab, setSummaryTab] = useState<number>(0);

  const renderStateRef = useRef({
    isPreIndexing,
    showSkeleton,
    showMotionTrails,
    showCoG,
    showAngleArcs,
    selectedJointId,
    clickedLandmarkIndex,
    selectedSkeletonTarget,
    isPlaying,
    showIdealOverlay,
    showNicoleReference,
    nicoleReferenceGuide,
    showFocusDim,
  });
  useEffect(() => {
    renderStateRef.current = {
      isPreIndexing,
      showSkeleton,
      showMotionTrails,
      showCoG,
      showAngleArcs,
      selectedJointId,
      clickedLandmarkIndex,
      selectedSkeletonTarget,
      isPlaying,
      showIdealOverlay,
      showNicoleReference,
      nicoleReferenceGuide,
      showFocusDim,
    };
  }, [
    isPreIndexing,
    showSkeleton,
    showMotionTrails,
    showCoG,
    showAngleArcs,
    selectedJointId,
    clickedLandmarkIndex,
    selectedSkeletonTarget,
    isPlaying,
    showIdealOverlay,
    showNicoleReference,
    nicoleReferenceGuide,
    showFocusDim,
  ]);

  // VIDEO RENAME STATE
  const [renamingVideoId, setRenamingVideoId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>('');

  // ANALYSE-TOAST STATE
  const [analyseToast, setAnalyseToast] = useState<string | null>(null);
  const analyseToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRenameVideo = () => {
    if (!renamingVideoId || !renameValue.trim()) {
      setRenamingVideoId(null);
      return;
    }
    videoStore.renameVideo(renamingVideoId, renameValue.trim());
    setVideoList(videoStore.getAllVideos());
    setRenamingVideoId(null);
  };

  const startRename = () => {
    const vid = videoList.find(v => v.url === selectedDevVideoUrl);
    if (!vid) return;
    setRenamingVideoId(vid.id);
    setRenameValue(vid.title);
  };

  const showAnalyseToast = (msg: string) => {
    setAnalyseToast(msg);
    if (analyseToastTimerRef.current) clearTimeout(analyseToastTimerRef.current);
    analyseToastTimerRef.current = setTimeout(() => setAnalyseToast(null), 4000);
  };

  const toggleCueExpanded = (id: string) => {
    setSummaryOpen(false); // Gesamt-Summary einklappen wenn Cue geöffnet wird
    setExpandedCueIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  // Tab state: 0=Was&Warum, 1=Ziel&Üben, 2=Technik
  const [cueTabState, setCueTabState] = useState<Record<string, number>>({});
  const getCueTab = (id: string) => cueTabState[id] ?? 0;
  const setCueTab = (id: string, tab: number) => setCueTabState(prev => ({ ...prev, [id]: tab }));

  const [editForm, setEditForm] = useState<{ poseName: string; headline: string; cueMetaphor: string; status: VaganovaCuePoint['status']; diagnosisText: string; goalText: string; practiceText: string }>({
    poseName: '',
    headline: '',
    cueMetaphor: '',
    status: 'GOOD',
    diagnosisText: '',
    goalText: '',
    practiceText: '',
  });

  // VAGANOVA CURRICULUM MODAL STATE
  const [isCurriculumModalOpen, setIsCurriculumModalOpen] = useState<boolean>(false);

  // ── ANNOTATION TOOL STATE ──────────────────────────────────────────────────
  // Per-video undo/redo via local hook (no Redux)
  const stableVideoId = selectedDevVideoUrl.split('/').pop() ?? 'default';
  const {
    entries: annotationEntries,
    push: pushAnnotations,
    updateEntry: updateAnnotationEntry,
    undo: undoAnnotation,
    redo: redoAnnotation,
    canUndo: canUndoAnnotation,
    canRedo: canRedoAnnotation,
  } = useUndoableAnnotations(stableVideoId);

  const [drawingTool, setDrawingTool] = useState<DrawingTool>('pen');
  const [isAnnotationModeActive, setIsAnnotationModeActive] = useState<boolean>(false);
  const [drawingColor, setDrawingColor] = useState<string>('#ff453a');
  const [drawingLineWidth, setDrawingLineWidth] = useState<number>(3);
  const [saveWithSkeleton, setSaveWithSkeleton] = useState<boolean>(true);
  const annotationCanvasRef = useRef<AnnotationCanvasHandle>(null);

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);
  const [lightboxIndex, setLightboxIndex] = useState<number>(0);

  // Caption selector: Nicole wählt was unter dem Screenshot stehen soll
  const [captionPanelOpen, setCaptionPanelOpen] = useState<boolean>(false);
  const [captionDraft, setCaptionDraft] = useState<string>('');

  // 🦴 Joint popover state
  // normalizedX/Y: 0–1 relative to canvas (used for joint clicks → arrow tracks landmark)
  const [jointPopover, setJointPopover] = useState<{
    targetId: import('../types/skeletonTarget').SkeletonTargetId;
    normalizedX: number;
    normalizedY: number;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const avatarLoopRangeRef = useRef<AvatarLoopRange | null>(null);
  const getPrimaryVideoTimeMs = useCallback(
    () => (videoRef.current?.currentTime ?? 0) * 1000,
    [],
  );
  const handleAvatarLoopRangeChange = useCallback((range: AvatarLoopRange | null) => {
    avatarLoopRangeRef.current = range;
    const video = videoRef.current;
    if (range && video) {
      const currentMs = video.currentTime * 1000;
      if (currentMs < range.startMs || currentMs > range.endMs) video.currentTime = range.startMs / 1000;
    }
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isProcessingRef = useRef<boolean>(false);
  const processingStartTimeRef = useRef<number>(0);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const videoPanelRef = useRef<HTMLDivElement>(null); // Outer panel: Video + Canvas + Scrubber
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const annotationMergeCanvasRef = useRef<HTMLCanvasElement>(null); // Off-screen merge canvas

  // ── FRAME SYNC FOUNDATION (2026-08-10, upgraded 2026-08-11) ──────────────
  // Each pose result is tagged with the exact video timestamp it came from.
  // Drawing only happens when the packet's mediaTimeUs matches the current frame.
  // FramePump + Generation system replaces ad-hoc rAF loop.
  const latestPacketRef = useRef<import('../types/posePacket').PosePacket | null>(null);
  const streamEpochRef = useRef<number>(Date.now());
  const frameSeqRef = useRef<number>(0);
  const poseDropoutStartedAtRef = useRef<number | null>(null);
  const debugHudRef = useRef<import('../types/posePacket').FrameSyncDebugInfo>({
    inferenceMs: 0, poseAgeMs: 0, syncErrorMs: 0,
    droppedFrames: 0, skippedInferences: 0, usingRvfc: false,
  });
  // Ref-based overlayMode so mode-switch doesn't restart the effect (Berater 2026-08-11)
  const overlayModeRef = useRef(overlayMode);
  useEffect(() => { overlayModeRef.current = overlayMode; }, [overlayMode]);
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
    sourceId: string;
    streamEpoch: number;
    generation: number;
    videoWidth: number;
    videoHeight: number;
  } | null>(null);

  // Phase 8: Stabilizer result cache (only update when analysis changes, not at 60fps)
  const stabilizedOverlayRef = useRef<import('../types/teacherHeuristic').TeacherOverlayPacket | null>(null);
  const lastStabilizedAnalysisTimeRef = useRef<number>(-1);

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
    if (containerW <= 0 || containerH <= 0) return;

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
    const scanVideoUrl = selectedDevVideoUrl;
    const assessmentContextAtScanStart = currentAnalysisContextEpochRef.current;
    const scanRun = ++preIndexRunRef.current;
    const scanIsCurrent = () => (
      preIndexRunRef.current === scanRun
      && selectedDevVideoUrlRef.current === scanVideoUrl
    );

    setIsPreIndexing(true);
    clearTeacherPhaseAssessment();
    setLoadedFromCache(false);
    setIndexingProgress(0);
    setIndexingStatusStr('Suche im Cache...');

    // Build stable IDB key: for uploads use File metadata, for built-ins use URL segment
    const currentVideoObj = videoList.find(v => v.url === scanVideoUrl);
    const idbKey = vaganovaIdbCache.buildKey(
      scanVideoUrl,
      (currentVideoObj as any)?._file as File | undefined
    );

    await vaganovaFrameCache.preIndexVideo(
      scanVideoUrl,
      videoRef.current,
      (percent, step, total, fromCache) => {
        if (!scanIsCurrent()) return;
        if (fromCache) {
          setLoadedFromCache(true);
          setIndexingStatusStr(`Aus Cache geladen (${step} Frames)`);
        } else {
          setLoadedFromCache(false);
          setIndexingStatusStr(`Frame ${step}/${total} (${percent}%)`);
        }
        setIndexingProgress(percent);
      },
      idbKey,
      scanIsCurrent,
    );

    // A completed scan belongs only to the source that started it.
    if (!scanIsCurrent()) return;

    setIsPreIndexing(false);
    setIsEngineReady(true);
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }

    // Auto-Analyse: KI-Cue-Points aus echten Frame-Daten generieren
    const { autoCuePoints, report } = analyzeFrameCacheForHighlights(scanVideoUrl);
    // KI-Cue-Points immer ersetzen, damit gesperrte Altbefunde nicht bestehen bleiben.
    const merged = replaceAutoCuePoints(
      vaganovaPreAnalyzer.getCuePoints(scanVideoUrl),
      autoCuePoints,
    );
    vaganovaPreAnalyzer.saveCuePoints(scanVideoUrl, merged);
    setCuePoints(merged);
    const assessmentContextStillCurrent = sameAnalysisContextEpoch(
      assessmentContextAtScanStart,
      currentAnalysisContextEpochRef.current,
    );
    setAnalysisReport(assessmentContextStillCurrent ? report : null);
    // Raw pose extraction is source-scoped and reusable. The phase assessment
    // is published separately and only if the context that started this scan
    // is still the current context epoch.
    requestTeacherPhaseAssessment(assessmentContextAtScanStart);

    // ── Analyse-Toast zeigen ──────────────────────────────────────────
    if (report && assessmentContextStillCurrent) {
      const s = report.strengths.length;
      const c = report.corrections.length;
      const totalCues = autoCuePoints.length;
      showAnalyseToast(
        `✅ Analyse abgeschlossen: ${totalCues} Cue-Points · ${s} Stärke${s !== 1 ? 'n' : ''} · ${c} Korrektur${c !== 1 ? 'en' : ''}`
      );
      setSummaryOpen(true); // Zusammenfassung automatisch aufklappen
    }

    // Die automatisch erkannte Pose darf Nicoles explizite Übungsauswahl nicht
    // überschreiben. Sie bleibt ein internes Analysesignal; das Aufnahme-Gate
    // prüft die von Nicole gewählte Übung und Stufe.
  };

  // Auto-Scan: startet automatisch wenn Video geladen ist und kein Cache vorhanden
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const startScanIfNeeded = () => {
      if (vaganovaFrameCache.hasCache(selectedDevVideoUrl)) {
        // Cache HIT: Frames sind schon im Speicher → Engine ist sofort bereit
        setIsPreIndexing(false);
        setIsEngineReady(true);

        // ABER: KI-Analyse (Cue-Points + Report) trotzdem generieren,
        // falls sie noch nicht vorliegen (z.B. nach Page-Reload)
        const { autoCuePoints, report } = analyzeFrameCacheForHighlights(selectedDevVideoUrl);
        const merged = replaceAutoCuePoints(
          vaganovaPreAnalyzer.getCuePoints(selectedDevVideoUrl),
          autoCuePoints,
        );
        vaganovaPreAnalyzer.saveCuePoints(selectedDevVideoUrl, merged);
        setCuePoints(merged);
        setAnalysisReport(report);
        requestTeacherPhaseAssessment(currentAnalysisContextEpochRef.current);
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

  useEffect(() => {
    if (!assessmentRequest || isPreIndexing) return;
    if (!sameAnalysisContextEpoch(assessmentRequest.context, currentAnalysisContextEpochRef.current)) return;
    const sourceId = assessmentRequest.context.context.sourceId;
    if (!vaganovaFrameCache.hasCache(sourceId)) return;
    const registryEntry = MOTION_REGISTRY.find(entry => entry.id === assessmentRequest.context.context.exerciseId);
    if (!registryEntry) return;
    const cacheDimensions = vaganovaFrameCache.getVideoDimensions(sourceId);
    const frames = vaganovaFrameCache.getFrames(sourceId);
    const analysis = analyzeTeacherPhases({
      frames,
      videoWidth: cacheDimensions.vw,
      videoHeight: cacheDimensions.vh,
      exerciseLabel: registryEntry.label,
      levelLabel: levelLabel,
    });
    if (analysis.exerciseId !== assessmentRequest.context.context.exerciseId) return;
    if (publishTeacherPhaseAssessment(analysis, assessmentRequest.context)) {
      setAssessmentRequest(current => current?.requestId === assessmentRequest.requestId ? null : current);
    }
  }, [assessmentRequest, isPreIndexing, levelLabel, publishTeacherPhaseAssessment]);

  useEffect(() => {
    if (!assessmentCapabilities.canCompareReferences || !teacherPhaseAnalysis || !currentAnalysisContextEpoch) {
      setNicolePhaseComparisons([]);
      return;
    }
    const sourceId = currentAnalysisContextEpoch.context.sourceId;
    const cacheDimensions = vaganovaFrameCache.getVideoDimensions(sourceId);
    const frames = vaganovaFrameCache.getFrames(sourceId);
    setNicolePhaseComparisons(compareNicolePhaseReferences({
      analysis: teacherPhaseAnalysis,
      frames,
      videoSourceId: sourceId,
      videoWidth: cacheDimensions.vw,
      videoHeight: cacheDimensions.vh,
      records: loadNicoleReferenceLines(localStorage),
    }));
  }, [assessmentCapabilities.canCompareReferences, currentAnalysisContextEpoch, nicoleReferenceStorageRevision, teacherPhaseAnalysis]);

  const handleAnalysisRequest = () => {
    if (isPreIndexing) return;
    const context = currentAnalysisContextEpochRef.current;
    if (!context) {
      showAnalyseToast('Analyse benötigt eine gültige Schülerin, Übung und Stufe.');
      return;
    }
    const currentAssessment = assessmentValueForCurrentContext(
      boundTeacherPhaseAssessment,
      context,
    );
    if (!currentAssessment && vaganovaFrameCache.hasCache(context.context.sourceId)) {
      // Context-only refresh: reuse raw pose frames and skip MediaPipe entirely.
      requestTeacherPhaseAssessment(context);
      return;
    }
    // Explicit refresh of an already-current assessment retains the existing
    // Force-Rescan behavior.
    vaganovaFrameCache.clear(selectedDevVideoUrl);
    triggerPreIndexingScan();
  };

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
      stabilizedOverlayRef.current = null;
      lastStabilizedAnalysisTimeRef.current = -1;
      activeCueGlowTypeRef.current = undefined;
      groundedDraftPendingRef.current = false;
      groundedSnapPendingRef.current = false;
      groundedDraftTargetRef.current = null;
      skeletonTargetRebindRef.current = null;
      updateSelectedSkeletonTarget(null);
      setJointPopover(null);
      setSelectedJointId('');
      setClickedLandmarkIndex(undefined);
      setShowIdealOverlay(false);
      updateGroundedTeacherDraft(createBlockedGroundedTeacherDraft('target_not_selected'));
      poseDropoutStartedAtRef.current = null;
      if (staticFrameRetryRef.current) {
        clearTimeout(staticFrameRetryRef.current);
        staticFrameRetryRef.current = null;
      }
      staticFrameRetryCountRef.current = 0;
      frameSeqRef.current = 0;
      streamEpochRef.current = Date.now();
      vaganovaPoseEngine.reset();
      realMediaPipePose.reset(); // FIX: Clear MediaPipe temporal tracking on source change
      framePump.reset(); // Bump generation + stop any running pump
      overlayStabilizer.reset();
      capabilityTierManager.resetSession();
      // Phase 3: Determine capabilities immediately after reset
      // Without this, frameClock stays 'unavailable' → all colors blocked → white bones
      const v = videoRef.current;
      if (v) {
        const hasRvfc = typeof (v as any).requestVideoFrameCallback === 'function';
        capabilityTierManager.determine?.(hasRvfc, false, true);
      }
      // Clear canvas immediately
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    resetPoseState(); // Always reset on effect restart (video change)

    // Seek handlers – PRE-invalidation on 'seeking', reset on 'seeked'
    // ARCHITEKTUR-VERTRAG (Berater v2, 2026-08-11):
    //   – 'seeking' (BEFORE decode): bump generation, clear all refs, clear canvas
    //   – 'seeked'  (AFTER decode): log only (pump continues via generation-gated rVFC/rAF)
    //   – Invalidation MUSS VOR dem neuen Frame passieren, nicht danach
    const handleSeeking = () => {
      framePump.bumpGeneration(); // Invalidates all in-flight callbacks
      latestPacketRef.current = null;
      cachedAnalysisRef.current = null;
      stabilizedOverlayRef.current = null; // Phase 8: cached stabilizer result
      lastStabilizedAnalysisTimeRef.current = -1;
      activeCueGlowTypeRef.current = undefined;
      groundedDraftPendingRef.current = false;
      updateGroundedTeacherDraft(createBlockedGroundedTeacherDraft('analysis_stale'));
      if (!groundedSnapPendingRef.current) {
        clearSkeletonSelection('analysis_stale');
      }
      poseDropoutStartedAtRef.current = null;
      landmarksRef.current = null;
      vaganovaPoseEngine.reset();
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    const handleSeeked = () => {
      // After seek completes: pump continues automatically (rVFC/rAF re-schedules)
      // No action needed – the seeking handler already cleared everything
      console.debug('[VideoAnalyzer] seeked – pump generation:', framePump.generation);
      if (groundedSnapPendingRef.current) {
        groundedSnapPendingRef.current = false;
        const pendingTarget = skeletonTargetRebindRef.current
          ? getSkeletonTarget(skeletonTargetRebindRef.current.targetId)
          : null;
        groundedDraftPendingRef.current = Boolean(pendingTarget?.metricAdapter);
        processStaticPausedFrame();
      }
    };
    videoRef.current?.addEventListener('seeking', handleSeeking);
    videoRef.current?.addEventListener('seeked', handleSeeked);
    // ────────────────────────────────────────────────────────────────────────

    const renderLoop = () => {
      if (!isActive) return;

      const v = videoRef.current;
      const canvas = canvasRef.current;
      const renderState = renderStateRef.current;

      if (v && v.readyState >= 2 && !renderState.isPreIndexing) {
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
              // Phase 6: Full provenance (Berater v2)
              source: 'frame_cache',
              generation: framePump.generation,
              sourceId: selectedDevVideoUrl,
              videoWidth: v.videoWidth || 0,
              videoHeight: v.videoHeight || 0,
            };
            latestPacketRef.current = packet;
            landmarksRef.current = cached;
            poseDropoutStartedAtRef.current = null;

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
            // Capture the mediaTimeUs AND generation for THIS frame so we can tag the result
            const capturedMediaTimeUs = currentMediaTimeUs;
            const capturedEpoch = streamEpochRef.current;
            const capturedSeq = frameSeqRef.current++;
            const capturedGeneration = framePump.generation;

            realMediaPipePose.processFrame(v, (data: PoseResultsData) => {
              isProcessingRef.current = false;
              const inferenceEndMs = performance.now();

              if (!isActive) return; // Effect cleaned up – discard

              // Generation gate: discard if seek/source-change happened since inference started
              if (capturedGeneration !== framePump.generation) {
                debugHudRef.current.droppedFrames++;
                return; // Stale: generation changed during inference
              }

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
                  // Phase 6: Full provenance (Berater v2)
                  source: 'live_inference',
                  generation: capturedGeneration,
                  sourceId: selectedDevVideoUrl,
                  videoWidth: v.videoWidth || 0,
                  videoHeight: v.videoHeight || 0,
                };

                // Staleness check: discard if older than what we already have
                const candidateIdentity = {
                  streamEpoch: capturedEpoch,
                  generation: capturedGeneration,
                  sourceId: selectedDevVideoUrl,
                  mediaTimeUs: capturedMediaTimeUs,
                };
                if (!isPoseResultLatest(candidateIdentity, latestPacketRef.current)) {
                  debugHudRef.current.droppedFrames++;
                  return; // Stale result – discard
                }

                // Update debug HUD
                debugHudRef.current.inferenceMs = inferenceEndMs - inferenceStartMs;

                latestPacketRef.current = packet;
                landmarksRef.current = lmToUse;
                if (poseDropoutStartedAtRef.current !== null) {
                  lastStabilizedAnalysisTimeRef.current = -1;
                }
                poseDropoutStartedAtRef.current = null;
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
                // no_pose result – proper provenance tracking (Berater 2026-08-11)
                const candidateIdentity = {
                  streamEpoch: capturedEpoch,
                  generation: capturedGeneration,
                  sourceId: selectedDevVideoUrl,
                  mediaTimeUs: capturedMediaTimeUs,
                };
                if (!isPoseResultLatest(candidateIdentity, latestPacketRef.current)) {
                  debugHudRef.current.droppedFrames++;
                  return;
                }
                const noPosePacket = makeNoPosePacket(
                  capturedEpoch, capturedSeq, capturedMediaTimeUs,
                  'live_inference', capturedGeneration, selectedDevVideoUrl,
                  v.videoWidth || 0, v.videoHeight || 0
                );
                latestPacketRef.current = noPosePacket;
                landmarksRef.current = null;
                poseDropoutStartedAtRef.current ??= inferenceEndMs;
                const blockedPacket = createBlockedPacket(
                  capturedMediaTimeUs / 1_000_000,
                  capturedEpoch,
                );
                stabilizedOverlayRef.current = overlayStabilizer.stabilize(
                  blockedPacket,
                  capturedGeneration,
                );
                lastStabilizedAnalysisTimeRef.current = capturedMediaTimeUs;
                activeCueGlowTypeRef.current = undefined;
              }
            }).then(status => {
              if (status !== 'processed') isProcessingRef.current = false;
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
          if (canvas2 && lm && renderState.showSkeleton) {
            // ── Staleness gate (Phase 4 fix, Berater v2) ────────────────────
            // FIXES:
            //   - Math.abs catches backward-seek (future landmarks)
            //   - No 5s upper cap – everything beyond tolerance is stale
            //   - Generation check as additional safety net
            const packet = latestPacketRef.current;
            const currentMediaTimeUs = (v.currentTime || 0) * 1_000_000;
            const TOLERANCE_US = 66_667; // ~2 frames at 30fps tolerance
            if (packet) {
              const ageUs = currentMediaTimeUs - packet.mediaTimeUs;
              const absAgeUs = Math.abs(ageUs);
              debugHudRef.current.poseAgeMs = ageUs / 1000;
              // Stale if: beyond tolerance OR generation mismatch
              const isStale = absAgeUs > TOLERANCE_US
                || ('generation' in packet && (packet as any).generation !== framePump.generation);
              if (isStale) {
                debugHudRef.current.syncErrorMs = absAgeUs / 1000;
                const ctx2 = canvas2.getContext('2d');
                if (ctx2) ctx2.clearRect(0, 0, canvas2.width, canvas2.height);
                skipDraw = true;
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

              // ⚡ THROTTLED ANALYSIS: max 20fps. The 50ms cadence stays safely
              // inside the explicit 66.7ms two-frame render tolerance so normal
              // scheduler jitter cannot produce a one-frame blank canvas.
              const nowMs = performance.now();
              const packetMediaTimeUs = packet?.mediaTimeUs ?? 0;
              if (shouldRefreshAnalysisForPosePacket(
                cachedAnalysisRef.current?.packetMediaTimeUs ?? null,
                packetMediaTimeUs,
                nowMs - lastAnalysisTimeRef.current,
              )) {
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
                  packetMediaTimeUs,
                  sourceId: packet?.sourceId ?? selectedDevVideoUrl,
                  streamEpoch: packet?.streamEpoch ?? streamEpochRef.current,
                  generation: packet?.generation ?? framePump.generation,
                  videoWidth: packet?.videoWidth ?? v.videoWidth,
                  videoHeight: packet?.videoHeight ?? v.videoHeight,
                };
              }

              // Canvas draw always runs at 60fps using cached analysis
              const c = cachedAnalysisRef.current;
              if (c) {
                const analysisIsCurrent = isPoseAnalysisCurrent(latestPacketRef.current, {
                  streamEpoch: streamEpochRef.current,
                  generation: framePump.generation,
                  sourceId: selectedDevVideoUrl,
                  analysisMediaTimeUs: c.packetMediaTimeUs,
                  currentMediaTimeUs: (v.currentTime || 0) * 1_000_000,
                });
                if (!analysisIsCurrent) {
                  const ctx2 = canvas2.getContext('2d');
                  if (ctx2) ctx2.clearRect(0, 0, canvas2.width, canvas2.height);
                } else {
                // Read mode from ref (not state) to avoid effect restart on mode switch
                const currentMode = overlayModeRef.current;

                // ── Phase 8: Stabilizer only on NEW analysis frames ──────────
                // The stabilizer was being called at 60fps but analysis only
                // updates at ~15fps. Same analysis feeding the hysteresis timer
                // multiple times caused incorrect timing. Now we only call
                // stabilize() when the underlying analysis actually changed.
                let overlayPacket: TeacherOverlayPacket | undefined = stabilizedOverlayRef.current ?? undefined;
                if (currentMode === 'lehrer-ampel') {
                  const analysisChanged = c.packetMediaTimeUs !== lastStabilizedAnalysisTimeRef.current;
                  if (analysisChanged) {
                    const canColor = CapabilityManager.canOutputColors(
                      capabilityTierManager.frameClock,
                    );
                    const phase = canColor
                      ? findTeacherPhaseAtTime(
                        teacherPhaseAnalysisRef.current,
                        c.packetMediaTimeUs / 1000,
                      )
                      : null;
                    overlayPacket = phase
                      ? phaseToOverlayPacket(
                        phase,
                        c.packetMediaTimeUs / 1_000_000,
                        streamEpochRef.current,
                      )
                      : undefined;
                    stabilizedOverlayRef.current = overlayPacket ?? null;
                    lastStabilizedAnalysisTimeRef.current = c.packetMediaTimeUs;
                  }
                  // Between analysis updates: reuse cached stabilized result
                }

                const targetToRebind = skeletonTargetRebindRef.current;
                if (targetToRebind && v.paused) {
                  const target = getSkeletonTarget(targetToRebind.targetId);
                  const posePacket = latestPacketRef.current;
                  const exactLandmarks = findExactCachedPoseLandmarks(
                    vaganovaFrameCache.getFrames(selectedDevVideoUrlRef.current),
                    c.packetMediaTimeUs / 1_000_000,
                  );
                  const anchor = target
                    && posePacket?.resultKind === 'pose'
                    && posePacket.source === 'frame_cache'
                    && posePacket.sourceId === c.sourceId
                    && posePacket.streamEpoch === c.streamEpoch
                    && posePacket.generation === c.generation
                    && Math.abs(posePacket.mediaTimeUs - c.packetMediaTimeUs) <= 1
                    && exactLandmarks !== null
                    ? resolveSkeletonTargetAnchor(
                      c.sk,
                      target,
                      c.videoWidth,
                      c.videoHeight,
                      targetToRebind.segmentT,
                    )
                    : null;
                  if (target && anchor) {
                    const selected = createSelectedSkeletonTarget({
                      target,
                      anchorNormalized: anchor,
                      distancePx: 0,
                      segmentT: targetToRebind.segmentT,
                    }, {
                      sourceId: c.sourceId,
                      streamEpoch: c.streamEpoch,
                      generation: c.generation,
                      mediaTimeUs: c.packetMediaTimeUs,
                      frameStatus: 'exact_cache_frame',
                    });
                    skeletonTargetRebindRef.current = null;
                    updateSelectedSkeletonTarget(selected);
                    try {
                      const savedReference = getNicoleReferenceLine(
                        localStorage,
                        selectedDevVideoUrlRef.current,
                        target.id,
                      );
                      const savedGuide = projectNicoleReferenceGuide(savedReference);
                      updateNicoleReference(savedGuide, Boolean(savedGuide));
                    } catch {
                      updateNicoleReference(null, false);
                    }
                    setJointPopover({
                      targetId: target.id,
                      normalizedX: anchor.x,
                      normalizedY: anchor.y,
                    });
                    setPanOffset({
                      x: (0.5 - anchor.x) * 100 / 1.8,
                      y: (0.5 - anchor.y) * 100 / 1.8,
                    });
                  } else if (
                    target
                    && posePacket?.resultKind === 'pose'
                    && posePacket.source === 'frame_cache'
                    && posePacket.sourceId === c.sourceId
                    && posePacket.streamEpoch === c.streamEpoch
                    && posePacket.generation === c.generation
                    && Math.abs(posePacket.mediaTimeUs - c.packetMediaTimeUs) <= 1
                  ) {
                    // The exact frame settled, but it cannot prove this target's
                    // geometry (missing cache entry, low visibility or predicted
                    // points). End the pending state instead of retrying forever.
                    skeletonTargetRebindRef.current = null;
                    groundedDraftPendingRef.current = false;
                    groundedSnapPendingRef.current = false;
                    // No trustworthy anchor exists on the exact displayed frame;
                    // keeping the pre-snap pointer would visually misidentify it.
                    clearSkeletonSelection(
                      exactLandmarks === null
                        ? 'exact_cache_frame_missing'
                        : 'pose_geometry_mismatch',
                    );
                  }
                }

                if (
                  groundedDraftPendingRef.current
                  && v.paused
                ) {
                  const groundedTarget = groundedDraftTargetRef.current;
                  const runtimeContext: GroundedGuideFrameContext = {
                    sourceId: selectedDevVideoUrlRef.current,
                    streamEpoch: streamEpochRef.current,
                    generation: framePump.generation,
                    mediaTimeUs: c.packetMediaTimeUs,
                    videoWidth: v.videoWidth,
                    videoHeight: v.videoHeight,
                    policyVersion: BUILD_POLICY.policyVersion,
                  };
                  const refreshedDraft = buildGroundedTeacherDraft({
                    metricAdapter: groundedTarget?.metricAdapter ?? null,
                    targetJointId: groundedTarget?.focusId ?? '',
                    isPaused: true,
                    exactCacheLandmarks: findExactCachedPoseLandmarks(
                      vaganovaFrameCache.getFrames(runtimeContext.sourceId),
                      c.packetMediaTimeUs / 1_000_000,
                    ),
                    posePacket: latestPacketRef.current,
                    analysis: c.vagAn,
                    analysisMediaTimeUs: c.packetMediaTimeUs,
                    overlayPacket: overlayPacket ?? null,
                    runtime: runtimeContext,
                  });
                  groundedDraftPendingRef.current = false;
                  updateGroundedTeacherDraft(refreshedDraft);
                }

                const phaseGateStatus = teacherPhaseAnalysisRef.current?.gate.status;
                const phaseTrafficLightReady = currentMode !== 'lehrer-ampel'
                  || (phaseGateStatus !== undefined && phaseGateStatus !== 'needs_correction');
                renderSkeletonToCanvas(canvas2, c.sk, c.cogPt, c.armPos, c.elbowQ, c.epaul, c.footAl, c.wDist, {
                  showSkeleton: renderState.showSkeleton,
                  showMotionTrails: renderState.showMotionTrails,
                  showCoG: renderState.showCoG,
                  showAngleArcs: renderState.showAngleArcs,
                  selectedJointId: !renderState.isPlaying ? renderState.selectedJointId : '',
                  clickedLandmarkIndex: !renderState.isPlaying ? renderState.clickedLandmarkIndex : undefined,
                  selectedSkeletonTarget: !renderState.isPlaying ? renderState.selectedSkeletonTarget : null,
                  selectedTargetFrameContext: {
                    sourceId: c.sourceId,
                    streamEpoch: c.streamEpoch,
                    generation: c.generation,
                    mediaTimeUs: c.packetMediaTimeUs,
                  },
                  nicoleReferenceGuide: !renderState.isPlaying && nicoleReferenceRenderRef.current.show
                    ? nicoleReferenceRenderRef.current.guide
                    : null,
                  nicoleReferenceFrameContext: {
                    sourceId: c.sourceId,
                    streamEpoch: c.streamEpoch,
                    generation: c.generation,
                    mediaTimeUs: c.packetMediaTimeUs,
                    videoWidth: c.videoWidth,
                    videoHeight: c.videoHeight,
                  },
                  glowPulsePhase: (performance.now() % 1500) / 1500, // 1.5s pulse cycle
                  glowType: currentMode === 'lehrer-ampel' && overlayPacket
                    ? activeCueGlowTypeRef.current
                    : undefined,
                  showIdealOverlay: !renderState.isPlaying && renderState.showIdealOverlay,
                  groundedAplombGuide: groundedTeacherDraftRef.current.kind === 'ready'
                    ? groundedTeacherDraftRef.current.guide
                    : undefined,
                  groundedGuideFrameContext: {
                    sourceId: selectedDevVideoUrlRef.current,
                    streamEpoch: streamEpochRef.current,
                    generation: framePump.generation,
                    mediaTimeUs: c.packetMediaTimeUs,
                    videoWidth: v.videoWidth,
                    videoHeight: v.videoHeight,
                    policyVersion: BUILD_POLICY.policyVersion,
                  },
                  showFocusDim: !renderState.isPlaying && renderState.showFocusDim,
                  isPlie: c.motionCls.isPlie,
                  vaganovaAnalysis: c.vagAn,
                  overlayMode: phaseTrafficLightReady ? currentMode : 'lehrbuch',
                  overlayPacket,
                  overlayFrameContext: {
                    streamEpoch: streamEpochRef.current,
                    framePtsSeconds: c.packetMediaTimeUs / 1_000_000,
                    policyVersion: BUILD_POLICY.policyVersion,
                  },
                }, v.videoWidth, v.videoHeight);
                }
              }
            } // end !skipDraw

          } else if (canvas2 && renderState.showSkeleton) {
            const packet = latestPacketRef.current;
            const cachedAnalysis = cachedAnalysisRef.current;
            const holdNeutral = cachedAnalysis && shouldHoldNeutralSkeleton(packet, {
              streamEpoch: streamEpochRef.current,
              generation: framePump.generation,
              sourceId: selectedDevVideoUrl,
              dropoutStartedAtMs: poseDropoutStartedAtRef.current,
              nowMs: performance.now(),
            });

            if (holdNeutral && packet) {
              const currentMode = overlayModeRef.current;
              renderSkeletonToCanvas(
                canvas2,
                cachedAnalysis.sk,
                cachedAnalysis.cogPt,
                cachedAnalysis.armPos,
                cachedAnalysis.elbowQ,
                cachedAnalysis.epaul,
                cachedAnalysis.footAl,
                cachedAnalysis.wDist,
                {
                  showSkeleton: true,
                  showMotionTrails: false,
                  showCoG: false,
                  showAngleArcs: false,
                  selectedJointId: '',
                  isPlie: cachedAnalysis.motionCls.isPlie,
                  vaganovaAnalysis: cachedAnalysis.vagAn,
                  overlayMode: currentMode,
                  overlayPacket: stabilizedOverlayRef.current ?? undefined,
                  overlayFrameContext: {
                    streamEpoch: packet.streamEpoch,
                    framePtsSeconds: packet.mediaTimeUs / 1_000_000,
                    policyVersion: BUILD_POLICY.policyVersion,
                  },
                },
                v.videoWidth,
                v.videoHeight,
              );
            } else {
              const ctx2 = canvas2.getContext('2d');
              if (ctx2) ctx2.clearRect(0, 0, canvas2.width, canvas2.height);
            }
          } else if (canvas2 && !renderState.showSkeleton) {
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
      videoRef.current?.removeEventListener('seeking', handleSeeking);
      videoRef.current?.removeEventListener('seeked', handleSeeked);
      if (staticFrameRetryRef.current) {
        clearTimeout(staticFrameRetryRef.current);
        staticFrameRetryRef.current = null;
      }
      staticFrameRetryCountRef.current = 0;
    };
  // FIX (Berater 2026-08-11): overlayMode removed from deps.
  // Mode is read via overlayModeRef inside the loop → no effect restart on mode switch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDevVideoUrl]);

  // ── VIDEO TIME SYNC for Scrubber ─────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      const loop = avatarLoopRangeRef.current;
      if (loop && v.currentTime * 1000 >= loop.endMs - 3) {
        v.currentTime = loop.startMs / 1000;
      }
      setCurrentPlayTime(v.currentTime);
    };
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

  useEffect(() => {
    avatarLoopRangeRef.current = null;
  }, [effectiveExerciseLabel, selectedDevVideoUrl, splitScreenMode]);



  // Trigger immediate frame detection on Video Pause or Seek
  const processStaticPausedFrame = () => {
    const capturedVideo = videoRef.current;
    if (!capturedVideo || capturedVideo.readyState < 2 || capturedVideo.seeking) return;

    const capturedTime = capturedVideo.currentTime || 0;
    const capturedMediaTimeUs = capturedTime * 1_000_000;
    const capturedEpoch = streamEpochRef.current;
    const capturedGeneration = framePump.generation;
    const capturedSourceId = selectedDevVideoUrlRef.current;
    const capturedSeq = frameSeqRef.current++;
    const inferenceStartedAtMs = performance.now();
    const capturedIdentity = {
      streamEpoch: capturedEpoch,
      generation: capturedGeneration,
      sourceId: capturedSourceId,
      mediaTimeUs: capturedMediaTimeUs,
    };

    const captureIsCurrent = () => {
      const currentVideo = videoRef.current;
      return currentVideo === capturedVideo && isPoseCaptureCurrent(capturedIdentity, {
        streamEpoch: streamEpochRef.current,
        generation: framePump.generation,
        sourceId: selectedDevVideoUrlRef.current,
        mediaTimeUs: (currentVideo?.currentTime ?? -1) * 1_000_000,
      });
    };

    const acceptNoPose = () => {
      if (!captureIsCurrent()) return;

      clearSkeletonSelection('pose_packet_missing');

      latestPacketRef.current = makeNoPosePacket(
        capturedEpoch,
        capturedSeq,
        capturedMediaTimeUs,
        'pause_reprocess',
        capturedGeneration,
        capturedSourceId,
        capturedVideo.videoWidth || 0,
        capturedVideo.videoHeight || 0,
      );
      landmarksRef.current = null;
      worldLandmarksRef.current = null;
      poseDropoutStartedAtRef.current ??= performance.now();
      const blockedPacket = createBlockedPacket(capturedTime, capturedEpoch);
      stabilizedOverlayRef.current = overlayStabilizer.stabilize(
        blockedPacket,
        capturedGeneration,
      );
      lastStabilizedAnalysisTimeRef.current = capturedMediaTimeUs;
      activeCueGlowTypeRef.current = undefined;
      setDetectedLandmarks(null);
      setDetectedWorldLandmarks(null);
      setIsEngineReady(false);
      staticFrameRetryCountRef.current = 0;
    };

    const acceptPose = (
      landmarks: PoseLandmark[],
      source: 'frame_cache' | 'pause_reprocess',
      worldLandmarks?: PoseLandmark[],
    ) => {
      if (!captureIsCurrent()) return;

      const packet: import('../types/posePacket').PosePacket = {
        streamEpoch: capturedEpoch,
        frameSeq: capturedSeq,
        mediaTimeUs: capturedMediaTimeUs,
        inferenceStartedAtMs,
        inferenceEndedAtMs: performance.now(),
        resultKind: 'pose',
        landmarks,
        worldLandmarks,
        avgVisibility: landmarks.reduce((sum, landmark) => sum + (landmark.visibility ?? 1), 0) / landmarks.length,
        source,
        generation: capturedGeneration,
        sourceId: capturedSourceId,
        videoWidth: capturedVideo.videoWidth || 0,
        videoHeight: capturedVideo.videoHeight || 0,
      };
      latestPacketRef.current = packet;
      landmarksRef.current = landmarks;
      worldLandmarksRef.current = worldLandmarks ?? null;
      cachedAnalysisRef.current = null;
      activeCueGlowTypeRef.current = undefined;
      const phase = source === 'frame_cache'
        ? findTeacherPhaseAtTime(teacherPhaseAnalysisRef.current, capturedTime * 1000)
        : null;
      stabilizedOverlayRef.current = phase
        ? phaseToOverlayPacket(phase, capturedTime, capturedEpoch)
        : null;
      // Paused colours come from the completed phase analysis, never from a
      // newly inferred isolated still frame.
      lastStabilizedAnalysisTimeRef.current = capturedMediaTimeUs;
      poseDropoutStartedAtRef.current = null;
      setDetectedLandmarks(landmarks);
      setDetectedWorldLandmarks(worldLandmarks ?? null);
      setIsEngineReady(true);
      staticFrameRetryCountRef.current = 0;
    };

    const cachedFrames = vaganovaFrameCache.getFrames(capturedSourceId);
    const exactCached = findExactCachedPoseLandmarks(cachedFrames, capturedTime);
    if (exactCached) {
      // Exact cached evidence is also the exact rendered geometry. Interpolated
      // fallback geometry is allowed for display, but its paused colors remain
      // neutral because the evidence builder requires an exact cache PTS.
      acceptPose(clonePausedCacheLandmarks(exactCached), 'frame_cache');
      return;
    }
    const interpolatedCached = vaganovaFrameCache.getFrame(capturedSourceId, capturedTime);
    if (interpolatedCached) {
      acceptPose(clonePausedCacheLandmarks(interpolatedCached), 'frame_cache');
      return;
    }

    void realMediaPipePose.processFrame(capturedVideo, (data: PoseResultsData) => {
      if (!data.landmarks || data.landmarks.length < 33) {
        acceptNoPose();
        return;
      }

      const smoothed = vaganovaPoseEngine.smoothLandmarks(data.landmarks, capturedTime);
      if (smoothed) acceptPose(smoothed, 'pause_reprocess', data.worldLandmarks);
      else acceptNoPose();
    }).then(status => {
      if (!captureIsCurrent() || capturedVideo.seeking) return;

      if (status === 'error' || status === 'unavailable') {
        acceptNoPose();
        return;
      }

      if (status !== 'busy') return;
      if (staticFrameRetryCountRef.current >= 5) {
        acceptNoPose();
        return;
      }

      staticFrameRetryCountRef.current += 1;
      if (staticFrameRetryRef.current) clearTimeout(staticFrameRetryRef.current);
      staticFrameRetryRef.current = setTimeout(() => {
        staticFrameRetryRef.current = null;
        processStaticPausedFrame();
      }, 50);
    }).catch(acceptNoPose);
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
      preIndexRunRef.current += 1;
      setIsPreIndexing(false);
      clearTeacherPhaseAssessment();
      clearSkeletonSelection();
      selectedDevVideoUrlRef.current = newVid.url;
      setSelectedDevVideoUrl(newVid.url);
      setCuePoints(vaganovaPreAnalyzer.getCuePoints(newVid.url));
      vaganovaKineticAI.reset();
      vaganovaPoseEngine.reset();
      setIsPlaying(true);
    }
  };

  // Switch Dropdown Selection
  const handleVideoSelect = (url: string) => {
    const selectedVideo = videoList.find(video => video.url === url);
    if (/tendu/i.test(selectedVideo?.topic ?? '')) {
      onExerciseChange?.('Battement Tendu');
    }
    realMediaPipePose.reset();
    vaganova3DKinematics.reset();
    vaganovaKineticAI.reset();
    vaganovaPoseEngine.reset();
    setDetectedLandmarks(null);
    setDetectedWorldLandmarks(null);
    setIsEngineReady(false);
    preIndexRunRef.current += 1;
    setIsPreIndexing(false);
    clearTeacherPhaseAssessment();
    clearSkeletonSelection();
    selectedDevVideoUrlRef.current = url;
    setSelectedDevVideoUrl(url);
    setCuePoints(vaganovaPreAnalyzer.getCuePoints(url));
    setIsPlaying(true);
  };

  // Interactive Cue-Point Seek & Frame-Freeze Handler
  // PROJECT_DECISION 2026-08-11: Clicking a cue point ALWAYS freezes the frame.
  // The teacher needs to study the frozen frame before deciding on action.
  // Slow-Mo playback is only triggered via the explicit 'Slow-Mo Sequenz' button.
  const handleSeekToCuePoint = (cue: VaganovaCuePoint) => {
    if (videoRef.current) {
      // Phase 2 (Berater v2): Pre-invalidate BEFORE setting currentTime
      // This ensures no stale in-flight inference can contaminate the new frame
      framePump.bumpGeneration();
      clearSkeletonSelection('analysis_stale', false);
      latestPacketRef.current = null;
      // NOTE: cachedAnalysisRef is intentionally NOT cleared here.
      // The old analysis provides skeleton data for the glow animation
      // while processStaticPausedFrame computes fresh landmarks.
      // Once fresh landmarks arrive, the rAF loop recalculates analysis.
      stabilizedOverlayRef.current = null;

      videoRef.current.currentTime = cue.timeSeconds;
      // Freeze frame immediately – teacher studies the still image
      videoRef.current.pause();
      setIsPlaying(false);

      setSelectedFrameTime(cue.timecodeStr);
      setSelectedJointId(cue.jointFocusId);
      setClickedLandmarkIndex(undefined); // Cue-based → fallback to region-center glow
      // Cue classification is not the live frame's color authority.
      activeCueGlowTypeRef.current = undefined;

      // ── AUTO-ZOOM: Zoom zum relevanten Gelenk ──
      const jointPositions: Record<string, { y: number }> = {
        'head_epaulement': { y: 0.15 },
        'shoulder_line':   { y: 0.25 },
        'spine_center':    { y: 0.35 },
        'port_de_bras_arms': { y: 0.30 },
        'left_elbow':      { y: 0.30 },
        'pelvis_core':     { y: 0.45 },
        'left_knee':       { y: 0.65 },
        'right_knee':      { y: 0.65 },
      };
      const jPos = jointPositions[cue.jointFocusId];
      if (jPos) {
        const autoZoom = 1.8;
        const panY = (0.5 - jPos.y) * 100 / autoZoom;
        setZoomLevel(autoZoom);
        setPanOffset({ x: 0, y: panY });
      }

      // Auto-enable visual overlays for full premium experience
      setShowIdealOverlay(true);
      if (!showFocusDim) setShowFocusDim(true);

      vaganovaKineticAI.reset();

      processStaticPausedFrame();

      // Lift selected cue to right panel for KI detail view
      onSelectedCue?.(cue);
    }
  };

  // 🎬 Slow-Mo Clip: spielt 1.5 Sekunden Videoinhalt um den Cue-Point bei 0.25x ab
  // Fenster: -0.5s (exzentrische Phase / Vorbereitung) bis +1.0s (konzentrische Auswirkung)
  // Biomechanische Logik: Die -0.5s zeigen WANN die Kontrolle verloren geht,
  // die +1.0s zeigen die Auswirkung auf die nachfolgende Bewegungsphase.
  const handleSlowMoClip = (cue: VaganovaCuePoint) => {
    const vid = videoRef.current;
    if (!vid) return;

    const startAt = Math.max(0, cue.timeSeconds - 0.5);  // 0.5s vor dem Cue-Point
    const endAt   = cue.timeSeconds + 1.0;                // 1.0s nach dem Cue-Point (1.5s gesamt)

    if (slowMoTimerRef.current) clearTimeout(slowMoTimerRef.current);

    clearGroundedSelectionForPlayback();
    vid.currentTime = startAt;
    vid.playbackRate = 0.25;
    setPlaybackSpeed(0.25);
    vid.play();
    setIsPlaying(true);

    // Stopp via timeupdate (präziser als setTimeout)
    const onTimeUpdate = () => {
      if (vid.currentTime >= endAt) {
        vid.pause();
        setIsPlaying(false);
        vid.playbackRate = 1;
        setPlaybackSpeed(1);
        vid.removeEventListener('timeupdate', onTimeUpdate);
      }
    };
    vid.addEventListener('timeupdate', onTimeUpdate);
  };

  // 🦴 SKELETON TARGET CLICK – hit-test the same reconstructed joints and
  // bone segments that are actually painted by the renderer.
  const handleSkeletonClick = (e: React.MouseEvent<HTMLElement>) => {
    // Allow clicking at any time — if playing, we auto-pause below on joint hit
    // But NOT in annotation/drawing mode — those clicks are for strokes
    if (isAnnotationModeActive) return;
    const bounds = overlayBounds;
    const cached = cachedAnalysisRef.current;
    const packet = latestPacketRef.current;
    const video = videoRef.current;
    if (!cached || !packet || packet.resultKind !== 'pose' || !bounds || !video) {
      clearSkeletonSelection('analysis_stale');
      return;
    }

    const analysisIsCurrent = isPoseAnalysisCurrent(packet, {
      streamEpoch: cached.streamEpoch,
      generation: cached.generation,
      sourceId: cached.sourceId,
      analysisMediaTimeUs: cached.packetMediaTimeUs,
      currentMediaTimeUs: video.currentTime * 1_000_000,
    });
    if (!analysisIsCurrent
      || cached.videoWidth !== packet.videoWidth
      || cached.videoHeight !== packet.videoHeight) {
      clearSkeletonSelection('analysis_stale');
      return;
    }

    // Get click position relative to the canvas rect (the overlay area)
    // CRITICAL: rect is the VISUAL bounding box (includes CSS zoom/pan transforms)
    // but landmark coordinates are in LOGICAL canvas space. We must convert.
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    // Convert from visual space → logical canvas space
    const scaleX = bounds.width / rect.width;
    const scaleY = bounds.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    // Only consider clicks that are within the overlay bounds (now in logical space)
    if (clickX < 0 || clickY < 0 || clickX > bounds.width || clickY > bounds.height) {
      clearSkeletonSelection();
      return;
    }

    const hit = findSkeletonTargetAtPoint({
      skeleton: cached.sk,
      canvasX: clickX,
      canvasY: clickY,
      canvasWidth: bounds.width,
      canvasHeight: bounds.height,
      videoWidth: packet.videoWidth,
      videoHeight: packet.videoHeight,
    });

    if (hit) {
      updateNicoleReference(null, false);
      const resolvedNormX = hit.anchorNormalized.x;
      const resolvedNormY = hit.anchorNormalized.y;

      // Popover anchor: ALWAYS use normalized coords so arrow tracks correctly
      // across auto-zoom and pan changes (fixes drift on bone clicks)
      setJointPopover({
        targetId: hit.target.id,
        normalizedX: resolvedNormX,
        normalizedY: resolvedNormY,
      });
      const wasPlaying = Boolean(videoRef.current && !videoRef.current.paused);
      // Pause video for better exploration
      if (videoRef.current && wasPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      }

      const mappedJointId = hit.target.focusId;
      if (mappedJointId) {
        setSelectedJointId(mappedJointId);
        setClickedLandmarkIndex(hit.target.representativeLandmarkIndex);
        activeCueGlowTypeRef.current = undefined;

        const currentVideo = videoRef.current;
        groundedDraftTargetRef.current = hit.target.metricAdapter
          ? Object.freeze({
            metricAdapter: hit.target.metricAdapter,
            focusId: hit.target.focusId,
          })
          : null;
        const nearestExactFrame = currentVideo
          ? findNearestExactPoseFrame(
            vaganovaFrameCache.getFrames(selectedDevVideoUrlRef.current),
            currentVideo.currentTime,
          )
          : null;
        const pendingSelection = createSelectedSkeletonTarget(hit, {
          sourceId: cached.sourceId,
          streamEpoch: cached.streamEpoch,
          generation: cached.generation,
          mediaTimeUs: cached.packetMediaTimeUs,
          frameStatus: nearestExactFrame ? 'pending_exact_frame' : 'display_frame',
        });
        updateSelectedSkeletonTarget(pendingSelection);

        if (!nearestExactFrame || !currentVideo) {
          skeletonTargetRebindRef.current = null;
          groundedDraftPendingRef.current = false;
          groundedSnapPendingRef.current = false;
          updateGroundedTeacherDraft(createBlockedGroundedTeacherDraft(
            hit.target.metricAdapter
              ? 'exact_cache_frame_missing'
              : 'measurement_not_authorized',
            hit.target.focusId,
          ));
        } else {
          skeletonTargetRebindRef.current = Object.freeze({
            targetId: hit.target.id,
            segmentT: hit.segmentT,
          });
          const requiresSeek = Math.abs(
            nearestExactFrame.timeMs - currentVideo.currentTime * 1000,
          ) > 0.001;
          groundedSnapPendingRef.current = requiresSeek;
          groundedDraftPendingRef.current = !requiresSeek
            && Boolean(hit.target.metricAdapter);
          updateGroundedTeacherDraft(createBlockedGroundedTeacherDraft(
            hit.target.metricAdapter
              ? 'analysis_stale'
              : 'measurement_not_authorized',
            hit.target.focusId,
          ));
          if (requiresSeek) currentVideo.currentTime = nearestExactFrame.timeMs / 1000;
          else processStaticPausedFrame();
        }

        // Auto-zoom to the ACTUAL landmark position (supports synthetic index 100)
        const autoZoom = 1.8;
        // Use resolvedNormX/Y which correctly handles synthetic indices
        const panY = (0.5 - resolvedNormY) * 100 / autoZoom;
        const panX = (0.5 - resolvedNormX) * 100 / autoZoom;
        setZoomLevel(autoZoom);
        setPanOffset({ x: panX, y: panY });

        // A green 2D orientation guide is only allowed for provenance-gated adapters.
        setShowIdealOverlay(Boolean(hit.target.metricAdapter));
        if (!showFocusDim) setShowFocusDim(true);
      }
    } else {
      clearSkeletonSelection();
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

  // ── KI-VORSCHLAG für manuell gesetzte Marker ───────────────────────────
  // Liest die aktuelle vaganovaAnalysis und generiert kontextsensitiven Vorschlagstext
  const generateManualCueSuggestion = (va: typeof vaganovaAnalysis): {
    diagnosisText: string; goalText: string; practiceText: string; headline: string; status: VaganovaCuePoint['status'];
  } => {
    if (!canGenerateLegacyUngroundedCues() || !va) {
      return buildNeutralManualCueSuggestion(motionClass.detectedPoseName);
    }

    // Finde den auffälligsten Messwert
    const checks: Array<{ condition: boolean; headline: string; status: 'GOOD' | 'CORRECTION' | 'WARNING'; diag: string; goal: string; practice: string }> = [
      {
        condition: (va.armLineQualityL?.status === 'ERROR' || va.armLineQualityR?.status === 'ERROR'),
        headline: 'Arm-Linie – Ellbogen und Handgelenk prüfen',
        status: 'CORRECTION',
        diag: `Der Arm zeigt eine gebrochene Linie — meist als Knick im Ellbogen oder abgeknicktes Handgelenk sichtbar. Gemessen: ${(va.armLineQualityL?.status === 'ERROR' ? va.armLineQualityL : va.armLineQualityR)?.value?.toFixed(0) ?? '?'}° Abweichung.`,
        goal: 'Der Arm bildet eine fließende Kurve vom Schulterblatt bis zur Fingerspitze — kein Knick, kein hochgezogenes Schulterblatt. Ellbogen liegt minimal tiefer als die Schulter.',
        practice: 'Vor dem Spiegel ohne Musik durch alle Positionen führen. An jeder Position kurz anhalten: Ellbogen unter der Schulter? Handgelenk in der Verlängerung des Unterarms? Augen schließen, Gefühl spüren, vergleichen.',
      },
      {
        condition: (va.shoulderSymmetry?.status === 'ERROR'),
        headline: 'Schulter-Asymmetrie – Epaulement prüfen',
        status: 'WARNING',
        diag: `Die Schultern sind an diesem Frame nicht parallel — eine Seite ist deutlich höher. Gemessen: ${va.shoulderSymmetry?.value?.toFixed(1) ?? '?'}° Neigung. Häufig entsteht das durch Überanstrengung im oberen Trapezius.`,
        goal: 'Schultern wie ein Tablett, das du balancierst — kein Tropfen darf herunterfallen. Schulterblätter aktiv nach unten, Nacken lang und entspannt.',
        practice: 'Schultern hochziehen, 3 Sekunden halten, dann langsam loslassen und tiefer als normal sinken lassen — das ist die richtige Position. Täglich auch außerhalb des Tanzens üben.',
      },
      {
        condition: (va.spineTilt?.status === 'ERROR'),
        headline: 'Oberkörper-Achse – Wirbelsäule aufrichten',
        status: 'WARNING',
        diag: `Die Torso-Linie weicht von der Senkrechten ab — der Oberkörper neigt sich seitlich oder nach vorne. Gemessen: ${va.spineTilt?.value?.toFixed(1) ?? '?'}° Abweichung. Die gelbe Torso-Linie im Skeleton zeigt genau diese Schiefstellung. Das passiert häufig, wenn die seitliche Rumpfmuskulatur oder die Tiefenstabilisatoren (M. multifidus, M. transversus abdominis) ermüden.`,
        goal: 'Die Wirbelsäule bleibt wie eine aufgefädelte Perlenkette lang und senkrecht — keine Seitneigung, kein Vorbeugen. Die Torso-Linie im Skeleton sollte grün sein (vertikal). Der Oberkörper liegt ruhig über dem Becken, als ob ein Faden den Scheitel zur Decke zieht.',
        practice: 'An der Stange: Plié ausführen und dabei im Spiegel (Seitenansicht) beobachten, ob der Oberkörper genau senkrecht bleibt. Faust zwischen Brustbein und Kinn halten — der Abstand sollte sich im Plié nicht verändern. Seitlich: Hände auf die Hüften — beim Tendu bleibt der Oberkörper exakt über dem Becken, kein Ausweichen zur Standbeinseite.',
      },
      {
        condition: (va.pelvicTilt?.status === 'ERROR'),
        headline: 'Becken-Achse – Neutralposition halten',
        status: 'WARNING',
        diag: `Beckenkippung erkannt — das Becken ist nach vorne oder hinten rotiert. Wert: ${va.pelvicTilt?.value?.toFixed(1) ?? '?'}°. Eine gekippte Beckenposition verschiebt die gesamte Körperachse und führt zu Kompensation in Wirbelsäule und Knien.`,
        goal: 'Becken in neutraler Mitte — nicht aktiv eingedrückt, nicht gewölbt. Wirbelsäule behält ihre natürliche S-Kurve. Energie fließt nach oben zur offenen Brust.',
        practice: 'Hand auf Bauchnabel, Hand auf Lendenwirbel — beim langsamen Plié spüren, ob sich die Lendenwirbel mitbewegen. Sie sollen ruhig bleiben. Übung: \"Wasserglas auf dem Steißbein\" — im Stehen und Plié darf es nicht kippen.',
      },
      {
        condition: (va.shoulderSymmetry?.status === 'CORRECT' && va.shoulderElevationL?.status !== 'ERROR' && va.shoulderElevationR?.status !== 'ERROR'),
        headline: 'Schöne Haltung – diesen Moment festhalten',
        status: 'GOOD',
        diag: 'An diesem Frame zeigt die Haltung — insbesondere die Schulter-Horizontallität — eine sehr gute Ausführung. Dieser Moment verdient es, als Referenz festgehalten zu werden.',
        goal: 'Dieses Körpergefühl als persönlichen Anker-Moment speichern. Auf Abruf reproduzieren können — das ist das Trainingsziel.',
        practice: 'Augen schließen, Körpergefühl spüren. Was passiert gerade mit den Schulterblättern, dem Nacken, dem Becken? Dieses Gefühl täglich bewusst aufrufen.',
      },
    ];

    const match = checks.find(c => c.condition);
    if (match) return {
      headline: match.headline,
      status: match.status,
      diagnosisText: match.diag,
      goalText: match.goal,
      practiceText: match.practice,
    };

    // Fallback: generischer Beobachtungspunkt
    return buildNeutralManualCueSuggestion(motionClass.detectedPoseName);
  };

  // TEACHER CRUD: Add Cue-Point at current video playback position
  const handleAddCuePointAtCurrentFrame = () => {
    if (!videoRef.current) return;
    const timeSec = videoRef.current.currentTime || 0;
    const mins = Math.floor(timeSec / 60);
    const secs = (timeSec % 60).toFixed(3).padStart(6, '0');
    const timecodeStr = `0${mins}:${secs}`;

    // KI generiert Vorschlagstext basierend auf aktuellem Frame
    const suggestion = generateManualCueSuggestion(vaganovaAnalysis);

    const previousCuePoints = vaganovaPreAnalyzer.getCuePoints(selectedDevVideoUrl);
    const updated = vaganovaPreAnalyzer.addCuePoint(selectedDevVideoUrl, {
      timeSeconds: timeSec,
      timecodeStr,
      poseName: motionClass.detectedPoseName,
      status: suggestion.status,
      headline: suggestion.headline,
      cueMetaphor: '',
      jointFocusId: selectedJointId || 'pelvis_core',
      diagnosisText: suggestion.diagnosisText,
      goalText: suggestion.goalText,
      practiceText: suggestion.practiceText,
    });

    setCuePoints(updated);
    // Direkt in den Edit-Modus für den neuen Cue springen
    const newCue = findAddedCuePoint(previousCuePoints, updated);
    if (newCue) {
      setEditingCueId(newCue.id);
      setEditForm({
        poseName: newCue.poseName,
        headline: newCue.headline,
        cueMetaphor: newCue.cueMetaphor ?? '',
        status: newCue.status,
        diagnosisText: suggestion.diagnosisText,
        goalText: suggestion.goalText,
        practiceText: suggestion.practiceText,
      });
    }
  };

  // TEACHER CRUD: Start Editing
  const handleStartEdit = (cue: VaganovaCuePoint, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCueId(cue.id);
    setEditForm({
      poseName: cue.poseName,
      headline: cue.headline,
      cueMetaphor: cue.cueMetaphor,
      status: cue.status,
      diagnosisText: cue.diagnosisText ?? '',
      goalText: cue.goalText ?? '',
      practiceText: cue.practiceText ?? '',
    });
  };

  // TEACHER CRUD: Save Edit
  const handleSaveEdit = (cueId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const existingCue = cuePoints.find(cue => cue.id === cueId);
    if (!existingCue) return;
    const patch: CueReviewEditablePatch = {
      poseName: editForm.poseName,
      headline: editForm.headline,
      cueMetaphor: editForm.cueMetaphor,
      status: editForm.status,
      diagnosisText: editForm.diagnosisText || undefined,
      goalText: editForm.goalText || undefined,
      practiceText: editForm.practiceText || undefined,
    };
    try {
      const updated = existingCue.reviewAudit
        ? vaganovaPreAnalyzer.reviseReviewedCue(selectedDevVideoUrl, cueId, patch, cueReviewExpectedState(existingCue.reviewAudit))
        : vaganovaPreAnalyzer.updateCuePoint(selectedDevVideoUrl, cueId, {
          ...patch,
          provenance: existingCue.provenance === 'ki_suggestion' ? 'nicole_edited' : existingCue.provenance,
        });
      setCuePoints(updated);
      setEditingCueId(null);
    } catch (error) {
      setCuePoints(vaganovaPreAnalyzer.getCuePoints(selectedDevVideoUrl));
      showAnalyseToast(error instanceof Error ? error.message : 'Revision konnte nicht gespeichert werden.');
    }
  };

  // TEACHER CRUD: Delete Cue-Point
  const handleDeleteCuePoint = (cueId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (cuePoints.some(cue => cue.id === cueId && cue.reviewAudit)) {
      showAnalyseToast('Auditierte Nicole-Entwürfe bleiben als Revisionsspur erhalten.');
      return;
    }
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
        processStaticPausedFrame();
      } else {
        clearGroundedSelectionForPlayback();
        videoRef.current.play().catch(() => {});
        // Reset zoom + cue-overlays when resuming playback
        setZoomLevel(1);
        setPanOffset({ x: 0, y: 0 });
        setIsAnnotationModeActive(false);
      }
    }
  };

  const clearGroundedSelectionForPlayback = () => {
    clearSkeletonSelection('video_playing');
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

    function finalize(merge: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
      // 5. Caption bar below image (if captionDraft is set)
      const caption = captionDraft.trim();
      let finalCanvas = merge;
      if (caption) {
        const PADDING = 14;
        const FONT_SIZE = 13;
        const LINE_HEIGHT = 18;
        // Measure and wrap text
        const tmpCtx = document.createElement('canvas').getContext('2d')!;
        tmpCtx.font = `600 ${FONT_SIZE}px Inter, system-ui, sans-serif`;
        const maxW = W - PADDING * 2;
        const words = caption.split(' ');
        const lines: string[] = [];
        let cur = '';
        words.forEach(w => {
          const test = cur ? `${cur} ${w}` : w;
          if (tmpCtx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
          else cur = test;
        });
        if (cur) lines.push(cur);
        const barH = lines.length * LINE_HEIGHT + PADDING * 2;
        const total = document.createElement('canvas');
        total.width = W;
        total.height = H + barH;
        const tc = total.getContext('2d')!;
        tc.drawImage(merge, 0, 0);
        // Dark caption bar
        tc.fillStyle = 'rgba(8,4,18,0.97)';
        tc.fillRect(0, H, W, barH);
        // Top border line
        tc.fillStyle = 'rgba(168,129,189,0.5)';
        tc.fillRect(0, H, W, 1);
        // Caption text
        tc.fillStyle = 'rgba(220,215,235,0.9)';
        tc.font = `600 ${FONT_SIZE}px Inter, system-ui, sans-serif`;
        tc.textBaseline = 'top';
        lines.forEach((line, i) => tc.fillText(line, PADDING, H + PADDING + i * LINE_HEIGHT));
        finalCanvas = total;
      }

      const dataUrl = finalCanvas.toDataURL('image/png');
      // Thumbnail (30% scale of FULL height incl. caption)
      const thumbW = Math.round(finalCanvas.width * 0.3);
      const thumbH = Math.round(finalCanvas.height * 0.3);
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = thumbW;
      thumbCanvas.height = thumbH;
      const tctx = thumbCanvas.getContext('2d');
      tctx?.drawImage(finalCanvas, 0, 0, thumbW, thumbH);
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
        caption: captionDraft.trim() || undefined,
        studentName: (document.querySelector('.monolith-card select, select') as HTMLSelectElement | null)?.value ?? undefined,
        createdAt: Date.now(),
        note: '',
      };
      const updated = [...annotationEntries, entry];
      const accepted = pushAnnotations(updated);
      if (!accepted) return;
      // Open lightbox showing the new entry
      setLightboxIndex(updated.length - 1);
      setLightboxOpen(true);
      annotationCanvasRef.current?.clear();
    }
  };

  // Update note on a saved annotation
  const handleUpdateNote = (id: string, note: string) => {
    updateAnnotationEntry(id, { note });
  };

  // KI-Vorschlag für bestehende leere TEACHER_CREATED Cues generieren
  const handleApplyKiSuggestion = (cueId: string) => {
    if (!canGenerateLegacyUngroundedCues()) return;
    const suggestion = generateManualCueSuggestion(vaganovaAnalysis);
    const cueMetaphor = '(KI-Vorschlag — durch Nicole editierbar)';
    const updated = vaganovaPreAnalyzer.updateCuePoint(selectedDevVideoUrl, cueId, {
      headline: suggestion.headline,
      status: suggestion.status,
      diagnosisText: suggestion.diagnosisText,
      goalText: suggestion.goalText,
      practiceText: suggestion.practiceText,
      cueMetaphor,
    });
    setCuePoints(updated);
    // Direkt in Edit-Modus
    setEditingCueId(cueId);
    setEditForm({
      poseName: updated.find(c => c.id === cueId)?.poseName ?? '',
      headline: suggestion.headline,
      cueMetaphor,
      status: suggestion.status,
      diagnosisText: suggestion.diagnosisText,
      goalText: suggestion.goalText,
      practiceText: suggestion.practiceText,
    });
  };

  // Update caption on a saved annotation
  const handleUpdateCaption = (id: string, caption: string) => {
    updateAnnotationEntry(id, { caption });
  };

  // Inline-Edit für TEACHER_CREATED Cues: speichert ein einzelnes Feld on-blur
  const handleInlineCueEdit = (cueId: string, field: CueReviewEditablePatch) => {
    const existingCue = cuePoints.find(cue => cue.id === cueId);
    if (!existingCue) return;
    try {
      const updated = existingCue.reviewAudit
        ? vaganovaPreAnalyzer.reviseReviewedCue(selectedDevVideoUrl, cueId, field, cueReviewExpectedState(existingCue.reviewAudit))
        : vaganovaPreAnalyzer.updateCuePoint(selectedDevVideoUrl, cueId, {
          ...field,
          provenance: existingCue.provenance === 'ki_suggestion' ? 'nicole_edited' : existingCue.provenance,
        });
      setCuePoints(updated);
    } catch (error) {
      setCuePoints(vaganovaPreAnalyzer.getCuePoints(selectedDevVideoUrl));
      showAnalyseToast(error instanceof Error ? error.message : 'Revision konnte nicht gespeichert werden.');
    }
  };

  const handleReviewedCueTransition = (cueId: string, transition: 'approve' | 'reject' | 'reopen') => {
    const cue = cuePoints.find(item => item.id === cueId && item.reviewAudit);
    if (!cue?.reviewAudit) return;
    try {
      setCuePoints(vaganovaPreAnalyzer.transitionReviewedCue(
        selectedDevVideoUrl, cueId, transition, cueReviewExpectedState(cue.reviewAudit),
      ));
    } catch (error) {
      setCuePoints(vaganovaPreAnalyzer.getCuePoints(selectedDevVideoUrl));
      showAnalyseToast(error instanceof Error ? error.message : 'Review konnte nicht gespeichert werden.');
    }
  };

  const handleReviewedAudience = (cueId: string, audience: 'learner' | 'parent', visible: boolean) => {
    const cue = cuePoints.find(item => item.id === cueId && item.reviewAudit);
    if (!cue?.reviewAudit) return;
    try {
      setCuePoints(vaganovaPreAnalyzer.setReviewedAudience(
        selectedDevVideoUrl, cueId, audience, visible, cueReviewExpectedState(cue.reviewAudit),
      ));
    } catch (error) {
      setCuePoints(vaganovaPreAnalyzer.getCuePoints(selectedDevVideoUrl));
      showAnalyseToast(error instanceof Error ? error.message : 'Freigabe konnte nicht gespeichert werden.');
    }
  };

  const handleTakeOverGroundedDraft = () => {
    if (groundedTeacherDraft.kind !== 'ready' || !selectedSkeletonTarget) return false;
    let updated: VaganovaCuePoint[];
    try {
      updated = vaganovaPreAnalyzer.addGroundedTeacherDraft(
        selectedDevVideoUrl,
        groundedTeacherDraft,
        selectedSkeletonTarget,
        motionClass.detectedPoseName,
      );
    } catch (error) {
      showAnalyseToast(error instanceof Error ? error.message : 'Nicole-Entwurf konnte nicht gespeichert werden.');
      return false;
    }
    setCuePoints(updated);
    const created = updated.find(cue => cue.reviewAudit?.origin.anchor.mediaTimeUs === groundedTeacherDraft.evidence.mediaTimeUs
      && cue.reviewAudit.origin.anchor.targetId === selectedSkeletonTarget.targetId);
    if (created) {
      setExpandedCueIds(previous => new Set(previous).add(created.id));
      setEditingCueId(created.id);
      setEditForm({
        poseName: created.poseName, headline: created.headline, cueMetaphor: created.cueMetaphor,
        status: created.status, diagnosisText: created.diagnosisText ?? '', goalText: created.goalText ?? '',
        practiceText: created.practiceText ?? '',
      });
    }
    return Boolean(created);
  };

  const handleSaveNicoleReference = () => {
    const selected = selectedSkeletonTarget;
    const target = selected ? getSkeletonTarget(selected.targetId) : null;
    const cached = cachedAnalysisRef.current;
    const posePacket = latestPacketRef.current;
    const video = videoRef.current;
    if (!selected || target?.kind !== 'bone' || !cached || !posePacket || !video || !video.paused) {
      showAnalyseToast('Nicole-Referenz benötigt einen exakt pausierten Bone.');
      return false;
    }
    if (!canCreateNicoleReferenceFromSource(selectedDevVideoUrl)) {
      showAnalyseToast('Diese spontane Studioaufnahme ist nur Testmaterial und kann keine Nicole-Referenz werden.');
      return false;
    }
    try {
      const phaseAnalysis = teacherPhaseAnalysisRef.current;
      const targetTimeMs = selected.mediaTimeUs / 1000;
      const phase = phaseAnalysis?.gate.status === 'ready'
        ? phaseAnalysis.phases.find(item => targetTimeMs >= item.startMs && targetTimeMs <= item.endMs)
        : undefined;
      const perspective = phaseAnalysis?.gate.detectedPerspective;
      const phaseBindingCandidate = phase && perspective
        ? Object.freeze({
          schemaVersion: 1,
          exerciseId: phaseAnalysis.exerciseId,
          phaseId: phase.id,
          perspectivePlane: perspective === 'FRONTAL' ? 'frontal' : 'profile',
          levelLabel: phaseAnalysis.levelLabel,
          policyVersion: phaseAnalysis.policyVersion,
          reviewState: 'nicole_approved',
          sourcePhaseStartMs: phase.startMs,
          sourcePhaseEndMs: phase.endMs,
          sourcePhaseRepresentativeTimeMs: phase.representativeTimeMs,
        })
        : undefined;
      const phaseBinding: NicoleReferencePhaseBinding | undefined = nicoleReferencePhaseBindingIsValid(phaseBindingCandidate)
        ? phaseBindingCandidate
        : undefined;
      const record = saveNicoleReferenceLine({
        storage: localStorage,
        videoSourceId: selectedDevVideoUrl,
        selectedTarget: selected,
        posePacket,
        phaseBinding,
        frame: {
          sourceId: cached.sourceId,
          streamEpoch: cached.streamEpoch,
          generation: cached.generation,
          mediaTimeUs: cached.packetMediaTimeUs,
          videoWidth: cached.videoWidth,
          videoHeight: cached.videoHeight,
        },
      });
      const guide = projectNicoleReferenceGuide(record);
      updateNicoleReference(guide, Boolean(guide));
      setNicoleReferenceStorageRevision(value => value + 1);
      showAnalyseToast(phaseBinding
        ? `Nicole-Referenz V${record.versions.length} gespeichert · ${phase?.label} · ${target.label}`
        : `Nicole-Referenz V${record.versions.length} gespeichert · ohne Phasenbindung · ${target.label}`);
      return true;
    } catch (error) {
      showAnalyseToast(error instanceof Error ? error.message : 'Nicole-Referenz konnte nicht gespeichert werden.');
      return false;
    }
  };

  const persistCueUpdate = (
    cueId: string,
    updates: Partial<VaganovaCuePoint>,
  ) => {
    setCuePoints(prev => {
      const updated = prev.map(cue => cue.id === cueId ? { ...cue, ...updates } : cue);
      vaganovaPreAnalyzer.saveCuePoints(selectedDevVideoUrl, updated);
      return updated;
    });
  };

  // Update the dataUrl of an annotation (after lightbox burn-in)
  const handleUpdateDataUrl = (id: string, dataUrl: string) => {
    updateAnnotationEntry(id, { dataUrl });
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
  };

  const handleInspectTeacherPhase = (phaseTimeMs: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(phaseTimeMs)) return;
    clearSkeletonSelection('analysis_stale', false);
    video.pause();
    video.currentTime = phaseTimeMs / 1000;
    setIsPlaying(false);
  };

  // AUTOMATIC MOTION & PERSPECTIVE KI-CLASSIFIER
  const motionClass: MotionClassificationResult = vaganovaMotionClassifier.classify(detectedLandmarks);

  // Phase 5 (Berater v2): Geometry FAIL-CLOSED
  // If video dimensions are unavailable or too small, skip all geometry-dependent analysis.
  // Previously fell back to 1×1 which produced invalid measurements.
  const videoEl = videoRef.current;
  const geometryValid = videoEl && videoEl.videoWidth > 1 && videoEl.videoHeight > 1;
  const vw = geometryValid ? videoEl.videoWidth : 0;
  const vh = geometryValid ? videoEl.videoHeight : 0;

  // 🦴 RECONSTRUCT 3D FORWARD KINEMATICS & TEMPORAL SKELETON
  // Skeleton solver uses 1000 as fallback for display-only purposes (no measurement accuracy needed)
  const vwSk = geometryValid ? videoEl!.videoWidth : 1000;
  const vhSk = geometryValid ? videoEl!.videoHeight : 1000;
  const sk: ReconstructedSkeleton = vaganova3DKinematics.solve(detectedLandmarks, detectedWorldLandmarks, vwSk, vhSk);

  // Update Kinetic AI Trajectory & Center of Gravity
  const currentVidTime = videoRef.current ? videoRef.current.currentTime : 0;
  const activeTeacherPhase = findTeacherPhaseAtTime(
    teacherPhaseAnalysis,
    currentPlayTime * 1000,
  );
  const activeTeacherCycleIndex = activeTeacherPhase?.cycleIndex ?? 0;
  const visibleTeacherPhases = teacherPhaseAnalysis?.phases.filter(
    phase => phase.cycleIndex === activeTeacherCycleIndex,
  ) ?? [];
  const activeNicolePhaseComparisons = activeTeacherPhase
    ? nicolePhaseComparisons.filter(comparison => (
      comparison.phaseId === activeTeacherPhase.id
      && comparison.cycleIndex === activeTeacherPhase.cycleIndex
    ))
    : [];
  const attemptHistoryRecords = useMemo(
    () => studentAttemptHistory.list(),
    [attemptHistoryRevision],
  );
  const nicoleReferenceLibraryRecords = useMemo(
    () => loadNicoleReferenceLines(localStorage),
    [nicoleReferenceStorageRevision],
  );
  const currentAttemptPreview = useMemo(() => teacherPhaseAnalysis
    ? createStudentAttemptSnapshot({
      analysis: teacherPhaseAnalysis,
      studentLabel: selectedStudent,
      sourceId: selectedDevVideoUrl,
      now: () => new Date(0),
      createId: () => 'current-attempt-preview',
    })
    : null,
  [selectedDevVideoUrl, selectedStudent, teacherPhaseAnalysis]);
  const previousComparableAttempt = currentAttemptPreview
    ? findPreviousComparableAttempt(attemptHistoryRecords, currentAttemptPreview)
    : null;
  const activeAttemptComparison = comparePhaseWithAttempt(activeTeacherPhase, previousComparableAttempt);
  const attemptProgressCurve = buildAttemptProgressCurve(currentAttemptPreview, previousComparableAttempt);
  const currentAttemptAlreadySaved = currentAttemptPreview
    ? attemptHistoryRecords.some(record => (
      record.studentKey === currentAttemptPreview.studentKey
      && record.sourceId === currentAttemptPreview.sourceId
      && record.exerciseId === currentAttemptPreview.exerciseId
      && record.levelLabel === currentAttemptPreview.levelLabel
    ))
    : false;
  const handleSaveStudentAttempt = () => {
    const guardedAnalysis = assessmentValueForCurrentContext(
      boundTeacherPhaseAssessment,
      currentAnalysisContextEpochRef.current,
    );
    if (!assessmentCapabilities.canSaveAttempt || !guardedAnalysis) {
      showAnalyseToast('Versuch erst nach einer Analyse für den aktuellen Kontext speichern.');
      return;
    }
    const snapshot = createStudentAttemptSnapshot({
      analysis: guardedAnalysis,
      studentLabel: selectedStudent,
      sourceId: selectedDevVideoUrl,
    });
    if (!snapshot) {
      showAnalyseToast('Versuch kann erst nach einer auswertbaren vollständigen Analyse gespeichert werden.');
      return;
    }
    try {
      const saved = studentAttemptHistory.save(snapshot);
      setAttemptHistoryRevision(revision => revision + 1);
      showAnalyseToast(saved.attemptId === snapshot.attemptId
        ? `Versuch für ${selectedStudent} gespeichert · keine Referenz`
        : `Dieser Versuch ist für ${selectedStudent} bereits gespeichert.`);
    } catch (error) {
      showAnalyseToast(error instanceof Error ? error.message : 'Versuch konnte nicht gespeichert werden.');
    }
  };
  vaganovaKineticAI.updateTrails(sk, currentVidTime);
  const cog = vaganovaKineticAI.computeCenterOfGravity(sk);

  // Generate Vaganova Curriculum & Homework Report
  const curriculumReport: VaganovaCurriculumReport = vaganovaCurriculumEngine.generatePlan(6, motionClass.detectedPoseName, 14);

  // 📐 REAL-TIME VAGANOVA ANGLE ANALYSIS
  const vaganovaAnalysis = detectedLandmarks && geometryValid
    ? vaganovaAngleCalculator.analyzeFullFrame(detectedLandmarks, vw, vh)
    : null;

  // 🔔 Notify parent (App.tsx) with latest analysis for RightInspectorPanel
  useLayoutEffect(() => {
    onVaganovaAnalysis?.(assessmentCapabilities.canUseFeedback ? vaganovaAnalysis : null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentCapabilities.canUseFeedback, detectedLandmarks]);

  useEffect(() => () => {
    onVaganovaAnalysis?.(null);
  }, [onVaganovaAnalysis]);

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
    false, // P0-FIX (Berater 2026-08-10): teacherConfirmed NIEMALS hart als true – immer false bis explizite Bestätigung
    geometryValid ? vw : 1, // Phase 5: geometry guard – evidence engine has its own safety gate
    geometryValid ? vh : 1
  );

  // Derive finding severity from the evidence ledger (Fix D, 2026-08-11)
  // The headline comes from the "activeCp" – the most prominent checkpoint.
  // Map checkpoint status → inspector severity for correct coloring.
  const deriveFindingSeverity = (): 'GOOD' | 'CORRECTION' | 'WARNING' | 'NEUTRAL' => {
    if (!feedbackObj.checkpointResults || feedbackObj.checkpointResults.length === 0) return 'NEUTRAL';
    // Find the checkpoint whose name appears in the headline
    const activeResult = feedbackObj.checkpointResults.find(cp =>
      feedbackObj.findingHeadline.includes(cp.name)
    );
    if (!activeResult) return 'NEUTRAL';
    switch (activeResult.status) {
      case 'auffaellig': return 'CORRECTION';
      case 'review': return 'WARNING';
      case 'richtig': return 'GOOD';
      case 'nicht_auswertbar': return 'NEUTRAL';
      default: return 'NEUTRAL';
    }
  };

  const inspectorData: JetztWichtigInspectorData = {
    studentName: feedbackObj.studentName,
    exerciseName: `${motionClass.detectedPoseName} (${motionClass.detectedPerspective === 'FRONTAL' ? 'Frontal' : 'Profil-Seite'})`,
    timestampStr: feedbackObj.timestampStr,
    findingHeadline: feedbackObj.findingHeadline,
    findingSeverity: deriveFindingSeverity(),
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
  const cueColor = (status: VaganovaCuePoint['status']) =>
    status === 'CORRECTION' ? COLOR_BAD
    : status === 'WARNING'  ? COLOR_WARN
    : status === 'GOOD' ? COLOR_GOOD
    : 'rgba(255,255,255,0.35)';

  // Border-Farbe (gedimmt) für den Karten-Rand
  const cueBorderColor = (status: VaganovaCuePoint['status']) =>
    status === 'CORRECTION' ? 'rgba(255, 69, 58, 0.4)'
    : status === 'WARNING'  ? 'rgba(255, 159, 10, 0.4)'
    : status === 'GOOD' ? 'rgba(48, 209, 88, 0.3)'
    : 'rgba(255,255,255,0.18)';

  // Hintergrund-Farbe (gedimmt) für Status-Badges
  const cueBgColor = (status: VaganovaCuePoint['status']) =>
    status === 'CORRECTION' ? 'rgba(255, 69, 58, 0.15)'
    : status === 'WARNING'  ? 'rgba(255, 159, 10, 0.12)'
    : status === 'GOOD' ? 'rgba(48, 209, 88, 0.15)'
    : 'rgba(255,255,255,0.06)';

  // Status-Label mit Icon
  const cueLabel = (status: VaganovaCuePoint['status']) =>
    status === 'CORRECTION' ? '🔴 FEHLER'
    : status === 'WARNING'  ? '🟠 BEOB.'
    : status === 'GOOD' ? '🟢 GUT'
    : '⚪ NEUTRAL';

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
    <div className="video-analyzer" style={{ display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 'calc(100vh - 32px)', height: 'calc(100dvh - 32px)', overflow: 'hidden' }}>
      
      {/* Vaganova Curriculum & Homework Modal */}
      <VaganovaCurriculumModal
        isOpen={isCurriculumModalOpen}
        onClose={() => setIsCurriculumModalOpen(false)}
        report={curriculumReport}
        studentName="Emma Berger (6 J.)"
      />

      <MotionReferenceLibraryPanel
        open={showReferenceLibrary}
        onClose={() => setShowReferenceLibrary(false)}
        currentExerciseId={resolveMotionRegistryEntry(exerciseName)?.id ?? 'all'}
        currentVideoSourceId={selectedDevVideoUrl}
        nicoleRecords={nicoleReferenceLibraryRecords}
        technicalSources={MOTION_REFERENCE_LIBRARY}
        attempts={attemptHistoryRecords}
      />

      {/* 🖼 ANNOTATION LIGHTBOX */}
      {lightboxOpen && annotationEntries.length > 0 && (
      <AnnotationLightbox
          entries={annotationEntries}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
          onNavigate={setLightboxIndex}
          onUpdateNote={handleUpdateNote}
          onUpdateCaption={handleUpdateCaption}
          onUpdateDataUrl={handleUpdateDataUrl}
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
      <div className="video-analyzer-toolbar" style={{
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
          {/* Video-Selector mit Rename-Inline */}
          {renamingVideoId ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameVideo();
                  if (e.key === 'Escape') setRenamingVideoId(null);
                }}
                onBlur={() => handleRenameVideo()}
                style={{
                  background: 'rgba(25, 20, 35, 0.95)',
                  color: '#ffffff',
                  border: '1px solid rgba(192, 132, 252, 0.5)',
                  borderRadius: '8px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  fontFamily: 'Montserrat',
                  outline: 'none',
                  width: '200px',
                }}
              />
              <button
                onClick={() => handleRenameVideo()}
                style={{ background: 'rgba(48,209,88,0.15)', color: '#30d158', border: 'none', borderRadius: '6px', padding: '3px 6px', fontSize: '10px', cursor: 'pointer' }}
              >
                <Save size={11} />
              </button>
              <button
                onClick={() => setRenamingVideoId(null)}
                style={{ background: 'rgba(255,69,58,0.15)', color: '#ff453a', border: 'none', borderRadius: '6px', padding: '3px 6px', fontSize: '10px', cursor: 'pointer' }}
              >
                <X size={11} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
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
              <button
                onClick={startRename}
                title="Video umbenennen"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.5)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  padding: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                <Edit2 size={11} />
              </button>
            </div>
          )}

          <label style={{
            display: 'flex', alignItems: 'center', gap: '5px', color: 'rgba(255,255,255,0.58)',
            fontSize: '8px', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            Übung
            <select
              aria-label="Übung für die Video-Analyse"
              value={resolveMotionRegistryEntry(exerciseName)?.id ?? 'plie'}
              onChange={(event) => {
                const next = MOTION_REGISTRY.find(entry => entry.id === event.target.value);
                if (!next || next.phaseEngineStatus === 'technical_events_only') return;
                clearTeacherPhaseAssessment();
                setAssessmentRequest(null);
                onExerciseChange?.(next.label);
                clearSkeletonSelection('analysis_stale');
                if (next.id === 'plie') setSplitScreenMode(false);
              }}
              style={{
                background: 'rgba(25,20,35,0.9)', color: '#fff',
                border: '1px solid rgba(103,232,249,0.38)', borderRadius: '9px',
                padding: '5px 8px', fontSize: '10px', fontWeight: 750,
                fontFamily: 'Montserrat', outline: 'none', cursor: 'pointer', maxWidth: '150px',
              }}
            >
              {MOTION_REGISTRY.map(entry => (
                <option
                  key={entry.id}
                  value={entry.id}
                  disabled={entry.phaseEngineStatus === 'technical_events_only'}
                  style={{ background: '#1c1c1e' }}
                >
                  {entry.label}{entry.phaseEngineStatus === 'technical_phase_pilot' ? ' · Phasenpilot' : entry.phaseEngineStatus === 'technical_events_only' ? ' · Technikimport' : ''}
                </option>
              ))}
            </select>
          </label>

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

          {/* Re-Scan Button – gleicher Style wie Upload, nur grün */}
          <button
            onClick={handleAnalysisRequest}
            title={teacherPhaseAnalysis
              ? 'Analyse neu starten (Force-Rescan)'
              : 'Auswertung für die aktuelle Schülerin, Übung und Stufe starten'}
            disabled={isPreIndexing}
            style={{
              background: isPreIndexing ? 'rgba(48,209,88,0.06)' : 'rgba(48,209,88,0.12)',
              color: isPreIndexing ? 'rgba(48,209,88,0.4)' : '#30d158',
              border: `1px solid ${isPreIndexing ? 'rgba(48,209,88,0.15)' : 'rgba(48,209,88,0.35)'}`,
              padding: '6px 14px',
              borderRadius: '10px',
              fontSize: '10px',
              fontWeight: 700,
              cursor: isPreIndexing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              transition: 'all 0.18s ease'
            }}
          >
            {isPreIndexing ? (
              <><span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#30d158', animation: 'pulse 1s ease-in-out infinite', flexShrink: 0 }} /> Analyse {indexingProgress}%</>
            ) : (
              <><RefreshCw size={12} /> Analyse</>
            )}
          </button>
        </div>

        {/* Mitte: Overlay-Toggles – modernes Chip-Design */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '3px 4px', border: '1px solid rgba(255,255,255,0.08)' }}>
          {/* CoG Lot */}
          <button
            onClick={() => setShowCoG(!showCoG)}
            title="2D-Rumpfmitte: zeigt ihre Bildprojektion über der sichtbaren Standfläche (kein Druck-/COP-Messwert)"
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
            title="Trajektorien: zeigt Gelenk-Bewegungsspuren der letzten Frames"
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
            title="Winkel-Bögen: visuelle Darstellung der gemessenen Gelenkwinkel"
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

          {/* Provenienzgebundene 2D-Aplomb-Orientierung */}
          <button
            onClick={() => setShowIdealOverlay(!showIdealOverlay)}
            title="2D-Leitlinie: zeigt die vorläufige Orientierung nur bei abgesicherter Rumpf-, Schulter- oder Beckenevidenz"
            style={{
              background: showIdealOverlay ? 'rgba(52,211,153,0.15)' : 'transparent',
              color: showIdealOverlay ? '#34d399' : 'rgba(255,255,255,0.45)',
              border: showIdealOverlay ? '1px solid rgba(52,211,153,0.3)' : '1px solid transparent',
              padding: '5px 11px',
              borderRadius: '9px',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '4px',
              transition: 'all 0.15s ease'
            }}
          >
            <span style={{ fontSize: '13px' }}>◎</span>
            <span>2D-Leitlinie</span>
          </button>

          {/* Von Nicole am exakten Bone gespeicherte, versionierte Referenz */}
          <button
            onClick={() => updateNicoleReference(nicoleReferenceGuide, !showNicoleReference)}
            disabled={!nicoleReferenceGuide || selectedSkeletonTarget?.frameStatus !== 'exact_cache_frame'}
            title={!canCreateNicoleReferenceFromSource(selectedDevVideoUrl)
              ? 'Spontane Testaufnahme mit bekannten Ausführungsfehlern · nie als Nicole-Referenz verwenden'
              : nicoleReferenceGuide
              ? `Nicole-Referenz V${nicoleReferenceGuide.versionNumber} für den ausgewählten Bone ein-/ausblenden`
              : 'Für diesen ausgewählten Bone ist noch keine Nicole-Referenz gespeichert'}
            style={{
              background: showNicoleReference ? 'rgba(34,211,238,0.15)' : 'transparent',
              color: nicoleReferenceGuide ? '#22d3ee' : 'rgba(255,255,255,0.22)',
              border: showNicoleReference ? '1px solid rgba(34,211,238,0.35)' : '1px solid transparent',
              padding: '5px 11px',
              borderRadius: '9px',
              fontSize: '10px',
              fontWeight: 700,
              cursor: nicoleReferenceGuide ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', gap: '4px',
              transition: 'all 0.15s ease'
            }}
          >
            <span style={{ fontSize: '13px' }}>◇</span>
            <span>Nicole-Referenz</span>
          </button>

          {/* Focus-Dim: Umgebung abdunkeln */}
          <button
            onClick={() => setShowFocusDim(!showFocusDim)}
            title="Fokus-Dim: Umgebung abdunkeln, Gelenk hervorheben"
            style={{
              background: showFocusDim ? 'rgba(147,130,220,0.15)' : 'transparent',
              color: showFocusDim ? '#9382dc' : 'rgba(255,255,255,0.45)',
              border: showFocusDim ? '1px solid rgba(147,130,220,0.3)' : '1px solid transparent',
              padding: '5px 11px',
              borderRadius: '9px',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '4px',
              transition: 'all 0.15s ease'
            }}
          >
            <span style={{ fontSize: '13px' }}>◐</span>
            <span>Fokus</span>
          </button>
        </div>

        {/* Zoom Slider */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '4px 12px',
          background: 'rgba(0,0,0,0.3)',
          borderRadius: '12px',
        }}>
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>🔍</span>
          <input
            type="range"
            min="1"
            max="4"
            step="0.1"
            value={zoomLevel}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setZoomLevel(val);
              if (val === 1) setPanOffset({ x: 0, y: 0 });
            }}
            style={{
              width: '90px',
              height: '4px',
              accentColor: '#a78bfa',
              cursor: 'pointer',
            }}
          />
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', fontWeight: 700, minWidth: '30px' }}>
            {zoomLevel.toFixed(1)}x
          </span>
          {zoomLevel > 1 && (
            <button
              onClick={() => { setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); }}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                borderRadius: '6px',
                padding: '2px 8px',
                fontSize: '9px',
                color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
              }}
            >
              Reset
            </button>
          )}
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
            disabled={!motionAvatarAvailable}
            onClick={() => {
              if (!motionAvatarAvailable
                || !assessmentValueForCurrentContext(boundTeacherPhaseAssessment, currentAnalysisContextEpochRef.current)) return;
              setSplitScreenMode(!splitScreenMode);
            }}
            title={motionAvatarAvailable
              ? `Technischen Single-Clock-Linienavatar für ${resolveMotionRegistryEntry(exerciseName)?.shortLabel ?? 'diese Übung'} ein-/ausblenden`
              : 'Technischer Linienavatar für Tendu, Passé, Jeté und Changement'}
            style={{
              background: splitScreenMode ? 'rgba(192,132,252,0.18)' : 'transparent',
              color: !motionAvatarAvailable ? 'rgba(255,255,255,0.2)' : splitScreenMode ? '#c084fc' : 'rgba(255,255,255,0.45)',
              border: 'none',
              padding: '5px 11px',
              borderRadius: '9px',
              fontSize: '10px',
              fontWeight: 700,
              cursor: motionAvatarAvailable ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s ease'
            }}
          >
            Avatar
          </button>

          <button
            onClick={() => setShowReferenceLibrary(true)}
            title="Nicole‑Referenzen, technische Quellen und Schülerverläufe öffnen"
            style={{
              background: showReferenceLibrary ? 'rgba(103,232,249,0.16)' : 'transparent',
              color: showReferenceLibrary ? '#67e8f9' : 'rgba(255,255,255,0.55)',
              border: showReferenceLibrary ? '1px solid rgba(103,232,249,0.32)' : '1px solid transparent',
              padding: '5px 9px',
              borderRadius: '9px',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <BookOpen size={12} /> Referenzen
          </button>

          {/* Overlay-Modus Selector – PROJECT_DECISION 2026-08-10: volle Ampel freigegeben */}
          <div style={{ position: 'relative' }}>
            <button
              id="overlay-mode-btn"
              ref={overlayModeButtonRef}
              aria-haspopup="menu"
              aria-expanded={showOverlayMenu}
              aria-controls={showOverlayMenu ? 'overlay-mode-menu' : undefined}
              onClick={() => {
                if (!showOverlayMenu) updateOverlayMenuPosition();
                setShowOverlayMenu(!showOverlayMenu);
              }}
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
            {showOverlayMenu && overlayMenuPosition && createPortal(
              <div
                id="overlay-mode-menu"
                ref={overlayMenuRef}
                role="menu"
                aria-labelledby="overlay-mode-btn"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    closeOverlayMenu(true);
                    return;
                  }

                  const items = Array.from(
                    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
                  );
                  const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
                  const nextIndex = event.key === 'ArrowDown'
                    ? (currentIndex + 1) % items.length
                    : event.key === 'ArrowUp'
                    ? (currentIndex - 1 + items.length) % items.length
                    : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                    ? items.length - 1
                    : -1;
                  if (nextIndex >= 0) {
                    event.preventDefault();
                    items[nextIndex]?.focus();
                  }
                }}
                style={{
                position: 'fixed', top: overlayMenuPosition.top, left: overlayMenuPosition.left, zIndex: 10001,
                background: '#1e1b2e', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '10px', padding: '6px', width: '270px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
              }}>
                {/* Mode 1: Lehrer-Ampel */}
                <button
                  id="overlay-lehrer-ampel"
                  role="menuitem"
                  onClick={() => { setOverlayModeWithSave(selectedDevVideoUrl)('lehrer-ampel'); closeOverlayMenu(true); }}
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
                    Phasenbasierte Nachanalyse. Aufnahmefehler werden zuerst korrigiert, nicht farblich geraten.
                  </div>
                  <div style={{ marginTop: '5px', display: 'grid', gap: '2px', fontSize: '8px', lineHeight: 1.35 }}>
                    <span><b style={{ color: '#30d158' }}>━━ Grün</b> · nächste Phasenklasse: im Korridor</span>
                    <span><b style={{ color: '#ffd60a' }}>━━ Gelb</b> · nächste Phasenklasse: Grenzbereich</span>
                    <span><b style={{ color: '#ff453a' }}>━━ Rot</b> · nächste Phasenklasse: außerhalb</span>
                    <span><b style={{ color: '#30d158', letterSpacing: '1px' }}>····</b><b style={{ color: '#ffd60a', letterSpacing: '1px' }}> ····</b><b style={{ color: '#ff453a', letterSpacing: '1px' }}> ····</b> · Einzelpunkte: leicht unsicher</span>
                    <span><b style={{ color: '#30d158', letterSpacing: '1px' }}>·· ··</b><b style={{ color: '#ffd60a', letterSpacing: '1px' }}> ·· ··</b><b style={{ color: '#ff453a', letterSpacing: '1px' }}> ·· ··</b> · Punktpaare: schwache Evidenz</span>
                  </div>
                </button>
                {/* Mode 2: Anatomisch */}
                <button
                  id="overlay-anatomisch"
                  role="menuitem"
                  onClick={() => { setOverlayModeWithSave(selectedDevVideoUrl)('anatomisch'); closeOverlayMenu(true); }}
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
                  role="menuitem"
                  onClick={() => { setOverlayModeWithSave(selectedDevVideoUrl)('lehrbuch'); closeOverlayMenu(true); }}
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
              </div>,
              document.body
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
      <div className="video-analyzer-workspace" style={{ flex: 1, display: 'grid', gap: '12px', minHeight: 0, overflow: 'hidden' }}>
        
        {/* LEFT PANEL: UNCLUTTERED MAIN VIDEO VIEWPORT */}
        <div ref={videoPanelRef} className="monolith-card video-analyzer-video-panel" style={{ display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', padding: 0, minWidth: 0, background: isFullscreen ? '#000' : undefined }}>
          
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
          <div className="video-analyzer-video-grid" style={{ flex: 1, display: 'grid', gridTemplateColumns: splitScreenMode ? '1fr 1fr' : '1fr', gap: '2px', minWidth: 0, backgroundColor: '#000000', position: 'relative', overflow: 'hidden' }}>
            
            {/* VIEWPORT 1: HD BALLET VIDEO STREAM (NATIVE RELATIVE OVERLAY WRAP) */}
            <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
            <div ref={videoContainerRef} style={{
              position: 'absolute',
              inset: 0,
              overflow: 'hidden',
              background: '#050407',
              transform: `scale(${zoomLevel}) translate(${panOffset.x}%, ${panOffset.y}%)`,
              transformOrigin: 'center center',
              transition: isDraggingRef.current ? 'none' : 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              cursor: (!isPlaying && isAnnotationModeActive) ? 'crosshair' : (zoomLevel > 1 ? (isDraggingRef.current ? 'grabbing' : 'grab') : 'default'),
            }}
              onClick={(e) => {
                // Suppress click if the user was dragging (moved > 5px)
                if (zoomLevel > 1) {
                  const dx = Math.abs(e.clientX - dragStartRef.current.x);
                  const dy = Math.abs(e.clientY - dragStartRef.current.y);
                  if (dx > 5 || dy > 5) return;
                }
                handleSkeletonClick(e);
              }}
              onMouseDown={(e) => {
                // Always record start position (for click-vs-drag detection)
                dragStartRef.current = { x: e.clientX, y: e.clientY, panX: panOffset.x, panY: panOffset.y };
                if (zoomLevel <= 1 || (!isPlaying && isAnnotationModeActive)) return;
                isDraggingRef.current = true;
                e.preventDefault();
              }}
              onMouseMove={(e) => {
                if (!isDraggingRef.current) return;
                const dx = e.clientX - dragStartRef.current.x;
                const dy = e.clientY - dragStartRef.current.y;
                const container = videoContainerRef.current;
                if (!container) return;
                const rect = container.getBoundingClientRect();
                const pctX = (dx / (rect.width / zoomLevel)) * 100;
                const pctY = (dy / (rect.height / zoomLevel)) * 100;
                setPanOffset({
                  x: dragStartRef.current.panX + pctX,
                  y: dragStartRef.current.panY + pctY,
                });
              }}
              onMouseUp={() => { isDraggingRef.current = false; }}
              onMouseLeave={() => { isDraggingRef.current = false; }}
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
                  onPlay={() => {
                    setIsPlaying(true);
                    clearGroundedSelectionForPlayback();
                  }}
                  onPause={() => {
                    setIsPlaying(false);
                    processStaticPausedFrame();
                  }}
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
                    {loadedFromCache ? (
                      /* ── Cache HIT: instant confirmation ── */
                      <>
                        <div style={{ fontSize: '28px', lineHeight: 1 }}>💾</div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#30d158', letterSpacing: '0.5px' }}>
                          Aus Cache geladen
                        </div>
                        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)' }}>{indexingStatusStr}</span>
                      </>
                    ) : (
                      /* ── Cache MISS: normal progress ── */
                      <>
                        <Zap size={32} color="#30d158" style={{ filter: 'drop-shadow(0 0 8px #30d158)' }} />
                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#ffffff', letterSpacing: '0.5px' }}>
                          ⚡ Analyse: {indexingStatusStr}
                        </div>
                        <div style={{ width: '240px', height: '5px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${indexingProgress}%`, background: 'linear-gradient(90deg, #30d158, #a881bd)', borderRadius: '3px', transition: 'width 0.3s ease' }} />
                        </div>
                        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.55)' }}>Wird analysiert &amp; für nächste Sitzung gespeichert…</span>
                      </>
                    )}
                  </div>
                )}

                {/* Phase-based post-analysis. Hard recording failures show a
                    correction request instead of a guessed traffic light. */}
                {overlayMode === 'lehrer-ampel' && teacherPhaseAnalysis && !isPreIndexing && (
                  <div style={{
                    position: 'absolute', top: '10px', right: '10px', zIndex: 35,
                    width: 'min(330px, calc(100% - 20px))',
                    background: 'rgba(14,11,22,0.92)', backdropFilter: 'blur(14px)',
                    border: teacherPhaseAnalysis.gate.status === 'ready'
                      ? '1px solid rgba(100,210,255,0.55)'
                      : teacherPhaseAnalysis.gate.status === 'usable_with_caution'
                        ? '1px solid rgba(255,214,10,0.72)'
                        : '1px solid rgba(255,159,10,0.7)',
                    borderRadius: '12px', padding: '9px 10px', color: '#fff',
                    boxShadow: '0 8px 28px rgba(0,0,0,0.38)',
                  }}>
                    {teacherPhaseAnalysis.gate.status === 'needs_correction' ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: '#ff9f0a', fontSize: '11px', fontWeight: 900 }}>
                          <AlertTriangle size={14} /> Aufnahme korrigieren
                        </div>
                        <div style={{ fontSize: '9px', opacity: 0.72, marginTop: '3px', lineHeight: 1.35 }}>
                          Keine Ampelbewertung, solange der Aufnahmecheck nicht vollständig bestanden ist.
                        </div>
                        <div style={{ marginTop: '6px', display: 'grid', gap: '3px' }}>
                          {teacherPhaseAnalysis.gate.checks.filter(check => !check.passed).map(check => (
                            <div key={check.id} style={{ fontSize: '8px', color: '#ffd6a0' }}>• {check.label} · {check.detail}</div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                          <div>
                            <div style={{ color: teacherPhaseAnalysis.gate.status === 'ready' ? '#64d2ff' : '#ffd60a', fontSize: '10px', fontWeight: 900 }}>
                              {teacherPhaseAnalysis.gate.status === 'ready'
                                ? '✓ Aufnahme geeignet · Nachanalyse'
                                : '·· ·· Aufnahme mit Vorsicht auswertbar'}
                            </div>
                            <div style={{ fontSize: '8px', opacity: 0.65, marginTop: '2px' }}>
                              {teacherPhaseAnalysis.exerciseLabel} · {teacherPhaseAnalysis.levelLabel} · {teacherPhaseAnalysis.framesAnalyzed} Frames
                            </div>
                            <div style={{ fontSize: '7px', opacity: 0.52, marginTop: '1px' }}>
                              Pose · Zeitverlauf · Bildqualität · Geometrie{nicolePhaseComparisons.length > 0 ? ' · Nicole-Linie' : ''}
                            </div>
                            {teacherPhaseAnalysis.phaseAuthority === 'technical_phase_pilot' && (
                              <div style={{ fontSize: '7px', color: '#fbbf24', marginTop: '2px', fontWeight: 800 }}>
                                TECHNISCHER PHASENPILOT · Dryad-Zeitstruktur · Nicole-Korridore ausstehend
                              </div>
                            )}
                            {(teacherPhaseAnalysis.exerciseId === 'tendu' || teacherPhaseAnalysis.exerciseId === 'jete') && (
                              <div style={{ fontSize: '7px', color: '#a5f3fc', marginTop: '2px' }}>
                                {teacherPhaseAnalysis.workingSide === 'left' ? 'Links' : teacherPhaseAnalysis.workingSide === 'right' ? 'Rechts' : 'Seite uneindeutig'} · {
                                  teacherPhaseAnalysis.direction === 'a_la_seconde' ? 'à la seconde'
                                    : teacherPhaseAnalysis.direction === 'devant' ? 'devant'
                                      : teacherPhaseAnalysis.direction === 'derriere' ? 'derrière'
                                        : 'Richtung noch uneindeutig'
                                } · Phasen {Math.round(teacherPhaseAnalysis.phaseEngineConfidence * 100)} %
                              </div>
                            )}
                            {(teacherPhaseAnalysis.exerciseId === 'passe' || teacherPhaseAnalysis.exerciseId === 'changement') && (
                              <div style={{ fontSize: '7px', color: '#a5f3fc', marginTop: '2px' }}>
                                {teacherPhaseAnalysis.exerciseId === 'changement'
                                  ? 'Beidseitige Sprungfolge'
                                  : teacherPhaseAnalysis.workingSide === 'left' ? 'Arbeitsbein links' : teacherPhaseAnalysis.workingSide === 'right' ? 'Arbeitsbein rechts' : 'Arbeitsbein uneindeutig'}
                                {' · '}Phasen {Math.round(teacherPhaseAnalysis.phaseEngineConfidence * 100)} %
                              </div>
                            )}
                            {!canCreateNicoleReferenceFromSource(selectedDevVideoUrl) && (
                              <div style={{ fontSize: '7px', color: '#fbbf24', marginTop: '2px' }}>
                                Testaufnahme · keine Nicole-Referenzquelle
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: '8px', opacity: 0.7, textAlign: 'right' }}>
                            {activeTeacherPhase?.label ?? 'Phase wählen'}
                            {teacherPhaseAnalysis.cycleCount > 1 ? (
                              <div style={{ marginTop: '2px', color: '#67e8f9', fontWeight: 800 }}>
                                Zyklus {activeTeacherCycleIndex + 1}/{teacherPhaseAnalysis.cycleCount}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        {teacherPhaseAnalysis.gate.status === 'usable_with_caution' && (
                          <div style={{ marginTop: '5px', color: '#ffe87a', fontSize: '7.5px', lineHeight: 1.35 }}>
                            Farben bleiben sichtbar, Punktpaare markieren das vorläufige Urteil. Optimieren: {teacherPhaseAnalysis.gate.correctiveActions.join(' · ')}
                          </div>
                        )}
                        {teacherPhaseAnalysis.phaseAuthority === 'technical_phase_pilot' && teacherPhaseAnalysis.gate.status === 'ready' && (
                          <div style={{ marginTop: '5px', color: '#ffe87a', fontSize: '7.5px', lineHeight: 1.35 }}>
                            Farben zeigen die vorhandene Regionsheuristik; feine Punkte kennzeichnen die noch nicht von Nicole kalibrierten Phasenkorridore.
                          </div>
                        )}
                        <details style={{ marginTop: '6px', fontSize: '7.5px', color: 'rgba(255,255,255,0.74)' }}>
                          <summary style={{ cursor: 'pointer', color: '#a5f3fc', fontWeight: 850 }}>
                            Aufnahmecheck {teacherPhaseAnalysis.gate.checks.filter(check => check.passed).length}/{teacherPhaseAnalysis.gate.checks.length}
                          </summary>
                          <div style={{ marginTop: '4px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 6px' }}>
                            {teacherPhaseAnalysis.gate.checks.map(check => (
                              <div key={check.id} title={check.detail} style={{ minWidth: 0, color: check.passed ? '#a5f3fc' : '#ffe87a' }}>
                                {check.passed ? '✓' : '•'} {check.label}
                              </div>
                            ))}
                          </div>
                        </details>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '4px', marginTop: '7px' }}>
                          {visibleTeacherPhases.map(phase => {
                            const color = heuristicColor(phase.displayState);
                            const evidenceStrength = heuristicEvidenceStrength(phase.displayState);
                            const dotted = heuristicDash(phase.displayState).length > 0;
                            const active = activeTeacherPhase?.id === phase.id
                              && activeTeacherPhase.cycleIndex === phase.cycleIndex;
                            const evidenceLabel = evidenceStrength === 'stable'
                              ? 'Evidenz stabil'
                              : evidenceStrength === 'uncertain'
                                ? 'Evidenz leicht unsicher'
                                : 'Evidenz schwach · Urteil vorläufig';
                            return (
                              <button
                                key={`${phase.cycleIndex}:${phase.id}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleInspectTeacherPhase(phase.representativeTimeMs);
                                }}
                                title={`${phase.label} · Phasenerkennung ${Math.round(phase.confidence * 100)} % · ${evidenceLabel}`}
                                style={{
                                  minWidth: 0, height: '28px', padding: '2px', cursor: 'pointer',
                                  background: active ? `${color}2d` : 'rgba(255,255,255,0.035)',
                                  color: active ? '#fff' : 'rgba(255,255,255,0.72)',
                                  border: `1px ${dotted ? 'dotted' : 'solid'} ${color}`,
                                  borderRadius: '7px', fontSize: '8px', fontWeight: 850,
                                }}
                              >
                                {phase.id === 'setup' || phase.id === 'departure'
                                  ? 'Start'
                                  : phase.id === 'descent'
                                    ? 'Ab'
                                    : phase.id === 'bottom'
                                      ? 'Tief'
                                      : phase.id === 'ascent'
                                        ? 'Auf'
                                        : phase.id === 'extension'
                                          ? 'Abstr.'
                                          : phase.id === 'full_extension'
                                            ? 'Streck'
                                            : phase.id === 'return'
                                              ? 'Zurück'
                                              : 'Schluss'}
                              </button>
                            );
                          })}
                        </div>
                        {activeNicolePhaseComparisons.map(comparison => {
                          const ready = comparison.status === 'ready' && comparison.medianAxisDeltaDeg !== null;
                          return (
                            <div
                              key={`${comparison.recordId}:${comparison.versionId}:${comparison.cycleIndex}`}
                              title="Versionsgebundener 2D-Linienvergleich aus Nicoles Referenzbibliothek. Kein automatisches Richtig/Falsch."
                              style={{
                                marginTop: '6px', padding: '5px 6px', borderRadius: '7px',
                                background: 'rgba(34,211,238,0.07)',
                                border: `1px ${comparison.evidenceStyle} rgba(34,211,238,0.72)`,
                                color: '#a5f3fc', fontSize: '7.5px', lineHeight: 1.35,
                              }}
                            >
                              <div style={{ fontWeight: 900 }}>
                                Nicole V{comparison.versionNumber} · {comparison.targetLabel}
                              </div>
                              <div style={{ opacity: 0.82 }}>
                                {ready
                                  ? `${comparison.medianAxisDeltaDeg!.toFixed(1)}° 2D-Achsenabstand · ${comparison.usableSampleCount}/${comparison.phaseSampleCount} Phasenframes`
                                  : `nicht ausreichend sichtbar · ${comparison.usableSampleCount}/${comparison.phaseSampleCount} Phasenframes`}
                              </div>
                              <div style={{ opacity: 0.58 }}>
                                {comparison.sourceScope === 'same_video'
                                  ? 'gleiche Aufnahme'
                                  : `andere Aufnahme · ${comparison.referenceVideoSourceId.split('/').pop() ?? comparison.referenceVideoSourceId}`}
                                {' · '}phasen- und versionsgebunden · Nicole geprüft
                              </div>
                            </div>
                          );
                        })}
                        <div style={{
                          marginTop: '6px', padding: '5px 6px', borderRadius: '7px',
                          background: 'rgba(168,129,189,0.08)', border: '1px solid rgba(168,129,189,0.3)',
                          color: '#e9d5ff', fontSize: '7.5px', lineHeight: 1.35,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                            <div>
                              <div style={{ fontWeight: 900 }}>Versuchsverlauf · {selectedStudent}</div>
                              <div style={{ opacity: 0.58 }}>gleiche Übung · Stufe · Ansicht · Seite · keine Referenz</div>
                            </div>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleSaveStudentAttempt();
                              }}
                              disabled={!currentAttemptPreview || currentAttemptAlreadySaved}
                              title={currentAttemptAlreadySaved ? 'Dieser Video-Versuch ist bereits gespeichert.' : 'Nur technische Phasenzusammenfassung speichern – kein Video und keine Rohlandmarks.'}
                              style={{
                                flexShrink: 0, borderRadius: '6px', padding: '4px 6px',
                                border: '1px solid rgba(192,132,252,0.55)',
                                background: currentAttemptAlreadySaved ? 'rgba(255,255,255,0.04)' : 'rgba(168,85,247,0.18)',
                                color: currentAttemptAlreadySaved ? 'rgba(255,255,255,0.45)' : '#f3e8ff',
                                fontSize: '7px', fontWeight: 850,
                                cursor: currentAttemptAlreadySaved ? 'default' : 'pointer',
                              }}
                            >
                              {currentAttemptAlreadySaved ? '✓ Gemerkt' : 'Versuch merken'}
                            </button>
                          </div>
                          {activeAttemptComparison ? (
                            <>
                              <div style={{ marginTop: '4px', color: '#fff' }}>
                                Gegen den letzten vergleichbaren Versuch in „{activeTeacherPhase?.label}“:
                                {' '}<span style={{ color: '#30d158' }}>{activeAttemptComparison.improved} verbessert</span>
                                {' · '}<span style={{ color: '#a5f3fc' }}>{activeAttemptComparison.unchanged} stabil</span>
                                {' · '}<span style={{ color: '#ffd60a' }}>{activeAttemptComparison.needsMoreAttention} braucht mehr Aufmerksamkeit</span>
                                {activeAttemptComparison.provisional ? ' · gepunktete Evidenz bleibt vorläufig' : ''}
                              </div>
                              {activeAttemptComparison.motion.steadinessTrend !== 'not_comparable' && (
                                <div style={{ marginTop: '3px', color: '#c4b5fd' }}>
                                  Fußbahn {activeAttemptComparison.motion.footPathLengthDeltaPercent === null ? 'vergleichbar' : `${activeAttemptComparison.motion.footPathLengthDeltaPercent > 0 ? '+' : ''}${activeAttemptComparison.motion.footPathLengthDeltaPercent} % Weg`}
                                  {' · '}{activeAttemptComparison.motion.steadinessTrend === 'steadier' ? 'ruhiger'
                                    : activeAttemptComparison.motion.steadinessTrend === 'more_restless' ? 'unruhiger' : 'ähnlich ruhig'}
                                  {activeAttemptComparison.motion.jitterDeltaPercent === null ? '' : ` (${activeAttemptComparison.motion.jitterDeltaPercent > 0 ? '+' : ''}${activeAttemptComparison.motion.jitterDeltaPercent} % Unruhe)`}
                                  {activeAttemptComparison.motion.durationDeltaPercent === null ? '' : ` · Tempo ${activeAttemptComparison.motion.durationDeltaPercent > 0 ? '+' : ''}${activeAttemptComparison.motion.durationDeltaPercent} %`}
                                </div>
                              )}
                              {attemptProgressCurve.length > 0 && (
                                <div aria-label="Fortschrittskurve über die Phasen" style={{ display: 'grid', gridTemplateColumns: `repeat(${attemptProgressCurve.length}, minmax(0,1fr))`, gap: 2, alignItems: 'end', height: 20, marginTop: 5 }}>
                                  {attemptProgressCurve.map((point, index) => (
                                    <div key={`${point.phaseId}:${index}`} title={`${point.label}: ${point.score > 0 ? '+' : ''}${Math.round(point.score * 100)}${point.provisional ? ' · vorläufig' : ''}`} style={{
                                      height: `${5 + Math.abs(point.score) * 15}px`, borderRadius: 2,
                                      background: point.score > .12 ? '#30d158' : point.score < -.12 ? '#ff9f0a' : '#67e8f9',
                                      opacity: point.provisional ? .58 : .9,
                                      border: point.provisional ? '1px dotted rgba(255,255,255,.65)' : 'none',
                                    }} />
                                  ))}
                                </div>
                              )}
                            </>
                          ) : (
                            <div style={{ marginTop: '4px', opacity: 0.7 }}>
                              Noch kein anderer vergleichbarer Versuch gespeichert. Der erste gespeicherte Versuch wird nur zur persönlichen Verlaufslinie – niemals zur Soll-Referenz.
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: '7.5px', opacity: 0.68, marginTop: '6px', lineHeight: 1.35 }}>
                          Farbe = Phasenleistung · Einzelpunkte = leicht unsicher · Punktpaare = schwache Evidenz. Erst nach vollständigem Scan.
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Analyse-Abschluss Toast */}
                {analyseToast && !isPreIndexing && (
                  <div style={{
                    position: 'absolute',
                    bottom: '60px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(48,209,88,0.15)',
                    border: '1px solid rgba(48,209,88,0.4)',
                    backdropFilter: 'blur(12px)',
                    borderRadius: '10px',
                    padding: '8px 16px',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#30d158',
                    zIndex: 45,
                    whiteSpace: 'nowrap',
                    boxShadow: '0 4px 20px rgba(48,209,88,0.2)',
                  }}>
                    {analyseToast}
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
                    key={`annotation:${selectedDevVideoUrl}`}
                    ref={annotationCanvasRef}
                    width={overlayBounds.width}
                    height={overlayBounds.height}
                    isActive={!isPlaying && isAnnotationModeActive}
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
            </div>{/* end overflow wrapper */}

            {/* 🦴 JOINT KNOWLEDGE POPOVER – position:fixed, outside all overflow:hidden containers */}
            {jointPopover && overlayBounds && (() => {
              const target = getSkeletonTarget(jointPopover.targetId);
              if (!target) return null;
              const knowledge = getJointKnowledge(target.representativeLandmarkIndex);
              if (!knowledge) return null;
              // Compute viewport coords from the skeleton canvas bounding rect
              const canvasRect = canvasRef.current?.getBoundingClientRect();
              if (!canvasRect) return null;
              // ALWAYS compute from normalized coords × current canvas rect
              // This ensures the arrow tracks the joint correctly across zoom/pan changes
              const vpJointX = canvasRect.left + jointPopover.normalizedX * canvasRect.width;
              const vpJointY = canvasRect.top + jointPopover.normalizedY * canvasRect.height;
              return (
                <SkeletonJointPopover
                  knowledge={knowledge}
                  jointX={vpJointX}
                  jointY={vpJointY}
                  videoLeft={canvasRect.left}
                  containerHeight={window.innerHeight}
                  vaganovaAnalysis={vaganovaAnalysis}
                  landmarkIndex={target.representativeLandmarkIndex}
                  selectedTarget={target}
                  selectedTargetIdentity={selectedSkeletonTarget}
                  groundedTeacherDraft={groundedTeacherDraft}
                  onAddToCueManager={groundedTeacherDraft.kind === 'ready'
                    ? handleTakeOverGroundedDraft
                    : undefined}
                  onSaveNicoleReference={target.kind === 'bone'
                    && selectedSkeletonTarget?.frameStatus === 'exact_cache_frame'
                    && canCreateNicoleReferenceFromSource(selectedDevVideoUrl)
                    ? handleSaveNicoleReference
                    : undefined}
                  nicoleReferenceVersion={nicoleReferenceGuide?.targetId === target.id
                    ? nicoleReferenceGuide.versionNumber
                    : undefined}
                  onClose={() => clearSkeletonSelection()}
                />
              );
            })()}

            {/* VIEWPORT 2: technical reference avatar on the primary clock. */}
            {splitScreenMode && assessmentCapabilities.canUseAvatar && teacherPhaseAnalysis && (
              <Suspense fallback={<div role="status" style={{ display: 'grid', placeItems: 'center', minWidth: 0, color: '#cbd5e1', background: '#050508', fontSize: 11 }}>Technischer Linienavatar wird geladen …</div>}>
                <SynchronizedMotionAvatarViewport
                  analysis={teacherPhaseAnalysis}
                  isPlaying={isPlaying}
                  currentTimeMs={currentPlayTime * 1000}
                  getCurrentTimeMs={getPrimaryVideoTimeMs}
                  liveSkeleton={sk}
                  videoWidth={vwSk}
                  videoHeight={vhSk}
                  previousAttempt={previousComparableAttempt}
                  progressCurve={attemptProgressCurve}
                  onLoopRangeChange={handleAvatarLoopRangeChange}
                />
              </Suspense>
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
              position: 'relative',
              zIndex: 10001, // above joint popover (9999)
            }}>
              {/* Pan/Select button (explicitly deactivates drawing) */}
              <button
                onClick={() => setIsAnnotationModeActive(false)}
                title="Bewegen / Auswählen"
                style={{
                  width: '36px', height: '36px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  background: !isAnnotationModeActive ? 'rgba(192,132,252,0.3)' : 'rgba(255,255,255,0.06)',
                  color: !isAnnotationModeActive ? '#c084fc' : 'rgba(255,255,255,0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: !isAnnotationModeActive ? '0 0 0 1px rgba(192,132,252,0.5)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              ><Hand size={14} /></button>

              {/* Mode indicator */}
              <div style={{ fontSize: '8px', fontWeight: 800, color: '#a881bd', letterSpacing: '0.5px', marginBottom: '4px', textAlign: 'center' }}>
                {isAnnotationModeActive ? '✏️' : '🤚'}
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
                  onClick={() => {
                    if (drawingTool === t && isAnnotationModeActive) {
                      setIsAnnotationModeActive(false);
                    } else {
                      setDrawingTool(t);
                      setIsAnnotationModeActive(true);
                    }
                  }}
                  title={label}
                  style={{
                    width: '36px', height: '36px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    background: drawingTool === t && isAnnotationModeActive ? 'rgba(192,132,252,0.3)' : 'rgba(255,255,255,0.06)',
                    color: drawingTool === t && isAnnotationModeActive ? '#c084fc' : 'rgba(255,255,255,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: drawingTool === t && isAnnotationModeActive ? '0 0 0 1px rgba(192,132,252,0.5)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >{icon}</button>
              ))}

              {/* Undo / Redo – context-aware: canvas strokes first, then saved annotations */}
              {[
                {
                  label: 'Rückgängig',
                  icon: <Undo2 size={14} />,
                  action: () => {
                    // Prioritize canvas stroke undo, then annotation undo
                    if (annotationCanvasRef.current?.canUndo()) {
                      annotationCanvasRef.current.undo();
                    } else if (canUndoAnnotation) {
                      undoAnnotation();
                    }
                  },
                  enabled: (annotationCanvasRef.current?.canUndo() ?? false) || canUndoAnnotation,
                },
                {
                  label: 'Wiederholen',
                  icon: <Redo2 size={14} />,
                  action: () => {
                    if (annotationCanvasRef.current?.canRedo()) {
                      annotationCanvasRef.current.redo();
                    } else if (canRedoAnnotation) {
                      redoAnnotation();
                    }
                  },
                  enabled: (annotationCanvasRef.current?.canRedo() ?? false) || canRedoAnnotation,
                },
              ].map(({ label, icon, action, enabled }) => (
                <button
                  key={label}
                  onClick={action}
                  title={label}
                  style={{
                    width: '36px', height: '36px', borderRadius: '8px', border: 'none',
                    cursor: enabled ? 'pointer' : 'not-allowed',
                    background: enabled ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
                    color: enabled ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: enabled ? 1 : 0.6,
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

              {/* Save PNG – opens caption panel first */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setCaptionPanelOpen(v => !v)}
                  title={captionPanelOpen ? 'Caption-Panel schliessen' : 'PNG mit Bildunterschrift speichern'}
                  style={{
                    width: '36px', height: '36px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    background: captionPanelOpen
                      ? 'linear-gradient(135deg, #a881bd 0%, #8b5a8b 100%)'
                      : 'linear-gradient(135deg, rgba(168,129,189,0.3) 0%, rgba(139,90,139,0.3) 100%)',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: captionPanelOpen ? '0 0 12px rgba(168,129,189,0.7)' : '0 0 8px rgba(168,129,189,0.3)',
                    transition: 'all 0.2s ease',
                  }}
                ><ImageDown size={14} /></button>

                {/* Caption Selector Panel */}
                {captionPanelOpen && (
                  <div
                    style={{
                      position: 'fixed',
                      right: '356px',
                      bottom: '120px',
                      width: '300px',
                      maxHeight: '55vh',
                      overflowY: 'auto',
                      background: 'rgba(8,4,18,0.97)',
                      backdropFilter: 'blur(24px)',
                      WebkitBackdropFilter: 'blur(24px)',
                      border: '1px solid rgba(168,129,189,0.4)',
                      borderLeft: '3px solid #a881bd',
                      borderRadius: '14px',
                      boxShadow: '0 8px 40px rgba(0,0,0,0.9)',
                      zIndex: 10002,
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      scrollbarWidth: 'thin' as const,
                      scrollbarColor: 'rgba(168,129,189,0.4) rgba(255,255,255,0.03)',
                    }}
                    onClick={e => e.stopPropagation()}
                  >
                    {/* Panel Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: '10px', fontWeight: 800, color: '#a881bd', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                        📋 Bildunterschrift wählen
                      </div>
                      <button
                        onClick={() => setCaptionPanelOpen(false)}
                        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: '2px' }}
                      ><X size={12} /></button>
                    </div>

                    {/* Caption draft textarea */}
                    <div>
                      <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>Vorschau / Eingabe:</div>
                      <textarea
                        value={captionDraft}
                        onChange={e => setCaptionDraft(e.target.value)}
                        placeholder="Bildunterschrift eingeben oder unten Felder anklicken..."
                        rows={3}
                        style={{
                          width: '100%', resize: 'vertical', boxSizing: 'border-box',
                          background: 'rgba(168,129,189,0.08)',
                          border: '1px solid rgba(168,129,189,0.3)',
                          borderRadius: '8px', padding: '7px 9px',
                          color: 'rgba(255,255,255,0.85)', fontSize: '11px', lineHeight: 1.5,
                          fontFamily: 'Inter, sans-serif', outline: 'none',
                        }}
                      />
                      {captionDraft && (
                        <button
                          onClick={() => setCaptionDraft('')}
                          style={{ marginTop: '3px', background: 'none', border: 'none', fontSize: '9px', color: 'rgba(255,69,58,0.6)', cursor: 'pointer', padding: 0 }}
                        >✕ Leeren</button>
                      )}
                    </div>

                    {/* Cue point field buttons – NUR der nächste Cue zum aktuellen Frame */}
                    {(() => {
                      const currentSec = videoRef.current?.currentTime ?? 0;
                      // Finde den Cue der dem aktuellen Frame am nächsten ist
                      const nearest = cuePoints
                        .filter(c => Math.abs(c.timeSeconds - currentSec) < 10) // max 10s Abstand
                        .sort((a, b) => Math.abs(a.timeSeconds - currentSec) - Math.abs(b.timeSeconds - currentSec))[0];

                      if (!nearest) return (
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic', textAlign: 'center', padding: '8px 0' }}>
                          Kein Cue-Point in der Nähe.<br />
                          <span style={{ fontSize: '9px' }}>Im Cue-Manager auf einen Frame springen, dann hier öffnen.</span>
                        </div>
                      );

                      const fields: Array<{ label: string; text: string }> = [
                        nearest.headline && { label: 'Überschrift', text: nearest.headline },
                        (nearest.diagnosisText || nearest.kiNote) && { label: 'Was & Warum', text: (nearest.diagnosisText || nearest.kiNote)! },
                        nearest.goalText && { label: 'Ziel', text: nearest.goalText },
                        nearest.practiceText && { label: 'Übung', text: nearest.practiceText },
                        nearest.cueMetaphor && nearest.cueMetaphor !== '(KI-Vorschlag — durch Nicole editierbar)' && { label: 'Metapher', text: nearest.cueMetaphor },
                      ].filter(Boolean) as Array<{ label: string; text: string }>;

                      const nearestCueColor = cueColor(nearest.status);
                      const distSec = Math.abs(nearest.timeSeconds - currentSec);

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                            Aus Cue-Point einfügen:
                          </div>
                          <div style={{ background: cueBgColor(nearest.status), border: `1px solid ${cueBorderColor(nearest.status)}`, borderRadius: '9px', padding: '8px 10px' }}>
                            {/* Cue-Kontext */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                              <div style={{ fontSize: '10px', fontWeight: 800, color: nearestCueColor, lineHeight: 1.2 }}>
                                {nearest.timecodeStr} · {nearest.headline}
                              </div>
                              {distSec > 0.1 && (
                                <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.3)' }}>~{distSec.toFixed(1)}s</span>
                              )}
                            </div>
                            {/* Feld-Buttons */}
                            {fields.length > 0 ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                {fields.map(({ label, text }) => (
                                  <button
                                    key={label}
                                    onClick={() => setCaptionDraft(prev => prev ? `${prev}\n${text}` : text)}
                                    title={text.slice(0, 100)}
                                    style={{
                                      background: 'rgba(168,129,189,0.18)',
                                      border: '1px solid rgba(168,129,189,0.35)',
                                      borderRadius: '6px', padding: '3px 9px',
                                      fontSize: '10px', fontWeight: 700, color: '#c084fc',
                                      cursor: 'pointer', transition: 'all 0.15s ease',
                                    }}
                                  >+ {label}</button>
                                ))}
                              </div>
                            ) : (
                              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
                                Cue hat noch keinen Text (KI-Vorschlag im Cue-Manager generieren).
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
                            Anderen Cue wählen: Im Cue-Manager Frame anspringen, dann hier neu öffnen.
                          </div>
                        </div>
                      );
                    })()}

                    {/* Action: save PNG */}
                    <button
                      onClick={() => { handleSaveAnnotation(); setCaptionPanelOpen(false); }}
                      style={{
                        width: '100%', padding: '9px', borderRadius: '9px', border: 'none', cursor: 'pointer',
                        background: 'linear-gradient(135deg, #a881bd 0%, #8b5a8b 100%)',
                        color: '#fff', fontSize: '12px', fontWeight: 800,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        boxShadow: '0 0 12px rgba(168,129,189,0.5)',
                      }}
                    >
                      <ImageDown size={13} />
                      PNG speichern{captionDraft.trim() ? ' mit Bildunterschrift' : ''}
                    </button>
                  </div>
                )}
              </div>

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
          {assessmentCapabilities.canUseFeedback ? <JetztWichtigInspector data={inspectorData} /> : null}

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
                          background: cueColor(cue.status),
                          border: isActive ? '2px solid #fff' : '1.5px solid rgba(255,255,255,0.55)',
                          borderRadius: '2px',
                          rotate: '45deg',
                          cursor: 'pointer',
                          zIndex: 3,
                          transition: 'all 0.15s ease',
                          boxShadow: isActive ? `0 0 8px ${cueColor(cue.status)}` : 'none',
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
        <div className="monolith-card video-analyzer-cue-panel" style={{ display: 'flex', flexDirection: 'column', padding: '16px', gap: '14px', background: 'rgba(10, 8, 14, 0.98)', border: '1px solid rgba(192, 132, 252, 0.3)', overflow: 'hidden' }}>
          
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

          {/* ── GESAMT-ZUSAMMENFASSUNG AKKORDION ────────────────────── */}
          {assessmentCapabilities.canUseFeedback && analysisReport && (() => {
            const nStrong = analysisReport.strengths.length;
            const nCorr   = analysisReport.corrections.length;

            // ─ Fließtext aus Report-Daten generieren ────────────────
            const strengthNames = analysisReport.strengths.map(s => s.label).join(', ');
            const corrNames = analysisReport.corrections.map(c => c.label).join(', ');

            const summaryTexts: Record<number, React.ReactNode> = {
              // Tab 0 – Was & Warum (Nicole-Sicht, pädagogisch)
              0: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '11.5px', color: 'rgba(255,255,255,0.85)', lineHeight: 1.65 }}>
                  {nStrong > 0 && (
                    <div>
                      <div style={{ fontSize: '9px', fontWeight: 800, color: '#30d158', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '5px' }}>Was läuft gut</div>
                      <p style={{ margin: 0 }}>
                        In dieser Sequenz zeigt die Schülerin in {nStrong} Bereichen solide Qualität: 
                        <strong style={{ color: 'rgba(255,255,255,0.95)' }}>{strengthNames}</strong>.
                        Das sind tragfähige Grundlagen, auf die weitere Arbeit aufgebaut werden kann.
                      </p>
                    </div>
                  )}
                  {nCorr > 0 && (
                    <div>
                      <div style={{ fontSize: '9px', fontWeight: 800, color: '#ff9f0a', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '5px' }}>Wo mehr Aufmerksamkeit nötig ist</div>
                      <p style={{ margin: 0 }}>
                        Auffällig sind {nCorr} wiederkehrende Muster: <strong style={{ color: 'rgba(255,255,255,0.95)' }}>{corrNames}</strong>.
                        Diese treten nicht einmalig auf, sondern zeigen sich sequenzbegleitend —
                        das deutet auf strukturelle Ursachen hin, die durch gezielte Übungen adressiert werden sollten.
                      </p>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 800, color: '#a881bd', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '5px' }}>Gesamteindruck</div>
                    <p style={{ margin: 0 }}>
                      Die Analyse umfasst {analysisReport.framesAnalyzed} Frames über {analysisReport.durationSec.toFixed(1)} Sekunden.
                      Die Details zu jedem Moment sind in den Cue Points unterhalb dokumentiert.
                    </p>
                  </div>
                </div>
              ),
              // Tab 1 – Ziel & Üben (Hausaufgaben / Fokus)
              1: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '11.5px', color: 'rgba(255,255,255,0.85)', lineHeight: 1.65 }}>
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 800, color: 'rgba(48,209,88,0.8)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '5px' }}>Primärziel dieser Einheit</div>
                    <p style={{ margin: 0 }}>
                      {nCorr > 0
                        ? `Stabilisierung der schwachen Bereiche — insbesondere ${analysisReport.corrections[0]?.label ?? 'der identifizierten Korrekturen'} — steht im Vordergrund der nächsten Unterrichtseinheit.`
                        : 'Die technische Ausführung ist in dieser Sequenz durchgängig positiv. Das Ziel ist Konsolidierung und Übertrag auf schwierigere Kombinationen.'}
                    </p>
                  </div>
                  {nCorr > 0 && (
                    <div>
                      <div style={{ fontSize: '9px', fontWeight: 800, color: 'rgba(192,132,252,0.8)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '5px' }}>Empfohlene Übungsschwerpunkte</div>
                      <p style={{ margin: 0 }}>
                        Die Cue Points enthalten spezifische Übungsanweisungen für jeden Korrekturbedarf.
                        Übergreifend empfiehlt sich, die identifizierten Muster auch im Standspiegel-Training
                        und in der Hausaufgabenroutine zu adressieren.
                      </p>
                    </div>
                  )}
                </div>
              ),
              // Tab 2 – Technik (Nicole intern)
              2: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '11.5px', color: 'rgba(255,255,255,0.82)', lineHeight: 1.65 }}>
                  <div style={{ fontSize: '9px', fontWeight: 800, color: 'rgba(255,214,10,0.75)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '5px' }}>Forensische Gesamt-Einschätzung · Nur für Nicole</div>
                  <p style={{ margin: 0 }}>
                    {nStrong > 0 && `Positive biomechanische Marker: ${strengthNames}. `}
                    {nCorr > 0
                      ? `Korrekturbedarf bei ${corrNames}. Die Timing- und Winkeldetails der einzelnen Momente sind in den Cue Points vollständig dokumentiert.`
                      : 'Alle gemessenen Parameter liegen im akzeptablen Bereich.'}
                  </p>
                  <p style={{ margin: 0, fontSize: '10.5px', color: 'rgba(255,255,255,0.45)' }}>
                    Basis: {analysisReport.framesAnalyzed} Frames · {analysisReport.durationSec.toFixed(1)}s ·
                    {nStrong} Stärke{nStrong !== 1 ? 'n' : ''} · {nCorr} Korrektur{nCorr !== 1 ? 'en' : ''}
                  </p>
                </div>
              ),
            };

            const TAB_LABELS = ['Was & Warum', 'Ziel & Üben', 'Technik'];
            const tabBtnStyle = (active: boolean, idx: number): React.CSSProperties => ({
              flex: 1, padding: '5px 4px', fontSize: '9.5px', fontWeight: 700,
              border: 'none', borderRadius: '6px', cursor: 'pointer',
              letterSpacing: '0.2px', transition: 'all 0.15s ease',
              background: active
                ? (idx === 2 ? 'rgba(255,214,10,0.15)' : 'rgba(192,132,252,0.2)')
                : 'rgba(255,255,255,0.05)',
              color: active
                ? (idx === 2 ? '#ffd60a' : '#d0a0ff')
                : 'rgba(255,255,255,0.38)',
              boxShadow: active ? `0 0 0 1px ${idx === 2 ? 'rgba(255,214,10,0.3)' : 'rgba(192,132,252,0.25)'}` : 'none',
            });

            return (
              <div style={{
                background: 'rgba(168,129,189,0.07)',
                border: '1px solid rgba(168,129,189,0.22)',
                borderRadius: '10px',
                overflow: 'hidden',
                flexShrink: 0,
              }}>
                {/* ─ ACCORDION HEADER ─ */}
                <div
                  onClick={() => setSummaryOpen(o => !o)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 12px', cursor: 'pointer', userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <span style={{
                      fontSize: '9px', color: '#a881bd',
                      transform: summaryOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                      display: 'inline-block',
                    }}>▶</span>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#a881bd', letterSpacing: '0.4px' }}>
                      GESAMTZUSAMMENFASSUNG
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    {nStrong > 0 && <span style={{ fontSize: '8px', fontWeight: 700, color: '#30d158', background: 'rgba(48,209,88,0.1)', padding: '2px 6px', borderRadius: '5px' }}>{nStrong} Stärke{nStrong !== 1 ? 'n' : ''}</span>}
                    {nCorr > 0   && <span style={{ fontSize: '8px', fontWeight: 700, color: '#ff9f0a', background: 'rgba(255,159,10,0.1)',  padding: '2px 6px', borderRadius: '5px' }}>{nCorr} Korrektur{nCorr !== 1 ? 'en' : ''}</span>}
                  </div>
                </div>

                {/* ─ ACCORDION BODY ─ */}
                {summaryOpen && (
                  <div style={{ padding: '0 12px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.1)' }}>
                    {/* Tab-Bar */}
                    <div style={{ display: 'flex', gap: '3px', margin: '10px 0' }}>
                      {TAB_LABELS.map((label, i) => (
                        <button key={i}
                          onClick={(e) => { e.stopPropagation(); setSummaryTab(i); }}
                          style={tabBtnStyle(summaryTab === i, i)}
                        >{label}</button>
                      ))}
                    </div>
                    {/* Tab Content */}
                    {summaryTexts[summaryTab]}
                  </div>
                )}
              </div>
            );
          })()}


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
              const auditProjection = cue.reviewAudit && cueReviewAuditIsValid(cue.reviewAudit)
                ? projectCueReviewAudit(cue.reviewAudit)
                : null;

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
                      <span style={{ fontSize: '10px', fontWeight: 800, color: '#c084fc' }}>
                        {auditProjection ? `✏️ Nicole-Entwurf · Revision ${auditProjection.revisionNumber}` : `✏️ Marker bei ${cue.timecodeStr} bearbeiten`}
                      </span>
                      <button onClick={() => setEditingCueId(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}>
                        <X size={12} />
                      </button>
                    </div>

                    {auditProjection && (
                      <div style={{ background: 'rgba(100,210,255,0.07)', border: '1px solid rgba(100,210,255,0.25)', borderRadius: '7px', padding: '7px 9px', fontSize: '8.5px', color: 'rgba(255,255,255,0.68)', lineHeight: 1.45 }}>
                        {cue.reviewAudit?.origin.integrity === 'legacy_unverified'
                          ? '⚠ Legacy-Import · ursprünglicher KI-Stand nicht vollständig verifizierbar.'
                          : '🔒 KI-Snapshot lokal integritätsgeprüft · exakter Analyseframe.'} Änderungen erzeugen eine neue Nicole-Revision. Lernenden-/Elternfreigaben werden dabei automatisch widerrufen.
                      </div>
                    )}

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
                      placeholder={editForm.status === 'NEUTRAL' ? 'Beobachtung / Titel...' : 'Befund / Fehler...'}
                      style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '4px 8px', borderRadius: '6px', fontSize: '10px' }}
                    />

                    <textarea
                      value={editForm.cueMetaphor}
                      onChange={e => setEditForm({ ...editForm, cueMetaphor: e.target.value })}
                      placeholder="Pädagogische Metapher..."
                      rows={2}
                      style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '4px 8px', borderRadius: '6px', fontSize: '10px' }}
                    />

                    <div style={{ fontSize: '8px', fontWeight: 800, color: editForm.status === 'NEUTRAL' ? 'rgba(255,255,255,0.55)' : '#ff453a', letterSpacing: '0.5px', marginTop: '4px' }}>
                      {editForm.status === 'NEUTRAL' ? '○ SICHTBARE BEOBACHTUNG' : '📍 WAS PASSIERT / WARUM'}
                    </div>
                    <textarea
                      value={editForm.diagnosisText}
                      onChange={e => setEditForm({ ...editForm, diagnosisText: e.target.value })}
                      placeholder={editForm.status === 'NEUTRAL'
                        ? 'Was ist in diesem Frame sichtbar? Noch keine Ursache ableiten.'
                        : 'Was ist falsch und warum? (kein Fachjargon...)'}
                      rows={2}
                      style={{ background: 'rgba(0,0,0,0.6)', border: editForm.status === 'NEUTRAL' ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,69,58,0.3)', color: '#fff', padding: '4px 8px', borderRadius: '6px', fontSize: '10px' }}
                    />

                    <div style={{ fontSize: '8px', fontWeight: 800, color: '#30d158', letterSpacing: '0.5px' }}>✦ WIE ES SEIN SOLL</div>
                    <textarea
                      value={editForm.goalText}
                      onChange={e => setEditForm({ ...editForm, goalText: e.target.value })}
                      placeholder="Wie sieht es richtig aus?"
                      rows={2}
                      style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(48,209,88,0.3)', color: '#fff', padding: '4px 8px', borderRadius: '6px', fontSize: '10px' }}
                    />

                    <div style={{ fontSize: '8px', fontWeight: 800, color: '#c084fc', letterSpacing: '0.5px' }}>🎯 ÜBEN & VERBESSERN</div>
                    <textarea
                      value={editForm.practiceText}
                      onChange={e => setEditForm({ ...editForm, practiceText: e.target.value })}
                      placeholder="Was konkret üben? Wie verbessern?"
                      rows={2}
                      style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(192,132,252,0.3)', color: '#fff', padding: '4px 8px', borderRadius: '6px', fontSize: '10px' }}
                    />

                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => setEditForm({ ...editForm, status: 'NEUTRAL' })}
                        style={{ background: editForm.status === 'NEUTRAL' ? 'rgba(255,255,255,0.12)' : 'transparent', color: editForm.status === 'NEUTRAL' ? '#fff' : 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.35)', padding: '2px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        ⚪ NEUTRAL
                      </button>
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
                      <Save size={12} /> {auditProjection ? 'Als neue Nicole-Revision speichern' : 'Speichern'}
                    </button>
                  </div>
                );
              }

              const isExpanded = expandedCueIds.has(cue.id);

              return (
                <div
                  key={cue.id}
                  style={{
                    background: isSelected
                      ? 'rgba(192, 132, 252, 0.18)'
                      : cue.status === 'NEUTRAL'
                        ? 'rgba(255,255,255,0.03)'
                        : cue.dataSource === 'TEACHER_CREATED'
                          ? 'rgba(245,158,11,0.04)'
                          : 'rgba(255, 255, 255, 0.03)',
                    border: isSelected
                      ? '1px solid #c084fc'
                      : cue.status === 'NEUTRAL'
                        ? `1px solid ${cueBorderColor(cue.status)}`
                        : cue.dataSource === 'TEACHER_CREATED'
                        ? '1px solid rgba(245,158,11,0.35)'
                        : `1px solid ${cueBorderColor(cue.status)}`,
                    borderLeft: cue.dataSource === 'TEACHER_CREATED' && cue.status !== 'NEUTRAL' && !isSelected
                      ? '3px solid rgba(245,158,11,0.5)'
                      : undefined,
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
                        {cue.isDemoFixture && (
                          <span
                            title="Beispielinhalt – keine Messung und keine Schülerbeurteilung"
                            style={{ color: '#ffd60a', fontSize: '7px', fontWeight: 900, flexShrink: 0, border: '1px solid rgba(255,214,10,0.45)', borderRadius: '4px', padding: '1px 4px' }}
                          >DEMO · keine Messung</span>
                        )}
                        {auditProjection && (
                          <span title={cue.reviewAudit?.origin.integrity === 'legacy_unverified' ? 'Legacy-Import – erneute Nicole-Prüfung erforderlich' : 'Lokal integritätsgeprüfter KI-Snapshot mit Lehrerrevisionen'} style={{ color: cue.reviewAudit?.origin.integrity === 'legacy_unverified' ? '#ffd60a' : '#64d2ff', fontSize: '7px', fontWeight: 900, flexShrink: 0, border: `1px solid ${cue.reviewAudit?.origin.integrity === 'legacy_unverified' ? 'rgba(255,214,10,0.4)' : 'rgba(100,210,255,0.4)'}`, borderRadius: '4px', padding: '1px 4px' }}>
                            NICOLE · R{auditProjection.revisionNumber} · {cue.reviewAudit?.origin.integrity === 'legacy_unverified' ? 'LEGACY UNVERIFIZIERT' : 'KI-SNAPSHOT ✓'}
                          </span>
                        )}
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
                          boxShadow: cue.status === 'NEUTRAL'
                            ? 'none'
                            : `0 0 5px ${cueColor(cue.status)}`,
                          flexShrink: 0,
                        }}
                      />
                      <button onClick={(e) => handleStartEdit(cue, e)} title="Bearbeiten"
                        style={{ background: 'transparent', border: 'none', color: '#c084fc', cursor: 'pointer', padding: '2px' }}>
                        <Edit2 size={11} />
                      </button>
                      <button onClick={(e) => handleDeleteCuePoint(cue.id, e)} title={cue.reviewAudit ? 'Auditierte Revisionen können nicht gelöscht werden' : 'Löschen'} disabled={Boolean(cue.reviewAudit)}
                        style={{ background: 'transparent', border: 'none', color: cue.reviewAudit ? 'rgba(255,255,255,0.18)' : '#ff453a', cursor: cue.reviewAudit ? 'not-allowed' : 'pointer', padding: '2px' }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>

                  {/* ─── ACCORDION BODY (nur wenn aufgeklappt) ─── */}
                  {isExpanded && (
                    <div style={{ padding: '8px 12px 12px', display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid rgba(255,255,255,0.06)', background: cue.status === 'CORRECTION' ? 'rgba(255,69,58,0.07)' : cue.status === 'WARNING' ? 'rgba(255,159,10,0.06)' : cue.status === 'GOOD' ? 'rgba(48,209,88,0.06)' : 'rgba(255,255,255,0.03)', borderRadius: '0 0 10px 10px' }}>

                  <div style={{ fontSize: '11px', fontWeight: 400, color: cue.status === 'CORRECTION' ? '#ff453a' : cueColor(cue.status), display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {cue.status === 'CORRECTION' ? <AlertTriangle size={10} />
                     : cue.status === 'WARNING' ? <AlertTriangle size={10} />
                     : cue.status === 'GOOD' ? <CheckCircle size={10} />
                     : <span aria-hidden="true">○</span>}
                    <span>{cue.headline}</span>
                  </div>


                  {/* ── 3-REITER PÄDAGOGIK ── */}
                  {(() => {
                    const diagContent = cue.diagnosisText || cue.kiNote || '';
                    const activeTab = getCueTab(cue.id);
                    const TAB_LABELS = ['Was & Warum', 'Ziel & Üben', 'Technik'];
                    const tabBtnStyle = (active: boolean, idx: number): React.CSSProperties => ({
                      flex: 1, padding: '5px 4px', fontSize: '9.5px', fontWeight: 700,
                      border: 'none', borderRadius: '6px', cursor: 'pointer',
                      letterSpacing: '0.2px', transition: 'all 0.15s ease',
                      background: active
                        ? (idx === 2 ? 'rgba(255,214,10,0.15)' : 'rgba(192,132,252,0.2)')
                        : 'rgba(255,255,255,0.05)',
                      color: active
                        ? (idx === 2 ? '#ffd60a' : '#d0a0ff')
                        : 'rgba(255,255,255,0.38)',
                      boxShadow: active ? `0 0 0 1px ${idx === 2 ? 'rgba(255,214,10,0.3)' : 'rgba(192,132,252,0.25)'}` : 'none',
                    });
                    const sectionLabel = (text: string, color: string) => (
                      <div style={{ fontSize: '9px', fontWeight: 800, color, letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '5px' }}>{text}</div>
                    );
                    const bodyText = (text: string) => (
                      <div style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.88)', lineHeight: 1.6 }}>{text}</div>
                    );
                    // Inline-editierbare Textarea für TEACHER_CREATED: sieht identisch aus wie bodyText,
                    // beim Fokus erscheint ein subtiler lila Rahmen; Höhe passt sich automatisch an
                    const autoH = (el: HTMLTextAreaElement | null) => {
                      if (!el) return;
                      el.style.height = 'auto';
                      el.style.height = `${el.scrollHeight}px`;
                    };
                    const inlineEdit = (value: string | undefined, field: keyof VaganovaCuePoint, placeholder: string) => (
                      <textarea
                        key={`${cue.id}-${field}-${value?.slice(0, 20)}`}
                        defaultValue={value ?? ''}
                        placeholder={placeholder}
                        ref={el => autoH(el)}
                        onInput={e => autoH(e.currentTarget)}
                        onBlur={e => handleInlineCueEdit(cue.id, { [field]: e.target.value || undefined })}
                        onClick={e => e.stopPropagation()}
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          resize: 'none', overflow: 'hidden',
                          background: 'transparent',
                          border: '1px solid transparent',
                          borderRadius: '6px', padding: '2px 4px',
                          color: 'rgba(255,255,255,0.88)', fontSize: '11.5px', lineHeight: 1.6,
                          fontFamily: 'Inter, system-ui, sans-serif',
                          outline: 'none',
                          transition: 'border-color 0.15s ease',
                          display: 'block',
                        }}
                        onFocus={e => { e.target.style.borderColor = 'rgba(192,132,252,0.35)'; autoH(e.target); }}
                        onBlurCapture={e => (e.target.style.borderColor = 'transparent')}
                      />
                    );
                    const emptyHint = () => (
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>— noch nicht ausgefüllt —</div>
                    );
                    const quoteBlock = (text?: string) => text ? (
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', fontStyle: 'italic', borderLeft: '2px solid rgba(192,132,252,0.35)', paddingLeft: '10px', marginTop: '8px', lineHeight: 1.55 }}>{text}</div>
                    ) : null;

                    return (
                      <div style={{ marginTop: '4px' }}>
                        {/* Tab-Bar */}
                        <div style={{ display: 'flex', gap: '3px', marginBottom: '10px' }}>
                          {TAB_LABELS.map((label, i) => (
                            <button key={i} onClick={(e) => { e.stopPropagation(); setCueTab(cue.id, i); }}
                              style={tabBtnStyle(activeTab === i, i)}>
                              {label}
                            </button>
                          ))}
                        </div>

                        {/* Tab 0 – Was & Warum */}
                        {activeTab === 0 && (
                          <div>
                            {cue.dataSource === 'TEACHER_CREATED'
                              // TEACHER: inline-editierbares Textfeld (sieht wie KI-Body aus)
                              ? inlineEdit(diagContent || undefined, 'diagnosisText', 'Was passiert und warum? Beschreibung eintragen...')
                              // KI: read-only
                              : (diagContent
                                  ? bodyText(diagContent)
                                  : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', fontStyle: 'italic', lineHeight: 1.6 }}>
                                        Noch kein Inhalt für diesen Marker.
                                      </div>
                                      <button
                                        onClick={canGenerateLegacyUngroundedCues()
                                          ? (e) => { e.stopPropagation(); handleApplyKiSuggestion(cue.id); }
                                          : undefined}
                                        disabled={!canGenerateLegacyUngroundedCues()}
                                        title={!canGenerateLegacyUngroundedCues()
                                          ? 'Automatische Textvorschläge sind bis zur metrikspezifischen Evidenzfreigabe deaktiviert.'
                                          : undefined}
                                        style={{
                                          display: 'flex', alignItems: 'center', gap: '6px',
                                          background: 'linear-gradient(135deg, rgba(245,158,11,0.2) 0%, rgba(245,158,11,0.08) 100%)',
                                          border: '1px solid rgba(245,158,11,0.4)',
                                          borderRadius: '8px', padding: '7px 10px',
                                          color: '#f59e0b', fontSize: '10px', fontWeight: 800,
                                          cursor: canGenerateLegacyUngroundedCues() ? 'pointer' : 'not-allowed', width: '100%', justifyContent: 'center',
                                          opacity: canGenerateLegacyUngroundedCues() ? 1 : 0.55,
                                        }}
                                      >
                                        <Sparkles size={11} />
                                        {canGenerateLegacyUngroundedCues()
                                          ? 'KI-Vorschlag für diesen Frame generieren'
                                          : 'KI-Vorschlag derzeit gesperrt'}
                                      </button>
                                    </div>
                                  )
                              )}
                            {quoteBlock(cue.diagnosisMetaphor)}
                          </div>
                        )}

                        {/* Tab 1 – Ziel & Üben */}
                        {activeTab === 1 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                              {sectionLabel('Wie es sein soll', 'rgba(48,209,88,0.75)')}
                              {cue.dataSource === 'TEACHER_CREATED'
                                ? inlineEdit(cue.goalText, 'goalText', 'Ziel & Soll-Zustand eintragen...')
                                : (cue.goalText ? bodyText(cue.goalText) : emptyHint())}
                            </div>
                            <div>
                              {sectionLabel('Üben & verbessern', 'rgba(192,132,252,0.75)')}
                              {cue.dataSource === 'TEACHER_CREATED'
                                ? inlineEdit(cue.practiceText, 'practiceText', 'Konkrete Übung eintragen...')
                                : (cue.practiceText ? bodyText(cue.practiceText) : emptyHint())}
                            </div>
                            {/* Metapher inline editierbar für Teacher */}
                            {cue.dataSource === 'TEACHER_CREATED' ? (
                              <div>
                                {sectionLabel('Metapher / Bild', 'rgba(192,132,252,0.4)')}
                                {inlineEdit(
                                  cue.cueMetaphor && cue.cueMetaphor !== '(KI-Vorschlag — durch Nicole editierbar)' ? cue.cueMetaphor : undefined,
                                  'cueMetaphor',
                                  '"Metapher oder Bild für die Schülerin..."'
                                )}
                              </div>
                            ) : quoteBlock(cue.cueMetaphor)}
                          </div>
                        )}

                        {/* Tab 2 – Technik */}
                        {activeTab === 2 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {sectionLabel('Forensische Technik-Analyse', 'rgba(255,214,10,0.7)')}
                            {cue.dataSource === 'TEACHER_CREATED' ? (
                              // TEACHER: inline-editierbares Feld
                              inlineEdit(cue.technicalAnalysis, 'technicalAnalysis', 'Technische Details, Beobachtungen, Notizen für fortgeschrittene Analyse...')
                            ) : cue.technicalAnalysis ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {cue.technicalAnalysis.split('\n\n').map((block, i) => {
                                  const lines = block.split('\n');
                                  const heading = lines[0];
                                  const body = lines.slice(1).join('\n').trim();
                                  return (
                                    <div key={i}>
                                      <div style={{ fontSize: '9px', fontWeight: 800, color: i === 0 ? '#ffd60a' : i === 1 ? 'rgba(255,255,255,0.45)' : i === 2 ? '#c084fc' : i === 3 ? '#ff9f0a' : '#30d158', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '4px' }}>
                                        {heading}
                                      </div>
                                      <div style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.82)', lineHeight: 1.65 }}>
                                        {body}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>
                                — Noch keine forensische Analyse verfügbar. KI-Analyse durchführen oder manuell ergänzen. —
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}



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
                        <button onClick={(e) => { e.stopPropagation(); persistCueUpdate(cue.id, { provenance: 'nicole_confirmed' }); }}
                          style={{ background: 'rgba(48,209,88,0.2)', border: '1px solid rgba(48,209,88,0.5)', color: '#30d158', padding: '3px 8px', borderRadius: '5px', fontSize: '9px', fontWeight: 800, cursor: 'pointer' }}
                        >✓ Übernehmen</button>
                        <button onClick={(e) => { e.stopPropagation(); handleStartEdit(cue, e); }}
                          style={{ background: 'rgba(192,132,252,0.15)', border: '1px solid rgba(192,132,252,0.4)', color: '#c084fc', padding: '3px 8px', borderRadius: '5px', fontSize: '9px', fontWeight: 800, cursor: 'pointer' }}
                        >✏ Bearbeiten</button>
                        <button onClick={(e) => { e.stopPropagation(); persistCueUpdate(cue.id, { provenance: 'nicole_rejected' }); }}
                          style={{ background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.3)', color: '#ff453a', padding: '3px 8px', borderRadius: '5px', fontSize: '9px', fontWeight: 800, cursor: 'pointer' }}
                        >✕ Ablehnen</button>
                        <button onClick={(e) => { e.stopPropagation(); persistCueUpdate(cue.id, { provenance: 'nicole_confirmed', nicoleAction: 'strength', status: 'GOOD' }); }}
                          style={{ background: 'rgba(48,209,88,0.1)', border: '1px solid rgba(48,209,88,0.3)', color: 'rgba(255,255,255,0.7)', padding: '3px 8px', borderRadius: '5px', fontSize: '9px', cursor: 'pointer' }}
                        >⭐ Als Stärke</button>
                        <button onClick={(e) => { e.stopPropagation(); persistCueUpdate(cue.id, { provenance: 'nicole_confirmed', nicoleAction: 'correction', status: 'CORRECTION' }); }}
                          style={{ background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.3)', color: 'rgba(255,255,255,0.7)', padding: '3px 8px', borderRadius: '5px', fontSize: '9px', cursor: 'pointer' }}
                        >⚠ Als Korrektur</button>
                      </div>
                    </div>
                  )}

                  {auditProjection && (
                    <div style={{ background: 'rgba(100,210,255,0.055)', border: '1px solid rgba(100,210,255,0.2)', borderRadius: '8px', padding: '7px 9px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <div style={{ fontSize: '8px', color: '#64d2ff', fontWeight: 900, letterSpacing: '0.5px' }}>
                        {cue.reviewAudit!.origin.integrity === 'legacy_unverified'
                          ? `⚠ LEGACY-IMPORT · URSPRÜNGLICHER KI-STAND NICHT VOLLSTÄNDIG VERIFIZIERBAR · NICOLE-REVISION ${auditProjection.revisionNumber}`
                          : `🔒 KI-SNAPSHOT LOKAL INTEGRITÄTSGEPRÜFT · NICOLE-REVISION ${auditProjection.revisionNumber}`}
                      </div>
                      <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.4 }}>
                        Frame {(cue.reviewAudit!.origin.anchor.mediaTimeUs / 1_000_000).toFixed(3)}s · {cue.reviewAudit!.origin.policyVersion} · {cue.reviewAudit!.origin.integrity === 'legacy_unverified' ? 'Legacy-Ursprung unverifiziert; erneute Nicole-Prüfung erforderlich.' : 'KI-Original bleibt unverändert.'}
                      </div>
                      {auditProjection.provenance === 'nicole_rejected' ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                          <span style={{ fontSize: '8px', color: '#ff453a', fontWeight: 800 }}>Von Nicole abgelehnt</span>
                          <button onClick={(e) => { e.stopPropagation(); handleReviewedCueTransition(cue.id, 'reopen'); }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.5)', padding: '3px 7px', borderRadius: '5px', fontSize: '8px', cursor: 'pointer' }}>↩ Neu prüfen</button>
                        </div>
                      ) : !auditProjection.isApproved ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                          <span style={{ fontSize: '8px', color: '#ffd60a', fontWeight: 800 }}>Nicoles Entscheidung ausstehend</span>
                          <button onClick={(e) => { e.stopPropagation(); handleReviewedCueTransition(cue.id, 'approve'); }} style={{ background: 'rgba(48,209,88,0.16)', border: '1px solid rgba(48,209,88,0.4)', color: '#30d158', padding: '3px 7px', borderRadius: '5px', fontSize: '8px', fontWeight: 800, cursor: 'pointer' }}>✓ Fachlich freigeben</button>
                          <button onClick={(e) => { e.stopPropagation(); handleReviewedCueTransition(cue.id, 'reject'); }} style={{ background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.25)', color: '#ff453a', padding: '3px 7px', borderRadius: '5px', fontSize: '8px', cursor: 'pointer' }}>✕ Ablehnen</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '8px', color: '#30d158', fontWeight: 800 }}>✓ Diese Nicole-Revision ist fachlich freigegeben.</span>
                          <button onClick={(e) => { e.stopPropagation(); handleReviewedCueTransition(cue.id, 'reopen'); }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.5)', padding: '3px 7px', borderRadius: '5px', fontSize: '8px', cursor: 'pointer' }}>Freigabe widerrufen</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Freigabe nach Nicole-Bestätigung */}
                  {((cue.provenance === 'nicole_confirmed' || cue.provenance === 'nicole_edited') && (!auditProjection || auditProjection.isApproved)) && (
                    <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: '8px', color: '#30d158', fontWeight: 800 }}>✓ Bestätigt</span>
                      <button onClick={(e) => { e.stopPropagation(); auditProjection ? handleReviewedAudience(cue.id, 'learner', !cue.learnerVisible) : persistCueUpdate(cue.id, { learnerVisible: !cue.learnerVisible }); }}
                        style={{ background: cue.learnerVisible ? 'rgba(48,209,88,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${cue.learnerVisible ? 'rgba(48,209,88,0.5)' : 'rgba(255,255,255,0.15)'}`, color: cue.learnerVisible ? '#30d158' : 'rgba(255,255,255,0.45)', padding: '2px 7px', borderRadius: '5px', fontSize: '8px', fontWeight: 800, cursor: 'pointer' }}
                      >{cue.learnerVisible ? '👁 Lernende: an' : '👁 Für Lernende'}</button>
                      <button onClick={(e) => { e.stopPropagation(); auditProjection ? handleReviewedAudience(cue.id, 'parent', !cue.parentVisible) : persistCueUpdate(cue.id, { parentVisible: !cue.parentVisible }); }}
                        style={{ background: cue.parentVisible ? 'rgba(48,209,88,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${cue.parentVisible ? 'rgba(48,209,88,0.5)' : 'rgba(255,255,255,0.15)'}`, color: cue.parentVisible ? '#30d158' : 'rgba(255,255,255,0.45)', padding: '2px 7px', borderRadius: '5px', fontSize: '8px', fontWeight: 800, cursor: 'pointer' }}
                      >{cue.parentVisible ? '👨‍👩‍👧 Eltern: an' : '👨‍👩‍👧 Für Eltern'}</button>
                    </div>
                  )}

                  {/* Abgelehnter Vorschlag – kollabiert, grau, zur Nachvollziehbarkeit */}
                  {cue.provenance === 'nicole_rejected' && !auditProjection && (
                    <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.3)', fontWeight: 600, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>✕ Von Nicole abgelehnt</span>
                      <button onClick={(e) => { e.stopPropagation(); persistCueUpdate(cue.id, { provenance: 'ki_suggestion' }); }}
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
              onClick={cuePoints.some(cue => cue.reviewAudit) ? undefined : () => setCuePoints(vaganovaPreAnalyzer.resetToDefaults(selectedDevVideoUrl))}
              disabled={cuePoints.some(cue => cue.reviewAudit)}
              title={cuePoints.some(cue => cue.reviewAudit) ? 'Auditierte Nicole-Revisionen bleiben erhalten.' : undefined}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-sub)', fontSize: '9px', fontWeight: 600, cursor: cuePoints.some(cue => cue.reviewAudit) ? 'not-allowed' : 'pointer', opacity: cuePoints.some(cue => cue.reviewAudit) ? 0.4 : 1, display: 'flex', alignItems: 'center', gap: '4px' }}
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
