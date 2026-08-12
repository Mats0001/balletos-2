export interface VaganovaStandard {
  ideal: [number, number]; // [min, max] ideal range in degrees
  toleranz: number;        // Tolerance in degrees
  severity: 'info' | 'warning' | 'correction' | 'danger';
  label: string;           // German label
}

export interface VaganovaExerciseStandards {
  knieFlexion?: VaganovaStandard;
  turnout?: VaganovaStandard;
  spineTilt?: VaganovaStandard;
  epaulement?: VaganovaStandard;
  portDeBras?: VaganovaStandard;
  pelvicTilt?: VaganovaStandard;
  shoulderSymmetry?: VaganovaStandard;
  headTilt?: VaganovaStandard;
}

export const vaganovaStandards: Record<string, VaganovaExerciseStandards> = {
  'demi_plie': {
    knieFlexion: { ideal: [120, 145], toleranz: 10, severity: 'warning', label: 'Knieflexion Demi-Plié' },
    turnout: { ideal: [140, 180], toleranz: 15, severity: 'correction', label: 'Ausdrehung En Dehors' },
    spineTilt: { ideal: [0, 3], toleranz: 2, severity: 'warning', label: 'Aplomb (Rumpfneigung)' },
    pelvicTilt: { ideal: [0, 2], toleranz: 2, severity: 'warning', label: 'Beckenstabilität' },
  },
  'grand_plie': {
    knieFlexion: { ideal: [70, 100], toleranz: 10, severity: 'warning', label: 'Knieflexion Grand Plié' },
    turnout: { ideal: [140, 180], toleranz: 15, severity: 'correction', label: 'Ausdrehung En Dehors' },
    spineTilt: { ideal: [0, 5], toleranz: 3, severity: 'warning', label: 'Aplomb (Rumpfneigung)' },
    pelvicTilt: { ideal: [0, 3], toleranz: 2, severity: 'warning', label: 'Beckenstabilität' },
  },
  'tendu': {
    knieFlexion: { ideal: [170, 180], toleranz: 5, severity: 'correction', label: 'Kniestreckung Standbein' },
    turnout: { ideal: [160, 180], toleranz: 10, severity: 'correction', label: 'Ausdrehung En Dehors' },
    spineTilt: { ideal: [0, 3], toleranz: 2, severity: 'warning', label: 'Aplomb' },
    epaulement: { ideal: [10, 20], toleranz: 5, severity: 'info', label: 'Épaulement' },
  },
  'arabesque': {
    spineTilt: { ideal: [0, 15], toleranz: 5, severity: 'warning', label: 'Rumpfneigung Arabesque' },
    portDeBras: { ideal: [155, 175], toleranz: 10, severity: 'correction', label: 'Port de Bras Allongé' },
    epaulement: { ideal: [15, 25], toleranz: 5, severity: 'info', label: 'Épaulement Arabesque' },
    shoulderSymmetry: { ideal: [0, 3], toleranz: 2, severity: 'warning', label: 'Schulterhöhe' },
  },
  'releve': {
    spineTilt: { ideal: [0, 2], toleranz: 2, severity: 'warning', label: 'Aplomb Relevé' },
    pelvicTilt: { ideal: [0, 2], toleranz: 1, severity: 'correction', label: 'Beckenstabilität Relevé' },
    shoulderSymmetry: { ideal: [0, 2], toleranz: 2, severity: 'warning', label: 'Schulterhöhe Relevé' },
  },
  'port_de_bras': {
    portDeBras: { ideal: [90, 175], toleranz: 10, severity: 'correction', label: 'Port de Bras Armhaltung' },
    epaulement: { ideal: [10, 20], toleranz: 5, severity: 'info', label: 'Épaulement' },
    shoulderSymmetry: { ideal: [0, 3], toleranz: 2, severity: 'warning', label: 'Schulterhöhe' },
    headTilt: { ideal: [0, 5], toleranz: 3, severity: 'info', label: 'Kopfneigung' },
  },
  'default': {
    knieFlexion: { ideal: [170, 180], toleranz: 10, severity: 'warning', label: 'Knieflexion' },
    turnout: { ideal: [140, 180], toleranz: 15, severity: 'correction', label: 'Ausdrehung' },
    spineTilt: { ideal: [0, 3], toleranz: 2, severity: 'warning', label: 'Aplomb' },
    epaulement: { ideal: [10, 20], toleranz: 5, severity: 'info', label: 'Épaulement' },
    portDeBras: { ideal: [90, 175], toleranz: 10, severity: 'correction', label: 'Port de Bras' },
    pelvicTilt: { ideal: [0, 2], toleranz: 2, severity: 'warning', label: 'Beckenstabilität' },
    shoulderSymmetry: { ideal: [0, 3], toleranz: 2, severity: 'warning', label: 'Schulterhöhe' },
    headTilt: { ideal: [0, 5], toleranz: 3, severity: 'info', label: 'Kopfneigung' },
  }
};

/**
 * Get standards for a specific exercise, falling back to defaults.
 */
export function getStandards(exercise: string): VaganovaExerciseStandards {
  return vaganovaStandards[exercise] || vaganovaStandards['default'];
}
