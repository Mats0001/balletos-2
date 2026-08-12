# PROJECT_DECISION: Lehrer-Ampel – Vollständiger Funktionsumfang

**Datum:** 2026-08-10  
**Entscheid durch:** Externer Berater (formelles Schreiben) + Nicole (Ballettpädagogin)  
**Policy-Version:** `0.2.0-teacher-ampel` (BUILD_POLICY.policyVersion)  
**Status:** BINDEND – Produktionsimplementierung

> **Technischer P0-Nachtrag, 2026-08-12:** Die unten dokumentierte
> Bein-Heuristik ist vorläufig ausgesetzt. Ein reproduzierter Quellwechsel zeigte,
> dass die globale Baseline denselben Zielframe allein durch vorherige Frames Rot
> statt Grün färben konnte. Zudem sind `research_observation` und die aktuelle
> vorzeichenbehaftete, aber richtungssemantisch nicht validierte
> `individual_baseline` ausdrücklich keine Urteilsmetriken. `legL` und `legR`
> bleiben daher neutral, bis ein von Nicole geprüfter, quell-/schülergebundener
> DecisionGate Perspektive, Bewegungsphase und Richtungssemantik autorisiert.
> Aus denselben nicht urteilsfähigen Werten werden auch keine automatischen
> Knie-Cues und keine Knie-Anteile in einem positiven Gesamtmoment erzeugt.
> Ein automatischer positiver Gesamtmoment sowie positive Schulter-/Schwerpunkt-
> Cues bleiben insgesamt ausgesetzt, solange nicht jede Teilmessung über einen
> eigenen positiven Evidenzvertrag verfügt.
> Nicoles manuelle Marker, Demo-Beispiele und die neutrale Rohmesswertansicht
> bleiben davon unberührt.
> Die Arm-Heuristik ist ebenfalls vorläufig ausgesetzt: `armLineQuality` enthält
> den tatsächlichen Ellbogenwinkel, wurde in der Ampel jedoch fälschlich als
> Abweichung von 0° klassifiziert. Die hinterlegten Kandidatengrenzen gelten
> zudem nur für die zweite Armposition. `armL` und `armR` bleiben neutral, bis
> ein von Nicole geprüftes Gate Armposition, Perspektive und Bewegungsphase
> explizit bestätigt und den vorhandenen Messstatus autorisiert.
> Alle übrigen Teile dieser Entscheidung bleiben unverändert.

> **P0-Textnachtrag, 2026-08-12:** Der alte automatische Cue-Textgenerator ist
> vorläufig vollständig ausgesetzt. Seine Arm-, Rumpf- und Beckentexte leiteten
> aus projizierten 2D-Werten unbelegte Ursachen, Diagnosen und Prognosen ab.
> Automatische Scans erzeugen daher bis zur metrikspezifischen Freigabe keine
> neuen Texte oder Gesamtberichte. Manuelle Marker bleiben verfügbar und öffnen
> eine neutrale, von Nicole auszufüllende Struktur. Demo-Inhalte sowie von Nicole
> bestätigte oder bearbeitete Inhalte bleiben unverändert erhalten; Demo-Inhalte
> werden sichtbar als Beispiel ohne Messung gekennzeichnet.

---

## Kernentscheid

> BalletOS stellt Nicole im experimentellen Lehrer-Modus die vollständige automatische 
> Ampelfunktion zur Verfügung. Die Ampel ist ein KI-gestützter fachlicher Vorschlag, 
> kein validiertes Systemurteil. Nicole entscheidet über Annahme, Änderung und 
> Kommunikation. Fehlende oder nicht messbare Evidenz bleibt neutral und kann niemals 
> als positive Ausführung dargestellt werden.

---

## Freigegebener Scope

| Feature | Freigegeben |
|---------|-------------|
| `allowExperimentalTeacherTrafficLight` | **true** |
| Rot/Gelb/Grün für evidenzautorisierte Regionen im Lehrer-Modus | ✅ |
| Automatische Unterrichtshinweise und Priorisierung | ✅ |
| KI-Cue-Vorschläge im Cue Point Manager | ✅ |
| Nicoles persönlicher bevorzugter Modus speicherbar | ✅ |
| FlaskConical-Icon + Tooltip (keine Dauerwarnung) | ✅ |

## Dauerhaft gesperrt (unabhängig vom Modus)

| Feature | Gesperrt |
|---------|----------|
| `allowValidatedThresholdScoring` | **false** |
| `allowAutomaticSafetyClaims` | **false** |
| `allowAutomaticDiagnosisClaims` | **false** |
| `allowUnreviewedLearnerOutput` | **false** |
| `allowUnreviewedParentOutput` | **false** |
| `allowAutomaticHomeworkGeneration` | **false** |

---

## Datenfluss-Trennung (Provenienz)

