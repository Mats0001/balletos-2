import {
  EvidenceVerdict,
  RegionEvidence,
  BalletCheckpoint,
  SafetyGate,
  FeedbackObject,
  HomeworkOutput
} from '../types';
import { PoseLandmark } from './realMediaPipePose';
import {
  isMeasurableVaganovaMeasurement,
  vaganovaAngleCalculator,
  VaganovaFullAnalysis,
  VaganovaMeasurement
} from './vaganovaAngleCalculator';
import { getStandards } from '../config/vaganovaStandards';
import { BUILD_POLICY } from '../config/buildPolicy';

export class VaganovaEvidenceEngineService {
  /**
   * Compute Region Evidence according to Production Contract Rules (G-01 / Invariants)
   */
  public computeRegionEvidence(landmarks: PoseLandmark[] | null, exercise: string): RegionEvidence[] {
    const hasLm = landmarks && landmarks.length >= 33;

    // Helper to check landmark visibility
    const checkVis = (indices: number[]): { present: number[]; confidence: number } => {
      if (!hasLm) return { present: [], confidence: 0 };
      const present: number[] = [];
      let totalVis = 0;

      indices.forEach(idx => {
        if (landmarks![idx] && (landmarks![idx].visibility ?? 1.0) >= 0.5) {
          present.push(idx);
          totalVis += (landmarks![idx].visibility ?? 1.0);
        }
      });

      const conf = indices.length > 0 ? (totalVis / indices.length) * 100 : 0;
      return { present, confidence: conf };
    };

    // Region 1: Head & Cervical Axis (Indices: 0, 2, 5, 7, 8)
    const headCheck = checkVis([0, 2, 5, 7, 8]);
    const headVerdict: RegionEvidence = {
      region: 'head',
      requiredLandmarks: [0, 2, 5, 7, 8],
      presentLandmarks: headCheck.present,
      allowedSources: ['face', 'pose'],
      confidence: headCheck.confidence,
      stability: -1, // NOT_COMPUTED: frame-to-frame variance not yet tracked (audit fix 2026-08-10)
      verdict: headCheck.present.length >= 3 ? 'measurable' : 'review',
      reason: headCheck.present.length >= 3 ? 'Kopf- & Gesichts-Landmarks ausreichend sichtbar.' : 'Kopf teilweise verdeckt; Épaulement im Review-Modus.'
    };

    // Region 2: Shoulder Line (Indices: 11, 12)
    const shoulderCheck = checkVis([11, 12]);
    const shoulderVerdict: RegionEvidence = {
      region: 'shoulder',
      requiredLandmarks: [11, 12],
      presentLandmarks: shoulderCheck.present,
      allowedSources: ['pose'],
      confidence: shoulderCheck.confidence,
      stability: -1, // NOT_COMPUTED
      verdict: shoulderCheck.present.length === 2 ? 'measurable' : 'blocked',
      reason: shoulderCheck.present.length === 2 ? 'Schulterachse vollständig messbar.' : 'Schulterpunkte nicht ausreichend sichtbar.'
    };

    // Region 3: Left Arm (Indices: 11, 13, 15)
    const armLCheck = checkVis([11, 13, 15]);
    const armLVerdict: RegionEvidence = {
      region: 'armLeft',
      requiredLandmarks: [11, 13, 15],
      presentLandmarks: armLCheck.present,
      allowedSources: ['pose'],
      confidence: armLCheck.confidence,
      stability: -1, // NOT_COMPUTED
      verdict: armLCheck.present.length === 3 ? 'measurable' : 'review',
      reason: armLCheck.present.length === 3 ? 'Linker Arm Bogen messbar.' : 'Linker Ellbogen/Handgelenk im Review.'
    };

    // Region 4: Right Arm (Indices: 12, 14, 16)
    const armRCheck = checkVis([12, 14, 16]);
    const armRVerdict: RegionEvidence = {
      region: 'armRight',
      requiredLandmarks: [12, 14, 16],
      presentLandmarks: armRCheck.present,
      allowedSources: ['pose'],
      confidence: armRCheck.confidence,
      stability: -1, // NOT_COMPUTED
      verdict: armRCheck.present.length === 3 ? 'measurable' : 'review',
      reason: armRCheck.present.length === 3 ? 'Rechter Arm Bogen messbar.' : 'Rechter Ellbogen/Handgelenk im Review.'
    };

    // Region 5: Pelvis & Core (Indices: 23, 24)
    const pelvisCheck = checkVis([23, 24]);
    const pelvisVerdict: RegionEvidence = {
      region: 'pelvis',
      requiredLandmarks: [23, 24],
      presentLandmarks: pelvisCheck.present,
      allowedSources: ['pose'],
      confidence: pelvisCheck.confidence,
      stability: -1, // NOT_COMPUTED
      verdict: pelvisCheck.present.length === 2 ? 'measurable' : 'blocked',
      reason: pelvisCheck.present.length === 2 ? 'Beckenachse neutral & messbar.' : 'Beckenpunkte nicht sichtbar.'
    };

    // Region 6: Left knee observation. Landmarks may be visible, but the
    // current single-camera contract has no valid view/phase/reference anchor.
    const kneeLCheck = checkVis([23, 25, 27, 31]);
    const kneeLVerdict: RegionEvidence = {
      region: 'kneeLeft',
      requiredLandmarks: [23, 25, 27, 31],
      presentLandmarks: kneeLCheck.present,
      allowedSources: ['pose'],
      confidence: kneeLCheck.confidence,
      stability: -1, // NOT_COMPUTED
      verdict: 'blocked',
      reason: kneeLCheck.present.length >= 3
        ? 'Kniepunkte sichtbar; automatische Knieachsenbewertung ohne bestätigten Referenzanker gesperrt.'
        : 'Knie-/Fußpunkte nicht ausreichend sichtbar; automatische Bewertung gesperrt.'
    };

    // Region 7: Right knee observation — same fail-closed contract as left.
    const kneeRCheck = checkVis([24, 26, 28, 32]);
    const kneeRVerdict: RegionEvidence = {
      region: 'kneeRight',
      requiredLandmarks: [24, 26, 28, 32],
      presentLandmarks: kneeRCheck.present,
      allowedSources: ['pose'],
      confidence: kneeRCheck.confidence,
      stability: -1, // NOT_COMPUTED
      verdict: 'blocked',
      reason: kneeRCheck.present.length >= 3
        ? 'Kniepunkte sichtbar; automatische Knieachsenbewertung ohne bestätigten Referenzanker gesperrt.'
        : 'Knie-/Fußpunkte nicht ausreichend sichtbar; automatische Bewertung gesperrt.'
    };

    // Region 8: Feet En Dehors (Indices: 27, 28, 31, 32)
    const feetCheck = checkVis([27, 28, 31, 32]);
    const feetVerdict: RegionEvidence = {
      region: 'footLeft',
      requiredLandmarks: [27, 28, 31, 32],
      presentLandmarks: feetCheck.present,
      allowedSources: ['pose'],
      confidence: feetCheck.confidence,
      stability: -1, // NOT_COMPUTED
      verdict: feetCheck.present.length >= 3 ? 'measurable' : 'review',
      reason: feetCheck.present.length >= 3 ? 'En Dehors Auswärtsdrehung messbar.' : 'Füße am Bildrand leicht abgeschnitten.'
    };

    return [
      headVerdict,
      shoulderVerdict,
      armLVerdict,
      armRVerdict,
      pelvisVerdict,
      kneeLVerdict,
      kneeRVerdict,
      feetVerdict
    ];
  }

