/**
 * buildYoungStarChain — the young-stars tier as chains laid along every arm's
 * own ridge walk (spec docs/superpowers/specs/2026-08-09-young-stars-field-
 * design.md §3), replacing the deleted `buildBlueAssociations`' scattered
 * per-event splats. Reuses `sampleArmRidgeNodes` (P1) over BOTH the real arms
 * and their spurs. PURITY INVARIANT: pure `(geometry, tuning, seed) -> flat
 * data`, same discipline as every other `v2/` builder — no `ismMap`/
 * `starFormation` input, unlike the tier it replaces.
 */
import { armCrossSigma } from './armRidgeGeometry';
import { buildArmSpurs } from './armSpurGeometry';
import { HII_CLUSTER_COLOR } from './hiiRegionGeometry';
import { sampleArmRidgeNodes } from './sampleArmRidgeNodes';
import { inverseCovarianceFromFrame } from '../../../../utils/galaxy/inverseCovarianceFromFrame';
import { pcToUnits } from '../../../../utils/galaxy/pcToUnits';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldArmRecord } from '../../../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyFieldComponent } from '../../../../@types/galaxy/GalaxyFieldComponent';
import type { GalaxyFieldTuning } from '../../../../@types/galaxy/GalaxyFieldTuning';

/**
 * Hard ceiling across every arm and spur combined, well inside the comps
 * budget (spec §3) — `planNodeCounts` below only approaches it when the
 * combined ridge length actually calls for that many nodes; it never
 * allocates it up front. Not a strict invariant under a pathological
 * geometry (many records each pinned to `MIN_NODES_PER_RECORD`), same
 * "soft" character `GALAXY_FIELD_MAX_COMPONENTS` documents for its own cap.
 */
export const YOUNG_CHAIN_MAX_COMPONENTS = 512;

/** `sampleArmRidgeNodes`' own floor (`count < 2` returns no nodes at all). */
const MIN_NODES_PER_RECORD = 2;

/** Nodes per unit of a record's own log-radius span — eyeballed so a typical single MW-preset arm (~2 log units) lands in the low hundreds, well short of saturating the cap alone. */
const NODES_PER_LOG_UNIT = 80;

/** 2-3 chain neighbours overlap at this fraction of a node's own arc spacing — the spec's documented 0.6-0.7 band, midpoint. */
const OVERLAP = 0.65;

/** Fixed vertical extent every chain node shares — young stars haven't diffused off their birth height (cf. `ASSN_SCALE_HEIGHT_PC` in the deleted association tier, kept here). */
const YOUNG_SCALE_HEIGHT_PC = 100;

/**
 * Free-standing per-luminosity flux anchor (spec §3, Q3) — total tier flux
 * at `brightness` 1 is `geometry.luminosity * YOUNG_FLUX_REF`, the same
 * "fraction of the galaxy's own luminosity" idiom `hiiRegions.ts`'s
 * `HII_LUMINOSITY_SHARE` uses, standing in until the pivot to `clusterFluxSum`
 * (Q3's one-line anchor swap) wires this tier back into the HII pass' own
 * flux ledger. Eyeballed against the deleted `buildBlueAssociations`' own
 * typical total (its `brightness` default 0.6 times `clusterFluxSum`, which
 * itself ran a few percent of `tierFlux`'s ~6.8%-of-luminosity HII budget) —
 * a visual-calibration starting point, not a measurement.
 */
const YOUNG_FLUX_REF = 0.005;

const TAU_ROOT3 = (2 * Math.PI) ** 1.5;

/** Mirrors splatSilhouette.wesl's own `SPLAT_CUT` — parity guarded by tests/services/gpu/shaders/constants.parity.test.ts so the two can't silently drift. */
export const SPLAT_CUT_SIGMA = 4.5;

/**
 * The quad clips at `SPLAT_CUT_SIGMA * boundRadius` (splatSilhouette.wesl),
 * so under-bounding by this ratio truncates young components at
 * `YOUNG_BOUND_SIGMA` sigma instead of `SPLAT_CUT_SIGMA` — shaded fragment
 * area scales with the cut squared, so 3/4.5 cuts it ~2.25x. Smooth
 * components (disc/halo) need the full 4.5 because a 3σ edge is visible;
 * young components are grain-textured and the grain masks it (splatSilhouette
 * .wesl's own justification for 4.5). Near-fade sliders are multiples of
 * boundRadius (io.wesl), so young fade distances shrink by the same ratio —
 * live-tunable.
 */
