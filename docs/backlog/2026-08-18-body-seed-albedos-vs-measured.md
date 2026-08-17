# Body seed albedos are authored, not measured

Surfaced twice: once while deriving Pluto's atmosphere row, again in the
atmosphere-constituents ground pass
(`docs/superpowers/specs/2026-08-18-atmosphere-constituents-design.md`).

`SCENE_PLANETS` rows carry an authored `albedo: Vec3`
(`src/data/bodies/scenePlanets.ts`). Two consumers read it, and they want different
quantities:

- the **lit-body shading** wants a per-channel surface reflectance — roughly what the
  authored values are eyeballed to be;
- **`ATMOSPHERE_PARAMS.groundAlbedo`** feeds the multi-scatter LUT's isotropic ground
  bounce, which physically wants something closer to a **Bond albedo**.

They are currently the same number. Pluto is the measured case: the seed's mean is
0.49 against a Bond albedo of 0.72 ± 0.07 (Buratti et al. 2017), and its row says so.
Every other row has the same question and no answer, because nothing has been checked
against a published value.

## Why it has been safe to ignore

For Pluto the bounce is a ~1% term at vertical optical depth 0.04, so the error does
not show. That is a property of a thin atmosphere, not a general excuse — the same
mismatch on Venus or Titan, where the ground bounce is under an optically thick
column, is not obviously negligible.

## Shape of a fix

Audit the fifteen seed albedos against published geometric/Bond albedos, tag each
`[M]`/`[D]`/`[L]` the way the Pluto atmosphere row does, and decide deliberately
whether the two consumers keep sharing one field or the atmosphere table gets its own
`groundAlbedo` per row (it already may override — check before assuming).

Gate on look for the shading side; the bounce side has published numbers to check
against.
