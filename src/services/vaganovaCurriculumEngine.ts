export interface VaganovaHomeworkExercise {
  title: string;
  metaphor: string;
  howToExecute: string;
  repsAndDuration: string;
  targetFocus: string;
}

export interface VaganovaCurriculumReport {
  studentAgeGroup: 'MINIS_KIDS' | 'TEENS' | 'MASTER_CLASS';
  curriculumLevelStr: string; // e.g. "Vaganova Stufe 1 (Minis 4-8 J.)"
  trajectoryScorePercent: number; // e.g. 96% Trajektorien-Fluidität
  whatWasGood: string[];
  whatToCorrect: string;
  homeExercise: VaganovaHomeworkExercise;
  whatsappMessageTemplate: string;
}

export class VaganovaCurriculumEngineService {
  /**
   * Generates a tailored Vaganova Homework & Curriculum Plan based on age group and trajectory analysis
   */
  public generatePlan(
    studentAge: number,
    poseName: string,
    valgusDriftDegrees: number = 14
  ): VaganovaCurriculumReport {
    if (studentAge <= 8) {
      // MINIS & KIDS (4-8 J.)
      return {
        studentAgeGroup: 'MINIS_KIDS',
        curriculumLevelStr: 'Vaganova Elementar-Klasse (Minis & Kids 4-8 J.)',
        trajectoryScorePercent: 92,
        whatWasGood: [
          '⭐️ Wunderschöne, stolze Kopfhaltung (Epaulement)',
          '⭐️ Sanfte Armführung wie zwei Schwanenflügel im Port de Bras'
        ],
        whatToCorrect: 'Das linke Knie hat beim Beugen ein kleines Geheimnis verraten und wollte nach innen schauen.',
        homeExercise: {
          title: 'Schwanenflügel-Tanz am Zauberspiegel',
          metaphor: 'Stell dir vor, deine Knie sind zwei bunte Schwanenflügel, die sich ganz weit nach außen zur Wand öffnen!',
          howToExecute: 'Stelle dich mit den Fersen zusammen in die 1. Position. Beuge langsam deine Knie und schaue, dass die Schwanenflügel exakt über deine Zehensocken fliegen.',
          repsAndDuration: '2x täglich · 8 Wiederholungen vor dem Zähneputzen',
          targetFocus: 'En Dehors Knie-Fuß-Linie & spielerische Fuß-Stabilität'
        },
        whatsappMessageTemplate: `🌸 *BalletOS Hausaufgabe für Emma (6 J.)* 🌸\n\nLiebe Fr. Berger, Emma hat heute im Unterricht fantastisch mitgemacht! ⭐️\n\n💡 *Kleine Schwanen-Übung für Zuhause (2 Min):*\n"Schwanenflügel-Tanz": Beim Plié darauf achten, dass die Knie wie Schwanenflügel weit nach außen zur Wand zeigen!\n\nVideo-Analyse & Skelett-Fortschritt im Eltern-Portal freigeschaltet. ✨`
      };
    }

    if (studentAge <= 14) {
      // TEENS (9-14 J.)
      return {
        studentAgeGroup: 'TEENS',
        curriculumLevelStr: 'Vaganova Mittelstufe (Teens 9-14 J.)',
        trajectoryScorePercent: 88,
        whatWasGood: [
          '✓ Neutrale Beckenaufrichtung (Lendenwirbelsäule entlastet)',
          '✓ Port de Bras Armradien flüssig in der Trajektorie'
        ],
        whatToCorrect: `Valgus-Drift von ${valgusDriftDegrees}° am linken Knie vor der Plié-Umkehrphase.`,
        homeExercise: {
          title: 'Adduktoren & Gluteus Medius Aktivierung',
          metaphor: 'Spannung im Oberschenkel wie eine aufgedrehte Spirale von innen nach außen halten.',
          howToExecute: 'An der Stuhl-Barre in der 2. Position ein langsames Plié ausführen. Halte am tiefsten Punkt für 3 Sekunden und drücke die Fußaußenkanten fest in den Boden.',
          repsAndDuration: '3 Sätze x 10 Wiederholungen mit 3s Isometrie-Halten',
          targetFocus: 'Muskuläre Stabilisierung des VMR (Vas Medialis R.) & En Dehors Verankerung'
        },
        whatsappMessageTemplate: `🩰 *BalletOS Vaganova Analyse für Maya (12 J.)* 🩰\n\nHallo Maya! Deine Port de Bras Trajektorie war heute extrem flüssig (88% Score).\n\n🎯 *Fokus Hausaufgabe:*\nStabilisierung Knie-Alignment (${valgusDriftDegrees}° Drift korrigieren) durch Adduktoren-Spirale in 2. Position.\n\n3 Sätze à 10 Wiederholungen.`
      };
    }

    // MASTER CLASS (15+ J. & Profis)
    return {
      studentAgeGroup: 'MASTER_CLASS',
      curriculumLevelStr: 'Vaganova Master Class & Solisten-Diplom (15+ J.)',
      trajectoryScorePercent: 96,
      whatWasGood: [
        '✓ Goldstandard Vertikalachse (C7-Wirbel Lot 90° exakt)',
        '✓ Perfect Kinetic Center of Gravity (CoG) über dem Standbein',
        '✓ Trajektorien-Krümmung im Port de Bras ideal kreisförmig'
      ],
      whatToCorrect: 'Feine Mikro-Kompensation im Sprunggelenk bei maximaler En Dehors Auswärtsrotation.',
      homeExercise: {
        title: 'Propriozeptive Foot-Core & Rotations-Zentrierung',
        metaphor: 'Die Ferse schiebt aktiv nach vorne, während der Oberschenkelkopf in der Pfanne auswärts dreht.',
        howToExecute: 'Auf dem Theraband-Pad in der 1. Position: Slow Relevé mit 5 Sekunden Senkphase. Achte auf 100% Druckverteilung auf dem 1. und 5. Mittelfußknochen.',
        repsAndDuration: '4 Sätze x 12 Wiederholungen (Slow Eccentric 5s)',
        targetFocus: 'Propriozeption des M. Peroneus longus & Vaganova Solisten-Präzision'
      },
      whatsappMessageTemplate: `✨ *Vaganova Master Class Analyse* ✨\n\nSolisten-Präzision: 96% Trajektorien-Fluidität.\n\n🎯 *Fokus: Propriozeptive Zentrierung des Fußgewölbes in der 1. Position.*`
    };
  }
}

export const vaganovaCurriculumEngine = new VaganovaCurriculumEngineService();
