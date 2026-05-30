/**
 * buildStaticAnchorPois — assemble the static `PointOfInterest[]` list
 * from the curated cluster/supercluster/void seed in
 * `data/cluster_anchors.seed.json`.
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
 *   - The slug rule (`names[0] → lower-kebab-case`), so `Virgo (M87)` →
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
 * and tests alike.  The seed JSON is bundled at build time via the Vite
 * JSON import below, so this remains synchronous.
 */

import { raDecDistToEqCart } from '../utils/math/raDecDistToEqCart';
import type { PointOfInterest } from '../@types/engine/subsystems/PointOfInterest';
// Vite resolves JSON imports at build time; TypeScript narrows the type
// via `resolveJsonModule: true`.  We cast to the fields we consume so
// new seed columns don't require a type update here.
import clusterSeedJson from '../../data/cluster_anchors.seed.json';

/**
 * Minimal shape we need from each seed entry — a strict subset of
 * ClusterSeedEntry from `tools/parsers/parseClusterSeed.ts`.  Defined
 * locally so the src/ tsconfig (which excludes tools/) doesn't need to
 * reach across the boundary for a runtime-erased type.
 */
type SeedEntry = {
  readonly names: readonly string[];
  readonly category: 'cluster' | 'supercluster' | 'void';
  readonly raHours: number;
  readonly decDeg: number;
  readonly distMpc: number;
  readonly physicalRadiusMpc: number;
  readonly apparentRadiusMpc: number;
};

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
  return (clusterSeedJson as SeedEntry[]).map(
    (a): PointOfInterest => {
      // Every seed entry is guaranteed to have at least one name (validated
      // at build time by parseClusterSeed).  The non-null assertion is safe
      // because an empty names array would have been caught at seed authoring.
      const primaryName = a.names[0]!;
      return {
        id: `${a.category}-${slug(primaryName)}`,
        name: primaryName,
        category: a.category,
        worldPos: raDecDistToEqCart(a),
        physicalRadiusMpc: a.physicalRadiusMpc,
        apparentRadiusMpc: a.apparentRadiusMpc,
      };
    },
  );
}
