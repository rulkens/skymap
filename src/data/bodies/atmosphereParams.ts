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
 *
 * ### Physics vs look — the two radiometric dials
 *
 * Most of a row is the PHYSICAL scattering constants the three LUTs integrate —
 * Rayleigh/Mie/ozone coefficients, scale heights, radii. Body physics. The two
 * trailing fields (`sunIrradiance`, `exposure`) are instead the per-frame
 * RADIOMETRIC dials the shell draw packs into `AtmosphereUniforms` every frame:
 * the sun brightness fed into the in-scatter integral and the exposure scale on
 * its HDR output. They are look knobs, not physics — the same split
 * `earthSurfaceParams` / `pbr.wesl` draws between artistic dials and shading-model
 * floors — but they ride this row so a new atmosphere body carries its own look
 * in one place rather than in a parallel table.
 *
 * Both values are starting points calibrated by eye against the lit Earth via HMR
 * (the spec §12 row-E visual pass), not by a unit test — a physically-based sky
 * has no closed-form "correct" brightness, and a numeric restatement would fail on
 * every legitimate look tweak (see conventions/testing.md). Hence no test on them.
 *
 * - **`sunIrradiance`** scales the solar radiance driving the in-scatter integral.
 *   It is carried through `packAtmosphereUniforms` per the uniform contract but is
 *   currently UNUSED by the shell fragment (the sky-view LUT bakes its own
 *   irradiance normalisation); it is packed so the CPU write never drifts from the
 *   WGSL struct, and it becomes live if the fragment ever routes it. `1.0` is the
 *   neutral starting point — do NOT invent a fragment routing for it here; that is
 *   a shader change, not a data one.
 *
 * - **`exposure`** scales the shell's in-scattered radiance as it lands in the HDR
 *   target, before the shared tone-map compresses it with the rest of the scene.
 *   `2.35` is the user-calibrated realistic strength — eye-tuned against the
 *   Meteosat full-disc reference so the blue limb and the reddened terminator arc
 *   read at a plausible brightness against the tonemapped Earth rather than washing
 *   to grey. For Earth alone this value is the SEED DEFAULT for
 *   `settings.earth.atmosphereExposure`, tuned live via the Settings → Display →
 *   Earth slider — the same relationship `DEFAULT_EXPOSURE` in `data/defaults.ts`
 *   has to `tonemap.exposure`. The shell draw reads the settings value each frame
 *   for Earth (so a drag still overrides the limb without a reload) and this row's
 *   `exposure` for every other body.
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
    sunIrradiance: 1.0,
    exposure: 2.35,
  },
};
