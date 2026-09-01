/**
 * deriveDustHeaderLanes — the galaxy-dependent dust lanes of the field header,
 * as one pure function over the same inputs `rebuildDustMixture` builds the
 * mixture from. `drawFrame` reads the result every frame; it changes only when
 * the dust params, the geometry or the `dust.enabled` pill do.
 */
import type { GalaxyDustParams } from '../../../../../@types/galaxy/GalaxyDustParams';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import { DISC_SIGMA_RATIOS } from '../../../../engine/galaxyGenerator/v2/discSurfaceFit';
import {
  dustDiscShape,
  dustSigmaR,
} from '../../../../engine/galaxyGenerator/v2/galaxyDustMixture';
import { dustNoiseTileUnits } from '../../../../engine/galaxyGenerator/v2/dustParticleCloud';
import { dustExtinctionRgb } from '../../../../../utils/galaxy/dustExtinctionRgb';
import { stretchExtinctionChroma } from '../../../../../utils/galaxy/stretchExtinctionChroma';

import type { DustHeaderLanes } from '../../../../../@types/galaxy/DustHeaderLanes';
import type { FieldDustCarve } from '../../../../../@types/galaxy/FieldDustCarve';
import type { FieldDustNoise } from '../../../../../@types/galaxy/FieldDustNoise';

/**
 * Floor for R — small next to any real galaxy's scale (generator units where
 * the orbit distance ranges 0.02..8000), just enough to keep
 * `tNear = max(D-R, 0.02*R)` and `tFar = D+R` from collapsing to the same
 * value when R itself is ~0 (a disc-less category, or dust tuned to a
 * vanishing scale length).
 */
const DUST_REACH_FLOOR = 1e-3;

/** `amplitude: 0` is what makes dustMap.wesl branch out of the erosion multiply entirely. */
const NO_NOISE: FieldDustNoise = { tileUnits: 1, amplitude: 0, cloudOffset: 0, contrastExp: 1 };
/** `carve: 0` is what makes dustMap.wesl branch out of S5 entirely (the mandatory identity). */
const NO_CARVE: FieldDustCarve = { carve: 0, sharpness: 0.5, stretch: 1 };

export function deriveDustHeaderLanes(
  geometry: GalaxyDescription | null,
  dust: GalaxyDustParams,
  dustEnabled: boolean,
): DustHeaderLanes {
  // R comes from the disc shape the particle cloud's mass budget is anchored
  // to, not from the built mixture: the cloud's own components carry no
  // comparable radial sigma to max over. Computed even with dust off, because
  // R sizes the slice geometry `drawFrame` packs regardless — degenerate slice
  // edges are wrong header state, not a harmless no-op.
  let reachR = DUST_REACH_FLOOR;
  if (geometry) {
    const shape = dustDiscShape(geometry, dust);
    let maxSigmaR = 0;
    for (let i = 0; i < DISC_SIGMA_RATIOS.length; i++) {
      maxSigmaR = Math.max(maxSigmaR, dustSigmaR(i, shape));
    }
    reachR = Math.max(3 * maxSigmaR, DUST_REACH_FLOOR);
  }

  const live = geometry !== null && dustEnabled;
  return {
    // `?? 1`: defensive default, same idiom as `carve` below — an old preset
    // re-entering before `redness` existed loads `undefined` here.
    extinctionRgb: stretchExtinctionChroma(dustExtinctionRgb(dust.rV), dust.redness ?? 1),
    reachR,
    noise: live
      ? {
          tileUnits: dustNoiseTileUnits(dust.cloud.textureScale),
          amplitude: dust.cloud.texture,
          // The particle cloud IS the dust slice (no smooth-lane offset to
          // skip), so it starts at index 0.
          cloudOffset: 0,
          // Inverted here, not in the shader, so dustMap.wesl stays one plain
          // pow(): a higher slider value means a SMALLER exponent (pushes |s|
          // toward 1, hardening filament edges). Floored well above 0 — the
          // slider's own range never reaches it, but 1/0 would still be an
          // infinite exponent reaching this uniform.
          contrastExp: 1 / Math.max(dust.cloud.textureContrast, 1e-3),
        }
      : NO_NOISE,
    // `?? 0` because `fieldTuning.dust`'s own defaults-fill is shallow: it
    // fills holes in `dust` itself but takes `cloud` wholesale, so a preset
    // saved before `mapDetail` existed still re-enters here `undefined`.
    detail: live ? (dust.cloud.mapDetail ?? 0) : 0,
    // Same shallow-fill gap as `detail` above — a preset saved before S5
    // existed re-enters with `cloud.carve`/`carveSharpness`/`carveStretch`
    // `undefined`, and `carve: undefined` is NOT `carve: 0`: it would fail
    // dustMap.wesl's `carve > 0.0` gate as NaN-falsy today, but is one `??`
    // away from silently flipping should that gate ever become `!== 0`.
    // `?? 0`/`?? 1` name the identity defaults explicitly rather than lean on
    // that.
    carve: live
      ? {
          carve: dust.cloud.carve ?? 0,
          sharpness: dust.cloud.carveSharpness ?? 0.5,
          stretch: dust.cloud.carveStretch ?? 1,
        }
      : NO_CARVE,
  };
}
