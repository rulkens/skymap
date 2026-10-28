import type { BodyInfo } from './BodyInfo';

/**
 * EarthSceneInfo — the display-ready projection of a selected Earth scene (Søndermarken): a
 * body's record under the earthScenes Layer's own `earthScene` tag, so the card, the halo and
 * the framing read it exactly as they read a body.
 */
export type EarthSceneInfo = Omit<BodyInfo, 'type'> & { readonly type: 'earthScene' };
