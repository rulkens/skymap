import type { SceneBodyId } from '../scene/SceneBodyId';

/** What the palette's sky rows read of the view: whether "Sky from here" is on offer, and the
 *  terrain host typed coordinates stand on (D10). */
export type PaletteSkyContext = { readonly hereOpen: boolean; readonly host: SceneBodyId };
