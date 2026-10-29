import type { BodyInfo } from './BodyInfo';

/** A selected Earth scene (Søndermarken): a body's record under the earthScenes Layer's own tag. */
export type EarthSceneInfo = Omit<BodyInfo, 'type'> & { readonly type: 'earthScene' };
