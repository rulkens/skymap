import { backdropBand } from '../../../utils/math/backdropBand';
import { regionById } from '../../../utils/regions/regionById';

// The seeded stars are a minimum-size additive sprite field: at galaxy framing the whole
// roster would collapse onto a few pixels into one bright blob, so each set dissolves well
// before that, measured from its own region.
const { fullAt, goneAt } = backdropBand(regionById('solar-neighbourhood').extentMpc);

export const STAR_BACKDROP_DISSOLVE = { out: [fullAt, goneAt] } as const;
