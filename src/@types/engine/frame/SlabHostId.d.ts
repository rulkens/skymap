/**
 * SlabHostId — what a `body-m` slab row is posed from and identified by.
 *
 * A body id today; the blackHoles Layer's PR widens it to `BodyId | PlaceId`
 * so an authored place (the galactic centre) can host a row without being
 * seeded into the body tables.
 */

import type { BodyId } from '../../data/body/BodyId';

export type SlabHostId = BodyId;
