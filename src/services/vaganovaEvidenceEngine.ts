import {
  EvidenceVerdict,
  RegionEvidence,
  BalletCheckpoint,
  SafetyGate,
  FeedbackObject,
  HomeworkOutput
} from '../types';
import { PoseLandmark } from './realMediaPipePose';
import { vaganovaAngleCalculator, VaganovaFullAnalysis } from './vaganovaAngleCalculator';
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

    // Region 6: Left Knee Alignment (Indices: 23, 25, 27, 31)
    const kneeLCheck = checkVis([23, 25, 27, 31]);
    const kneeLVerdict: RegionEvidence = {
      region: 'kneeLeft',
      requiredLandmarks: [23, 25, 27, 31],
      presentLandmarks: kneeLCheck.present,
      allowedSources: ['pose'],
      confidence: kneeLCheck.confidence,
      stability: -1, // NOT_COMPUTED
      verdict: kneeLCheck.present.length >= 3 ? 'measurable' : 'review',
      reason: kneeLCheck.present.length >= 3 ? 'Knie-Fuß-Projektion links messbar.' : 'Linker Fuß/Knöchel verdeckt.'
    };

    // Region 7: Right Knee Alignment (Indices: 24, 26, 28, 32)
    const kneeRCheck = checkVis([24, 26, 28, 32]);
    const kneeRVerdict: RegionEvidence = {
      region: 'kneeRight',
      requiredLandmarks: [24, 26, 28, 32],
      presentLandmarks: kneeRCheck.present,
      allowedSources: ['pose'],
      confidence: kneeRCheck.confidence,
      stability: -1, // NOT_COMPUTED
      verdict: kneeRCheck.present.length >= 3 ? 'measurable' : 'review',
      reason: kneeRCheck.present.length >= 3 ? 'Knie-Fuß-Projektion rechts messbar.' : 'Rechter Fuß/Knöchel verdeckt.'
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
    const getEv = (r: string) => regionEvidences.find(e => e.region === r);

    const headEv = getEv('head');
    const kneeLEv = getEv('kneeLeft');
    const armLEv = getEv('armLeft');
    const pelvisEv = getEv('pelvis');
    const feetEv = getEv('footLeft');

    // P0 FIX: Pass video dimensions for aspect-ratio-correct angle calculation
    const analysis = landmarks ? vaganovaAngleCalculator.analyzeFullFrame(landmarks, vw, vh) : {} as Partial<VaganovaFullAnalysis>;
    // Audit fix: use exercise-specific standards, not always 'default'
    const standards = getStandards(selectedJointId || 'default');

    // SOFORTPATCH (Berater 2026-08-10, Sprint 1 Step 1):
    // getStatus() liefert ausnahmslos 'review' (NOT_SCORED).
    // Begründung: Die EvidenceEngine darf ohne DecisionGate + validationArtifactId
    // NIEMALS 'richtig' oder 'auffaellig' erzeugen. Fehlender Status darf nicht
    // grün oder rot dargestellt werden.
    // TODO Sprint 1 Step 5: Diese Funktion vollständig durch DecisionGate ersetzen.
    // Der DecisionGate konsumiert MetricDecision, niemals rohe measurement.value.
    const getStatus = (_measurement: any, _standard: any, _evVerdict: any): 'richtig' | 'auffaellig' | 'review' => {
      // BUILD_POLICY.allowThresholdScoring === false → immer 'review'
      return 'review';
    };

    const getMeasuredValue = (measurement: any) => {
      return measurement ? `${measurement.value.toFixed(1)}° ${measurement.label}` : 'Messung fehlt';
    };

    const getTargetValue = (standard: any, fallback: string) => {
      return standard ? `${standard.ideal[0]}° - ${standard.ideal[1]}°` : fallback;
    };

    return [
      {
        checkpointId: 'head_epaulement',
        name: 'Kopf & Épaulement (Cervical Axis)',
        region: 'head',
        status: getStatus(analysis.epaulement, standards.epaulement, headEv?.verdict),
        measuredValue: getMeasuredValue(analysis.epaulement),
        targetValue: getTargetValue(standards.epaulement, '15.0° Vaganova Standard'),
        vaganovaRule: 'Der Kopf folgt der Handführung mit 15° Schrägung über der Schulterachse.',
        pedagogicalCue: 'Blick über die rechte Handspitze führen ("Wie ein stolzer Schwan").',
        minimumEvidenceLevel: 'E3'
      },
      {
        checkpointId: 'port_de_bras_arms',
        name: 'Port de Bras & Ellbogen-Bogen',
        region: 'armLeft',
        status: getStatus(analysis.portDeBrasL, standards.portDeBras, armLEv?.verdict),
        measuredValue: getMeasuredValue(analysis.portDeBrasL),
        targetValue: getTargetValue(standards.portDeBras, '160°–170° Fließend'),
        vaganovaRule: 'Ellbogen gehoben halten, fließender Bogen von den Schultern bis zu den Fingerspitzen.',
        pedagogicalCue: 'Ellbogen nie abknicken lassen; Flügelspannung spüren.',
        minimumEvidenceLevel: 'E2'
      },
      {
        checkpointId: 'pelvis_core',
        name: 'Becken & Schwerpunkt (Pelvic Tilt & CoM)',
        region: 'pelvis',
        status: getStatus(analysis.pelvicTilt, standards.pelvicTilt, pelvisEv?.verdict),
        measuredValue: getMeasuredValue(analysis.pelvicTilt),
        targetValue: getTargetValue(standards.pelvicTilt, '0.0° Absolut Horizontal'),
        vaganovaRule: 'Neutraler Beckenstand ohne Vorkippen (Anterior Tilt) oder seitlichen Hochstand.',
        pedagogicalCue: 'Bauchnabel sanft zur Wirbelsäule ziehen, Becken neutral verankern.',
        minimumEvidenceLevel: 'E2'
      },
      {
        checkpointId: 'left_knee',
        name: 'Linkes Knie (Knie-Valgus Alignment)',
        region: 'kneeLeft',
        status: getStatus(analysis.valgusDriftL, standards.valgusDrift, kneeLEv?.verdict),
        measuredValue: getMeasuredValue(analysis.valgusDriftL),
        targetValue: getTargetValue(standards.valgusDrift, '0.0° (Spur über 2. Zeh)'),
        vaganovaRule: 'Die Kniescheiben-Mitte muss im Plié exakt über dem 2. Zeh geführt werden.',
        pedagogicalCue: 'Schwanenflügel-Metapher: "Öffne das linke Knie weit zur Wand wie ein Flügel".',
        minimumEvidenceLevel: 'E2'
      },
      {
        checkpointId: 'en_dehors_feet',
        name: 'Füße & En Dehors Auswärts-Drehung',
        region: 'footLeft',
        status: getStatus(analysis.turnoutL, standards.turnout, feetEv?.verdict),
        measuredValue: getMeasuredValue(analysis.turnoutL),
        targetValue: getTargetValue(standards.turnout, '90° je Fuß'),
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
    teacherConfirmed: boolean = false  // Audit fix: false = safe default; teacher must explicitly confirm
  ): FeedbackObject {
    const evidenceLedger = this.computeRegionEvidence(landmarks, exerciseName);
    const checkpointResults = this.computeCheckpoints(evidenceLedger, selectedJointId, landmarks); // vw/vh not available here – angles are review-only in evidence engine

    // Determine overall verdict
    const measurableCount = evidenceLedger.filter(e => e.verdict === 'measurable').length;
    const overallVerdict: EvidenceVerdict =
      measurableCount >= 5 ? 'beurteilbar' : measurableCount >= 2 ? 'review' : 'nicht_beurteilbar';

    const safetyGate = this.evaluateSafetyGate(overallVerdict, teacherConfirmed);

    const activeCp = checkpointResults.find(c => c.checkpointId === selectedJointId) || checkpointResults[3];
    const bestCp = checkpointResults.find(c => c.status === 'richtig') || activeCp;
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
      positiveNote: `Sehr gute Haltung bei: ${bestCp.name} (${bestCp.measuredValue}).`,
      uncertaintyNote: `Positions-Treue gemessen mit ${avgConfidence}% Konfidenz.`,
      historyComparison: 'Erste Messung – Baseline wird gespeichert',
      nextCue: activeCp.pedagogicalCue,
      safetyGate,
      homework,
      evidenceLedger,
      checkpointResults
    };
  }
}

export const vaganovaEvidenceEngine = new VaganovaEvidenceEngineService();
