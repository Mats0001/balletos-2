# UNVERHANDELBARE QUALITÄTSREGEL: Visuelle Verifikation

## Regel
JEDE Code-Änderung am BalletOS/balletos-app Projekt MUSS visuell verifiziert werden.

## Was das bedeutet

1. **NIEMALS nach Bauchgefühl arbeiten** – nur verifizierte Fakten
2. **NIEMALS annehmen dass etwas funktioniert** – immer visuell prüfen
3. **IMMER Chrome DevTools MCP nutzen** um das Ergebnis zu sehen:
   - `take_screenshot` nach jeder visuellen Änderung
   - `evaluate_script` um Werte im Browser zu prüfen
   - `take_snapshot` für DOM-Inspektion
4. **IMMER den Build testen** (`npm run build`) nach Code-Änderungen
5. **IMMER TypeScript-Fehler prüfen** (`npx tsc --noEmit`)

## Workflow für JEDEN Fix

```
1. Code lesen und Problem verstehen (Fakten, Zeilennummern)
2. Minimale Änderung vornehmen
3. Build testen (npm run build)
4. App im Browser öffnen (npm run dev)
5. Chrome DevTools MCP: Screenshot machen
6. Screenshot analysieren: Ist das Problem gelöst?
7. Wenn NEIN → zurück zu Schritt 1
8. Wenn JA → nächster Fix
```

## Verboten

- ❌ "Das sollte funktionieren" (ohne visuellen Beweis)
- ❌ "Ich nehme an dass..." (Annahmen)
- ❌ Code-Änderungen ohne Build-Test
- ❌ Visuelle Änderungen ohne Screenshot-Verifikation
- ❌ Bauchgefühl, Raten, Vermutungen

## Gilt für

- Alle Agenten in diesem Chat
- Alle Subagenten die für dieses Projekt arbeiten
- Alle zukünftigen Chats die dieses Projekt betreffen
