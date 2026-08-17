# Re-home the six planet atmospheres onto physical channels

Surfaced while adding Pluto's haze row (`src/data/bodies/atmosphereParams.ts`), which is
the only row in the table derived from measurements.

## What's there now

`rayleighScatter` is doing duty as a per-body colour dial, because until the Pluto work
widened `mieScatter` to a `Vec3` it was the table's only per-channel knob:

- **Venus** `[12, 10, 7]e-3` and **Mars** `[8, 5, 3]e-3` decrease toward blue. Rayleigh
  goes as λ⁻⁴, so real molecular scattering cannot; both rows say so in their comments
  ("warm/whitish-yellow Rayleigh tint", "the tint + Mie ARE the dust"). Both bodies'
  colour is aerosol — sulphuric-acid haze and suspended dust — which is Mie.
- **Uranus** `[4, 10, 20]e-3` and **Neptune** `[4, 9, 22]e-3` are "mimicking methane's
  red absorption". That is absorption modelled as scattering, while `ozoneAbsorption` —
  a per-channel _absorption_ vector — sits at `[0,0,0]` in all six rows.
- **Jupiter/Saturn** are near-neutral and least affected.

The rows are honest about being eye-tuned starting points and carry no numeric tests, so
this is misplaced physics rather than a wrong picture. The look was calibrated by eye and
should be preserved through any re-homing.

## Why it's now worth doing

`mieScatter` became per-channel (`Vec3`) for Pluto, so aerosol colour has a correct home,
and `ozoneAbsorption` can carry methane's red absorption under a renamed field. Nothing
new is needed in the shader — the terms already exist and are already per-channel.

## Shape of a fix

Per body: move aerosol colour into `mieScatter`, molecular scattering back to a λ⁻⁴-
consistent `rayleighScatter`, and band absorption into the absorption term (which wants a
name that isn't `ozone` once Uranus and Neptune use it for methane). Carry the
[M]/[D]/[L] provenance tags the Pluto row introduced, so a future tuner knows which
values a nudge would falsify.

Gate on look, not numbers: a before/after visual pass per body, since these are
calibrated by eye and the tests deliberately don't pin them.

## Related

- `EngineGpuHandles.d.ts:490-507` still says "Earth today; Mars / Venus / Titan opt in
  later", stale since the six planet rows landed — sweep it in the same pass.
- Pluto's `groundAlbedo` rides the seed mean (0.49) against a measured Bond albedo of
  0.72 ± 0.07. The seed is the thing to fix, and the same question applies to every row.
