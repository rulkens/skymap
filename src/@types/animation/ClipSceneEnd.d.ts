/**
 * What happens to a clip's scene when it ends: `'revert'` drops it (the registry fades back to
 * intent), `'keep'` has the player commit it to intent in the tick the clip ends, so a tour's
 * next clip starts from it. A property of the play, so every `playClip` call states it.
 */
export type ClipSceneEnd = 'revert' | 'keep';
