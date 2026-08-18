# Titan's north/south albedo asymmetry

Surfaced while shipping Titan's atmosphere row
(`docs/superpowers/specs/2026-08-18-atmosphere-constituents-design.md` stage 3,
derivation in `docs/research/atmospheres/titan.md`).

Titan ships **textureless** — no visible-light global mosaic of it exists — so its
disc is a flat Lambert sphere under the haze shell. That loses nothing at high
frequency: Titan has no visible surface detail to lose. But it does lose the one
piece of large-scale visible structure Titan actually has.

## What the structure is

A **north/south albedo asymmetry**: one hemisphere brighter than the other across the
disc, roughly **10% at 440 and 550 nm** in the HST photometry (Caldwell et al. 1992),
and larger at shorter wavelengths still. It is a haze-distribution effect, not a
surface one — the winter hemisphere carries more haze opacity, so it darkens in the
blue and brightens in the near IR.

Two properties make it awkward for a texture, and both are measured:

- **The symmetry axis is tilted, and it migrates.** The dividing line is not Titan's
  equator. Roman et al. (2009) find a tilted symmetry axis whose orientation drifts
  **westward** over the Cassini record, so the asymmetry's geometry is not fixed to
  the body frame either.
- **It reverses with the season.** Titan's year is **29.5 Earth years**. The sense
  had already flipped from the Voyager (1980–81) configuration by the 1992–95 HST
  epoch (Lorenz et al. 1997), and it was reversing again in late 2016.

## Why a texture cannot carry it

A static equirectangular map is a function of body-frame position alone. This signal
is a function of body-frame position **and** the date — it changes sign twice per
Titan year and its axis rotates in the body frame meanwhile. Bake any one epoch and
the render is wrong for roughly half of all sim times, silently, with no way for a
viewer to tell which half they are in. That is worse than shipping it absent.

## Shape of a fix

A **procedural term driven by the sim clock**: a smooth latitude ramp about a tilted,
slowly-precessing axis, amplitude and sign taken from Titan's seasonal phase (heliocentric
longitude relative to its solstices), applied as a modulation of the haze column rather
than of the disc's albedo — the asymmetry is haze opacity, so it should appear in the
shell, where it will also be per-channel for free (blue-darkening/IR-brightening comes
out of the existing `scatter`/`absorb` slope rather than needing its own tint).

Open questions, none answered here:

- Where the modulation attaches. `AtmosphereConstituent` has no positional dependence
  at all today — every profile is a function of altitude only. A latitude term is a new
  axis in the medium model, not a new constituent, so this is a shader/data-model
  question before it is a Titan question.
- Whether any other body wants it. Titan is the extreme case, but seasonal haze
  asymmetry is not unique to it, so a Titan-shaped special case is the wrong first cut.
- What pins the amplitude per channel. Caldwell+92's ~10% is two wavelengths at one
  epoch; the full seasonal amplitude curve would need the Cassini ISS record.

Gate on look — but the sign at a given date is checkable against the published epochs
above, so this one has a real correctness test as well as a taste one.