  /**
   * Evaluate Ballet Checkpoints on top of Region Evidence
   */
  public computeCheckpoints(regionEvidences: RegionEvidence[], selectedJointId: string, landmarks: PoseLandmark[] | null, vw = 1, vh = 1): BalletCheckpoint[] {
    const getEvVerdict = (region: string) => regionEvidences.find(e => e.region === region)?.verdict;

    // P0 FIX: Pass video dimensions for aspect-ratio-correct angle calculation
    const analysis = landmarks ? vaganovaAngleCalculator.analyzeFullFrame(landmarks, vw, vh) : {} as Partial<VaganovaFullAnalysis>;
    // Audit fix: use exercise-specific standards, not always 'default'
    const standards = getStandards(selectedJointId || 'default');

    // The EvidenceEngine must never convert missing/not_measurable evidence to
    // review (orange), richtig (green), or auffaellig (red). Measurable values
    // remain review-only until a DecisionGate authorizes their metric contract.
    // TODO Sprint 1 Step 5: Diese Funktion vollständig durch DecisionGate ersetzen.
    // Der DecisionGate konsumiert MetricDecision, niemals rohe measurement.value.
    const isUsable = (measurement: VaganovaMeasurement | null | undefined, evidenceVerdict?: RegionEvidence['verdict']) => (
      isMeasurableVaganovaMeasurement(measurement)
      && evidenceVerdict === 'measurable'
    );

    const getStatus = (measurement: VaganovaMeasurement | null | undefined, evidenceVerdict?: RegionEvidence['verdict']): 'review' | 'nicht_auswertbar' => {
      if (!isUsable(measurement, evidenceVerdict)) return 'nicht_auswertbar';
      // BUILD_POLICY.allowThresholdScoring === false → immer 'review'
      return 'review';
    };

    const getMeasuredValue = (measurement: VaganovaMeasurement | null | undefined, evidenceVerdict?: RegionEvidence['verdict']) => {
      if (!isMeasurableVaganovaMeasurement(measurement) || !isUsable(measurement, evidenceVerdict)) return 'Nicht messbar';
      return `${measurement.value.toFixed(1)}° ${measurement.label}`;
    };

    const getTargetValue = (measurement: VaganovaMeasurement | null | undefined, evidenceVerdict: RegionEvidence['verdict'] | undefined, standard: any, fallback: string) => {
      if (!isUsable(measurement, evidenceVerdict)) return 'Keine bewertbare Schwelle';
      return standard ? `${standard.ideal[0]}° - ${standard.ideal[1]}°` : fallback;
    };

    return [
      {
        checkpointId: 'head_epaulement',
        name: 'Kopf & Épaulement (Cervical Axis)',
        region: 'head',
        status: getStatus(analysis.epaulement, getEvVerdict('head')),
        measuredValue: getMeasuredValue(analysis.epaulement, getEvVerdict('head')),
        targetValue: getTargetValue(analysis.epaulement, getEvVerdict('head'), standards.epaulement, '15.0° Vaganova Standard'),
        vaganovaRule: 'Der Kopf folgt der Handführung mit 15° Schrägung über der Schulterachse.',
        pedagogicalCue: 'Blick über die rechte Handspitze führen ("Wie ein stolzer Schwan").',
        minimumEvidenceLevel: 'E3'
      },
      {
        checkpointId: 'port_de_bras_arms',
        name: 'Port de Bras & Ellbogen-Bogen',
        region: 'armLeft',
        status: getStatus(analysis.portDeBrasL, getEvVerdict('armLeft')),
        measuredValue: getMeasuredValue(analysis.portDeBrasL, getEvVerdict('armLeft')),
        targetValue: getTargetValue(analysis.portDeBrasL, getEvVerdict('armLeft'), standards.portDeBras, '160°–170° Fließend'),
        vaganovaRule: 'Ellbogen gehoben halten, fließender Bogen von den Schultern bis zu den Fingerspitzen.',
        pedagogicalCue: 'Ellbogen nie abknicken lassen; Flügelspannung spüren.',
        minimumEvidenceLevel: 'E2'
      },
      {
        checkpointId: 'pelvis_core',
        name: 'Becken & Schwerpunkt (Pelvic Tilt & CoM)',
        region: 'pelvis',
        status: getStatus(analysis.pelvicTilt, getEvVerdict('pelvis')),
        measuredValue: getMeasuredValue(analysis.pelvicTilt, getEvVerdict('pelvis')),
        targetValue: getTargetValue(analysis.pelvicTilt, getEvVerdict('pelvis'), standards.pelvicTilt, '0.0° Absolut Horizontal'),
        vaganovaRule: 'Neutraler Beckenstand ohne Vorkippen (Anterior Tilt) oder seitlichen Hochstand.',
        pedagogicalCue: 'Bauchnabel sanft zur Wirbelsäule ziehen, Becken neutral verankern.',
        minimumEvidenceLevel: 'E2'
      },
      {
        checkpointId: 'left_knee',
        name: 'Linke Knieachse (2D-Beobachtung)',
        region: 'kneeLeft',
        status: getStatus(analysis.valgusDriftL, getEvVerdict('kneeLeft')),
        measuredValue: getMeasuredValue(analysis.valgusDriftL, getEvVerdict('kneeLeft')),
        targetValue: getTargetValue(analysis.valgusDriftL, getEvVerdict('kneeLeft'), undefined, 'Keine bewertbare Schwelle'),
        vaganovaRule: 'Der Einzelkamera-Proxy liefert ohne bestätigten Referenzframe, Perspektive und Bewegungsphase kein automatisches Urteil.',
        pedagogicalCue: 'Nicole prüft die sichtbare Knie-Fuß-Linie und legt bei Bedarf einen Referenzframe fest.',
        minimumEvidenceLevel: 'E2'
      },
      {
        checkpointId: 'right_knee',
        name: 'Rechte Knieachse (2D-Beobachtung)',
        region: 'kneeRight',
        status: getStatus(analysis.valgusDriftR, getEvVerdict('kneeRight')),
        measuredValue: getMeasuredValue(analysis.valgusDriftR, getEvVerdict('kneeRight')),
        targetValue: getTargetValue(analysis.valgusDriftR, getEvVerdict('kneeRight'), undefined, 'Keine bewertbare Schwelle'),
        vaganovaRule: 'Der Einzelkamera-Proxy liefert ohne bestätigten Referenzframe, Perspektive und Bewegungsphase kein automatisches Urteil.',
        pedagogicalCue: 'Nicole prüft die sichtbare Knie-Fuß-Linie und legt bei Bedarf einen Referenzframe fest.',
        minimumEvidenceLevel: 'E2'
      },
      {
        checkpointId: 'en_dehors_feet',
        name: 'Füße & En Dehors Auswärts-Drehung',
        region: 'footLeft',
        status: getStatus(analysis.turnoutL, getEvVerdict('footLeft')),
        measuredValue: getMeasuredValue(analysis.turnoutL, getEvVerdict('footLeft')),
        targetValue: getTargetValue(analysis.turnoutL, getEvVerdict('footLeft'), standards.turnout, '90° je Fuß'),
        vaganovaRule: 'Auswärts-Drehung entsteht zu 100% aus dem Hüftgelenk, nicht durch Verdrehen der Knöchel.',
        pedagogicalCue: 'Oberschenkel im Hüftgelenk nach außen rotieren.',
        minimumEvidenceLevel: 'E3'
      }
    ];
  }

