# BallettOS Motion-, Schüler- und Referenz-Roadmap

Stand: 2026-08-13

## Verbindliche Trennung

1. **Technische Bewegungsquellen** unterstützen Import, Phasen, Avatar und Regression. Sie sind keine pädagogische Sollbewegung.
2. **Schülerversuche** zeigen Entwicklung derselben Schülerin. Sie sind keine Sollreferenz.
3. **Nicole-Referenzen** entstehen nur aus einer bewusst aufgenommenen, von Nicole akzeptierten Übung, Phase, Richtung und Ansicht.
4. Die vorhandenen spontanen Nicole-Testvideos bleiben `test_recording` und dürfen nicht zu Referenzen hochgestuft werden.

## Aktueller Datenstand

- Tendu: Dryad-Fußbahn und fünf Phasen im Single-Clock-Linienavatar.
- Passé, Jeté, Changement: Dryad-Kohorten, technische fünfphasige Analysepiloten und Single-Clock-Retargeting auf den neutralen BalletOS-Linienkörper.
- CMU: technische Import-, Retargeting- und Regressionsebene; keine Nicole-Goldreferenz.
- BalletMoves II: ausschließlich kontrollierter interner Taxonomie-Pilot auf einem berechtigten Rechner; keine Cloud-, Produkt- oder reversible Datenübernahme ohne Sonderlizenz.
- Nicole-Referenzlinien: lokal versioniert, quell- und framegebunden; die fachliche Bibliothek wächst erst mit neuen, bewusst korrekten Aufnahmen.

## Zielmodell Schülerbibliothek

Die tragfähige Kette aus dem parallelen SCHOENEWOLF-Konzept wird übernommen, nicht dessen Mockdaten:

```text
Schülerin
  └─ Unterrichtsprojekt / Lerninhalt
      └─ Session
          └─ Versuch
              ├─ Medium (Video/Bild/Kamera)
              ├─ phasengebundene Evidenz
              ├─ Nicole-Annotationen
              ├─ revisionssichere Cue-Entscheidungen
              └─ Fortschrittsvergleich
```

Ein Fortschrittspunkt ist nur vergleichbar, wenn mindestens Schülerin, Übung, Richtung, Arbeitsseite, Kameraansicht, Phase, Stufe und Policy-Version zusammenpassen. Fehlende oder technisch unzureichende Evidenz wird nicht als Verschlechterung gezählt.

## Lernkurven

Die Oberfläche soll keine einzelne Prozentnote zeigen. Sie trennt:

- Fußbahn und Endpunkt;
- Phasentiming und Phasenruhe;
- Wiederholbarkeit mehrerer Zyklen;
- sichtbare Regionsentwicklung;
- Aufnahmequalität/Evidenzabdeckung;
- Nicoles bestätigte Korrekturen und nächste Unterrichtsfokusse.

Kurven vergleichen zunächst `heute ↔ vorheriger vergleichbarer Versuch`. Erst später kommen Nicole-Korridore als getrennte, versionierte Ebene hinzu.

## Reihenfolge bis zu Nicoles neuen Aufnahmen

1. Übungsauswahl und Motion-Registry sichtbar halten.
2. Single-Clock-Avatar für Tendu, Passé, Jeté und Changement.
3. Mehrzyklus-Phasenengine mit Richtung, Hysterese und Konfidenz härten. **Technischer Pilot umgesetzt:** variable Wiederholungen, linke/rechte Arbeitsseite, kurze Sichtbarkeitslücken, lange Aufnahmeunterbrechungen als Segmentgrenze, Richtungskonsens über alle Jeté-Zyklen und Evidenzabdeckung je Phase. Die fachlichen Korridore bleiben weiterhin Nicole-abhängig.
4. Live-Aufnahmeassistent vervollständigen.
5. Schülerbibliothek auf das obige Session-/Attempt-Modell migrieren und Lernkurven erweitern.
6. Cross-Video-Bibliothek als echte Filter- und Verwaltungsoberfläche ausbauen.
7. Autorisierte Körperquellen, Overlay, Loop und Vorher/Nachher im Avatar erweitern.
8. Feedbackbibliothek je Übung, Phase, Region und Altersstufe vorbereiten; Veröffentlichung bleibt Nicole-revisionsgebunden.
9. Neue Nicole-Referenzaufnahmen erfassen und fachliche Korridore kalibrieren.

## Design-DNA / CI

Die künftige Oberfläche soll die Design-DNA von SCHOENEWOLF Community / „Meine Ballettstange“ übernehmen. Das ist ein eigener, späterer CI-Migrationsstrang. Bis dahin werden keine Farben, Typografie oder globale Layoutstruktur aus dem Parallelprototyp in technische Motion-Slices kopiert. Wiederverwendet werden zunächst nur Informationsarchitektur, Objektmodell und Workflow-Prinzipien.
