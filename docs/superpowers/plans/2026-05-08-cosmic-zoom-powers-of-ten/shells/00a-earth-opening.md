# Shell 0a — Earth Opening (and Closing)

**Status:** Proposed (2026-05-09 amendment) — see [`decisions/0010-earth-opening.md`](../decisions/0010-earth-opening.md).
**Tour timing:** T+0:00 to T+0:22 (open) and T+1:38 to T+1:48 (close).
**Numbering:** "0a" because it sits before the Solar System (Shell 1) — it is a *pre-shell* in the sense that the camera is not yet in Solar System space; we are inside Earth's atmosphere.

## Overview

The user clicks "Take the tour." The first thing they see is **a sunset.** Orange sky, dim ground silhouette, the brightest stars beginning to emerge. Over the next 8 seconds the sky darkens, more stars appear, the Milky Way band fades in overhead, and the camera tilts up. Then the camera lifts off the surface, Earth curves away below, and the camera is in space.

This shell is the most emotionally important moment of the tour. It is the only beat that uses lived experience the user already has — every viewer has watched a sunset and seen stars come out. We are triggering that memory, not teaching new content.

The tour close mirrors this: we return through the shells and land back on Earth at sunrise.

## Visible elements

### Open beat (T+0:00 → T+0:22)

| Time | What's on screen |
|---|---|
| T+0:00 | Orange sunset sky gradient. Black ground silhouette across bottom 25% of frame. Sun visible as a soft disc just above the western horizon. |
| T+0:01 | Venus appears low in the west (the most visible "evening star" trigger). |
| T+0:03 | Sky color shifts: orange → deep red → indigo. Sirius rises in the east. |
| T+0:05 | Sky is now mostly dark blue. Vega visible high in the sky. Maybe 50 brightest stars visible. |
| T+0:07 | Milky Way band fades up across the overhead sky as a soft luminous river. ~500 stars visible. |
| T+0:08 | Camera tilts up. Frame is now ~80% sky, 20% ground. Sky is fully dark. Stars at full Gaia DR3 density. |
| T+0:11 | Camera lifts off the ground. The black ground silhouette curves into a horizon arc. |
| T+0:14 | Earth's atmospheric blue rim becomes visible at the horizon (we're looking *back* at the atmosphere from low orbit). |
| T+0:16 | Earth begins to be a disc rather than a surface. Continents resolve briefly (low-alpha Blue Marble overlay). Day/night terminator visible. |
| T+0:18 | Earth is now a small disc. Sun visible to the side, planets begin to fade up on their orbits. |
| T+0:22 | Earth becomes one of the planets. Camera is now at Solar System scale; Shell 1 takes over. |

### Close beat (T+1:38 → T+1:48)

| Time | What's on screen |
|---|---|
| T+1:38 | Camera approaches Earth (the reverse of T+0:18). Earth grows from a small disc. |
| T+1:40 | Camera enters the atmosphere — atmospheric blue rim grows. Continents resolve. |
| T+1:42 | Camera lands at ground level. Looking east. Pre-dawn sky: deep indigo with a hint of color at the horizon. Stars still visible. |
| T+1:44 | Sun rises. Sky shifts: indigo → red → orange. Stars fade. |
| T+1:46 | Full sunrise. **TOUR COMPLETE** overlay over the lit sky. |
| T+1:48 | "Replay" button visible; cursor reappears; cinematic ends. |

## Data requirements

Three data assets, all small. Detailed in [`data/11-earth-textures.md`](../data/11-earth-textures.md):

1. **Blue Marble Earth diffuse** — 4096 × 2048 equirectangular JPEG. NASA Visible Earth, public domain. ~5 MB committed to repo.
2. **Earth night-side lights** — 4096 × 2048 equirectangular JPEG of city light emission. NASA Visible Earth. ~3 MB. Used for the brief continents-resolve beat at T+0:16 to suggest the day/night terminator.
3. **Atmosphere LUT (precomputed scattering)** — 256 × 64 RGBA texture. Generated once at build time; ~64 KB. See [`rendering/08-atmosphere.md`](../rendering/08-atmosphere.md) for the precompute method.

The Gaia DR3 starfield from [`shells/02-stellar-neighborhood.md`](02-stellar-neighborhood.md) is **reused** for the night-sky stars. The same dataset, viewed from a different scale + different perspective. No new star data.

## Visual design

### Color palette (open, in order)

