# Cloud deck: thickness channel, multiple-scattering shading

The Earth cloud shell is the last ad-hoc layer in an otherwise physically-based
stack: the surface is Cook-Torrance + Oren-Nayar, the atmosphere is
Bruneton/Hillaire, but `cloudShell/fragment.wesl` shades the deck with a single
Lambert term (`N·L` scaled by `sunIrradiance`, plus the ambient floor). It gives
none of what makes real cloud decks read as clouds: they stay bright at high sun
angles, thick clouds self-shadow, and edges glow (forward-scatter silver lining)
— all dominated by MULTIPLE scattering, not direct illumination.

This note supersedes item 6 of `2026-07-19-photoreal-earth-followups.md`.

Live coverage, once bundled with this item, shipped separately: the web app loads the
previous day's map from the nightly cloud bake (`tools/cloud-bake-rs`,
`build-live-clouds`), falling back to the static composite.

## Current pipeline — one channel of information

- **Source:** the daily cloud bake, or the static NASA Blue Marble composite
  `cloud_combined_8192.tif` (`textures.earthClouds`) as the fallback; both are
  grey, white cloud on black.
- **Build and runtime:** one grey channel (`writeCloudTier`, uploaded `r8unorm`);
  the shader derives both opacity and colour from that one byte.

So there is **one degree of freedom per texel** ("how bright/white the cloud
is"): **no independent optical-thickness channel**, and no independent
information in either source to build one from. A real thickness channel means
a second channel from a separate raster.

## Fetchability — two tiers

1. **Real optical thickness (the actual thickness channel).** MODIS MOD06/MYD06
   Cloud Optical Thickness (retrieved τ) + VIIRS equivalents, via NASA
   LAADS/Worldview/GIBS. A genuine measured quantity for a second packed channel.
   Cost is not the shader — it's the data layer: reprojection to equirect, polar
   gaps, swath-edge seams, and night-side retrieval holes (visible-band retrieval
   fails in darkness). This is the load-bearing work.
2. **Thickness proxy (no new data).** The existing grey coverage already
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

Start with tier 2 (proxy phase term — free, isolated to `fragment.wesl`) and see
if it looks wrong before investing in a real τ channel (tier 1).

## Night-side visibility (user-observed 2026-07-19)

On the dark side of Earth the cloud deck currently reads as fully invisible, even
though `cloudShell/fragment.wesl` already carries an `u.ambientLight` (0.08)
floor: the floor is crushed by the display transform while the city lights punch
straight through, so the night hemisphere shows lit cities under an apparently
cloudless sky. Real night imagery is the opposite — decks are faintly visible and
cities glow *through* thinner cloud, occluded by thicker cloud.

Two candidate fixes, composable (either alone helps; together they give the
ISS-photo look):

- **(a) A decoupled night floor for the deck.** One cloud-specific uniform, a
  higher night-side ambient than the shared `ambientLight` floor, applied where
  `N·L` has gone dark. Cheapest possible — a single float, no new bind. Buys "the
  deck is faintly there at night" without touching the light source.
- **(b) City-light illumination of the cloud undersides.** Sample the night-lights
  equirect at the cloud UV and tint that emission into the deck, modulated by
  coverage (thick cloud catches more underlighting, and in turn occludes the city
  glow). This is the physically-right look — cities lighting the cloud bases from
  below, the way they read from orbit. Costs one extra texture bind on the cloud
  pipeline (the night-lights map the surface pass already loads).

Both are isolated to the cloud shell; (a) is a warm-up, (b) is the real fix.
