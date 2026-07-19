/**
 * limbDarkeningParams — the authored table of Minnaert limb-darkening constants
 * the textured-body fragment folds onto its Lambert term (spec §6.3). Data, not
 * code: one row per body whose disc reads visibly non-Lambertian at close
 * approach. A body absent from the table renders exactly as today — the packer
 * fills identity values (`strength 0`), and `limbDarkening` returns 1.0 for
 * `strength 0`, so the fragment path is untouched. This is the same data-gate
 * `SCENE_RINGS` and `ATMOSPHERE_PARAMS` use: adding a row is both necessary and
 * sufficient to turn the effect on for a body.
 *
 * ### Why gas giants get strong values and airless bodies none
 *
 * The Minnaert law `I/F = mu0^k * mu^(k-1)` flattens a disc's bright centre and
 * steepens its dimming toward the limb as the exponent `k` climbs above 1. The
 * gas giants (Jupiter, Saturn) and the ice giants (Uranus, Neptune) show this
 * strongly: their deep, scattering cloud decks read as smoothly limb-darkened
 * discs, so they carry the largest `strength`/`exponent`. Venus's thick haze
 * gives a milder version. Mars and the airless bodies (Mercury, the Moon, the
 * Galilean and Saturnian moons) show little coherent limb darkening at this
 * scale — a rocky, shadowed surface is closer to plain Lambert — so they are
 * absent and render identically to before.
 *
 * `strength ∈ [0,1]` lerps identity → the Minnaert law (`0` = plain Lambert).
 * `exponent` is the Minnaert `k` (`1.0` = Lambert identity; `>1` flattens the
 * disc centre and steepens the limb). These are eye-tunable starting points
 * (spec §6.3) calibrated by eye against the lit body via HMR, not by a unit test
 * — a numeric restatement would fail on every legitimate tweak (see
 * conventions/testing.md), so the values carry no test. Only a key-resolution
 * drift-catcher guards that every row names a real seeded body.
 */

export const LIMB_DARKENING_PARAMS: Readonly<
  Record<string, { strength: number; exponent: number }>
> = {
  venus: { strength: 0.25, exponent: 1.15 },
  jupiter: { strength: 0.6, exponent: 1.3 },
  saturn: { strength: 0.55, exponent: 1.3 },
  uranus: { strength: 0.45, exponent: 1.25 },
  neptune: { strength: 0.45, exponent: 1.25 },
  // mars + the airless bodies (mercury, moon, galileans, saturnian moons) are
  // absent ⇒ strength 0 ⇒ identity (plain Lambert, exactly as before).
};