const YOUNG_BOUND_SIGMA = 3.0;

/** Reuses the embedded-cluster's own stellar-continuum blue rather than re-deriving a colour for stellar continuum the tier already has a name for. */
const YOUNG_BLUE = HII_CLUSTER_COLOR;

function recordLogSpan(record: GalaxyFieldArmRecord, geometry: GalaxyDescription): number {
  const logEnd = Math.log(record.fadeRadius / geometry.armStartRadius);
  return Math.max(0, logEnd - record.spanStartLogR);
}

/**
 * Per-record node count, density-derived from each record's own ridge length
 * so spur arms genuinely ADD components rather than splitting a fixed total
 * with the real arms — then scaled down uniformly, never dropped record by
 * record, if the raw total would cross `YOUNG_CHAIN_MAX_COMPONENTS`.
 */
function planNodeCounts(
  records: readonly GalaxyFieldArmRecord[],
  geometry: GalaxyDescription,
): readonly number[] {
  const base = records.map((record) => {
    const span = recordLogSpan(record, geometry);
    return span > 0 ? Math.max(MIN_NODES_PER_RECORD, Math.round(span * NODES_PER_LOG_UNIT)) : 0;
  });
  const total = base.reduce((a, b) => a + b, 0);
  if (total <= YOUNG_CHAIN_MAX_COMPONENTS || total === 0) return base;
  const scale = YOUNG_CHAIN_MAX_COMPONENTS / total;
  return base.map((n) => (n > 0 ? Math.max(MIN_NODES_PER_RECORD, Math.floor(n * scale)) : 0));
}

export function buildYoungStarChain(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
  seed: number,
): readonly GalaxyFieldComponent[] {
  const young = tuning.hii.youngStars;
  if (!young.enabled || !(young.brightness > 0)) return [];

  const records = [...geometry.arms, ...buildArmSpurs(geometry, tuning.arms.spurs, seed)];
  if (records.length === 0) return [];

  const nodeCounts = planNodeCounts(records, geometry);
  const perRecordNodes = records.map((record, i) =>
    sampleArmRidgeNodes(nodeCounts[i]!, geometry, record),
  );

  const edgeBias = young.edgeBias ?? 1.5;

  // Un-normalized per-node weight (spacing * mod * radius^edgeBias, the
  // arm's own intensity law biased toward outer reaches) computed once per
  // node and summed across every record first, so each node's SHARE of the
  // tier's total flux is independent of how many records happened to
  // contribute nodes. No reference radius needed — normalization below
  // cancels any overall scale factor `radius^edgeBias` introduces.
  const weightsByRecord = perRecordNodes.map((nodes) =>
    nodes.map((node) => node.spacing * node.mod * Math.pow(node.radius, edgeBias)),
  );
  let weightSum = 0;
  for (const weights of weightsByRecord) {
    for (const weight of weights) weightSum += weight;
  }
  if (!(weightSum > 0)) return [];

  const totalFlux = young.brightness * geometry.luminosity * YOUNG_FLUX_REF;
  const width = young.width ?? 1;
  const poleSigma = pcToUnits(YOUNG_SCALE_HEIGHT_PC);
  const textureWeight = -(young.texture ?? 0.6); // negative selects splat.wesl's star-grain branch
  const starsWeight = young.mapDepth ?? 0.8;

  const out: GalaxyFieldComponent[] = [];
  for (let recordIndex = 0; recordIndex < perRecordNodes.length; recordIndex++) {
    const nodes = perRecordNodes[recordIndex]!;
    const weights = weightsByRecord[recordIndex]!;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      const weight = weights[i]!;
      if (weight <= 0) continue;
      const flux = (weight / weightSum) * totalFlux;
      const sigmaAlong = node.spacing * OVERLAP;
      const sigmaAcross = width * armCrossSigma(node.radius, geometry, tuning);
      const amplitude = flux / (TAU_ROOT3 * sigmaAlong * sigmaAcross * poleSigma);
      out.push({
        amplitude,
        ...inverseCovarianceFromFrame(node.frame, {
          along: sigmaAlong,
          across: sigmaAcross,
          pole: poleSigma,
        }),
        color: YOUNG_BLUE,
        center: node.center,
        boundRadius:
          Math.max(sigmaAlong, sigmaAcross, poleSigma) * (YOUNG_BOUND_SIGMA / SPLAT_CUT_SIGMA),
        textureWeight,
        starsWeight,
      });
    }
  }
  return out;
}
