/**
 * clusterCatalogToStructures — assemble the bulk (non-featured)
 * cluster/supercluster `StructureRecord`s from the decoded `.ccat` catalog +
 * its meta sidecar.
 *
 * ### Why a separate module
 *
 * A pure transform that `wireStructureProjection` installs into the structure
 * store's `bulk` group once the cluster-catalog slot lands, kept out of the
 * wiring so it's unit-testable without booting the engine.  Every record here
 * is `featured: false` — these ~375 structures render through the ring/halo
 * marker pass, NOT the
 * label/thumbnail path, and would flood the label layer if labelled.
 *
 * ### Category byte → arm
 *
 * The `.ccat` stores a category byte (0 = cluster, 1 = supercluster; higher
 * values reserved for a future void source).  We switch on it and return an
 * arm-typed literal so the discriminated `StructureRecord` union narrows
 * with no `as` cast (same construction as `buildAnchorStructure`).  Records whose
 * byte is neither 0 nor 1 are skipped defensively — a reserved/void byte
 * must not crash the producer or emit a malformed record.
 *
 * ### Significance normalisation — PER CATEGORY
 *
 * `catalog.significance` holds the RAW source proxy: M500 (in 1e14 M☉) for
 * clusters, N_m member count for superclusters.  A POI's `significance`
 * field is a NORMALISED [0,1] weight (Task 6 maps it to ring alpha), so we
 * normalise here — but separately per category, because a 30-member
 * supercluster and a 1e14-M☉ cluster live on incomparable raw scales and a
 * single mixed min-max would crush one against the other.
 *
 *   - Clusters: LOG-scaled.  M500 spans orders of magnitude, so we min-max
 *     `log10(M500)` across the cluster subset.  Linear min-max would leave
 *     all but the few most-massive clusters near zero.
 *   - Superclusters: LINEAR.  N_m is a small integer count with a narrow
 *     dynamic range; a plain min-max over the SC subset is the natural
 *     mapping.
 *
 * Edge cases: an empty subset contributes nothing.  A subset whose max
 * equals its min (single member, or all-equal) maps every member to 1
 * (full weight) rather than dividing by zero.  Non-positive M500 (shouldn't
 * occur — the build filters M500 ≥ 2.0 — but defensive) is clamped to the
 * subset minimum so `log10` never sees ≤ 0.
 *
 * ### id scheme
 *
 * `${category}-bulk-${meta.id}`.  The `-bulk-` infix keeps these ids
 * distinct from the featured anchors' `${category}-${seed.id}` and marks
 * them as non-deep-linkable (the URL drain only resolves featured ids).
 */

import type { ClusterCatalogPayload } from '../../../@types/loading/ClusterCatalogPayload';
import type { StructureRecord } from '../../../@types/engine/data/StructureRecord';
import type { Vec3 } from '../../../@types/math/Vec3';

/** The two renderable category bytes; everything else is skipped. */
type KnownCategory = 'cluster' | 'supercluster';

function categoryFromByte(byte: number): KnownCategory | null {
  if (byte === 0) return 'cluster';
  if (byte === 1) return 'supercluster';
  return null; // reserved / void — not yet a renderable arm
}

/**
 * Spread-free minimum over a numeric subset, returning `fallback` for an
 * empty input.  Avoids `Math.min(...values)`, whose argument-spread trips
 * the engine's call-argument limit on large arrays — the same reason
 * `makeNormaliser` walks its min/max by hand.
 */
function minOf(values: readonly number[], fallback: number): number {
  let min = fallback;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (i === 0 || v < min) min = v;
  }
  return min;
}

/**
 * Per-category significance normaliser.  Returns a function mapping a raw
 * value to [0,1].  `transform` lets clusters normalise in log space while
 * superclusters stay linear; both share the min-max + degenerate-subset
 * handling.
 */
function makeNormaliser(
  rawValues: readonly number[],
  transform: (raw: number) => number,
): (raw: number) => number {
  if (rawValues.length === 0) return () => 1;
  const transformed = rawValues.map(transform);
  let min = transformed[0]!;
  let max = transformed[0]!;
  for (const v of transformed) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  // Single member or all-equal: full weight, no divide-by-zero.
  if (max === min) return () => 1;
  const span = max - min;
  return (raw: number) => (transform(raw) - min) / span;
}

export function clusterCatalogToStructures(payload: ClusterCatalogPayload): StructureRecord[] {
  const { catalog, meta } = payload;
  if (catalog.count === 0) return [];

  // First pass: gather the raw significance per category so the
  // normalisers see the full subset before we emit any POI.  Clusters
  // normalise log10(M500); superclusters normalise N_m linearly.
  const clusterRaw: number[] = [];
  const superclusterRaw: number[] = [];
  for (let i = 0; i < catalog.count; i++) {
    const category = categoryFromByte(catalog.category[i]!);
    if (category === 'cluster') clusterRaw.push(catalog.significance[i]!);
    else if (category === 'supercluster') superclusterRaw.push(catalog.significance[i]!);
  }
  // Guard M500 ≤ 0 before log10 (defensive — the build filters M500 ≥ 2.0).
  const clusterMinRaw = minOf(clusterRaw, 1);
  const safeLog = (raw: number) => Math.log10(raw > 0 ? raw : clusterMinRaw);
  const normaliseCluster = makeNormaliser(clusterRaw, safeLog);
  const normaliseSupercluster = makeNormaliser(superclusterRaw, (raw) => raw);

  const out: StructureRecord[] = [];
  for (let i = 0; i < catalog.count; i++) {
    const category = categoryFromByte(catalog.category[i]!);
    if (category === null) continue; // reserved/void byte — skip, don't emit
    const m = meta[i]!;
    const worldPos: Vec3 = [
      catalog.positions[i * 3 + 0]!,
      catalog.positions[i * 3 + 1]!,
      catalog.positions[i * 3 + 2]!,
    ];
    const raw = catalog.significance[i]!;
    const significance =
      category === 'cluster' ? normaliseCluster(raw) : normaliseSupercluster(raw);
    const common = {
      // `-bulk-` infix: distinct from the featured `${category}-${seed.id}`
      // anchors and flags the POI as non-deep-linkable.
      id: `${category}-bulk-${m.id}`,
      name: m.names[0]!,
      worldPos,
      featured: false,
      description: m.description,
      significance,
      physicalRadiusMpc: catalog.physicalRadiusMpc[i]!,
      apparentRadiusMpc: catalog.apparentRadiusMpc[i]!,
    } as const;
    // Arm-typed switch: each branch returns a literal whose `category` is a
    // single string, so the union narrows with no `as` cast.
    switch (category) {
      case 'cluster':
        // `abell` lives on the cluster arm alone.  Spread it in only when the
        // meta carries a non-null designation so the key is absent (not
        // `abell: undefined`) for clusters with no Abell number.
        out.push({
          ...common,
          category: 'cluster',
          ...(m.abell !== null ? { abell: m.abell } : {}),
        });
        break;
      case 'supercluster':
        out.push({ ...common, category: 'supercluster' });
        break;
    }
  }
  return out;
}