| Beat | Sky top | Sky horizon | Ground |
|------|---------|-------------|--------|
| T+0:00 | `#3a4a6e` (deep blue) | `#e07a3a` (orange) | `#0a0a0a` (near-black) |
| T+0:03 | `#1c2540` (indigo) | `#7a3838` (deep red) | `#050505` |
| T+0:05 | `#0a1230` | `#22182a` | `#020202` |
| T+0:08 | `#03050d` (deep night) | `#080812` | `#000000` |

The transitions between rows are interpolated continuously — not stepped. The color values come from a precomputed atmosphere LUT keyed by (sun-elevation-angle, view-direction). See `rendering/08-atmosphere.md` for the parametric form.

### Star fade-in curve

Stars fade in as the sky brightness drops below their apparent magnitude. A star of magnitude `m` becomes visible when sky brightness `B` falls below threshold `B_crit(m)`. Brightest stars appear first (Sirius, Vega at T+0:03); progressively dimmer stars over the 5 seconds following. By T+0:08 the full Gaia DR3 (~7,500 stars within 50 pc) is visible. The Milky Way band — rendered as a low-frequency texture, not as resolved stars — fades in on its own curve and is fully visible by T+0:07.

### Camera path

Author-chosen to maximize the Milky Way visibility:
- **Latitude:** 30°N (subtropical — the latitude where the Milky Way passes near zenith at the chosen evening hour).
- **Date:** July (Northern hemisphere summer; Sagittarius / galactic center overhead in the evening sky).
- **Time:** ~30 minutes after sunset.
- **Initial heading:** west-southwest (so the Sun is in the right of the frame; viewer sees the most colorful sky).
- **Tilt:** starts at horizon (look straight ahead); over T+0:00 → T+0:08 tilts up to 75° elevation.

The camera does NOT pan during the surface beat. It tilts in place. Panning would suggest "you can look around," which the tour does not allow.

### Lift-off path

T+0:11 the camera begins moving upward at a non-linear acceleration:
- 0–5 km altitude in 1 s (fast — atmospheric layer)
- 5–500 km in 2 s (low Earth orbit; atmosphere blue rim becomes visible)
- 500 km–100,000 km in 4 s (Earth becomes a disc)
- 100,000 km–1 AU in 4 s (Earth shrinks to a point; we transition to Shell 1)

The acceleration curve is exponential — log-scale constant velocity, matching the rest of the tour's pacing.

## Render pipeline

Three new render passes, run in order before the existing shell render passes:

1. **Atmosphere pass** (`atmosphereRenderer.ts`) — full-screen post-process. Samples the atmosphere LUT by view direction and sun direction. Renders the sky gradient. ~0.5 ms.
2. **Ground silhouette pass** (`groundRenderer.ts`) — a single black quad below the horizon line. Trivial. ~0.1 ms.
3. **Sky-stars pass** — reuses `starRenderer.ts` from Shell 2 with an alpha multiplier from `skyBrightnessGate(B, m)`. Stars below threshold are alpha=0. ~1 ms (most of the cost is the Gaia point upload, which is shared with Shell 2).
4. **Earth-as-sphere pass** (`earthRenderer.ts`) — single textured sphere with day/night blend. Active during T+0:14 → T+0:22 only. ~0.5 ms.

Total Shell 0a budget: **~2 ms per frame.** Well under the 16 ms total frame budget.

The MSDF label pass runs as usual; the only label this shell uses is the lower-third "TOUR BEGINS · 90 SECONDS" overlay.

## Transitions

### Into the shell

There is no "in-transition" — this is the first frame of the tour. The cinematic starts in shell 0a. Immediately before T+0:00 the React shell hides the UI panel and the canvas dims to the sunset palette over 0.3 s. This is part of the "tour begins" UI state, not part of the shell.

### Out to Shell 1 (Solar System)

At T+0:18 → T+0:22, Earth shrinks to a planet-sized disc. The atmosphere pass fades to alpha=0 over T+0:18 → T+0:20 (we have left the atmosphere). The ground silhouette pass turns off at T+0:14 (we are above the horizon). The Earth-as-sphere pass continues into Shell 1, where it becomes one of Shell 1's planet billboards.

The transition is continuous — no hard cut. The camera is the constant; the rendered elements crossfade.

### Into the close (T+1:38)

Reverse of the above. Camera approaches Earth, atmosphere fades up, ground silhouette appears at T+1:42 (camera lands).

### Out of the close

There is no out-transition. The cinematic ends. The user is in the wide-angle default view; the React UI returns; the tour ends.

## Performance budget

- **Atmosphere pass:** 0.5 ms (single full-screen post-process, samples a small LUT).
- **Ground:** 0.1 ms (one quad).
- **Sky stars:** 1 ms (reuses Shell 2 buffer; alpha-gated).
- **Earth sphere:** 0.5 ms (single textured sphere, only during T+0:14 → T+0:22 and T+1:38 → T+1:42).
- **Total:** ~2 ms during the bulk of the shell; ~2.5 ms during the Earth-as-disc frames.

