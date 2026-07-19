# Cloud deck: thickness channel, live coverage, multiple-scattering shading

The Earth cloud shell is the last ad-hoc layer in an otherwise physically-based
stack: the surface is Cook-Torrance + Oren-Nayar, the atmosphere is
Bruneton/Hillaire, but `cloudShell/fragment.wesl` shades the deck with a single
Lambert term (`N·L` scaled by `sunIrradiance`, plus the ambient floor). It gives
none of what makes real cloud decks read as clouds: they stay bright at high sun
angles, thick clouds self-shadow, and edges glow (forward-scatter silver lining)
— all dominated by MULTIPLE scattering, not direct illumination.

This note supersedes item 6 of `2026-07-19-photoreal-earth-followups.md`.

## Two separable features, currently bundled

"PBR clouds" is really two independent efforts that got mentally merged. They do
not depend on each other and either can ship alone:

- **Live weather data** — the *what*: swap the static composite for today's
  clouds.
- **Multiple-scattering shading** — the *how it's lit*: a phase term (+ optional
  thickness channel).

## Current pipeline — one channel of information

- **Source:** NASA Blue Marble composite `cloud_combined_8192.tif` (8192×4096
  equirect, white-cloud-on-black, NO alpha, public domain).
  `rawDataRegistry.ts` key `textures.earthClouds`. Static — a fixed composite,
  not live.
- **Build:** `writeCloudTier` derives `alpha = Rec.709 luminance of RGB` (white
  cloud → opaque, black sky → clear).
- **Runtime:** samples `rgba8unorm-srgb` → RGB is colour, A is coverage→opacity
  (× `CLOUD_SHELL_PARAMS.opacity`).

Because alpha is literally the luminance of RGB, RGB and A carry the SAME signal
— effectively **one degree of freedom per texel** ("how bright/white the cloud
is"). There is **no independent optical-thickness channel**, and no independent
information in the current source to build one from. A real thickness channel
means decoupling A from RGB: stop deriving A from luminance, supply it from a
separate raster.

## Fetchability — three tiers

1. **Live coverage (cheap, ~no pipeline change).** NASA GIBS serves near-real-time
   global cloud imagery from MODIS/VIIRS (corrected reflectance / cloud fraction),
   updated daily, as equirect/WMTS — the same white-on-dark shape we already
   consume. "Today's clouds" is a **source swap + fetch cadence**, dropping
   straight into `writeCloudTier`'s luminance→alpha path. Still gives coverage,
   NOT optical depth.
2. **Real optical thickness (the actual thickness channel).** MODIS MOD06/MYD06
   Cloud Optical Thickness (retrieved τ) + VIIRS equivalents, via NASA
   LAADS/Worldview/GIBS. A genuine measured quantity for a second packed channel.
   Cost is not the shader — it's the data layer: reprojection to equirect, polar
   gaps, swath-edge seams, and night-side retrieval holes (visible-band retrieval
   fails in darkness). This is the load-bearing work.
3. **Thickness proxy (no new data).** The existing luminance-alpha already
   correlates loosely with thickness; feed it into a powder/HG phase term as a
   crude stand-in with ZERO pipeline change. Not physically calibrated τ, but buys
   most of the visual payoff (silver-lining glow, stays-bright-at-high-sun-angle).

## Shading cost — cheap, not volumetric

"Multiple scattering" sounds expensive because in games it usually implies
volumetric raymarching (64–128 primary steps + 4–8 secondary light steps per
sample → 256–1024 samples/pixel, needs half-res + temporal reprojection). That is
NOT what this needs. The deck is a thin translucent UV-sphere shell (128×64 at
`radiusRatio` 1.002), drawn as one OVER-blended pass. An analytic Hillaire-style
powder + Henyey-Greenstein term (optionally 2–3 scattering "octaves") is ~10–30
extra ALU instructions per cloud fragment — sub-millisecond, likely unmeasurable
behind the existing bandwidth-bound sample+blend, and dwarfed by the atmosphere
and surface passes.

## Fidelity ceiling of the shell

A single shell has no depth into the medium, so true self-shadowing (dense cloud
occluding its own interior) and volumetric parallax are unreachable no matter how
good the phase function — you can only *fake* self-shadow from a thickness value.
The shell approach caps out at the edge-glow / high-sun-angle brightness wins;
full volumetric behaviour would need a different representation entirely.

## Suggested order

Start with tier 3 (proxy phase term — free, isolated to `fragment.wesl`) and see
if it looks wrong before investing in a real τ channel (tier 2) or live coverage
(tier 1). Live coverage is independently valuable and pipeline-cheap, so it's a
reasonable standalone pickup regardless.
