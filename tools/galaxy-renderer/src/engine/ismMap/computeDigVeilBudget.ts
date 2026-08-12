/**
 * computeDigVeilBudget — the DIG veil's own reservation + per-rebuild
 * uniform inputs, the same "budget math survives, placement doesn't" cut
 * Task 7 made for dust (`computePlaceDustBudget.ts`'s own header). Mirrors
 * `buildDigVeil`'s gating/count logic (`hiiRegions.ts:532-...`) up through
 * `complexes`/`totalChildren`, but stops there — no rng draws, no per-child
 * loop, and (deliberately) NO `cdf.total > 0` gate: that check needs the CDF
 * itself, which only exists GPU-side (Task 6's scan) for this tier now, so
 * it moves into `placeDigVeil.wesl` as a per-invocation zero-amplitude guard
 * instead (this budget always reserves the full `complexes x
 * childrenPerComplex` count; an unusable map just means every reserved slot
 * writes amplitude 0 — the same liveness discipline dust's survival floor
 * uses, not a gap in this function).
 *
 * `shellFluxSum`/`recentEventCount` are NOT recomputed here — both are
 * already a byproduct of building the shell/young tiers
 * (`buildHiiShellsAndYoungWithSegments`), which the caller always runs
 * first (DIG's own flux anchor IS the shell tier's flux, not a standalone
 * quantity) — see that function's own doc.
 *
 * Its own file, deliberately separate from `createIsmMapPlaceDigVeil.ts`:
 * that file's `?static` shader import only resolves under the Vite/wesl-
 * plugin pipeline, but `probeGpuErrors.ts` imports this pure function
 * directly on the plain Node/tsx side (no Vite) for its own CPU budget-math
 * check — same split `computePlaceDustBudget.ts`'s own header documents.
 */
import {
  DIG_COMPLEX_SPREAD_PC,
  DIG_COMPLEXES_PER_EVENT,
  DIG_FLUX_RATIO_MAX,
  DIG_MAX_COUNT,
  DIG_SCALE_HEIGHT_PC,
  DIG_SIGMA_MAX_PC,
  DIG_SIGMA_MIN_PC,
} from '../../../../../src/services/engine/galaxyGenerator/v2/hiiRegions';
import { deriveComplexCount } from '../../../../../src/services/engine/galaxyGenerator/v2/sfEventAgeBands';
import { pcToUnits } from '../../../../../src/utils/galaxy/pcToUnits';
import type { GalaxyDescription } from '../../../../../src/@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../../src/@types/galaxy/GalaxyFieldTuning';

export type DigVeilBudget = {
  /** Reserved slot count (`complexes * childrenPerComplex`) — `repackHiiComponents`'s DIG span sizes off this, not off any placed particle. */
  readonly count: number;
  readonly childrenPerComplex: number;
  readonly complexSpread: number;
  readonly elongation: number;
  readonly coherence: number;
  /** `digTotalFlux / totalChildren` — every child's amplitude is this divided by its own `TAU_ROOT3 * sigma^3`. */
  readonly amplitudeBase: number;
  readonly color: readonly [number, number, number];
  readonly textureWeight: number;
  readonly scaleHeight: number;
  readonly sigmaMin: number;
  readonly sigmaMax: number;
};

export function computeDigVeilBudget(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
  shellFluxSum: number,
  recentEventCount: number,
): DigVeilBudget | null {
  // Stale-stored-tuning guard: a preset saved before this knob existed
  // carries an `hii` section with no `dig` object at all — mirrors
  // `buildDigVeil`'s own `!dig` early return.
  const dig = tuning.hii.dig;
  if (!dig) return null;
  const fraction = Math.min(0.999, Math.max(0, dig.fraction));
  const digBrightness = dig.brightness ?? 1;
  if (fraction <= 0 || digBrightness <= 0 || !(dig.elongation > 0)) return null;

  const digRatio = Math.min(DIG_FLUX_RATIO_MAX, fraction / (1 - fraction));
  // `shellFluxSum` already carries the root master — `digBrightness` layers
  // DIG's own gain on top without re-applying it (`buildDigVeil`'s own doc).
  const digTotalFlux = digRatio * shellFluxSum * digBrightness;
  if (!(digTotalFlux > 0)) return null;

  const childrenPerComplex = Math.max(0, Math.round(dig.childrenPerComplex));
  if (childrenPerComplex <= 0 || dig.complexes <= 0) return null;
  // Complex count clamped to DIG_MAX_COUNT's own budget rather than
  // truncating a partial trailing complex — same discipline `buildDigVeil`
  // itself documents.
  const complexes = deriveComplexCount(
    recentEventCount * DIG_COMPLEXES_PER_EVENT,
    dig.complexes,
    childrenPerComplex,
    DIG_MAX_COUNT,
  );
  if (complexes <= 0) return null;
  const totalChildren = complexes * childrenPerComplex;

  return {
    count: totalChildren,
    childrenPerComplex,
    complexSpread: pcToUnits(DIG_COMPLEX_SPREAD_PC),
    elongation: dig.elongation,
    coherence: Math.min(1, Math.max(0, dig.coherence)),
    amplitudeBase: digTotalFlux / totalChildren,
    color: geometry.hiiPalette.halo,
    textureWeight: dig.texture ?? 0,
    scaleHeight: pcToUnits(DIG_SCALE_HEIGHT_PC),
    sigmaMin: pcToUnits(DIG_SIGMA_MIN_PC),
    sigmaMax: pcToUnits(DIG_SIGMA_MAX_PC),
  };
}
