/**
 * SlabHostId — what a `body-m` slab row is posed from and identified by.
 *
 * A place as well as a body: the lens row hangs off the Galactic Centre's
 * location, not off whichever object sits there, so the pose key stays the
 * same when Sgr A* becomes a Layer's own row.
 */

import type { BodyId } from '../../data/body/BodyId';
import type { PlaceId } from '../../scene/PlaceId';

export type SlabHostId = BodyId | PlaceId;
