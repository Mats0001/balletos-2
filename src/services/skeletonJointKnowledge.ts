/**
 * SKELETON JOINT KNOWLEDGE BASE
 * Pädagogisches Wissen für alle relevanten MediaPipe Pose Landmarks (0–32).
 * Vaganova-Methode · Ballettschule Schönewolf
 */

export type JointRegion = 'head' | 'torso' | 'arm' | 'hip' | 'leg' | 'foot';

export interface JointKnowledge {
  name: string;
  nameShort: string;
  emoji: string;
  region: JointRegion;
  anatomyNote: string;
  vaganovaRule: string;
  howAndWhy: string;
  exercise: string;
  exerciseTitle: string;
  commonMistake: string;
}

export const JOINT_KNOWLEDGE: Record<number, JointKnowledge> = {
  0: {
    name: 'Kopf / Halsachse', nameShort: 'Kopf', emoji: '👑', region: 'head',
    anatomyNote: 'MediaPipe erkennt die Nasenspitze als Referenz für die Kopfposition. Die Halsachse verbindet C7 mit dem Hinterhauptsbein. Neigung, Rotation und Seitneigung (Inclinaison) sind alle drei Vaganova-relevante Parameter.',
    vaganovaRule: 'Der Kopf folgt dem Aplomb-Prinzip: Wirbelsäule lang, Kinn leicht zurückgezogen, Blick auf Augenhöhe oder leicht angehoben. Im Plie bleibt der Blick horizontal.',
    howAndWhy: '"Stell dir vor, ein goldener Faden zieht deinen Scheitel sanft zur Decke hoch." Vorgebeugter Kopf verschiebt den Schwerpunkt nach vorne und destabilisiert die Balance.',
    exerciseTitle: 'Kopfzirkel & Aplomb-Linie',
    exercise: 'Im Stehen: Kopf langsam kreisen (3x links, 3x rechts), dann Mittelposition halten. Finger auf Scheitel – leichter Aufwärtsdruck spüren. Plie ohne Kopfbewegung. 5 Wdh.',
    commonMistake: 'Kinn vorgeschoben oder Kopf nach vorne geneigt beim Plie-Abstieg.',
  },
  11: {
    name: 'Linke Schulter', nameShort: 'L-Schulter', emoji: '🔵', region: 'arm',
    anatomyNote: 'Landmark 11 = linker Akromion (Schultereckpunkt). Schulter-Horizontalität ist ein Kernmesswert im Vaganova-Scoring.',
    vaganovaRule: 'Beide Schultern bilden eine exakt horizontale Linie. "Weit und offen", aber niemals hochgezogen. Epaulement entsteht durch Thoraxrotation, nicht Schulter-Elevation.',
    howAndWhy: '"Deine Schultern sind ein ruhiges, breites Tablett – kein Glas Wasser darf herunterrutschen." Hochgezogene Schultern blockieren den M. trapezius und die Armbewegung.',
    exerciseTitle: 'Schulterblatt-Gleiten & Port de Bras',
    exercise: 'An der Stange: Schultern hochziehen, dann bewusst nach unten gleiten lassen. In Tief-Position: Port de Bras en avant. Horizontallinie konstant halten. 8 Wdh.',
    commonMistake: 'Linke Schulter zieht beim Port de Bras nach oben.',
  },
  12: {
    name: 'Rechte Schulter', nameShort: 'R-Schulter', emoji: '🔵', region: 'arm',
    anatomyNote: 'Landmark 12 – rechter Akromion. y-Differenz zu L-Schulter = Schulter-Neigungswinkel (Vaganova-Standard: < 5°).',
    vaganovaRule: 'Im Arabesque-Epaulement darf Standbein-Schulter minimal angehoben sein (max. 8°). Sonst: horizontale Symmetrie obligatorisch.',
    howAndWhy: '"Die rechte Schulter ist der Anker – sie zieht nicht, sie öffnet." Asymmetrie deutet auf Rumpf-Kompensation hin.',
    exerciseTitle: 'Spiegelübung Schulter-Symmetrie',
    exercise: 'Vor Spiegel: Eine Schulter anheben, Differenz erspüren, ausgleichen. Battement tendu devant mit Schulter-Kontrolle. 8x pro Seite.',
    commonMistake: 'Rechte Schulter kippt beim Tendu nach rechts.',
  },
  13: {
    name: 'Linker Ellbogen', nameShort: 'L-Ellbogen', emoji: '💪', region: 'arm',
    anatomyNote: 'Landmark 13 – linkes Ellbogengelenk (Humeroulnar). Winkel Schulter-Ellbogen-Handgelenk definiert die Port-de-Bras-Qualität.',
    vaganovaRule: 'Ellbogen "geöffnet aber gerundet" – nie vollständig gestreckt, nie zu stark gebeugt. Ellbogenspitze leicht nach hinten-unten (Pronation).',
    howAndWhy: '"Der Arm ist ein Ast im Wind – biegsam, aber nicht gebrochen." Leichte Beugung (5-15°) ermöglicht fließenden Übergang. Ellbogen-Pronation verhindert "Chicken Wings".',
    exerciseTitle: 'Port de Bras Arm-Linien-Training',
    exercise: 'Arm in 2. Position: Gegenhand drückt Ellbogen leicht nach hinten-unten bis optimale Linie. Position merken, 10x selbst wiederholen. Spiegel von vorne und seitlich.',
    commonMistake: 'Ellbogen zeigt nach oben oder Arm vollständig gestreckt (zu gerade).',
  },
  14: {
    name: 'Rechter Ellbogen', nameShort: 'R-Ellbogen', emoji: '💪', region: 'arm',
    anatomyNote: 'Landmark 14 – rechter Ellbogen. Im Arabesque croisee der besonders sichtbare vordere Arm.',
    vaganovaRule: 'Im Arabesque: vorderer Arm (meist rechts) besonders sichtbar. Ellbogen-Position ist hier entscheidend für Gesamtlinie.',
    howAndWhy: '"Der rechte Arm führt im Arabesque – er zeigt wohin die Energie fließt."',
    exerciseTitle: 'Arabesque Arm-Linie isoliert',
    exercise: 'Arabesque-Armposition ohne Bein: Ellbogen prüfen, 30 Sek halten, Spiegel kontrollieren.',
    commonMistake: 'Rechter Ellbogen hängt herunter oder zeigt zu weit nach außen.',
  },
  15: {
    name: 'Linkes Handgelenk', nameShort: 'L-Hand', emoji: '🤚', region: 'arm',
    anatomyNote: 'Landmark 15 – linkes Handgelenk. Hand ist Fortsetzung des Unterarms. Vaganova: Mittelfinger leicht angehoben, sanft gebogen.',
    vaganovaRule: 'Handgelenk in natürlicher Verlängerung des Unterarms – kein Knick. Hand "lebend": Finger leicht gebogen, Daumen eingezogen, Mittelfinger führt.',
    howAndWhy: '"Stell dir vor, du hältst einen zarten Schmetterling – fest genug dass er nicht fliegt, sanft genug dass er nicht verletzt wird."',
    exerciseTitle: 'Hand- & Finger-Isolation',
    exercise: 'Arm gestreckt: Faust - Finger spreizen - Vaganova-Position (Mittelfinger angehoben, Finger leicht gebogen). 20x wechseln. Dann Port de Bras.',
    commonMistake: 'Handgelenk knickt nach oben oder Hand hängt herab (flach, leblos).',
  },
  16: {
    name: 'Rechtes Handgelenk', nameShort: 'R-Hand', emoji: '🤚', region: 'arm',
    anatomyNote: 'Landmark 16 – rechtes Handgelenk. Im Arabesque die führende Hand.',
    vaganovaRule: 'Im Arabesque croisee ist die rechte Hand die Spitze der Energie-Linie.',
    howAndWhy: '"Die rechte Hand zeigt wohin die Seele des Tanzes fließt."',
    exerciseTitle: 'Arabesque Hand-Linie',
    exercise: 'Arabesque: Handgelenk neutral, Mittelfinger leicht angehoben. Foto zur Linienkontrolle.',
    commonMistake: 'Handgelenk hyper-extendiert nach oben im Arabesque.',
  },
  23: {
    name: 'Linke Hüfte', nameShort: 'L-Hüfte', emoji: '⚙️', region: 'hip',
    anatomyNote: 'Landmark 23 – linker ASIS (Beckenkamm). Hüfte ist Zentrum der Ballettbewegung: En-dehors entsteht hier, nicht im Knie.',
    vaganovaRule: 'Becken neutral (kein Hohlkreuz). En-dehors max. 90°/Seite aus dem Hüftgelenk – nie erzwungen. Beide Hüften im Plie auf gleicher Höhe.',
    howAndWhy: '"Das Becken ist das Fundament des Hauses – wenn es nicht steht, wackelt alles." En-dehors kommt aus Mm. obturatorii, gemelli, piriformis – nie aus dem Knie.',
    exerciseTitle: 'Clam-Shell & En-dehors-Isolation',
    exercise: 'Seitlage: Knie gebeugt. Oberes Knie wie Muschel öffnen – NUR aus der Hüfte! Becken darf nicht mitdrehen. 3x 15 Wdh. pro Seite.',
    commonMistake: 'Becken kippt nach vorne (Hohlkreuz) beim Arabesque oder Developpe.',
  },
  24: {
    name: 'Rechte Hüfte', nameShort: 'R-Hüfte', emoji: '⚙️', region: 'hip',
    anatomyNote: 'Landmark 24 – rechter ASIS. L/R-Verbindung = Becken-Horizontalität. Differenz sollte < 5° sein.',
    vaganovaRule: 'Becken-Horizontalität: beide Hüften auf gleicher Höhe. Grand Battement: minimales Becken-Lifting erlaubt (max. 5-8°) nur bei Bein > 90°.',
    howAndWhy: '"Das Becken ist eine Schüssel voll Wasser – kein Tropfen darf verschüttet werden." Asymmetrie = Schwäche M. gluteus medius.',
    exerciseTitle: 'Einbein-Stand Becken-Stabilität',
    exercise: 'Einbein-Stand: Freies Bein abheben – Becken waagerecht! 30 Sek halten. Fortgeschritten: Augen zu. 3x pro Seite.',
    commonMistake: 'Becken kippt zur Standbein-Seite (Trendelenburg-Zeichen).',
  },
  25: {
    name: 'Linkes Knie', nameShort: 'L-Knie', emoji: '🦵', region: 'leg',
    anatomyNote: 'Landmark 25 – linkes Knie. KI-Messwert "Knie-Einfallen" berechnet Abweichung der Knie-Achse von der Linie Hüfte-2.Zeh in der Frontalebene.',
    vaganovaRule: 'Im Plie zeigt das Knie exakt über den 2. Zeh. Knie-Valgus (Einfallen = "knock-knee") ist der häufigste Fehler. En-dehors kommt aus der Hüfte – Knie folgt nur.',
    howAndWhy: '"Das Knie ist wie ein Schwanenflügel – es öffnet sich weit zur Wand, nicht nach innen." Knie-Valgus: schwache Hüftaußenrotatoren + Fußpronation.',
    exerciseTitle: 'Plie Knie-Ausrichtung mit Wandfeedback',
    exercise: 'Füße in 1. Pos., Wand seitlich. Plie: linkes Knie muss die Wand berühren oder ihr nahekommen. Kniescheibe über 2. Zeh. 10x langsam, Spiegel von vorne.',
    commonMistake: 'Knie fällt beim Plie nach innen (Knie-Valgus).',
  },
  26: {
    name: 'Rechtes Knie', nameShort: 'R-Knie', emoji: '🦵', region: 'leg',
    anatomyNote: 'Landmark 26 – rechtes Knie. Im Arabesque (Standbein rechts) muss vollständige Streckung vorliegen.',
    vaganovaRule: 'Arabesque: Standbein-Knie vollständig gestreckt – kein leichtes Beugen als Ausweich.',
    howAndWhy: '"Das rechte Knie trägt das ganze Arabesque – es ist der Turm, der alles hält."',
    exerciseTitle: 'Arabesque Standbein-Streckung',
    exercise: 'Arabesque: Quadrizeps anspannen, Knie maximal strecken. 20 Sek halten. Dann Beinhohe steigern.',
    commonMistake: 'Standbein-Knie leicht gebeugt im Arabesque.',
  },
  27: {
    name: 'Linker Knöchel', nameShort: 'L-Knöchel', emoji: '🦶', region: 'foot',
    anatomyNote: 'Landmark 27 – linkes oberes Sprunggelenk (OSG). Achse Knie-Knöchel-2.Zeh = Schlüssel zur Knie-Fuß-Linie.',
    vaganovaRule: 'Im Releve: Knöchel zentriert, kein Pronieren (Einwärtsrollen). Im Plie: Ferse bleibt am Boden.',
    howAndWhy: '"Der Knöchel ist das Fundament des Turms – wenn er wackelt, fällt der Turm." Pronation = oft Ursache für Knie-Valgus.',
    exerciseTitle: 'Theraband Knöchel-Kräftigung',
    exercise: 'Sitzen, Theraband um Fußballen: Dorsiflexion, Plantarflexion, Eversion, Inversion. Je 15x. Dann Einbein-Releve 10x kontrolliert.',
    commonMistake: 'Knöchel rollt beim Releve nach innen (Pronation).',
  },
  28: {
    name: 'Rechter Knöchel', nameShort: 'R-Knöchel', emoji: '🦶', region: 'foot',
    anatomyNote: 'Landmark 28 – rechter Knöchel. Im Arabesque (Standbein rechts) unter einseitigem Gleichgewichtsdruck besonders stabil halten.',
    vaganovaRule: 'Arabesque: rechter Knöchel zentriert, keine Pronation unter Belastung.',
    howAndWhy: '"Der rechte Knöchel ist der Anker des Arabesques." Sichere Demi-Pointe beginnt mit stabilem Knöchel.',
    exerciseTitle: 'Einbein-Balance auf Demi-Pointe',
    exercise: 'Einbein-Stand rechts: Demi-Pointe heben, 20 Sek halten. Kein Einrollen. Fortgeschritten: Augen zu. 5x pro Seite.',
    commonMistake: 'Einwärtsrollen des Knöchels auf Demi-Pointe.',
  },
  29: {
    name: 'Linke Ferse', nameShort: 'L-Ferse', emoji: '👟', region: 'foot',
    anatomyNote: 'Landmark 29 – linke Ferse (Calcaneus). Im Plie Fersen-Bodenkontakt bis zum tiefsten Punkt halten.',
    vaganovaRule: 'Ferse im Demi-Plie am Boden. Ferse aktiv in den Boden drücken = En-dehors stabilisieren.',
    howAndWhy: '"Die Ferse ist der Anker deiner Drehung. Je tiefer sie drückt, desto höher dreht das Knie."',
    exerciseTitle: 'Fersen-Boden-Übung im Plie',
    exercise: 'Demi-Plie: Ferse aktiv in den Boden drücken während Knie öffnen. "Schieb die Erde weg." 10x.',
    commonMistake: 'Ferse hebt zu früh im Demi-Plie ab.',
  },
  30: {
    name: 'Rechte Ferse', nameShort: 'R-Ferse', emoji: '👟', region: 'foot',
    anatomyNote: 'Landmark 30 – rechte Ferse. Spiegelpunkt zu Landmark 29.',
    vaganovaRule: 'Identisch zu linker Ferse.',
    howAndWhy: '"Beide Fersen gleich stark in den Boden – das ist Symmetrie im Plie."',
    exerciseTitle: 'Symmetrie-Plie',
    exercise: 'Plie in 1. Pos.: Beide Fersen gleichzeitig nach unten drücken. Knie öffnen gleich weit. 8x Demi-Plie.',
    commonMistake: 'Eine Ferse hebt früher ab als die andere.',
  },
  31: {
    name: 'Linke Zehenspitze', nameShort: 'L-Zehe', emoji: '🩰', region: 'foot',
    anatomyNote: 'Landmark 31 – linke Zehenspitze (MTP). "Knie über 2. Zeh" ist die Grundregel.',
    vaganovaRule: 'Im Tendu: Fuß vollständig gestreckt, Zehenspitze ist Endpunkt der Energie-Linie. 1. Pos: Zehen seitlich (90°).',
    howAndWhy: '"Die Zehenspitze ist das Ende des Gedankens, den der Arm begann." Pointe kommt aus Sprunggelenk UND Zehen.',
    exerciseTitle: 'Zehen-Streck-Übung',
    exercise: 'Sitzen, Theraband: Fuß von Flex langsam in Pointe strecken – Zehen aktiv strecken (nicht krallen!). 20x pro Seite.',
    commonMistake: 'Zehen verkrampfen (krallen) statt sanft strecken.',
  },
  32: {
    name: 'Rechte Zehenspitze', nameShort: 'R-Zehe', emoji: '🩰', region: 'foot',
    anatomyNote: 'Landmark 32 – rechte Zehenspitze. Im Arabesque: Pointe des Arbeitsbeins obligatorisch.',
    vaganovaRule: 'Arabesque: vollständige Pointe. Fuß setzt Linie Hüfte-Knie-Knöchel-Zehe lückenlos fort.',
    howAndWhy: '"Der gestreckte Fuß ist das Ausrufezeichen des Arabesques."',
    exerciseTitle: 'Arabesque Pointe-Qualität',
    exercise: 'Arabesque: vollständige Pointe halten, Foto von der Seite für Linienkontrolle.',
    commonMistake: 'Fuß im Arabesque nicht vollständig gestreckt.',
  },
  // ── SYNTHETIC: Rumpf/Wirbelsäule (Index 100, beyond MediaPipe 0-32) ──
  // Used when user clicks a TORSO BONE (shoulder→hip line), not a specific joint.
  100: {
    name: 'Rumpf / Wirbelsäule', nameShort: 'Rumpf', emoji: '🏛️', region: 'hip',
    anatomyNote: 'Die Rumpfachse verbindet Schultergürtel mit Becken. Farbgebung im Lehrer-Ampel-Modus zeigt, ob die Rumpfhaltung korrekt (grün), auffällig (gelb) oder problematisch (rot) ist.',
    vaganovaRule: 'Aplomb: Der Rumpf bildet eine senkrechte Linie (Lot) vom Scheitel durch die Hüftmitte zum Boden. Keine Vorneigung, keine Seitneigung. Im Plie bleibt der Oberkörper vertikal.',
    howAndWhy: '"Dein Rumpf ist der Stamm eines Baumes – gerade, stabil, von innen aufgerichtet." Vorneigung verschiebt den Schwerpunkt und destabilisiert die Balance.',
    exerciseTitle: 'Aplomb-Training an der Stange',
    exercise: 'Stange seitlich: Demi-Plie, Oberkörper bleibt vertikal. Fingerspitzen leicht an der Stange. Rücken lang, Beckenboden aktiv. 10x, dann ohne Stange wiederholen.',
    commonMistake: 'Oberkörper neigt sich beim Plie nach vorne oder zur Seite.',
  },
};

export function getJointKnowledge(landmarkIndex: number): JointKnowledge | null {
  return JOINT_KNOWLEDGE[landmarkIndex] ?? null;
}

export const CLICKABLE_JOINT_INDICES = new Set(Object.keys(JOINT_KNOWLEDGE).map(Number));
