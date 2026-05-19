/**
 * buildStaticAnchorPois — assemble the static `PointOfInterest[]` list
 * from the curated CLUSTER / SUPERCLUSTER / VOID anchor tables in
 * `clusterAnchors.ts`.
 *
 * ### Why a separate module?
 *
 * Two consumers want exactly the same id-slug + worldPos mapping:
 *
 *   1.  `services/engine/phases/wireSlots.ts` — the engine bootstrap
 *       pushes these into `state.subsystems.pois.setPois(...)` so the
 *       label/ring overlays know where to draw.
 *
 *   2.  `hooks/usePoiUrlSync.ts` — the React-side `#poi=<id>` deep-link
 *       drain needs a `PointOfInterest` to feed `camera.focusOn`, but
 *       App.tsx has no public read-side accessor for the engine's POI
 *       table (the subsystem owns the list).
 *
 * Keeping a single helper here means both call sites agree on:
 *
 *   - The slug rule (`name → lower-kebab-case`), so `Virgo (M87)` →
 *     `virgo-m87`, prefixed by the category.  A drift between the two
 *     would silently break deep-link resolution for, e.g., the apostrophe
 *     in some future anchor name.
 *
 *   - The worldPos conversion (RA hours / Dec deg / Mpc → equatorial
 *     Cartesian Mpc via `raDecDistToEqCart`), so the POI the drain hands
 *     to the camera is the same Vec3 the ring renderer is drawing at.
 *
 *   - The `physicalRadiusMpc` carry-through, which downstream consumers
 *     (cone-search, ring sizing) rely on.
 *
 * ### Why not expose the engine's POI list directly?
 *
 * The engine's POI table is dynamic — `wireSlots` merges static anchors
 * with the asynchronously-loaded famous-galaxy POIs.  Exposing the merged
 * snapshot as a reactive React state slice would mean threading a new
 * callback through EngineCallbacks and re-rendering App on every famous-
 * meta load.  For the deep-link drain use case, the static subset is
 * sufficient — `#poi=cluster-virgo-m87` / `#poi=supercluster-coma-sc`
 * / `#poi=void-bootes-void` all live in this table.  Famous-galaxy
 * deep-links (`#poi=famous-…`) are a future extension; the drain
 * leaves the pending id set so a future "famous POIs ready" subscriber
 * can resolve it.
 *
 * ### Pure
 *
 * No I/O, no engine coupling — safe to import from React, the engine,
 * and tests alike.
 */

import {
  CLUSTER_ANCHORS,
  SUPERCLUSTER_ANCHORS,
  VOID_ANCHORS,
  raDecDistToEqCart,
} from './clusterAnchors';
import type { PointOfInterest } from '../@types/engine/subsystems/PointOfInterest';

/**
 * Lower-kebab the anchor name into a URL-safe slug.  Matches the rule
 * the engine's wireSlots phase uses inline, factored here so the two
 * stay in lock-step.  Trailing/leading dashes are stripped so an
 * anchor named `(Foo)` doesn't become `-foo-`.
 */
function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Build the static cluster + supercluster + void POI list.  Synchronous,
 * deterministic, and reference-stable per call (returns a fresh array
 * each call — callers should memoize at the React boundary so reference
 * identity is preserved across renders).
 */
export function buildStaticAnchorPois(): PointOfInterest[] {
  return [
    ...CLUSTER_ANCHORS.map(
      (a): PointOfInterest => ({
        id: `cluster-${slug(a.name)}`,
        name: a.name,
        category: 'cluster',
        worldPos: raDecDistToEqCart(a),
        physicalRadiusMpc: a.physicalRadiusMpc,
        apparentRadiusMpc: a.apparentRadiusMpc,
      }),
    ),
    ...SUPERCLUSTER_ANCHORS.map(
      (a): PointOfInterest => ({
        id: `supercluster-${slug(a.name)}`,
        name: a.name,
        category: 'supercluster',
        worldPos: raDecDistToEqCart(a),
        physicalRadiusMpc: a.physicalRadiusMpc,
        apparentRadiusMpc: a.apparentRadiusMpc,
      }),
    ),
    ...VOID_ANCHORS.map(
      (a): PointOfInterest => ({
        id: `void-${slug(a.name)}`,
        name: a.name,
        category: 'void',
        worldPos: raDecDistToEqCart(a),
        physicalRadiusMpc: a.physicalRadiusMpc,
        apparentRadiusMpc: a.apparentRadiusMpc,
      }),
    ),
  ];
}
