import { APP_CLIP_REGISTRY } from '../../../../../../src/compositions/appClips';

/** Every registered clip by its name, in the registry's order. */
export const CLIP_OPTIONS = Object.values(APP_CLIP_REGISTRY).map((clip) => ({
  value: clip.id,
  text: clip.label,
}));
