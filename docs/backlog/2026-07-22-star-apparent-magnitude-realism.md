# Real star apparent magnitudes from Earth

**Status:** needs-design (2026-07-22)

## Ask

Investigate rendering stars at their real apparent magnitudes as seen from Earth — the goal is realism. Interacts with the bloom pipeline and the star brightness slider.

## Current state — relative photometry is already physical; the display mapping is not

- The Gaia bin stores **absolute** magnitude (7-bit LUT, step 0.19 from −6.0) + BP−RP colour (6-bit) per star, not apparent magnitude (`tools/stars-rs/src/format.rs:37-44,104-110`; TS mirror `src/data/starCatalog/starCatalogFormat.ts:107-125`). Apparent→absolute conversion happens at build time from each source's distance (`tools/stars-rs/src/population.rs:98-99,166-244`).
- The shader reconstructs apparent flux physically: `flux = 10^(−0.4·absMag)` with inverse-square attenuation against camera distance, referenced to 10 pc (`src/services/gpu/shaders/starCatalog/vertex.wesl:304-324`, `lib/starPhotometry.wesl:92-99`). Relative apparent brightness between stars is therefore already correct from any vantage, including Earth's.
- What is **not** physical is the flux→screen mapping: `STAR_FLUX_EXPOSURE = 2400` is eye-tuned (`starPhotometry.wesl:119,145-147`), plus a non-physical aggregate "fog cap" clamp (`vertex.wesl:371-386`) and a near-field exposure ramp (`starExposureRamp.ts`), all layered for legibility across the whole scale ladder rather than fidelity at the Earth pose.
- Brightness slider: `settings.starCatalogs.brightness` (`settingsSlice.ts:177-180`), Stars ▸ Advanced row (`StarsSection.tsx:223-242`, range 0.01–4), fed as `u.brightness` into `starPeakIntensity` — a pure gain on top of the exposure constant.
- Bloom: star layers write additively into the shared `hdr` target (`starCatalogLayer.ts:810`, `starPointsLayer.ts:101`, `starAggregateUpsampleLayer.ts:43`); the bright-prefilter → mip pyramid (`runBloom.ts`) blooms anything past threshold, with no star-specific path. Famous/scene stars share `starPhotometry.wesl`, so any calibration carries over automatically.

## What "realism" needs decided

- An **absolute calibration**: map apparent magnitude → screen luminance so the Earth vantage matches the night sky — naked-eye limit around m ≈ 6.5 at the dim end; the brightest stars (Sirius m = −1.46) plausibly bloom-driven at the top end. Today's exposure constant is tuned for mid-ladder legibility, not this.
- **Slider semantics**: brightness becomes exposure / eye adaptation (or a sky-quality / limiting-magnitude control) rather than an arbitrary gain — otherwise the slider un-calibrates the realism.
- **Stylization layers**: decide whether the fog cap and exposure ramp disable near Earth or become part of a principled tone curve.
- **Validation**: known asterisms (Orion, Pleiades) + magnitude-ladder spot checks from the Earth pose; the `earth-surface` perf scenario pose is a ready-made vantage.
