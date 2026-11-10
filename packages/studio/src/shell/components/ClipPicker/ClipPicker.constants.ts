import { clipRegistry } from '../../../../../../src/data/animation/clips/clipRegistry';

/** Every registered clip by its name, in the registry's order. */
export const CLIP_OPTIONS = Object.values(clipRegistry).map((clip) => ({
  value: clip.id,
  text: clip.label,
}));
