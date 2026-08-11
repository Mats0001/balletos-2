// SCHOENEWOLF V2: Production Contract Type Hierarchy for Vaganova Skeleton

export type EvidenceVerdict = 'beurteilbar' | 'review' | 'nicht_beurteilbar';
export type RegionVerdict = 'measurable' | 'hint' | 'review' | 'blocked';
export type CheckpointStatus = 'richtig' | 'auffaellig' | 'review' | 'nicht_auswertbar';
export type SafetyStatus = 'passed' | 'review' | 'blocked';

export interface Keypoint2D {
  x: number;
  y: number;
  visibility: number;
}

export interface VideoAsset {
  videoId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  durationMs: number;
  naturalWidth: number;
  naturalHeight: number;
  orientation: 'portrait' | 'landscape';
  createdAt: string;
  localBlobKey?: string;
  source: 'local_upload' | 'nicole_studio' | 'demo';
}

export interface MappingProof {
  videoPixelRect: { width: number; height: number };
  displayPixelRect: { top: number; left: number; width: number; height: number };
  objectFitMode: 'contain' | 'cover';
  cropScale: number;
  maxPixelErrorPx: number;
  status: 'pass' | 'review' | 'fail';
}

export interface RegionEvidence {
  region: 'head' | 'neck' | 'shoulder' | 'torso' | 'pelvis' | 'armLeft' | 'armRight' | 'handLeft' | 'handRight' | 'kneeLeft' | 'kneeRight' | 'footLeft' | 'footRight';
  requiredLandmarks: number[];
  presentLandmarks: number[];
  allowedSources: ('pose' | 'hand' | 'face')[];
  confidence: number; // 0 - 100%
  stability: number; // 0 - 1.0
  verdict: RegionVerdict;
  reason: string;
}

export interface BalletCheckpoint {
  checkpointId: string;
  name: string;
  region: string;
  status: CheckpointStatus;
  measuredValue: string;
  targetValue: string;
  vaganovaRule: string;
  pedagogicalCue: string;
  minimumEvidenceLevel: 'E1' | 'E2' | 'E3' | 'E4' | 'E5';
}

export interface SafetyGate {
  status: SafetyStatus;
  blockedReason: string | null;
  allowedOutputs: {
    studentNote: boolean;
    teacherNote: boolean;
    parentDraft: boolean;
    homework: boolean;
  };
}

export interface HomeworkOutput {
  status: 'allowed' | 'blocked';
  plan: string | null;
  blockedReason: string | null;
}

export interface FeedbackObject {
  feedbackId: string;
  sessionId: string;
  studentName: string;
  exerciseName: string;
  timestampStr: string;
  overallVerdict: EvidenceVerdict;
  findingHeadline: string;
  whyRelevant: string;
  positiveNote: string;
  uncertaintyNote: string;
  historyComparison: string;
  nextCue: string;
  safetyGate: SafetyGate;
  homework: HomeworkOutput;
  evidenceLedger: RegionEvidence[];
  checkpointResults: BalletCheckpoint[];
}

export interface JetztWichtigInspectorData {
  studentName: string;
  exerciseName: string;
  timestampStr: string;
  findingHeadline: string;
  /** Severity of the finding – drives headline color (Fix D, 2026-08-11) */
  findingSeverity?: 'GOOD' | 'CORRECTION' | 'WARNING' | 'NEUTRAL';
  whyRelevant: string;
  positiveNote: string;
  uncertaintyNote: string;
  historyComparison: string;
  nextCue: string;
  overallVerdict?: EvidenceVerdict;
  homeworkStatus?: 'allowed' | 'blocked';
  homeworkBlockedReason?: string | null;
}

export type Location = 'MAINZ' | 'ALZEY';

export type AgeGroup = 'MINIS' | 'KIDS' | 'TEENS' | 'ERWACHSENE' | 'MASTERCLASS';

export interface Student {
  id: string;
  name: string;
  age: number;
  ageGroup: AgeGroup;
  location: Location;
  avatar: string;
  level: string;
  badges: string[];
  parentName: string;
  gdprConsent: boolean;
  notesCount: number;
  lastActive: string;
}

export interface StudentClip {
  id: string;
  title: string;
  date: string;
  thumbnail: string;
  note: string;
  category: 'AUFFÄLLIG' | 'HIGHLIGHT';
}

export interface StudentDetail extends Student {
  turnoutScore: number;
  axisStability: number;
  progressCurve: number[];
  todayCorrection: string;
  successPoints: string[];
  improvementPoints: string[];
  kiActionPlan: string;
  recentClips: StudentClip[];
}

export interface TelestratorStroke {
  color: string;
  lineWidth: number;
  points: { x: number; y: number }[];
}

export interface HomeTask {
  id: string;
  title: string;
  duration: string;
  description: string;
  metaphorTip: string;
}

export interface MetaphorFeedback {
  exerciseId: string;
  ageGroup: AgeGroup;
  whatWentWell: string[];
  whatToImprove: string[];
  nicoleSpeechPrompt: string;
  studentFocus: string;
  homeTasks: HomeTask[];
}

