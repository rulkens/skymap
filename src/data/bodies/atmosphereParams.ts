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
    constituents: [
      {
        // Molecules.
        scatter: [5.8e-3, 13.6e-3, 33.1e-3],
        absorb: [0, 0, 0],
        profile: { kind: 'exponential', scaleHeightKm: 8 },
        phase: { kind: 'rayleigh' },
      },
      {
        // Aerosol.
        scatter: [3.9e-3, 3.9e-3, 3.9e-3],
        absorb: [4.4e-3, 4.4e-3, 4.4e-3],
        profile: { kind: 'exponential', scaleHeightKm: 1.2 },
        phase: { kind: 'henyeyGreenstein', g: 0.8 },
      },
      {
        // Ozone — the table's only tent, and the reason a clear zenith stays blue
        // at twilight instead of washing to grey.
        scatter: [0, 0, 0],
        absorb: [0.65e-3, 1.881e-3, 0.085e-3],
        profile: { kind: 'tent', centerKm: 25, widthKm: 15 },
        phase: { kind: 'rayleigh' },
      },
    ],
    groundAlbedo: [0.3, 0.3, 0.3],
    twilightSoftness: 0.05,
    twilightIntensity: 1.0,
    sunIrradiance: 1.0,
    exposure: 2.35,
  },
  venus: {
    // Altitude 0 is the tau = 1 CLOUD TOP (50 mbar, 68.8 km up), not the 92 bar surface: the
    // drawn texture is already unresolved cloud, and the 41 optical depths of blue Rayleigh
    // below it are unmarchable. `planetRadiusKm` therefore draws the shell 68 km low — 1.1%
    // of the radius, and raising it would desync the shell from the rasterised sphere.
    planetRadiusKm: seededPlanet('venus').radiusKm,
    atmosphereTopKm: seededPlanet('venus').radiusKm + 40, // [M] haze tops ~110 km = +41
    constituents: [
      {
        // [D] CO2/N2 at 50 mbar, 233 K (He+21 sigmas). tau(440) = 0.022 above the reference:
        // correctness only — invisible under the cloud, and NOT a colour dial.
        scatter: [7.45e-4, 1.77e-3, 4.45e-3],
        absorb: [0, 0, 0],
        profile: { kind: 'exponential', scaleHeightKm: 5 }, // [D] kT/(mu g) at 233 K
        phase: { kind: 'rayleigh' },
      },
      {
        // [D] tau = 1 above the reference by definition of the level, over a 4 km scale height.
        // [M] Grey to 1.5% over RGB, and conservative (Titov+18): NO colour here — never warm it.
        scatter: [0.25, 0.25, 0.25],
        absorb: [0, 0, 0],
        profile: { kind: 'exponential', scaleHeightKm: 4 }, // [D] 4-5 km at the top, 2.8 in haze
        // [D] Mie g 0.679/0.718/0.750 at 680/550/440; one slot, so the green anchor. HG has
        // neither glory nor rainbow — an accepted loss, not a miss to chase by raising g.
        phase: { kind: 'henyeyGreenstein', g: 0.72 },
      },
      {
        // [L] however it is written: the near-UV absorber's identity is unsettled, and its
        // unfitted 0.4-0.5 um slope is exactly where B lives. [D] 0.25*(1-w0)/w0 (HH74 via
        // Bailey+26), small because most of the column sits BELOW altitude 0. Tune against
        // the rendered disc's B/R, which must read ~0.93 (Mallama+17), not 0.71.
        scatter: [0, 0, 0],
        absorb: [1.75e-4, 2.58e-4, 1.26e-3],
        profile: { kind: 'exponential', scaleHeightKm: 4 }, // mixed with the droplets
        phase: { kind: 'henyeyGreenstein', g: 0.72 },
      },
    ],
    groundAlbedo: seededPlanet('venus').albedo,
    twilightSoftness: 0.05,
    twilightIntensity: 1.0,
    sunIrradiance: 1.0,
    exposure: 3.0,
  },
  mars: {
    // Altitude 0 is the drawn surface. Dust carries 98%+ of the extinction and both colour
    // effects; tau_ext(880) = 0.40 [L on M], Gale's clear-season floor, is this row's one honest
    // dial — if the disc reads flat over an already-hazy mosaic lower tau, do NOT desaturate the
    // coefficients. No water-ice slot: that belt is seasonal and tropical, a shell is neither.
    planetRadiusKm: seededPlanet('mars').radiusKm,
    atmosphereTopKm: seededPlanet('mars').radiusKm + 60,
    constituents: [
      {
        // [D] CO2/N2/Ar Rayleigh at 610 Pa, 210 K (Bideau-Mehu n + He+21 King factor). Worth
        // 0.3/0.7/1.7% of extinction at 680/550/440 — kept for correctness, not for the look.
        scatter: [1.0e-4, 2.38e-4, 5.97e-4],
        absorb: [0, 0, 0],
        profile: { kind: 'exponential', scaleHeightKm: 10.8 }, // [D] RT/(43.568 g/mol · 3.72076)
        phase: { kind: 'rayleigh' },
      },
      {
        // Dust, forward lobe. TWO lobes because one g cannot make the sunset blue: g rises
        // toward the blue (0.766 @440 vs 0.700 @680), so a single g gives a butterscotch sky
        // AND a butterscotch sunset. Lobe g's are Chen-Chen+19's measured DHG, the split their
        // alpha(lambda). [M] Extinction is grey (Angstrom -0.09, five Mars years), deliberately
        // overriding Wolff09's Q_ext, whose red bump is one narrow size bin's Mie resonance.
        scatter: [0.022541, 0.019934, 0.019163], // [D]
        absorb: [0.000623, 0.002516, 0.005506], // [D] omega_0 0.97 red / 0.78 blue = butterscotch
        profile: { kind: 'exponential', scaleHeightKm: 13 }, // [M] MSL's adopted value
        phase: { kind: 'henyeyGreenstein', g: 0.889 }, // [M] Chen-Chen+19
      },
      {
        // Dust, broad lobe — same profile and same single-scattering albedo as the forward
        // lobe, only g differs. The pair is one aerosol split by alpha, so the two rows'
        // scatter+absorb SUM to the dust column; changing one alone breaks the extinction.
        scatter: [0.007007, 0.006518, 0.003518], // [D]
        absorb: [0.000194, 0.000823, 0.001011], // [D]
        profile: { kind: 'exponential', scaleHeightKm: 13 },
        phase: { kind: 'henyeyGreenstein', g: 0.094 }, // [M] Chen-Chen+19
      },
    ],
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
    constituents: [
      {
        // [M/D] H2/He Rayleigh at the Galileo composition (x_He 0.1356) and 1-bar T (166 K).
        // Was flat-grey [4,4,5]e-3, red:blue inverted; H2/He is derivable from first principles.
        scatter: [1.62e-3, 3.85e-3, 9.68e-3],
        absorb: [0, 0, 0],
        profile: { kind: 'exponential', scaleHeightKm: 25.8 }, // [D] kT/(mu m_u g_eff)
        phase: { kind: 'rayleigh' },
      },
      {
        // [M] Cloud+haze retrieved as conservatively scattering (k~1e-9); old absorb 1e-3 (omega
        // 0.75) killed the rim's colour. Jupiter's colour IS its chromophore, and the chromophore
        // is in the ground TEXTURE: as a uniform shell term it would delete the limb, not tint it.
        scatter: [3e-3, 3e-3, 3e-3], // [L] bracket 2-6e-3, any value here reads about the same
        absorb: [0, 0, 0],
        profile: { kind: 'exponential', scaleHeightKm: 14 }, // [D] 0.7x gas H at the ~0.5 bar haze
        phase: { kind: 'henyeyGreenstein', g: 0.75 }, // [D] Mie at the measured haze radius
      },
    ],
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
    constituents: [
      {
        // [M/D] H2/He Rayleigh, 35% stronger than Jupiter's at 1 bar (g_eff is 2.5x smaller).
        // x_He is genuinely unsettled — 0.033-0.14 across five non-overlapping Cassini/Voyager
        // determinations [L, midpoint 0.08 used] — but that whole spread moves this row only
        // +3/-6%, since He's cross section is 1/16 of H2's. Do not re-derive on the next He paper.
        scatter: [2.18e-3, 5.18e-3, 13.0e-3],
        absorb: [0, 0, 0],
        profile: { kind: 'exponential', scaleHeightKm: 55 }, // [D] old 59.5 = pre-Cassini 3.25% He
        phase: { kind: 'rayleigh' },
      },
      {
        // [M] Particle scale height 25 km is Sanz-Requena+19's MEASURED tropospheric-haze value —
        // already correct; do not "fix" it back toward the gas scale height. [D] absorb: retrieved
        // haze m_i ~1e-3 rising to the blue vs Jupiter's ~1e-9 — the measured colour difference.
        // [L] Grey, and the only free dial here. Must stay optically THIN: the body texture is a
        // photograph of these same clouds, so a shell thick enough to grey the limb (tau_vert ~2.5)
        // erases the banding the texture carries. Tried and rejected on screen, 2026-08-18.
        scatter: [3e-3, 3e-3, 3e-3],
        absorb: [4.5e-5, 1.1e-4, 2.7e-4],
        profile: { kind: 'exponential', scaleHeightKm: 25 },
        phase: { kind: 'henyeyGreenstein', g: 0.75 }, // [D] same g as Jupiter's; differs via absorb
      },
      {
        // [D] Well-mixed methane. Present here, absent from Jupiter's row: slant optical depth at
        // 680nm is 1.26 on Saturn vs 0.33 on Jupiter (lower g_eff -> 6x the CH4 column), so
        // Saturn's clears the noise floor and Jupiter's does not.
        scatter: [0, 0, 0],
        absorb: [2.78e-4, 1.6e-5, 1.7e-5],
        profile: { kind: 'exponential', scaleHeightKm: 55 }, // gas scale height, not methane's own
        phase: { kind: 'rayleigh' }, // unused: scatter is zero
      },
    ],
    groundAlbedo: seededPlanet('saturn').albedo,
    twilightSoftness: 0.03,
    twilightIntensity: 1.0,
    sunIrradiance: 1.0,
    exposure: 1.3,
  },
  titan: {
    // Cloud-tops-as-ground like Venus, except the offset is not free: altitude 0 is the nadir
    // tau=1 haze level 160 km up, so Titan draws 6.2% small. Do NOT close that by raising
    // `planetRadiusKm` above the rasterised radius — the fragment's ground test then reads true
    // where no disc was drawn, amputating the limb glow (shell/fragment.wesl:176-181).
    // Textureless: no visible-light mosaic of Titan exists, so the shell sits over a flat
    // Lambert sphere. Every number here, and what the disc should composite to:
    // docs/research/atmospheres/titan.md.
    planetRadiusKm: seededPlanet('titan').radiusKm,
    // [D] 7.8 aerosol scale heights (limb tau 0.009), and tall enough to contain the 500 km
    // detached haze, so the shell never has to grow.
    atmosphereTopKm: seededPlanet('titan').radiusKm + 350,
    constituents: [
      {
        // [D] N2/CH4 at 193 Pa, 172 K (HASI/Huygens; He+21 sigmas) — 0.2% of the extinction,
        // present for correctness and never a colour dial. No methane constituent, unlike
        // Uranus/Neptune: Titan's deep bands form below the drawn sphere, not above it.
        scatter: [1.62e-5, 3.84e-5, 9.58e-5],
        absorb: [0, 0, 0],
        profile: { kind: 'exponential', scaleHeightKm: 43 }, // [M] HASI dlnp/dz, 160-180 km
        phase: { kind: 'rayleigh' },
      },
      {
        // Organic haze, forward lobe. TWO lobes because the particles are fractal aggregates and
        // one g cannot hold both ends: g=0.85 alone darkens the low-phase disc ~6x, g=0.55 alone
        // kills the twilight surge that is Titan's defining optical property. The two rows SUM to
        // the haze column — changing one alone breaks the extinction.
        // [D] tau = 0.61/1.00/1.69 above the reference. The lambda^-2.34 slope is MEASURED and is
        // the aggregate's own signature (D_f=2 gives lambda^-2); flattening it greys the limb.
        scatter: [6.67e-3, 10.68e-3, 16.07e-3],
        // [D] beta*(1-w), w inverted from Karkoschka 98's measured full-disk albedo. 28x more
        // absorbing in blue than red — this, not `scatter`, is most of Titan's orange. w(440) is
        // a LOWER bound, so a Titan reading too brown is cured by cutting this, not by `scatter`.
        absorb: [0.096e-3, 0.427e-3, 2.66e-3],
        profile: { kind: 'exponential', scaleHeightKm: 45 }, // [M] Doose+16 revision via GM+17
        phase: { kind: 'henyeyGreenstein', g: 0.85 }, // [D] width-matched to the 7.7 deg Airy lobe
      },
      {
        // Organic haze, broad lobe — same medium, same albedo, 50/50 energy split. [L] on g: the
        // pair's mean cosine 0.55 is the g the `absorb` inversion assumed, so the two move together.
        scatter: [6.67e-3, 10.68e-3, 16.07e-3],
        absorb: [0.096e-3, 0.427e-3, 2.66e-3],
        profile: { kind: 'exponential', scaleHeightKm: 45 },
        phase: { kind: 'henyeyGreenstein', g: 0.25 },
      },
      // [M] No tent for the detached haze at 500 km: normal tau ~1e-3, and it was undetectable
      // from late 2012 to early 2016. A layer that comes and goes is not a table constant.
    ],
    // [M] Karkoschka 98 measures the disc at [0.28, 0.21, 0.12] and the seed is ~2.8x brighter,
    // which at tau~1 is first-order in the bounce, not Pluto's 1% rounding. NOT fixed here — the
    // seed's hue is right because it was eyeballed as the COMPOSITE, and that is table-wide:
    // docs/backlog/2026-08-18-body-seed-albedos-vs-measured.md.
    groundAlbedo: seededPlanet('titan').albedo,
    // [L] The table's widest terminator, and the one with a measured reason: H_a/R = 1.5e-2
    // (GM+17), ~23x Venus's, puts the lit shell top at 29 deg of solar depression vs Earth's 10.
    twilightSoftness: 0.12,
    // [L] 1.0 = the physical result; the surge already lives in the forward lobe.
    twilightIntensity: 1.0,
    sunIrradiance: 1.0,
    // [L] Between Mars's 1.5 and Venus's 3.0. Scales in-scatter only, so it is NOT the dial for a
    // composite that reads too bright or too red — that is the seed albedo above.
    exposure: 2.0,
  },
  uranus: {
    // Cloud-tops-as-ground; the old row faked methane's red absorption with a suppressed-red
    // Rayleigh vector. That vector was already close to right — the real gap was that methane
    // (the thing that actually reddens/blues these planets) had no constituent at all.
    planetRadiusKm: seededPlanet('uranus').radiusKm,
    atmosphereTopKm: seededPlanet('uranus').radiusKm + 150,
    constituents: [
      {
        // [D] H2/He Rayleigh (Dalgarno & Williams 1962 sigma_H2 + Mansfield & Peck 1969 sigma_He)
        // at N(1 bar) = 3.566 amagat. Steeper than lambda^-4 (D&W's lambda^-6/-8 terms); He is 1.2%.
        scatter: [3.15e-3, 7.5e-3, 18.9e-3],
        absorb: [0, 0, 0],
        profile: { kind: 'exponential', scaleHeightKm: 27.7 }, // [M] NASA fact sheet
        phase: { kind: 'rayleigh' },
      },
      {
        // [D] Methane. Karkoschka (1998) k, band-averaged R/G/B, x n_CH4 = 0.0347 amagat at the
        // 1-bar level — saturation-capped there, NOT the 3% deep value: methane condenses at
        // 1.4-1.5 bar, below the drawn sphere. scatter is CH4's own Rayleigh.
        scatter: [0.38e-3, 0.93e-3, 2.38e-3],
        absorb: [1.76e-3, 0.51e-3, 0.066e-3],
        // [D] 6.6 km is METHANE's own scale height (vapour tracks p_sat(T), e-folding 4x faster
        // than pressure above the condensation level) — not the 27.7 km gas value above.
        profile: { kind: 'exponential', scaleHeightKm: 6.6 },
        phase: { kind: 'rayleigh' },
      },
      {
        // [M/D] Extended photochemical haze (Irwin+22 Aerosol-3: tau 0.03 @ 0.8um, base 1.6 bar,
        // r 0.05um) — the only one of Irwin's 3 Uranus aerosol layers above 1 bar. Scatters as
        // ~lambda^-4 with g~0.06, i.e. Rayleigh in all but name.
        scatter: [0.68e-3, 1.57e-3, 3.75e-3],
        absorb: [0.027e-3, 0.025e-3, 0.26e-3],
        profile: { kind: 'exponential', scaleHeightKm: 55 }, // fsh 2x gas value (Irwin+22)
        phase: { kind: 'henyeyGreenstein', g: 0.06 },
      },
    ],
    groundAlbedo: seededPlanet('uranus').albedo,
    twilightSoftness: 0.03,
    twilightIntensity: 1.0,
    sunIrradiance: 1.0,
    exposure: 1.8,
  },
  neptune: {
    // Cloud-tops-as-ground like Uranus. Uses all 4 constituent slots — MAX_CONSTITUENTS is
    // exactly consumed, no headroom left on this row.
    planetRadiusKm: seededPlanet('neptune').radiusKm,
    atmosphereTopKm: seededPlanet('neptune').radiusKm + 120,
    constituents: [
      {
        // [D] H2/He Rayleigh, same cross sections as Uranus's. Only 5% above Uranus's — the higher
        // number density is nearly cancelled by the larger He fraction. Molecular Rayleigh is NOT
        // why Neptune reads bluer.
        scatter: [3.32e-3, 7.91e-3, 19.9e-3],
        absorb: [0, 0, 0],
        profile: { kind: 'exponential', scaleHeightKm: 20 }, // [M/D] fact sheet range 19.1-20.3
        phase: { kind: 'rayleigh' },
      },
      {
        // [D] Methane, saturation-capped at the 1-bar level like Uranus's — n = 0.0160 amagat,
        // LESS than Uranus's 0.0347, since Neptune's 1-bar level is 4K colder despite Neptune's
        // larger deep abundance (7% vs 3%, Irwin+22): that reservoir sits below the sphere.
        scatter: [0.18e-3, 0.42e-3, 1.09e-3],
        absorb: [0.81e-3, 0.24e-3, 0.031e-3],
        profile: { kind: 'exponential', scaleHeightKm: 5.9 }, // methane's own H, as for Uranus
        phase: { kind: 'rayleigh' },
      },
      {
        // [M/D] Aerosol-3 (Irwin+22, tau 0.04 @ 0.8um). 10-40x more ABSORBING than Uranus's
        // (single-scattering albedo 0.31 vs 0.96 in red) — real, but Irwin's own colour
        // decomposition gives this layer little weight; don't hang the U/N colour difference on it.
        scatter: [0.15e-3, 0.35e-3, 0.84e-3],
        absorb: [0.34e-3, 0.14e-3, 0.32e-3],
        profile: { kind: 'exponential', scaleHeightKm: 42 },
        phase: { kind: 'henyeyGreenstein', g: 0.06 },
      },
      {
        // [M/D] Detached methane-ice layer at 0.2 bar (Irwin+22 Aerosol-4) — the discrete case
        // `tent` exists for, unlike Uranus which has none above 1 bar. Grey, conservative (r
        // 2.5um ice, no absorption). LOOK RISK: ~100x limb enhancement drives tau_limb to ~3, a
        // bright ring unseen in reference imagery — eyeball, ready to halve `scatter` [L].
        scatter: [7.1e-3, 7.1e-3, 7.1e-3],
        absorb: [0, 0, 0],
        profile: { kind: 'tent', centerKm: 30, widthKm: 4.2 },
        phase: { kind: 'henyeyGreenstein', g: 0.84 },
      },
    ],
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
    constituents: [
      {
        // [D] Earth's Rayleigh scaled by surface number density (11 µbar / 40 K = 7.82e-5 of sea
        // level). ~300x under the haze: honest, and invisible.
        scatter: [4.5e-7, 1.06e-6, 2.59e-6],
        absorb: [0, 0, 0],
        // [M] Gas and haze share ONE measured falloff (Young+18: haze extinction ∝ N2 density over
        // 26-100 km). The isothermal 40 K value, 19 km, is the WRONG number for this profile — the
        // atmosphere climbs past 110 K by 30 km.
        profile: { kind: 'exponential', scaleHeightKm: 50 },
        phase: { kind: 'rayleigh' },
      },
      {
        // [D] Vertical scattering optical depth 0.013 over a 50 km scale height (Gladstone+16) =
        // 2.72e-4 /km at LORRI's 607.6 nm pivot, spread over 680/550/440 nm by the measured
        // blue/red ratio above (λ^-3.44).
        scatter: [1.85e-4, 3.83e-4, 8.25e-4],
        // [D] Tholin k=0.018 at 607.6 nm through van de Hulst: single-scattering albedo 0.966, so
        // absorption is 3.5% of scattering — present, never visible.
        absorb: [9.6e-6, 9.6e-6, 9.6e-6],
        // [M] "typical brightness scale heights of ~50 km" (Gladstone+16).
        profile: { kind: 'exponential', scaleHeightKm: 50 },
        // [D] Henyey-Greenstein solved against the one measured phase-function point, P(165°)~5
        // (Gladstone+16): g=0.5 gives 4.95. Far below Earth's 0.8 because HG must hit the forward
        // lobe's HEIGHT, not merely lean forward — raise g without cutting the haze `scatter` by
        // the same factor and the ring triples.
        phase: { kind: 'henyeyGreenstein', g: 0.5 },
      },
      // [M] No ozone, and no oxygen-bearing species to make any: the Alice occultation's inventory
      // is N2, CH4, C2H2, C2H4, C2H6 and haze (Young+18) — hence no third constituent.
    ],
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
