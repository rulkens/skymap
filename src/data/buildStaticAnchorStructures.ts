/**
 * buildStaticAnchorStructures — assemble the static `StructureRecord[]` list
 * from the curated cluster/supercluster/void/group seed in
 * `data/structure_anchors.seed.json`.
 *
 * ### Why a separate module?
 *
 * Two consumers want exactly the same id-slug + worldPos mapping:
 *
 *   1.  `services/engine/wiring/wireStructureProjection.ts` — the engine
 *       bootstrap writes these into the structure store so the label/ring
 *       overlays know where to draw.
 *
 *   2.  `hooks/useUrlSync.ts` — the React-side `#poi=<id>` deep-link drain
 *       needs a `StructureRecord` to feed `camera.focusOn`, but App.tsx has
 *       no public read-side accessor for the engine's structure table (the
 *       store owns the list).
 *
 * Keeping a single helper here means both call sites agree on:
 *
 *   - The id rule: `${category}-${seed.id}`, where `seed.id` is the
 *     curated identifier in `structure_anchors.seed.json`.  Using the seed
 *     field directly means the deep-link hash is the single canonical
 *     identity — no slug-function drift for names that contain non-ASCII
 *     characters or punctuation.
 *
 *   - The worldPos conversion (RA hours / Dec deg / Mpc → equatorial
 *     Cartesian Mpc via `raDecDistToEqCart`), so the record the drain hands
 *     to the camera is the same Vec3 the ring renderer is drawing at.
 *
 *   - The `physicalRadiusMpc` carry-through, which downstream consumers
 *     (cone-search, ring sizing) rely on.
 *
 *   - The cluster-only `abell` carry-through: the seed's Abell/ACO
 *     designation lands on the cluster arm alone (the `StructureRecord`
 *     union has no `abell` field on the supercluster/void/group arms), so
 *     the field never leaks onto a non-cluster anchor.
 *
 * ### Why not expose the engine's structure list directly?
 *
 * The engine's structure table is dynamic — the curated anchors merge with
 * the asynchronously-loaded bulk cluster catalog.  Exposing the merged
 * snapshot as a reactive React state slice would mean threading a new
 * callback through EngineCallbacks and re-rendering App on every catalog
 * load.  For the deep-link drain use case, the static subset is
 * sufficient — `#poi=cluster-virgo-m87` / `#poi=supercluster-coma-sc`
 * / `#poi=void-bootes-void` / `#poi=group-local-group` all live in this
 * table.  Famous-galaxy deep-links (`#poi=famous-…`) are a future
 * extension; the drain leaves the pending id set so a future "famous
 * galaxies ready" subscriber can resolve it.
 *
 * ### Pure
 *
 * No I/O, no engine coupling — safe to import from React, the engine,
 * and tests alike.  The seed JSON is bundled at build time via the Vite
 * JSON import below, so this remains synchronous.
 */

import { raDecDistToEqCart } from '../utils/math/raDecDistToEqCart';
import type { StructureRecord } from '../@types/engine/data/StructureRecord';
// Vite resolves JSON imports at build time; TypeScript narrows the type
// via `resolveJsonModule: true`.  We cast to the fields we consume so
// new seed columns don't require a type update here.  The JSON's shape is
// validated at build time by `tools/parsers/parseStructureSeed.ts` (run via
// `buildStructures.ts`), so this module trusts the cast and skips a runtime
// re-validator.
import structureSeedJson from '../../data/structure_anchors.seed.json';

/**
 * Minimal shape we need from each seed entry — a strict subset of
 * StructureSeedEntry from `tools/parsers/parseStructureSeed.ts`.  Defined
 * locally so the src/ tsconfig (which excludes tools/) doesn't need to
 * reach across the boundary for a runtime-erased type.
 */
type SeedEntry = {
  readonly id: string;
  readonly names: readonly string[];
  readonly category: 'cluster' | 'supercluster' | 'void' | 'group';
  readonly raHours: number;
  readonly decDeg: number;
  readonly distMpc: number;
  readonly physicalRadiusMpc: number;
  readonly apparentRadiusMpc: number;
  readonly abell?: string;
  readonly description?: string;
};

/**
 * Build one record from a seed entry.  The seed's `category` is the union
 * `'cluster' | 'supercluster' | 'void' | 'group'`; a single object
 * literal whose `category` is that union does NOT narrow to one arm of
 * the discriminated `StructureRecord`, so we switch on it and let each
 * branch produce a literal whose `category` is a single string — which
 * the arm types accept.  The four structure arms share `StructureBase`'s
 * body, so the only difference between branches is the discriminant.
 */
function buildAnchorStructure(a: SeedEntry): StructureRecord {
  const common = {
    // `${category}-${seed.id}` is the canonical structure id — the seed's
    // curated `id` field is the single source of truth, so deep-link
    // hashes never diverge from the stored ids regardless of punctuation
    // or non-ASCII characters in the display name.
    id: `${a.category}-${a.id}`,
    name: a.names[0]!,
    worldPos: raDecDistToEqCart(a),
    // Curated anchors are always featured: they get labels and are
    // resolvable as deep-link targets.  Significance is full weight —
    // each seed entry was chosen for being worth showing.
    featured: true,
    description: a.description,
    significance: 1,
    physicalRadiusMpc: a.physicalRadiusMpc,
    apparentRadiusMpc: a.apparentRadiusMpc,
  } as const;
  switch (a.category) {
    case 'cluster':
      // `abell` lives on the cluster arm alone.  Spread it in only when the
      // seed carries one so the key is absent (not `abell: undefined`) for
      // clusters with no Abell number, e.g. Virgo.
      return {
        ...common,
        category: 'cluster',
        ...(a.abell !== undefined ? { abell: a.abell } : {}),
      };
    case 'supercluster':
      return { ...common, category: 'supercluster' };
    case 'void':
      return { ...common, category: 'void' };
    case 'group':
      return { ...common, category: 'group' };
  }
}

/**
 * Build the static cluster + supercluster + void + group structure list.
 * Synchronous, deterministic, and reference-stable per call (returns a
 * fresh array each call — callers should memoize at the React boundary so
 * reference identity is preserved across renders).
 */
export function buildStaticAnchorStructures(): StructureRecord[] {
  return (structureSeedJson as SeedEntry[]).map(buildAnchorStructure);
}
