/**
 * atmosphereParams — the authored table of atmosphere-scattering constants the
 * shell renderer integrates (spec §8.1). Data, not code: Earth alone today;
 * Mars, Venus, and Titan arrive later as additional rows here. A body absent from
 * the table has no atmosphere shell (Moon, gas giants) — the same data-gate the
 * ring table uses (`sceneRings.ts`).
 *
 * The RENDERER itself is body-agnostic — it bakes whichever `AtmosphereParams`
 * row the factory is handed, so a new row needs no renderer change. But the wiring
 * AROUND it (the `atmosphereShellLayer`, the per-frame `encodeAtmosphereSkyView`
 * bake, `initGpu`, and the single `gpu.atmosphereShellRenderer` handle) is
 * Earth-scoped today: it constructs one renderer for `bodies.earth` and draws that
 * one shell. A second atmosphere body would need a second renderer instance and
 * the layer/encode to iterate the atmosphere bodies rather than read Earth — so
 * adding a row is necessary but not sufficient until that wiring is generalised.
 *
 * ### Earth = standard Bruneton/Hillaire constants
 *
 * The Earth row is the canonical parameter set from Bruneton & Neyret's
 * "Precomputed Atmospheric Scattering" (2008), as refined in Hillaire's 2020
 * "A Scalable and Production Ready Sky and Atmosphere Rendering Technique":
 * Rayleigh (5.8, 13.6, 33.1)e-3 1/km with an 8 km scale height, grey Mie
 * 3.9e-3 1/km scattering + 4.4e-3 1/km absorption with a 1.2 km scale height and
 * a 0.8 Henyey-Greenstein asymmetry, and an ozone tent centred at 25 km. These
 * are *tunable data* — expected to be nudged for look, so they carry no test
 * (a numeric restatement would fail on every legitimate tweak; see
 * conventions/testing.md).
 *
 * ### Concentricity with the drawn Earth
 *
 * `planetRadiusKm` MUST equal `SCENE_EARTH.radiusKm` so the scattering proxy is
 * concentric with the rendered ground sphere — a mismatch would float the limb
 * off the terminator. Rather than repeat the 6371 literal, we derive it from
 * `SCENE_EARTH` directly (single source of truth): if the Earth radius ever
 * moves, the atmosphere shell tracks it.
 *
 * ### No lookup helper
 *
 * The layer indexes this record directly (`ATMOSPHERE_PARAMS['earth']`), a bare
 * read like `SCENE_RINGS.find`. A `getAtmosphereParams` accessor would be pure
 * ergonomics over one reader; extract it only if a second reader appears.
 */

import { SCENE_EARTH } from './sceneEarth';
import type { AtmosphereParams } from '../../@types/scene/AtmosphereParams';

export const ATMOSPHERE_PARAMS: Readonly<Record<string, AtmosphereParams>> = {
  earth: {
    planetRadiusKm: SCENE_EARTH.radiusKm,
    atmosphereTopKm: SCENE_EARTH.radiusKm + 100,
    rayleighScatter: [5.8e-3, 13.6e-3, 33.1e-3],
    rayleighScaleHeightKm: 8,
    mieScatter: 3.9e-3,
    mieAbsorption: 4.4e-3,
    mieScaleHeightKm: 1.2,
    miePhaseG: 0.8,
    ozoneAbsorption: [0.65e-3, 1.881e-3, 0.085e-3],
    ozoneCenterKm: 25,
    ozoneWidthKm: 15,
    groundAlbedo: [0.3, 0.3, 0.3],
  },
};
