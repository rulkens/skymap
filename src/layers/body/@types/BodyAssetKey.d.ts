import type { BodyTextureSlotKey } from './BodyTextureSlotKey';

/** The asset rows this Layer authors: the packed texture atlas, one per body-surface texture,
 *  and one per shape model (`meshBodySlotKey`). */
export type BodyAssetKey = 'bodyTextureAtlas' | BodyTextureSlotKey | `mesh:${string}`;