  /**
   * Evaluate Safety Gate & Homework (Deterministic Safety Tree)
   */
  public evaluateSafetyGate(
    overallVerdict: EvidenceVerdict,
    teacherConfirmed: boolean
  ): SafetyGate {
    // DOMAIN ENFORCEMENT (Berater 2026-08-10):
    // BUILD_POLICY wird hier im Domain-Service selbst erzwungen, nicht nur in der UI.
    // Ein deaktivierter Hausaufgaben-Button reicht nicht – die Engine kann intern
    // homework: allowed erzeugen. Das ist hier definitiv gesperrt.
    // 'as const' ist nur typseitig readonly. Die Domain-Sperre ist die echte Schranke.
    if (!BUILD_POLICY.allowHomeworkGeneration || !BUILD_POLICY.allowSafetyClaims) {
      return {
        status: 'blocked',
        blockedReason: `BUILD_POLICY v${BUILD_POLICY.policyVersion}: Hausaufgaben und Safety-Claims sind deaktiviert bis DecisionGate + Mocap-Validierung abgeschlossen sind.`,
        allowedOutputs: { studentNote: false, teacherNote: true, parentDraft: false, homework: false }
      };
    }

    if (overallVerdict === 'nicht_beurteilbar') {
      return {
        status: 'blocked',
        blockedReason: 'Keine Evidenz: Aufnahme unvollständig oder Zielperson nicht erkennbar.',
        allowedOutputs: { studentNote: false, teacherNote: true, parentDraft: false, homework: false }
      };
    }

    if (overallVerdict === 'review' || !teacherConfirmed) {
      return {
        status: 'review',
        blockedReason: 'Keine neue Hausaufgabe ausgeben, bis Nicole die Evidenz bestätigt.',
        allowedOutputs: { studentNote: true, teacherNote: true, parentDraft: false, homework: false }
      };
    }

    return {
      status: 'passed',
      blockedReason: null,
      allowedOutputs: { studentNote: true, teacherNote: true, parentDraft: true, homework: true }
    };
  }