```
Systembeobachtung
  └─ MediaPipe → Rohwerte + Qualitätsinformationen

Experimentelle Lehrer-Heuristik
  └─ BalletOS → Ampel-/Prioritäts-/Cue-Vorschläge
                CuePoint.provenance = 'ki_suggestion'

Nicoles Entscheidung
  └─ Übernehmen → provenance = 'nicole_confirmed'
  └─ Bearbeiten → provenance = 'nicole_edited'
  └─ Ablehnen   → provenance = 'nicole_rejected' (erhalten)

Freigegebene pädagogische Kommunikation
  └─ Nach Nicole-Entscheidung: learnerVisible/parentVisible = true
```

---

## Neutrale Zustände (niemals automatisch Grün)

```
not_measurable, blocked, missing_landmark, invalid_geometry,
wrong_camera, occluded, unassigned_person, insufficient_temporal_data
```
→ Darstellung: `rgba(255,255,255,0.22)` Grau / gestrichelt

---

## Lehrer-Ampel Bein-Heuristik (historischer Entwurf – technisch ausgesetzt)

Da `knieFlexion` (research_observation) und `valgusDrift`
(individual_baseline) keine direkten CORRECT/WARNING/ERROR-Status emittieren
dürfen, sah der ursprüngliche Entwurf eine separate heuristische Einschätzung
aus den Rohwerten vor:

- `|knieFlexion| ≥ 165°` → CORRECT (gerades Standbein)
- `|knieFlexion| ∈ [60°, 145°]` → CORRECT (Plié-Bereich)
- `|knieFlexion| < 40°` → WARNING
- `|valgusDrift_delta| < 5°` → CORRECT
- `|valgusDrift_delta| ∈ [5°, 10°]` → WARNING
- `|valgusDrift_delta| > 10°` → ERROR
- Dominant: ERROR > WARNING > CORRECT > NEUTRAL

Diese Heuristik ist **nicht validiert** und seit dem P0-Nachtrag vom 2026-08-12
nicht farbberechtigt. Die Rohmesswerte bleiben als neutrale Beobachtungswerte
sichtbar; die Aussetzung verändert keine Messwerte.
Die epistemologischen Klassen der zugrundeliegenden Messungen bleiben unverändert.

---

## Implementierung

| Datei | Änderung |
|-------|----------|
| `src/config/buildPolicy.ts` | `allowExperimentalTeacherTrafficLight: true` + NEUTRAL_MEASUREMENT_CLASSES + TEACHER_AMPEL_COLORS |
| `src/services/skeletonCanvasRenderer.ts` | Stellt ausschließlich das aktuelle `TeacherOverlayPacket` dar; keine eigene Heuristik |
| `src/services/teacherHeuristicEngine.ts` | `armL`/`armR` und `legL`/`legR` bis zu kontextgebundenen Gates → NEUTRAL |
| `src/components/VideoAnalyzer.tsx` | FlaskConical Icon; localStorage pro Schülerin; Provenance-UI im Cue Manager |
| `src/services/vaganovaPreAnalyzer.ts` | Keine Auto-Knieurteile/ungeprüften positiven Aggregate; scan-lokaler Calculator; Pflicht-Provenienz |
| `src/services/vaganovaFrameCache.ts` | Laufende Scans werden bei Video-Wechsel verworfen und nie unter der alten Quelle publiziert |
| `src/config/buildPolicy.ts` | Sperrt den alten unbelegten Auto-Textgenerator bis zur metrikspezifischen Wiederfreigabe |

---

## Abnahmekriterien (geprüft)

- [x] Nur durch den aktuellen Evidenzvertrag autorisierte Regionen → Rot/Gelb/Grün im Lehrer-Ampelmodus
- [x] Bein-Shadow-Metriken ohne Richtungs-/Kontextfreigabe → NEUTRAL
- [x] Bein-Shadow-Metriken erzeugen keine automatischen Knie-Cues oder positiven Kniezählungen
- [x] Automatische KI-Cues starten als nicht veröffentlichter Vorschlag; Nicoles Review wird persistiert
- [x] Arm-Kandidatengrenzen ohne Positions-/Perspektivfreigabe → NEUTRAL
- [x] `not_measurable`/`blocked` → niemals Grün (NEUTRAL grau)
- [x] Lehrer-Ampelmodus als persönliche Einstellung pro Schülerin speicherbar
- [x] Moduswechsel verändert keine Rohmesswerte
- [x] KI-Vorschlag und Nicole-Entscheidung: getrennte Provenienz
- [x] Unbestätigte KI-Vorschläge: `learnerVisible/parentVisible = undefined (false)`
- [x] Nicole kann: bestätigen, bearbeiten, ablehnen, klassifizieren
- [x] FlaskConical-Icon + `title`-Tooltip (Maus/Touch) + `aria-label` (Tastatur)
- [x] Safety/Diagnose/Verletzungsclaims: `false` (unverändert)
- [x] Alte unbelegte Auto-Ursachen/-Diagnosen/-Prognosen: vollständig gesperrt
- [x] `npx tsc --noEmit` → 0 Fehler

---

*Nicoles Bestätigung macht die zugrundeliegende Systemmessung nicht wissenschaftlich validiert. 
Sie macht daraus jedoch eine fachlich von Nicole verantwortete pädagogische Aussage.*
