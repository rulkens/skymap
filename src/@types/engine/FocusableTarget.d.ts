import type { GalaxyInfo } from './GalaxyInfo';
import type { StructureInfo } from '../data/structure/StructureInfo';
import type { MilkyWayInfo } from './MilkyWayInfo';
import type { ZoneOfAvoidanceInfo } from './ZoneOfAvoidanceInfo';
import type { BodyInfo } from './BodyInfo';
import type { CraftInfo } from './CraftInfo';
import type { EarthSceneInfo } from './EarthSceneInfo';
import type { StarInfo } from './StarInfo';
import type { BlackHoleInfo } from './BlackHoleInfo';
import type { SatelliteInfo } from './SatelliteInfo';

/**
 * FocusableTarget — tagged union (`type: FocusableTargetType`) of what the camera can focus:
 * a galaxy, a structure anchor, the Milky Way singleton, the zone-of-avoidance singleton
 * (a line-of-sight effect with no `x`/`y`/`z`, so no focus target), a scene body, a craft,
 * an Earth scene, a star from any catalog, a black hole, or an Earth satellite.
 *
 * Dispatch is a table lookup on the tag (`DETAIL_CARD`, `REF_OF`), so a new
 * arm is one row per table. Used by InfoCard's `hovered` / `selected` and by `refOf`.
 */
export type FocusableTarget =
  | GalaxyInfo
  | StructureInfo
  | MilkyWayInfo
  | ZoneOfAvoidanceInfo
  | BodyInfo
  | CraftInfo
  | EarthSceneInfo
  | StarInfo
  | BlackHoleInfo
  | SatelliteInfo;
