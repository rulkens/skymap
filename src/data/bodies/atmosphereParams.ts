/**
 * atmosphereParams — the authored table of atmosphere-scattering constants the
 * shell renderer integrates (spec §8.1). Data, not code: one row per body with a
 * visible atmosphere — Earth plus the six other planets that show a scattering
 * limb. A body absent from the table draws no atmosphere shell (Mercury, the Moon
 * and the other moons) — the same data-gate the ring table uses (`sceneRings.ts`).
 *
 * The RENDERER is body-agnostic — it bakes whichever `AtmosphereParams` row it is
 * handed, so a new row needs no renderer change — and the wiring around it now
 * iterates the table too: `atmosphereDrawList` derives which seeded bodies draw a
 * shell this frame (each paired with its row), and the per-body renderer +
 * `encodeAtmosphereSkyView` bake walk that list. So adding a row here is both
 * necessary AND sufficient to turn a body's atmosphere on.
 *
 * ### Earth = standard Bruneton/Hillaire constants
 *
 * The Earth row is the canonical parameter set from Bruneton & Neyret's
 * "Precomputed Atmospheric Scattering" (2008), as refined in Hillaire's 2020
 * "A Scalable and Production Ready Sky and Atmosphere Rendering Technique":
 * Rayleigh (5.8, 13.6, 33.1)e-3 1/km with an 8 km scale height, Mie
 * 3.9e-3 1/km scattering + 4.4e-3 1/km absorption with a 1.2 km scale height and
 * a 0.8 Henyey-Greenstein asymmetry, and an ozone tent centred at 25 km. These
 * are *tunable data* — expected to be nudged for look, so they carry no test
 * (a numeric restatement would fail on every legitimate tweak; see
 * conventions/testing.md). The six planet rows are physically-motivated but
 * likewise eye-tuned starting points (spec §7) and carry no numeric test either.
 *
 * ### Concentricity with the drawn sphere
 *
 * Each row's `planetRadiusKm` MUST equal the radius of the sphere that body draws,
 * so the scattering proxy is concentric with the rendered ground — a mismatch
 * would float the limb off the terminator. Rather than repeat a radius literal,
 * every row derives it from its seed: Earth from `SCENE_EARTH.radiusKm`, the other
 * planets from their `SCENE_PLANETS` row via the `seededPlanet` lookup below.
 * `groundAlbedo` comes from that same seed (each body's authored plausible mean
 * surface colour). If a radius ever moves, its shell tracks it by construction.
 *
 * For the gas giants there is no solid surface: the drawn texture sphere IS the
 * cloud-top ground (`planetRadiusKm` is the cloud-top radius they already draw),
 * and the shell is a thin rim above it.
 *
 * ### No reader accessor, but a seed lookup
 *
 * Readers index this record directly (`ATMOSPHERE_PARAMS['earth']`), a bare read
 * like `SCENE_RINGS.find`; a `getAtmosphereParams` accessor would be pure
 * ergonomics over one reader, so it stays inlined until a second reader appears.
 * The `seededPlanet` helper below is a different thing — a construction-time
 * resolver of each planet's seed (radius + albedo) from `SCENE_PLANETS`, not a
 * reader over this table.
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
 * Both values are starting points calibrated by eye against the lit body via HMR
 * (the spec §12 visual pass), not by a unit test — a physically-based sky has no
 * closed-form "correct" brightness, and a numeric restatement would fail on every
 * legitimate look tweak (see conventions/testing.md). Hence no test on them.
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
 *   Earth's `2.35` is the user-calibrated realistic strength — eye-tuned against the
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
import { SCENE_PLANETS } from './scenePlanets';
import type { AtmosphereParams } from '../../@types/scene/AtmosphereParams';
import type { PlanetBody } from '../../@types/scene/PlanetBody';

// Resolve a seeded planet's physical seed (radius + mean-colour albedo) by id, so
// each row draws `planetRadiusKm` and `groundAlbedo` from the ONE place they are
// authored (`SCENE_PLANETS`) rather than restating them — the same single-source
// discipline the Earth row's `SCENE_EARTH.radiusKm` follows. A typo'd id throws at
// module load; the row would otherwise silently mis-size or mis-colour its shell.
const seededById = new Map(SCENE_PLANETS.map((body) => [body.id, body]));
const seededPlanet = (id: string): PlanetBody => {
  const body = seededById.get(id);
  if (body === undefined) throw new Error(`atmosphereParams: no seeded planet '${id}'`);
  return body;
};

export const ATMOSPHERE_PARAMS: Readonly<Record<string, AtmosphereParams>> = {
  earth: {
    planetRadiusKm: SCENE_EARTH.radiusKm,
    atmosphereTopKm: SCENE_EARTH.radiusKm + 100,
    rayleighScatter: [5.8e-3, 13.6e-3, 33.1e-3],
    rayleighScaleHeightKm: 8,
    mieScatter: [3.9e-3, 3.9e-3, 3.9e-3],
    mieAbsorption: 4.4e-3,
    mieScaleHeightKm: 1.2,
    miePhaseG: 0.8,
    ozoneAbsorption: [0.65e-3, 1.881e-3, 0.085e-3],
    ozoneCenterKm: 25,
    ozoneWidthKm: 15,
    groundAlbedo: [0.3, 0.3, 0.3],
    twilightSoftness: 0.05,
    twilightIntensity: 1.0,
    sunIrradiance: 1.0,
    exposure: 2.35,
  },
  venus: {
    // Mie-dominated: the thick CO2 + H2SO4 haze gives a large Mie scatter at a low
    // scale height (dense near the cloud tops), under a warm/whitish-yellow Rayleigh
    // tint. Tallest visible band of the six (+100 km); ozone has no analogue here.
    planetRadiusKm: seededPlanet('venus').radiusKm,
    atmosphereTopKm: seededPlanet('venus').radiusKm + 100,
    rayleighScatter: [12e-3, 10e-3, 7e-3],
    rayleighScaleHeightKm: 15.9,
    mieScatter: [25e-3, 25e-3, 25e-3],
    mieAbsorption: 2e-3,
    mieScaleHeightKm: 5,
    miePhaseG: 0.7,
    ozoneAbsorption: [0, 0, 0],
    ozoneCenterKm: 0,
    ozoneWidthKm: 0,
    groundAlbedo: seededPlanet('venus').albedo,
    twilightSoftness: 0.05,
    twilightIntensity: 1.0,
    sunIrradiance: 1.0,
    exposure: 3.0,
  },
  mars: {
    // Butterscotch sky is dust-driven, not molecular: encode it through a red-heavy,
    // blue-suppressed Rayleigh vec3 (inverted from Earth's blue-heavy tint) plus a
    // dusty Mie term — the tint + Mie ARE the dust, no separate dust channel.
    planetRadiusKm: seededPlanet('mars').radiusKm,
    atmosphereTopKm: seededPlanet('mars').radiusKm + 60,
    rayleighScatter: [8e-3, 5e-3, 3e-3],
    rayleighScaleHeightKm: 11.1,
    mieScatter: [10e-3, 10e-3, 10e-3],
    mieAbsorption: 4e-3,
    mieScaleHeightKm: 8,
    miePhaseG: 0.6,
    ozoneAbsorption: [0, 0, 0],
    ozoneCenterKm: 0,
    ozoneWidthKm: 0,
    groundAlbedo: seededPlanet('mars').albedo,
    twilightSoftness: 0.07,
    twilightIntensity: 1.0,
    sunIrradiance: 1.0,
    exposure: 1.5,
  },
  jupiter: {
    // Cloud-tops-as-ground: planetRadiusKm is the cloud-top radius already drawn, so
    // the shell is a thin, near-neutral rim above it. Its dominant close-approach
    // visual is the limb-darkening term (spec §6), not this faint scattering edge.
    planetRadiusKm: seededPlanet('jupiter').radiusKm,
    atmosphereTopKm: seededPlanet('jupiter').radiusKm + 150,
    rayleighScatter: [4e-3, 4e-3, 5e-3],
    rayleighScaleHeightKm: 27,
    mieScatter: [3e-3, 3e-3, 3e-3],
    mieAbsorption: 1e-3,
    mieScaleHeightKm: 12,
    miePhaseG: 0.6,
    ozoneAbsorption: [0, 0, 0],
    ozoneCenterKm: 0,
    ozoneWidthKm: 0,
    groundAlbedo: seededPlanet('jupiter').albedo,
    twilightSoftness: 0.03,
    twilightIntensity: 1.0,
    sunIrradiance: 1.0,
    exposure: 1.3,
  },
  saturn: {
    // Cloud-tops-as-ground like Jupiter, with a pale-gold tint and a taller, thinner
    // rim (+300 km, tall scale height). Limb darkening (spec §6) dominates the look;
    // the scattering shell is a faint edge glow.
    planetRadiusKm: seededPlanet('saturn').radiusKm,
    atmosphereTopKm: seededPlanet('saturn').radiusKm + 300,
    rayleighScatter: [4e-3, 4e-3, 4e-3],
    rayleighScaleHeightKm: 59.5,
    mieScatter: [3e-3, 3e-3, 3e-3],
    mieAbsorption: 1e-3,
    mieScaleHeightKm: 25,
    miePhaseG: 0.6,
    ozoneAbsorption: [0, 0, 0],
    ozoneCenterKm: 0,
    ozoneWidthKm: 0,
    groundAlbedo: seededPlanet('saturn').albedo,
    twilightSoftness: 0.03,
    twilightIntensity: 1.0,
    sunIrradiance: 1.0,
    exposure: 1.3,
  },
  uranus: {
    // Methane-blue Rayleigh: blue/cyan-heavy, red suppressed, mimicking methane's
    // red absorption — the cyan-blue limb the ice giant shows. Thin rim above the
    // cloud-top ground.
    planetRadiusKm: seededPlanet('uranus').radiusKm,
    atmosphereTopKm: seededPlanet('uranus').radiusKm + 150,
    rayleighScatter: [4e-3, 10e-3, 20e-3],
    rayleighScaleHeightKm: 27.7,
    mieScatter: [2e-3, 2e-3, 2e-3],
    mieAbsorption: 1e-3,
    mieScaleHeightKm: 12,
    miePhaseG: 0.6,
    ozoneAbsorption: [0, 0, 0],
    ozoneCenterKm: 0,
    ozoneWidthKm: 0,
    groundAlbedo: seededPlanet('uranus').albedo,
    twilightSoftness: 0.03,
    twilightIntensity: 1.0,
    sunIrradiance: 1.0,
    exposure: 1.8,
  },
  neptune: {
    // Methane-blue Rayleigh like Uranus but deeper blue (red suppressed harder),
    // for Neptune's saturated cyan-blue limb. Thin rim above the cloud-top ground.
    planetRadiusKm: seededPlanet('neptune').radiusKm,
    atmosphereTopKm: seededPlanet('neptune').radiusKm + 120,
    rayleighScatter: [4e-3, 9e-3, 22e-3],
    rayleighScaleHeightKm: 20,
    mieScatter: [2e-3, 2e-3, 2e-3],
    mieAbsorption: 1e-3,
    mieScaleHeightKm: 10,
    miePhaseG: 0.6,
    ozoneAbsorption: [0, 0, 0],
    ozoneCenterKm: 0,
    ozoneWidthKm: 0,
    groundAlbedo: seededPlanet('neptune').albedo,
    twilightSoftness: 0.03,
    twilightIntensity: 1.0,
    sunIrradiance: 1.0,
    exposure: 1.8,
  },
};
