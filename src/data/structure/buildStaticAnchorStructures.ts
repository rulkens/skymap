/**
 * buildStaticAnchorStructures — assemble the static `StructureInfo[]` list
 * from the curated seed in `data/seeds/structure_anchors.seed.json`.
 *
 * ### Why a separate module?
 *
 * `services/engine/wiring/wireStructureProjection.ts` writes the result into the
 * engine's structure store, where the label/ring overlays read it to know where
 * to draw. It is the only importer, but the mapping it performs is a shared
 * contract with the URL: the composed resolver's `resolveFocusId` decodes
 * `#focus=galaxy-cluster-virgo-m87` into `{ type: 'structure', id }` on the id STRING
 * alone, without consulting
 * any table, so the ref a deep link produces only names a real anchor while the
 * id rule here stays put. Isolating the mapping in one pure module is what makes
 * that rule inspectable and testable rather than buried in a bootstrap phase.
 *
 * What the module fixes in one place:
 *
 *   - The id rule: `${category}-${seed.id}`, where `seed.id` is the
 *     curated identifier in `structure_anchors.seed.json`.  Using the seed
 *     field directly means the deep-link hash is the single canonical
 *     identity — no slug-function drift for names that contain non-ASCII
 *     characters or punctuation.
 *
 *   - The worldPos conversion (RA hours / Dec deg / Mpc → equatorial
 *     Cartesian Mpc via `raDecDistToEqCart`), so the position the camera
 *     tweens to is the same Vec3 the ring renderer is drawing at.
 *
 *   - The `physicalRadiusMpc` carry-through, which downstream consumers
 *     (cone-search, ring sizing) rely on.
 *
 *   - The cluster-only `abell` carry-through: the seed's Abell/ACO
 *     designation lands on the cluster arm alone (the `StructureInfo`
 *     union has no `abell` field on the supercluster/void/group arms), so
 *     the field never leaks onto a non-cluster anchor.
 *
 * ### Pure
 *
 * No I/O, no engine coupling — safe to import from the engine and tests
 * alike.  The seed JSON is bundled at build time via the Vite JSON import
 * below, so this remains synchronous.
 */

import { raDecDistToEqCart } from '../../utils/math/raDecDistToEqCart';
import { lengthToMpc } from '../../utils/math/lengthToMpc';
import type { Length } from '../../@types/data/Length';
import type { StructureId } from '../../@types/data/structure/StructureId';
import type { NebulaKind } from '../../@types/data/structure/NebulaKind';
import type { StructureInfo } from '../../@types/data/structure/StructureInfo';
// Vite resolves JSON imports at build time; TypeScript narrows the type
// via `resolveJsonModule: true`.  We cast to the fields we consume so
// new seed columns don't require a type update here.  The JSON's shape is
// validated at build time by `tools/parsers/parseStructureSeed.ts` (run via
// `buildStructures.ts`), so this module trusts the cast and skips a runtime
// re-validator.
import structureSeedJson from '../../../data/seeds/structure_anchors.seed.json';

/**
 * Minimal shape we need from each seed entry — a strict subset of
 * StructureSeedEntry from `tools/parsers/parseStructureSeed.ts`.  Defined
 * locally so the src/ tsconfig (which excludes tools/) doesn't need to
 * reach across the boundary for a runtime-erased type.
 */
type SeedEntry = {
  readonly id: string;
  readonly names: readonly string[];
  readonly category: StructureId;
  readonly raHours: number;
  readonly decDeg: number;
  readonly distance: Length;
  readonly physicalRadius: Length;
  readonly apparentRadius: Length;
  readonly abell?: string;
  readonly nebulaKind?: NebulaKind;
  readonly description?: string;
  readonly wikipedia?: string;
};

/**
 * Build one record from a seed entry.  A single object literal whose
 * `category` is the whole `StructureId` union does NOT narrow to one arm of
 * the discriminated `StructureInfo`, so we switch on it and let each branch
 * produce a literal whose `category` is a single string — which the arm types
 * accept.  The arms share `StructureBase`'s body, so branches differ by the
 * discriminant and the fields only their arm carries.
 */
function buildAnchorStructure(a: SeedEntry): StructureInfo {
  const common = {
    type: 'structure',
    // `${category}-${seed.id}` is the canonical structure id — the seed's
    // curated `id` field is the single source of truth, so deep-link
    // hashes never diverge from the stored ids regardless of punctuation
    // or non-ASCII characters in the display name.
    id: `${a.category}-${a.id}`,
    name: a.names[0]!,
    worldPos: raDecDistToEqCart({
      raHours: a.raHours,
      decDeg: a.decDeg,
      distMpc: lengthToMpc(a.distance),
    }),
    // Curated anchors are always featured: they get labels and are
    // resolvable as deep-link targets.  Significance is full weight —
    // each seed entry was chosen for being worth showing.
    featured: true,
    description: a.description,
    // Key omitted (not `undefined`) when the seed has no article, like `abell`.
    ...(a.wikipedia !== undefined ? { wikipediaTitle: a.wikipedia } : {}),
    significance: 1,
    physicalRadiusMpc: lengthToMpc(a.physicalRadius),
    apparentRadiusMpc: lengthToMpc(a.apparentRadius),
  } as const;
  switch (a.category) {
    case 'galaxy-cluster':
      // `abell` lives on the cluster arm alone.  Spread it in only when the
      // seed carries one so the key is absent (not `abell: undefined`) for
      // clusters with no Abell number, e.g. Virgo.
      return {
        ...common,
        category: 'galaxy-cluster',
        ...(a.abell !== undefined ? { abell: a.abell } : {}),
      };
    case 'supercluster':
      return { ...common, category: 'supercluster' };
    case 'void':
      return { ...common, category: 'void' };
    case 'galaxy-group':
      return { ...common, category: 'galaxy-group' };
    case 'open-cluster':
      return { ...common, category: 'open-cluster' };
    case 'globular-cluster':
      return { ...common, category: 'globular-cluster' };
    case 'nebula':
      // The parser requires `nebulaKind` on every nebula row.
      return { ...common, category: 'nebula', nebulaKind: a.nebulaKind! };
    case 'galactic-centre':
      return { ...common, category: 'galactic-centre' };
  }
}

/**
 * Build the static structure list from the seed.
 * Synchronous, deterministic, and reference-stable per call (returns a
 * fresh array each call — callers should memoize at the React boundary so
 * reference identity is preserved across renders).
 */
export function buildStaticAnchorStructures(): StructureInfo[] {
  return (structureSeedJson as SeedEntry[]).map(buildAnchorStructure);
}
