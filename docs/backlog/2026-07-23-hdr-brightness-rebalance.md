# Cross-layer brightness rebalance + HDR output

**Status:** needs-design (2026-07-23)

Seeded by the `?hdr` output spike (branch `spike/hdr-mode`) and a survey of how other
universe explorers handle brightness across scales. The spike proved the pipeline can
reach an HDR display; this doc captures what the investigation learned about _why the
brightness across layers is currently un-navigable as physical values_, and the direction
the established tools point to.

## The HDR spike (context)

The renderer already works in HDR internally: every pass draws into an `rgba16float`
offscreen and one final compositor pass tone-maps down to an 8-bit swap chain, clamping to
`[0,1]`. The mechanism (a Settings → Display → HDR toggle, gated on `hdrCapable`) makes the swap
chain `rgba16float` + `toneMapping: { mode: 'extended' }`, and adds an additive "headroom
spill" in the tone pass so bright sources punch past paper-white:

```
lum  = max channel of scaled                 // same measure the bloom bright-pass uses
peak = max(0, lum - hdrKnee)
out  = mapped + (scaled / lum) * peak * hdrHeadroom   // headroom 0 => SDR bit-identical
```

Off by default; SDR output unchanged. The spill rides the pixel's own colour ratio rather
than being added per channel, so it lifts brightness without shifting hue. `hdrKnee` and
`hdrHeadroom` are live settings behind Display → HDR; the knee defaults to
`toneMapCurveSaturation(curve)`, the point where the curve stops separating values, since
spilling below that lifts midtones the curve was still handling.

This is a viewing spike, not the brightness model.

## The core finding — six incompatible brightness "currencies"

Every layer writes into one shared `rgba16float` HDR buffer, then passes through **one
static** exposure (`tonemap.exposure = 3.0`, `src/data/defaults.ts:255`) + Reinhard curve,
then bloom fires above threshold `2.0`. But the six layers do not speak a common brightness
unit — the cross-layer ordering (Sun brightest, then stars, then galaxies, then planets) is
an _emergent accident_ of hand-tuned constants, not a designed scale.

| Layer                      | Brightness basis                                                                                                              | Rough HDR peak                                      | Physical?                       | Key knob (file:line)                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------- |
| Galaxy points              | baked per-galaxy surface brightness `sbAmp`, clamped by `sbMax`, scaled by `sbScale`                                          | ~30 (the `sbMax` ceiling)                           | yes, physical SB                | `points/vertex.wesl`; `DEFAULT_GALAXY_SB_SCALE` / `DEFAULT_GALAXY_SB_MAX` (`defaults.ts`) |
| Galaxy procedural disks    | fixed bulge+disk silhouette; **no magnitude/luminosity input**                                                                | ~1                                                  | no                              | `proceduralDisks/fragment.wesl:59-96`                                                     |
| Galaxy thumbnails          | raw survey JPEG/WebP texels (already display-referred)                                                                        | ~1                                                  | no                              | `texturedDisks/fragment.wesl:40,65-72`                                                    |
| Stars (survey/near/famous) | real Pogson flux `10^(−0.4·absMag)` × inv-square × `STAR_FLUX_EXPOSURE=6000` × 15–70× camera ramp, compressed by `starKnee=8` | ~8 (post-knee)                                      | core yes, ×big eye-tuned fudge  | `lib/starPhotometry.wesl:119,145-147`; `starExposureRamp.ts`; `lib/starKnee.wesl:46`      |
| Planets / Earth            | albedo(0–1) × Lambert, `AMBIENT=0.08` floor; Earth adds `sunIrradiance=3.0` (algebraic match to old look, not W/m²)           | ~1                                                  | shapes yes, no irradiance scale | `lib/bodyLighting.wesl:34`; `earthSurfaceParams.ts:77-91`                                 |
| Sun                        | flat `EMISSIVE=12.0` (resolved sphere) — sole requirement is to sit above bloom threshold `2.0`                               | 12                                                  | no                              | `starRenderConstants.ts:31` (`star/fragment.wesl:38`)                                     |
| Milky Way                  | `MILKY_WAY_EXPOSURE=0.11` × per-star generated luminosity × fixed glow shape; additive, uncapped                              | sub-1/sprite, but core sums >1 (LOD boost up to 3×) | no                              | `milkyWayCalibration.ts:68`; `milkyWay/sprites/stars.wesl:134-145`                        |

Two of these are **SDR-preservation hacks that HDR makes unnecessary**:

- `starKnee = 8` exists only to stop the per-channel tone-map clipping star colours to white
  one channel at a time (`lib/starKnee.wesl:6-13`). HDR headroom is exactly what lets a star
  keep its colour into the extended range — so the knee should _relax_ in HDR, not be tuned.
- The Sun's `EMISSIVE = 12` is a "stay above bloom threshold" number
  (`starRenderConstants.ts:14-25`), decoupled from the Sun being ~10^10× a galaxy. With
  adaptation + headroom it becomes "emit real flux, let exposure and the curve handle it".

The disks/thumbnails carry **no photometry at all**, so any physical scale has to give them a
per-galaxy flux they don't currently have.

## How the established explorers do it

None of the good tools "tweak the magnitude constants" layer by layer. They start from real
apparent magnitude per object and add a **scene-adaptive exposure** so the frame is always
well-exposed for whatever you are near — that is what makes multi-scale navigation possible.