  /**
   * Construct Complete Single Source of Truth FeedbackObject
   */
  public buildFeedbackObject(
    studentName: string,
    exerciseName: string,
    timestampStr: string,
    landmarks: PoseLandmark[] | null,
    selectedJointId: string,
    teacherConfirmed: boolean = false,  // Audit fix: false = safe default; teacher must explicitly confirm
    vw = 1,
    vh = 1
  ): FeedbackObject {
    const evidenceLedger = this.computeRegionEvidence(landmarks, exerciseName);
    const checkpointResults = this.computeCheckpoints(evidenceLedger, selectedJointId, landmarks, vw, vh);

    // Determine overall verdict
    const measurableCount = evidenceLedger.filter(e => e.verdict === 'measurable').length;
    const overallVerdict: EvidenceVerdict =
      measurableCount >= 5 ? 'beurteilbar' : measurableCount >= 2 ? 'review' : 'nicht_beurteilbar';

    const safetyGate = this.evaluateSafetyGate(overallVerdict, teacherConfirmed);

    const activeCp = checkpointResults.find(c => c.checkpointId === selectedJointId) || checkpointResults[3];
    const bestCp = checkpointResults.find(c => c.status === 'richtig');
    const worstCp = checkpointResults.find(c => c.status === 'auffaellig') || activeCp;

    const avgConfidence = landmarks && landmarks.length > 0 
      ? Math.round((landmarks.reduce((sum, lm) => sum + (lm.visibility ?? 1.0), 0) / landmarks.length) * 100) 
      : 0;

    const homework: HomeworkOutput = safetyGate.status === 'passed'
      ? {
          status: 'allowed',
          plan: `Fokus auf ${worstCp.name}: ${worstCp.pedagogicalCue}`,
          blockedReason: null
        }
      : {
          status: 'blocked',
          plan: null,
          blockedReason: safetyGate.blockedReason
        };

    return {
      feedbackId: `fb_${Date.now()}`,
      sessionId: `sess_${Date.now()}`,
      studentName,
      exerciseName,
      timestampStr,
      overallVerdict,
      findingHeadline: `${activeCp.name}: ${activeCp.measuredValue}`,
      whyRelevant: activeCp.vaganovaRule,
      positiveNote: bestCp
        ? `Sehr gute Haltung bei: ${bestCp.name} (${bestCp.measuredValue}).`
        : 'Keine automatische Stärke freigegeben – Nicole beurteilt den Frame.',
      uncertaintyNote: `Pose-Landmark-Sichtbarkeit: ${avgConfidence}%. Das ist keine fachliche Messsicherheit.`,
      historyComparison: 'Kein belastbarer Vergleich ohne bestätigte Session-Referenz.',
      nextCue: activeCp.pedagogicalCue,
      safetyGate,
      homework,
      evidenceLedger,
      checkpointResults
    };
  }
}

export const vaganovaEvidenceEngine = new VaganovaEvidenceEngineService();
