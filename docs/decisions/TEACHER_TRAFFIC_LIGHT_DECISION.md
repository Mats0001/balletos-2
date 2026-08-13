# PROJECT_DECISION: Lehrer-Ampel – Vollständiger Funktionsumfang

**Datum:** 2026-08-10
**Entscheid durch:** Externer Berater (formelles Schreiben) + Nicole (Ballettpädagogin)
**Policy-Version:** `0.4.0-phase-evidence-separation` (BUILD_POLICY.policyVersion)
**Status:** BINDEND – Produktionsimplementierung

> **Phasen-/Evidenz-Nachtrag, 2026-08-13:** Vor jeder Ampelbewertung läuft ein
> Aufnahme-Gate für vollständige Körper- und Gelenksichtbarkeit, stabile
> Perspektive, Personengröße, Zieltracking, Bildschärfe, Kamerastabilität sowie
> ausgewählte Übung und Stufe. Ein harter Fehler ergibt ausschließlich
> **„Aufnahme korrigieren“**; das System rät dann keine Ampelfarbe. Nach
> bestandenem Gate wird ein vollständiger Plié-Zyklus in Ausgangsposition,
> Abwärtsbewegung, Tiefpunkt, Aufwärtsbewegung und Abschluss segmentiert. Die
> Grundfarbe Grün/Gelb/Rot stammt aus der dominanten, nächstliegenden
> Ampelklasse aller auswertbaren Frames der Phase; ein echter Gleichstand wird
> als Grenzbereich Gelb aufgelöst. Abweichende Frameklassen, Evidenzlücken oder
> unsichere Eingangssignale färben nicht pauschal Gelb, sondern machen die
> ermittelte Grundfarbe sichtbar gestrichelt. Durchgezogen bedeutet, dass alle
> auswertbaren Frames dieselbe Grundklasse tragen. Die Ampel
> wird aus der abgeschlossenen Nachanalyse bezogen, nicht aus einem zufälligen
> Live-Einzelbild.
>
> Der aktuelle Nachanalyse-Verbund nutzt Pose-Landmarks, zeitliches Tracking,
> optische Bildqualität und geometrische Plausibilitätsgrenzen. Ein zweites
> Posemodell, Nicoles gespeicherte Referenzlinien und frühere Versuche derselben
> Schülerin werden erst dann als zusätzliche Signale ausgewiesen, wenn ihr
> jeweiliger Adapter tatsächlich angeschlossen und provenance-geprüft ist.

> **Vollabdeckungs-Nachtrag, 2026-08-13 – ersetzt die früheren
> Darstellungsstopps für Arme, Beine, Füße und Schwerpunkt:** Die fehlerhaften
> Knie-BAS- und 0°-Armresolver bleiben vollständig entfernt. An ihre Stelle
> treten eigenständige, deterministische 2D-Lehrrelationen mit Perspektiv-,
> Bewegungs-, Sichtbarkeits- und Geometriegates. Damit erhält jede erkannte,
> auswertbare Körperregion eine Ampeldarstellung. Der neuere Phasen-Nachtrag
> trennt dabei harte Aufnahmefehler von regionaler Evidenzunsicherheit: harte
> Fehler stoppen die Bewertung, weiche Unsicherheit erhält die vorläufige
> Grundfarbe mit gestrichelter Linie. Dieser Nachtrag autorisiert keine
> Muskel-, Valgus-, Druck-, COP-, Ursachen-, Prognose- oder Verletzungsdiagnose.
> Die folgenden P0-/BAS-Nachträge bleiben als Historie und als Verbot der alten
> Resolver bindend; ihre damalige neutrale Darstellung ist durch diesen
> Vollabdeckungsvertrag ersetzt.