- **Gaia Sky** (closest analog — scientific, open-source, real star + galaxy catalogs):
  apparent magnitude → per-star pseudo-size → shader intensity; a manual **Star brightness
  slider**; **bloom** + a **light-glow** pass for bright sources like the Sun; and an
  **"Automatic" HDR tone-mapping mode that adjusts exposure in real time to overall image
  lightness**.
- **SpaceEngine** — this is the "pleasing but accurate when we want to" design already
  shipped: **two modes**. _HDR_ (pretty, deliberately unrealistic wide range) vs _Auto/Photo_
  = **physically-based real brightness + auto-exposure metering the centre of the screen**.
  They are explicit that no camera or eye has that wide a range, so Auto shrinks the range and
  floats exposure. Magnitude-limit keys pull faint stars into view. Auto-exposure simulates a
  **camera, not the eye** (there is "no human-eye equivalent for a star").
- **Stellarium** — the physical-accuracy gold standard: a real **tone-reproduction operator**
  (Tumblin-Rushmeier / Devlin) + a **luminance-adaptation** model that mimics eye adaptation,
  mapping true cd/m² through the day→night range. Principled but heavy; it models the human
  visual system, which SpaceEngine deliberately declined to do.

Common recipe: (1) real apparent magnitude → flux, (2) **scene-adaptive exposure** ← the
keystone skymap lacks, (3) manual brightness + magnitude-limit override, (4) bloom/glow for
bright sources, (5) a **realism toggle** (enhanced/compressed ↔ physical). Skymap has (3) and
(4), a _static_ exposure, and the six currencies above.

Sources: [Gaia Sky star rendering](https://gaia.ari.uni-heidelberg.de/gaiasky/docs/3.4.0/Star-rendering.html),
[Gaia Sky graphics settings](https://gaia.ari.uni-heidelberg.de/gaiasky/docs/3.4.1/Graphics-settings.html),
[SpaceEngine HDR rendering](https://spaceengine.org/news/blog170415/),
[SpaceEngine real brightness discussion](https://steamcommunity.com/app/314650/discussions/0/1639787494973516887/),
[Stellarium StelSkyDrawer / tone reproduction](https://stellarium.org/doc/1.x/classStelSkyDrawer.html).

## Direction — what needs decided

The user's goal: pleasing and navigable by default, but able to **show visitors how real
brightnesses relate** when wanted, while keeping stars + planets + galaxies visible together
during navigation. Three shapes, in ascending effort:

1. **Per-layer HDR gain table (spike-level).** Keep each layer's formula; add an explicit
   per-layer "peak headroom target" knob (galaxy / star / planet / Sun / Milky Way) as
   sliders and tune the ordering by eye on an HDR display. Turns the accidental ordering into
   an intentional, tunable one. Fast, reversible, extends the HDR display toggle. Not physical.
2. **Auto-exposure only (smallest keystone).** Add scene-adaptive exposure (meter the HDR
   buffer's centre/average luminance, adapt over time, camera-style) on top of today's
   scales. Proves whether adaptation alone makes multi-scale navigation feel right before any
   rebalance.
3. **Shared magnitude→flux scale + auto-exposure + realism slider (the recipe).** Put all
   layers on one apparent-magnitude flux scale (incl. real apparent mags for Sun/planets and a
   flux for the disks/thumbnails that lack one), add auto-exposure, and one "realism" slider
   (a compression power / γ on the flux, or a blend between compressed and true). Biggest
   payoff for "navigate + honest ratios"; a real feature → refactor-ground then spec. Retires
   `starKnee`, the Sun's magic `EMISSIVE`, and the near-field exposure ramp as HDR makes them
   redundant.

## Interactions

- **[Real star apparent magnitudes from Earth](2026-07-22-star-apparent-magnitude-realism.md)** —
  the star-only, Earth-vantage subset of this; its "slider becomes exposure/adaptation" note
  is the same keystone. Fold into whichever direction ships.
- **[Bright star clump at ~5.9 kpc](2026-07-17-star-clump-brightness-5-9kpc.md)** — residual
  over-exposure is display policy; a principled exposure/tone shoulder subsumes it.
- **Bloom** (`2026-07-21-bloom-mip-count-perf.md`, `2026-07-21-fold-star-upsample-into-tonemap.md`) —
  the bloom threshold `2.0` is load-bearing for the Sun; any brightness rebalance must hold or
  re-derive the `DEFAULT_BLOOM_THRESHOLD < STAR_KNEE ≤ STAR_EMISSIVE` ordering
  (`starRenderConstants.ts:14-25`).
- Depends on the HDR display toggle's extended-range swap (see "Carried forward" below)
  being the assumed output for direction 2/3.

## Carried forward from the `?hdr` productionisation review

The prerequisite list that lived here is now
[`specs/2026-07-30-hdr-display-toggle.md`](../superpowers/specs/2026-07-30-hdr-display-toggle.md),
which resolves the mirrored `hdr` flag, the swap-format rebuild seam, the missing
`matchMedia` listener, the `any` cast, and the offline-harness question. Two items are
out of that spec's scope and still open here:

- **Post-tone-map overlays need a headroom policy.** Labels and marker lines draw at white
  over a scene that can exceed it, so text over a bright star reads dim. Scale them with
  the headroom or pin them at paper white as a stated choice.
- **Non-Chrome behaviour is assumed, not verified.** Other implementations will ignore the
  unknown `toneMapping` dict member and give a float swap chain that clamps at 1.0 — the
  toggle would then do nothing visible. Check Safari rather than assume.