Well within the 16 ms frame budget. No risk.

## Mobile fallback

The atmosphere shader is the only piece that might be expensive on low-end mobile GPUs. Fallback strategy:

- **Tier A (modern Android, all iOS):** Full atmospheric shader. Looks correct.
- **Tier B (older Android, integrated GPUs):** Pre-rendered video-loop fallback. Bake the open and close as 8 + 6 second MP4 / WebM clips at 1080p; play them on a `<video>` element behind the canvas. Static during playback. The user gets the same visual experience; they just lose interactive pause/orbit during the surface beats. Acceptable trade.
- **Tier C (no WebGPU):** Tour is not offered. The standard "Best on a desktop browser" message.

The video fallback is recommended even for Tier A as a feature flag — any GPU hitch during the open is catastrophic for first impressions, and the video path is bulletproof. **Recommendation:** ship Tier A but have the video baked and ready as a one-flag-flip mitigation.

## Open questions

1. **Geographic neutrality.** Choosing 30°N latitude is arbitrary. Southern-hemisphere users will see "their" Milky Way differently. Acceptable: we are not pretending to show the user's specific local sky; we are showing *a* night sky. The overlay copy should not say "your sky" — it can say "the night sky."
2. **Light pollution realism.** A real sunset in 2026 from most populated places shows maybe 50 stars, not 7,500. Should we render with realistic light pollution (loses the wow) or with dark-sky conditions (the wow, but mildly fictional)? **Recommendation:** dark-sky. We are showing what the sky *is*, not what most viewers can see from their backyards. This is the same compromise Cosmos makes.
3. **Aircraft / satellites.** A real night sky has moving aircraft and satellites. Adding them would be cute but is a different scope. **Recommendation:** skip in v1.
4. **Audio.** This shell is the strongest candidate for ambient audio (a faint wind sound, a sustained low pad). The tour is otherwise silent. If audio ever lands, it lands here first.
5. **Date/time stamp.** Should we show "evening of July 14, 30°N latitude" as a small caption? Adds factual grounding but also visual noise. **Recommendation:** no caption; the date is in the credits if anyone asks.

## Test criteria

- The first 8 seconds work as a 1080p loop on social media — viewer can identify "sunset, stars emerging, Milky Way overhead" without context.
- A first-time visitor reports an emotional reaction within 5 seconds (smile, lean-in, "oh wow"). Validated by usability testing.
- Atmosphere shader frame time stays below 1 ms on a 2024 Mac mini M-series.
- The transition from surface to space (T+0:11 → T+0:18) is continuous; no perceptible cut, no popping.
- Sunrise close lands within 100 ms of T+1:48 across all browser/GPU combinations.
- Mobile video fallback plays within 200 ms of "Take the tour" click.

## Files this touches

New:

```
data/raw/textures/
  earth-blue-marble-4k.jpg              committed
  earth-night-lights-4k.jpg             committed
  atmosphere-lut.png                     committed (build artifact, regenerated by build script)

src/services/gpu/
  atmosphereRenderer.ts
  groundRenderer.ts
  earthRenderer.ts
  shaders/atmosphere.wesl
  shaders/earth.wesl

src/services/engine/shells/
  shell0aEarthOpening.ts                 ShellRenderer instance for the open + close beats

src/services/engine/tour/
  tourScript.ts                          (existing, +amended) — adds open/close beats

tools/
  buildAtmosphereLut.ts                  one-time precompute (run only when scattering coefficients change)

tests/services/gpu/
  atmosphereRenderer.test.ts
  earthRenderer.test.ts
```

Modified:

```
docs/superpowers/plans/2026-05-08-cosmic-zoom-powers-of-ten/vision/01-narrative-script.md
docs/superpowers/plans/2026-05-08-cosmic-zoom-powers-of-ten/decisions/0006-information-pacing.md
docs/superpowers/plans/2026-05-08-cosmic-zoom-powers-of-ten/shells/00-shell-overview.md (add row 0a)
docs/superpowers/plans/2026-05-08-cosmic-zoom-powers-of-ten/data/00-data-sources.md (add earth-textures row)
docs/superpowers/plans/2026-05-08-cosmic-zoom-powers-of-ten/FILES.md (link new files)
docs/superpowers/plans/2026-05-08-cosmic-zoom-powers-of-ten/README.md (note the amendment)
src/services/engine/scale/shellRendererRegistry.ts  (register shell 0a)
public/_headers (cache headers for new texture assets)
```
