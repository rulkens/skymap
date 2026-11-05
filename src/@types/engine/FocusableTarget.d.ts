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
import type { SelectionRef } from './SelectionRef';

/**
 * FocusableTarget — tagged union (`type: FocusableTargetType`) of what the camera can focus:
 * a galaxy, a structure anchor, the Milky Way singleton, the zone-of-avoidance singleton
 * (a line-of-sight effect with no `x`/`y`/`z`, so no focus target), a scene body, a craft,
 * an Earth scene, a star from any catalog, a black hole, or an Earth satellite.
 *
 * Each arm carries the `ref` its kind's `toFocusable` stamped on it, so the InfoCard's Focus
 * pill and identity compares read the ref instead of rebuilding it per kind.
 */
export type FocusableTarget =
  | (GalaxyInfo & { readonly ref: Extract<SelectionRef, { type: 'galaxyCatalog' }> })
  | (StructureInfo & { readonly ref: Extract<SelectionRef, { type: 'structure' }> })
  | (MilkyWayInfo & { readonly ref: Extract<SelectionRef, { type: 'milkyWay' }> })
  | (ZoneOfAvoidanceInfo & { readonly ref: Extract<SelectionRef, { type: 'zoneOfAvoidance' }> })
  | (BodyInfo & { readonly ref: Extract<SelectionRef, { type: 'body' }> })
  | (CraftInfo & { readonly ref: Extract<SelectionRef, { type: 'craft' }> })
  | (EarthSceneInfo & { readonly ref: Extract<SelectionRef, { type: 'earthScene' }> })
  | (StarInfo & { readonly ref: Extract<SelectionRef, { type: 'starCatalog' }> })
  | (BlackHoleInfo & { readonly ref: Extract<SelectionRef, { type: 'blackHole' }> })
  | (SatelliteInfo & { readonly ref: Extract<SelectionRef, { type: 'satellite' }> });