> **Historischer technischer P0-Nachtrag, 2026-08-12:** Die unten dokumentierte
> Bein-Heuristik ist vorläufig ausgesetzt. Ein reproduzierter Quellwechsel zeigte,
> dass die globale Baseline denselben Zielframe allein durch vorherige Frames Rot
> statt Grün färben konnte. Zudem waren `research_observation` und die frühere
> vorzeichenbehaftete, aber richtungssemantisch nicht validierte
> `individual_baseline` ausdrücklich keine Urteilsmetriken. `legL` und `legR`
> blieben deshalb in diesem damaligen Stand neutral. Der Nachtrag vom 2026-08-13
> ersetzt nur diese Darstellung durch eine neue sichtbare Knie-Fuß-Relation;
> die alten Metriken bleiben weiterhin ohne Farbberechtigung.
> Aus denselben nicht urteilsfähigen Werten werden auch keine automatischen
> Knie-Cues und keine Knie-Anteile in einem positiven Gesamtmoment erzeugt.
> Ein automatischer positiver Gesamtmoment sowie positive Schulter-/Schwerpunkt-
> Cues bleiben insgesamt ausgesetzt, solange nicht jede Teilmessung über einen
> eigenen positiven Evidenzvertrag verfügt.
> Nicoles manuelle Marker, Demo-Beispiele und die neutrale Rohmesswertansicht
> bleiben davon unberührt.
>
> **Historischer BAS-Nachtrag, 2026-08-12:** Die frühere Knieachsen-„Baseline“ aus den
> ersten 30 Calculator-Aufrufen wurde entfernt. Sie war weder an Video, Person,
> eindeutige Medienzeit noch Bewegungsphase gebunden und konnte denselben Frame
> abhängig von zuvor geöffneten Videos unterschiedlich anzeigen. Der verbleibende
> 2D-Projektionswert ist rein und reproduzierbar, wird aber als
> `not_measurable` behandelt: keine Zahl, kein Δ, keine Richtung und keine
> Schwelle. Er ist ausdrücklich nicht die neue sichtbare Knie-Fuß-Relation. Eine spätere
> Vergleichsfunktion benötigt einen von Nicole gewählten Referenzframe samt
> Video-/Person-/Zeit-/Perspektiv-/Spiegelungs- und Modellprovenienz.
> Die Arm-Heuristik ist ebenfalls vorläufig ausgesetzt: `armLineQuality` enthält
> den tatsächlichen Ellbogenwinkel, wurde in der Ampel jedoch fälschlich als
> Abweichung von 0° klassifiziert. Die hinterlegten Kandidatengrenzen gelten
> zudem nur für die zweite Armposition. `armL` und `armR` blieben deshalb in
> diesem damaligen Stand neutral. Der Nachtrag vom 2026-08-13 ersetzt den
> fehlerhaften Resolver durch eine positionsabhängige sichtbare 2D-Armrelation;
> der alte 0°-Abweichungsvertrag bleibt gesperrt.
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
> Kommunikation. Jede auswertbare Region erhält pro Bewegungsphase eine
> Grundfarbe Grün/Gelb/Rot. Evidenzsicherheit wird ausschließlich über den
> Linienstil dargestellt. Nicht auswertbare Aufnahmen werden vor der Bewertung
> mit „Aufnahme korrigieren“ gestoppt.

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

## Aufnahme-Gate und Evidenzstil

```
missing_landmark, invalid_geometry, wrong_camera, occluded,
unassigned_person, insufficient_temporal_data, blurred_frame, unstable_camera
```
→ Darstellung: keine Ampel; stattdessen **„Aufnahme korrigieren“** mit konkreter
Handlungsanweisung.

Nach bestandenem Gate gilt orthogonal:

- Farbe: Grün / Gelb / Rot = dominante/nächstliegende Phasenklasse; Gleichstand = Gelb.
- Linie: durchgezogen = stabile Evidenz; gestrichelt = unsichere Evidenz.

Damit kann auch ein vorläufig grünes oder rotes Phasenurteil gestrichelt sein,
ohne Gelb fälschlich als „halb richtig“ und zugleich „unsicher“ zu überladen.

---

## Lehrer-Ampel Unterkörpervertrag

