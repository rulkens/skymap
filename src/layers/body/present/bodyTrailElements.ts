/**
 * BODY_TRAIL_ELEMENTS — the body Layer's orbit-trail roster: every Earth, planet and moon row's
 * Keplerian elements. The craft ride the missions Layer's own trails and the S-stars the star
 * Layer's, so no filter is needed to keep them out.
 */

import { BODY_BODY_ROWS } from '../bodies/bodyBodyRows';
import type { OrbitalElements } from '../../../@types/scene/OrbitalElements';

export const BODY_TRAIL_ELEMENTS: readonly OrbitalElements[] = BODY_BODY_ROWS.flatMap((row) =>
  row.position.kind === 'orbit' ? [row.position.elements] : [],
);
