import type { BodyTextureSlotKey } from '../../../@types/data/BodyTextureSlotKey';

/** The asset rows this Layer authors: the packed texture atlas and one per body-surface texture. */
export type BodyAssetKey = 'bodyTextureAtlas' | BodyTextureSlotKey;
