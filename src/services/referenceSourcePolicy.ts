const QUICK_NICOLE_CLIP_PATTERN = /(?:^|\/)nicole_saal_[1-9]\.mp4(?:$|[?#])/i;

/**
 * The bundled Nicole studio clips are spontaneous analysis fixtures with
 * known execution errors. They may be analysed, but can never become a
 * pedagogical or visual reference source.
 */
export function isBundledNicoleTestClip(sourceId: string): boolean {
  return typeof sourceId === 'string' && QUICK_NICOLE_CLIP_PATTERN.test(sourceId);
}

export function canCreateNicoleReferenceFromSource(sourceId: string): boolean {
  return typeof sourceId === 'string'
    && sourceId.trim().length > 0
    && !isBundledNicoleTestClip(sourceId);
}
