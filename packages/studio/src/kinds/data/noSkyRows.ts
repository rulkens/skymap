/** The palette's sky context for object search: "Sky from here" never on offer, so the ranking stays on objects. */
import { asSceneBodyId } from '../../../../../src/utils/scene/asSceneBodyId';
import type { PaletteSkyContext } from '../../../../../src/@types/palette/PaletteSkyContext';

export const NO_SKY_ROWS: PaletteSkyContext = { hereOpen: false, host: asSceneBodyId('earth') };
