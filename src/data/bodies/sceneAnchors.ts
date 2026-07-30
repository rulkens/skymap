/**
 * SCENE_ANCHORS — roots of the focus graph: positions stated outright, not
 * derived from `OrbitalElements`. The whole seeded star map lives here, the Sun
 * included; their `SCENE_STARS` records carry identity and photometry only.
 *
 * The Sun's `[0, 0, 0]` is authored rather than converted from its seed row's
 * RA/Dec, and is not a reference to `RENDER_ORIGIN_MPC` (`data/renderOrigin.ts`)
 * — the Sun's position and the frame's origin are different facts that share a
 * value only because the origin was chosen to be the Sun. `renderOrigin.ts:15-18`
 * flags a future dynamic origin; importing the constant here would drag the Sun
 * along with a moving frame instead of leaving it fixed in heliocentric space.
 *
 * Seed order is preserved so this table and `SCENE_STARS` walk the roster the
 * same way.
 */

import { FAMOUS_STARS_GENERATED } from './famousStars.generated';
import { starAnchor } from './makers/starAnchor';
import { SUN_ENTRY } from '../sources/sun';
import type { AnchorBody } from '../../@types/scene/AnchorBody';

const SUN_ANCHOR: AnchorBody = { id: SUN_ENTRY.id, positionMpc: [0, 0, 0] };

export const SCENE_ANCHORS: readonly AnchorBody[] = FAMOUS_STARS_GENERATED.map((row) =>
  row.id === SUN_ENTRY.id ? SUN_ANCHOR : starAnchor(row),
);
