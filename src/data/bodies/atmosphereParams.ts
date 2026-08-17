/**
 * atmosphereParams — authored scattering constants, one row per body with a visible
 * atmosphere; a body absent from the table draws no shell, and adding a row is necessary AND
 * sufficient (renderer and `atmosphereDrawList` are body-agnostic). Earth is the
 * Bruneton/Hillaire reference set; the rest are physically motivated but eye-tuned, hence
 * untested — so Pluto's row tags each value [M]easured / [D]erived / [L]ook. `planetRadiusKm`
 * and `groundAlbedo` derive from the body's seed, keeping the shell concentric with the sphere
 * actually drawn. `sunIrradiance` is packed to match the WGSL struct but UNUSED by the
 * fragment; Earth's `exposure` seeds `settings.earth.atmosphereExposure` and is read there.
 */

import { SCENE_EARTH } from './sceneEarth';
import { SCENE_PLANETS } from './scenePlanets';
import type { AtmosphereParams } from '../../@types/scene/AtmosphereParams';
import type { PlanetBody } from '../../@types/scene/PlanetBody';

// Throws at module load on a typo'd id: an unresolved seed would otherwise silently
// mis-size or mis-colour the shell rather than fail.
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
    // Mie-dominated: thick CO2 + H2SO4 haze, dense near the cloud tops, under a warm
    // Rayleigh tint. Ozone has no analogue here, hence the zeroed tent.
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
    // Butterscotch sky is dust, not molecules: the red-heavy Rayleigh vec3 (inverted from
    // Earth's) plus the Mie term ARE the dust — there is no separate dust channel.
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
    // Cloud-tops-as-ground: no solid surface, so `planetRadiusKm` is the cloud-top radius
    // already drawn and the shell is a thin rim. Limb darkening dominates the look, not this.
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
    // Cloud-tops-as-ground like Jupiter; pale gold, with a taller and thinner rim.
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
    // Methane-blue Rayleigh: red suppressed to stand in for methane's red absorption.
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
    // Methane-blue like Uranus, red suppressed harder for the more saturated limb.
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
  pluto: {
    // The blue haze ring — the only row whose Mie term is per-channel. New Horizons measured
    // peak I/F ~0.3 in MVIC red against 0.7-0.8 in MVIC blue at the SAME 167° phase, so geometry
    // cancels and that factor 2.5 IS the tholin-aggregate cross-section's colour. Visible only
    // BACKLIT — eyeball at phase >160°, ~7 radii out. Papers, derivations and this model's known
    // caricatures: docs/superpowers/plans/completed/2026-08-16-add-pluto-charon.md.
    planetRadiusKm: seededPlanet('pluto').radiusKm,
    // [D] LORRI's haze noise floor sits ~260 km up (Cheng+17); 250 km is also 5 haze scale
    // heights. 1.21x the radius, the table's thickest shell relative to its body — not a typo.
    atmosphereTopKm: seededPlanet('pluto').radiusKm + 250,
    // [D] Earth's Rayleigh scaled by surface number density (11 µbar / 40 K = 7.82e-5 of sea
    // level). ~300x under the haze: honest, and invisible.
    rayleighScatter: [4.5e-7, 1.06e-6, 2.59e-6],
    // [M] Gas and haze share ONE measured falloff (Young+18: haze extinction ∝ N2 density over
    // 26-100 km). The isothermal 40 K value, 19 km, is the WRONG number for this profile — the
    // atmosphere climbs past 110 K by 30 km.
    rayleighScaleHeightKm: 50,
    // [D] Vertical scattering optical depth 0.013 over a 50 km scale height (Gladstone+16) =
    // 2.72e-4 /km at LORRI's 607.6 nm pivot, spread over 680/550/440 nm by the measured
    // blue/red ratio above (λ^-3.44).
    mieScatter: [1.85e-4, 3.83e-4, 8.25e-4],
    // [D] Tholin k=0.018 at 607.6 nm through van de Hulst: single-scattering albedo 0.966, so
    // absorption is 3.5% of scattering — present, never visible.
    mieAbsorption: 9.6e-6,
    // [M] "typical brightness scale heights of ~50 km" (Gladstone+16).
    mieScaleHeightKm: 50,
    // [D] Henyey-Greenstein solved against the one measured phase-function point, P(165°)~5
    // (Gladstone+16): g=0.5 gives 4.95. Far below Earth's 0.8 because HG must hit the forward
    // lobe's HEIGHT, not merely lean forward — raise g without cutting `mieScatter` by the same
    // factor and the ring triples.
    miePhaseG: 0.5,
    // [M] No ozone, and no oxygen-bearing species to make any: the Alice occultation's inventory
    // is N2, CH4, C2H2, C2H4, C2H6 and haze (Young+18).
    ozoneAbsorption: [0, 0, 0],
    ozoneCenterKm: 0,
    ozoneWidthKm: 0,
    // [M-ish] The seed's mean, 0.49, is darker than the measured Bond albedo 0.72 ± 0.07
    // (Buratti+17); kept, since the bounce it feeds is a ~1% term at τ_vert 0.04, but the SEED
    // is the thing to fix.
    groundAlbedo: seededPlanet('pluto').albedo,
    // [L] Double Earth's: the visible ring sits AT the terminator and real night-limb haze is
    // only ~4x fainter than day-limb (Cheng+17), so a hard fade halves it; too wide and the glow
    // leaks into deep shadow.
    twilightSoftness: 0.1,
    // [L] 1.0 = the physical result, no band gain.
    twilightIntensity: 1.0,
    sunIrradiance: 1.0,
    // [L] Earth's calibrated value as a start; two MEASURED anchors to tune against: at phase
    // ≳148° the ring must be at least as bright as the sunlit crescent (Cheng+17), at ~20°
    // barely detectable (I/F ~0.003, Gladstone+16). Obvious at both means this is too high.
    exposure: 2.35,
  },
};