Der ursprüngliche Entwurf kombinierte Beobachtungswerte zur Knieflexion mit
einer aufrufbasierten Knieachsen-Baseline und festen Farbschwellen. Die
numerischen Schwellen sind zurückgezogen; weder die historische Baseline noch
ihre Delta-Ziele gehören weiter zum Laufzeit- oder Messvertrag.

Der historische Knie-Δ-Wert bleibt entfernt. Die neue Ampel verwendet keine
Valgus-, Muskel- oder Baseline-Behauptung. Sie bewertet ausschließlich die
sichtbare frontale Knie–Fuß-Projektion, normiert an der sichtbaren Beinlänge.
Profil oder Arabesque verändern den Evidenzstil bzw. stoppen bei einem harten
Perspektivfehler das Aufnahme-Gate; sie werden nicht als eigene gelbe
Urteilsklasse verwendet.

Arme werden positionsabhängig als sichtbare 2D-Armform beurteilt. Füße nutzen
im Plié dieselbe Knie–Fuß-Projektion, außerhalb davon lediglich die sichtbare
Fortsetzung vom Körperzentrum weg. Der Schwerpunkt ist ausdrücklich nur die
projizierte Rumpfmitte über der sichtbaren Standfläche, kein Druckzentrum/COP.

---

## Implementierung

| Datei | Änderung |
|-------|----------|
| `src/config/buildPolicy.ts` | `allowExperimentalTeacherTrafficLight: true` + NEUTRAL_MEASUREMENT_CLASSES + TEACHER_AMPEL_COLORS |
| `src/services/skeletonCanvasRenderer.ts` | Stellt ausschließlich das aktuelle `TeacherOverlayPacket` dar; keine eigene Heuristik |
| `src/services/teacherHeuristicEngine.ts` | Vollständige kontextgebundene Arm-/Bein-/Fuß-/Rumpfzentrum-Heuristik; Farbe und Evidenzunsicherheit sind getrennt |
| `src/services/teacherPhaseAnalysis.ts` | Aufnahme-Gate, fünf Plié-Phasen und dominante/nächstliegende Grün-/Gelb-/Rot-Aggregation; Streuung oder Unsicherheit → dieselbe Farbe gestrichelt |
| `src/components/VideoAnalyzer.tsx` | FlaskConical Icon; localStorage pro Schülerin; Provenance-UI im Cue Manager |
| `src/services/vaganovaPreAnalyzer.ts` | Keine Auto-Knieurteile/ungeprüften positiven Aggregate; scan-lokaler Calculator; Pflicht-Provenienz |
| `src/services/vaganovaFrameCache.ts` | Laufende Scans werden bei Video-Wechsel verworfen und nie unter der alten Quelle publiziert |
| `src/config/buildPolicy.ts` | Sperrt den alten unbelegten Auto-Textgenerator bis zur metrikspezifischen Wiederfreigabe |

---

## Abnahmekriterien (geprüft)

- [x] Nur durch den aktuellen Evidenzvertrag autorisierte Regionen → Rot/Gelb/Grün im Lehrer-Ampelmodus
- [x] Bein-Shadow-Metriken bleiben ohne Farbberechtigung; Farbe stammt aus neuer sichtbarer Knie–Fuß-Relation
- [x] Bein-Shadow-Metriken erzeugen keine automatischen Knie-Cues oder positiven Kniezählungen
- [x] Automatische KI-Cues starten als nicht veröffentlichter Vorschlag; Nicoles Review wird persistiert
- [x] Armfarben sind an sichtbare Position, Geometrie und Confidence gebunden
- [x] Soft unsichere Evidenz → fachliches Grundurteil Grün/Gelb/Rot bleibt erhalten und wird gestrichelt
- [x] Gemischte Frameklassen → dominante/nächstliegende Grundfarbe bleibt erhalten; kein pauschaler Gelb-Sammelzustand
- [x] Hart gescheitertes Aufnahme-Gate → keine Ampel, sondern konkrete Aufforderung „Aufnahme korrigieren“
- [x] Keine graue oder ausgelassene Region im Lehrer-Ampelmodus
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
