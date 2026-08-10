# Audit Remediation Tasks

## Sprint 0 – Sofortmaßnahmen
- [ ] .gitignore erstellen + node_modules/dist/MOV aus Git entfernen
- [ ] vaganovaPreAnalyzer.ts: DEMO_FIXTURE isolieren, INSUFFICIENT_DATA für unbekannte Videos
- [ ] vaganovaEvidenceEngine.ts: teacherConfirmed default → false
- [ ] vaganovaEvidenceEngine.ts: computeCheckpoints → getStandards(exercise) statt 'default'
- [ ] vaganovaEvidenceEngine.ts: Stability-Werte als NOT_COMPUTED markieren
- [ ] vaganova3DKinematics.ts: Header als 2D_DISPLAY_ONLY markieren

## Sprint 1 – Wissenschaftliche Korrektheit
- [ ] angle3P: Aspektverhältnis-Fix (videoWidth/videoHeight Skalierung)
- [ ] vaganovaStandards.ts: Als DEPRECATED markieren
- [ ] Proxy-Bezeichnungen: projected_ prefix durchsetzen
- [ ] historyComparison: Echte Session-Daten oder expliziter Hinweis
