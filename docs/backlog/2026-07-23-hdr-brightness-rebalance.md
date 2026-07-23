# Cross-layer brightness rebalance + HDR output

**Status:** needs-design (2026-07-23)

Seeded by the `?hdr` output spike (branch `spike/hdr-mode`) and a survey of how other
universe explorers handle brightness across scales. The spike proved the pipeline can
reach an HDR display; this doc captures what the investigation learned about *why the
brightness across layers is currently un-navigable as physical values*, and the direction
the established tools point to.

## The HDR spike (context)

The renderer already works in HDR internally: every pass draws into an `rgba16float`
offscreen and one final compositor pass tone-maps down to an 8-bit swap chain, clamping to
`[0,1]`. The spike (behind `?hdr` + a `(dynamic-range: high)` display check) makes the swap
chain `rgba16float` + `toneMapping: { mode: 'extended' }`, and adds an additive "headroom
spill" in the tone pass so bright sources punch past paper-white:

```
peak = max(scaled - hdrKneeStart, 0)
out  = mapped + peak * hdrHeadroom      // hdrHeadroom 0 => SDR path bit-identical
```

Off by default; SDR output unchanged. Tuning constants live in `renderFrame.ts`
(`HDR_KNEE_START`, `HDR_HEADROOM`). This is a viewing spike, not the brightness model.

## The core finding — six incompatible brightness "currencies"

Every layer writes into one shared `rgba16float` HDR buffer, then passes through **one
static** exposure (`tonemap.exposure = 3.0`, `src/data/defaults.ts:255`) + Reinhard curve,
then bloom fires above threshold `7.0`. But the six layers do not speak a common brightness
unit — the cross-layer ordering (Sun brightest, then stars, then galaxies, then planets) is
an *emergent accident* of hand-tuned constants, not a designed scale.

| Layer | Brightness basis | Rough HDR peak | Physical? | Key knob (file:line) |
| --- | --- | --- | --- | --- |
| Galaxy points | linear remap `clamp((22−mag)/8, floor, 1) × brightness` — deliberate display compression, **not** flux | ~1–3 | no | `points/vertex.wesl:227-234`; `settings.galaxyCatalogs.brightness` (`defaults.ts:171`) |
| Galaxy procedural disks | fixed bulge+disk silhouette; **no magnitude/luminosity input** | ~1 | no | `proceduralDisks/fragment.wesl:59-96` |
| Galaxy thumbnails | raw survey JPEG/WebP texels (already display-referred) | ~1 | no | `texturedDisks/fragment.wesl:40,65-72` |
| Stars (survey/near/famous) | real Pogson flux `10^(−0.4·absMag)` × inv-square × `STAR_FLUX_EXPOSURE=6000` × 15–70× camera ramp, compressed by `starKnee=8` | ~8 (post-knee) | core yes, ×big eye-tuned fudge | `lib/starPhotometry.wesl:119,145-147`; `starExposureRamp.ts`; `lib/starKnee.wesl:46` |
| Planets / Earth | albedo(0–1) × Lambert, `AMBIENT=0.08` floor; Earth adds `sunIrradiance=3.0` (algebraic match to old look, not W/m²) | ~1 | shapes yes, no irradiance scale | `lib/bodyLighting.wesl:34`; `earthSurfaceParams.ts:77-91` |
| Sun | flat `EMISSIVE=12.0` (resolved sphere) — sole requirement is to sit above bloom threshold `7.0` | 12 | no | `starRenderConstants.ts:31` (`star/fragment.wesl:38`) |
| Milky Way | `MILKY_WAY_EXPOSURE=0.11` × per-star generated luminosity × fixed glow shape; additive, uncapped | sub-1/sprite, but core sums >1 (LOD boost up to 3×) | no | `milkyWayCalibration.ts:68`; `milkyWayCloud/stars.wesl:134-145` |

Two of these are **SDR-preservation hacks that HDR makes unnecessary**:

- `starKnee = 8` exists only to stop the per-channel tone-map clipping star colours to white
  one channel at a time (`lib/starKnee.wesl:6-13`). HDR headroom is exactly what lets a star
  keep its colour into the extended range — so the knee should *relax* in HDR, not be tuned.
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
  shipped: **two modes**. *HDR* (pretty, deliberately unrealistic wide range) vs *Auto/Photo*
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
(4), a *static* exposure, and the six currencies above.

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
   an intentional, tunable one. Fast, reversible, extends `?hdr`. Not physical.
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
  the bloom threshold `7.0` is load-bearing for the Sun; any brightness rebalance must hold or
  re-derive the `DEFAULT_BLOOM_THRESHOLD < STAR_KNEE ≤ STAR_EMISSIVE` ordering
  (`starRenderConstants.ts:14-25`).
- Depends on the `?hdr` output path (branch `spike/hdr-mode`) landing, or at least on its
  extended-range swap being the assumed output for direction 2/3.
