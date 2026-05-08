# Mobile Experience — UX Spec

**Status:** Draft (2026-05-08)
**Owner:** @rulkens
**Depends on:** [`../vision/00-product-vision.md`](../vision/00-product-vision.md), [`../shells/00-shell-overview.md`](../shells/00-shell-overview.md), [`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md)
**Sibling specs:** [`01-tour-ui-controls.md`](01-tour-ui-controls.md) (when written), [`04-text-overlay.md`](../rendering/04-text-overlay.md)

## 1. Goal

The cosmic zoom must complete on a **$300 Android phone** — concretely, something like a Samsung Galaxy A15 or Motorola Moto G Power (2024): mid-tier integrated GPU (Mali-G57 / Adreno 619 class), 4 GB RAM, 6.5" 1080p display, on a 4G LTE connection with ~10 Mbps down. This is success criterion 4 of the product vision and the gating constraint for "outreach" use cases — a science teacher pulling skymap up on a student's phone, a HackerNews reader on the bus.

The bar is not "looks identical to desktop." The bar is **the tour completes end-to-end without freezing, crashing, or skipping shells**, and the user comes away with the same *narrative* understanding of cosmic scale that a desktop user got. Visual fidelity degrades; story does not.

This spec is the **single source of truth for mobile concerns**. Other specs may mention mobile in passing; when they do, they defer here. In particular, the per-shell mobile-fallback table in [`../shells/00-shell-overview.md`](../shells/00-shell-overview.md) is an operational fallback for *data load failures*; this document's per-shell table (§4) is the *baseline mobile rendering plan*, applied unconditionally on mobile devices regardless of network outcome.

## 2. Touch interaction patterns

The desktop tour assumes a keyboard (space = pause, escape = exit) and a mouse (hover for tooltips, click for "more info"). None of that survives on a touchscreen. The mobile interaction set is **four gestures, no chrome**:

| Gesture | Action | Notes |
|---|---|---|
| Single tap (anywhere on canvas) | Pause / resume | Mirrors desktop space-bar. Tap on UI buttons remains UI-only — single-tap-to-pause is canvas-only. |
| Double tap | Exit tour, return to free-fly | Mirrors desktop escape. 350 ms tap-tap window. |
| One-finger drag (while paused) | Pan / orbit camera | Reuses existing `OrbitControls` touch path; only enabled when paused, so the user can't accidentally derail the cinematic. |
| Two-finger pinch (while paused) | Dolly in/out | Same. Pinch is also disabled during play to keep the camera path authoritative. |

**Why disable pan/pinch during playback?** Because the tour camera is choreographed at a log-scale constant speed (per [`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md)) and competing with user input mid-flight produces nausea-inducing jitter on a small screen. The "pause to explore" model from design Principle 4 maps cleanly: tap to stop the camera, then pan freely; tap again to rejoin the path with a brief re-easing.

**Edge case — accidental tap during loading.** Between shells, while a beat is fading, taps are ignored. Otherwise an impatient user tapping the screen during the 200 ms crossfade would trigger pause inside a transition, leaving the camera in an undefined state.

## 3. Layout

Mobile viewports range from 360×640 (older Android) to 430×932 (modern iPhone Pro Max). Two principles:

- **Bottom-anchored overlay copy.** The desktop layout puts the cinematic prose centred-bottom of the viewport. On mobile we keep the bottom anchor but pad it by `env(safe-area-inset-bottom) + 24px` so the text never sits behind the iOS home indicator or under the Android navigation gesture bar.
- **Reflow, don't truncate.** The desktop overlay caps at ~480 px wide (a comfortable 60-character line). On mobile the overlay takes `calc(100vw - 32px)` and reflows. Body font drops from `18px / 28px line-height` to `15px / 22px line-height`. Headline drops from `28px` to `22px`.

The "Take the tour" button (lower-right on desktop) moves to **lower-centre** on mobile — thumb-reachable, minimum 44×44 CSS pixel hit area per Apple HIG and Material accessibility guidance. The replay button after the tour ends takes the same position.

The MSDF world-anchored labels (per [`../rendering/04-text-overlay.md`](../rendering/04-text-overlay.md)) keep their world positions but multiply `pixelSize` by `0.85` on mobile — small screens don't tolerate 18 px labels well at 6.5" viewing distance. This is one number in `shellLabels.ts`, gated by a `isMobile` flag from a media-query hook.

No notch / dynamic-island handling is needed beyond the safe-area-inset CSS — the canvas is full-bleed and notches just occlude a small corner of star field, which is acceptable.

## 4. Per-shell mobile fallbacks

These are the **default mobile render plans**, applied on every mobile session regardless of data-load outcome. They are *additive* with the load-failure fallbacks in [`../shells/00-shell-overview.md`](../shells/00-shell-overview.md): if mobile shell 6 also fails to load, you skip the X-ray volumetric *and* fall back to cluster centres only.

| # | Shell | Mobile plan | Why |
|---|---|---|---|
| 1 | Solar System | **Skip** the live render; show a single static composite photo (Sun + planet silhouettes against orbit traces) with the same overlay caption for the same beat duration | Ray-traced Sun + per-planet billboards is the most fragment-shader-heavy shell relative to its visual payoff at small screen size |
| 2 | Stellar Neighborhood | Lower star count (50k → 8k); skip kPerZ trail rendering | Gaia DR3 cut already small, but star pass is fillrate-bound |
| 3 | Milky Way | Use the impostor's lowest LOD (1024×1024 disc texture, no parallax layering) | Existing fallback, just always-on for mobile |
| 4 | Local Group | Render MW + M31 + M33 + LMC + SMC + 8 named dwarfs only; skip the 50-dwarf long tail | Dwarf "fuzzy" renderer is alpha-blended and overdraw-heavy |
| 5 | Local Sheet | **Full** — galaxy points are cheap, group-colouring is a single attribute | This is core skymap; mobile already handles it |
| 6 | Virgo Supercluster | **Skip** the X-ray volumetric pass; render a flat 2D halo sprite at each cluster centre | Volumetric ray-march is the single most expensive pass in the tour |
| 7 | Laniakea | **Skip** the DM density volumetric; render points + ~30 representative flow-vector arrows | Same reasoning as shell 6, plus the volume texture itself is ~30 MB |
| 8 | Cosmic Web | **Full** — this is existing skymap rendering | Native to the engine |
| 9 | CMB | Lower-resolution JPEG (1024×512 equirect, ~200 KB) instead of the desktop 4096×2048 (~3 MB) | Texture upload + sphere fragment shader both win |

Two patterns recur. The volumetric passes (shells 6 and 7) are categorically too expensive on mobile mid-tier GPUs; we substitute flat sprites that read as the same *concept*. The dataset-heavy shells (2, 4) get aggressive subsampling — the user can't visually distinguish 50k vs 8k stars on a 6.5" screen, so the larger count is wasted bandwidth and fillrate.

## 5. Bandwidth strategy

A 4G connection at 10 Mbps delivers ~1.2 MB/s. The user has ~30 s of patience before the tour starts. Budget: **~36 MB of total preload before "Take the tour" is enabled.**

The pre-load policy on desktop is "fetch every shell concurrently when the user clicks the tour button" (per [`../shells/00-shell-overview.md`](../shells/00-shell-overview.md) §Per-shell data lifecycle). On mobile we split the shells into two cohorts:

- **Eager (preload before button enabled):** shells 1, 2, 3, 4, 5, 6, 8. Each is <10 MB on its mobile-fallback variant; combined ~25 MB. Loads in ~20 s on 4G.
- **Lazy (load while previous shell plays):** shells 7 (Laniakea, ~12 MB after volumetric removed) and 9 (CMB, ~200 KB). Shell 7's data starts fetching when the user enters shell 5; shell 9 starts when the user enters shell 7.

If a lazy shell isn't ready when its beat begins, the tour shows a small "loading next view…" indicator (a 2-second bottom-anchored text fade-in) and pauses the camera at the shell boundary until ready. This is the same loading-pause behaviour as desktop, just much more likely to fire.

The mobile build is also more aggressive about **bin-file tier selection** — the runtime `cloudLoader` always requests `*-small.bin` variants on mobile (`small` ≈ 50% of `medium`'s point count). The tier flag is a single boolean checked at `dataUrl()` resolution time.

## 6. Memory management

A 4 GB Android device has perhaps 1.5–2 GB available to the browser tab before the OS starts killing background pages. Each shell's GPU buffers and CPU-side decoded data combined are 5–40 MB; nine shells held in RAM is borderline.

Policy: **on mobile, eagerly transition shells from `IDLE` to `UNLOADED` after the camera has passed them by more than one shell boundary.** When the user is in shell 5, shells 1–3 are unloaded. If the user pauses and free-flies back inward, the shell re-fetches with a "loading…" indicator (cached in the browser's HTTP cache, so usually fast, but not guaranteed).

This is more aggressive than desktop, where shells stay `IDLE` for the whole session. The trade-off — occasional re-fetch on backward navigation — is preferable to mid-tour OOM kill, which on Android Chrome silently crashes the tab.

The image atlas (existing `textureAtlas.ts`) shrinks from 2048×2048 to 1024×1024 on mobile, halving the famous-galaxy thumbnail count from 256 slots to 64. This is fine; mobile users rarely zoom close enough during the tour to notice.

## 7. Battery and thermal

A WebGPU canvas pinned at 60 fps drains a modern phone in ~45 minutes and gets the chassis hot enough that the SoC throttles within ~5 minutes — at which point the framerate collapses anyway. Two mitigations:

- **Cap at 30 fps on mobile.** The tour's camera motion is slow ease-in-out cubic; the difference between 30 and 60 fps is imperceptible for cinematic motion. Halving the frame rate roughly halves GPU power draw.
- **At end of tour, drop to render-on-demand.** The existing `renderScheduler` does this anyway; on mobile we additionally release the WebGPU canvas's `requestAnimationFrame` loop entirely and only rebind on user input. This lets the device cool while the user reads the "Replay tour" button.

The 30 fps cap is implemented by gating `requestAnimationFrame` callbacks — no special API needed; the engine just no-ops every other frame on mobile.

## 8. Browser compatibility

WebGPU on mobile is **just barely** viable in 2026:

- **iOS Safari 16+** ships WebGPU behind a flag in 16, on by default in 17 (released Sep 2023). Most iPhones from iPhone XS onward are eligible; older iPhone 8 / SE first-gen are excluded.
- **Android Chrome 113+** (May 2023) ships WebGPU on devices with supported drivers. Practically: most 2022+ Android devices with Adreno 600+ or Mali-G57+ GPUs work; older or off-brand GPUs fall back.

**Recommendation: detect WebGPU support, and if absent, refuse to start the tour gracefully.** The user sees a single line of copy:

> *Best experienced on a desktop browser. Your device doesn't support WebGPU yet.*

…with a "Browse the universe →" link that loads the existing free-fly mode in WebGL2 (which already works). No half-broken tour, no WebGL2 cosmic zoom port — that would double the rendering codebase for a shrinking audience. The free-fly fallback exists today; we lean on it.

The detection is `'gpu' in navigator && await navigator.gpu.requestAdapter() !== null`, run once at boot. The result gates the visibility of the "Take the tour" button.

## 9. Test devices

The team should physically test on at least three devices spanning the support range:

- **Low end:** Samsung Galaxy A15 5G or Motorola Moto G Power (2024) — 4 GB RAM, mid-tier integrated GPU, 1080p 6.5" display. This is the gating device.
- **Mid range:** Google Pixel 7a or Samsung Galaxy A54 — 8 GB RAM, Tensor G2 / Exynos 1380 class. Should run the tour at full mobile-fallback quality without thermal issues.
- **iOS:** iPhone 12 mini (the smallest viewport modern iPhone) and iPhone 15. The mini is the worst-case for layout reflow; the 15 confirms the Safari 17 path.

Real-device testing is non-negotiable — Chrome DevTools' device emulation does not reproduce GPU throttling, real network jitter, or touch-event timing.

## 10. Test criteria

The mobile experience is shippable when:

1. The tour runs end-to-end on the gating Galaxy A15 over a *throttled* 10 Mbps / 80 ms RTT network without freezing, crashing, or visibly skipping a shell beat.
2. Average measured framerate stays at ≥27 fps (90% of the 30 fps cap) across all nine shells.
3. Total session memory (Chrome DevTools "Memory" tab) stays below 800 MB at peak.
4. Battery draw measured over a single 90-second tour stays below 4% on a fully charged 4000 mAh battery.
5. The double-tap-to-exit gesture works reliably (>95% recognition rate) across at least 20 manual test runs per device.
6. The WebGPU-absent fallback message displays correctly on Android Chrome with WebGPU disabled via flags.

## 11. Open questions

- **Mobile-only shorter tour?** The 90 s desktop tour at 30 fps on mobile is still 90 s; the user is not bored faster, but the device is hotter. Do we want a "Mobile express tour" that compresses to 60 s by skipping shells 1, 6, 7 entirely (the three with mobile downgrades anyway)? Pro: friendlier on thermals and bandwidth. Con: a second tour script doubles QA surface and makes the shareable 30-s clip device-dependent. **Recommendation:** ship a single tour for v1; revisit if we see high mid-tour drop-off in mobile session telemetry.
- **Landscape vs portrait.** All mobile design here assumes portrait. Landscape works (the canvas is full-bleed) but the bottom-anchored text overlap with the chin / safe-area changes. Do we lock to portrait during the tour? **Recommendation:** allow both, test landscape, accept that landscape is a secondary use case.
- **Tablets (iPad, Galaxy Tab).** A 12.9" iPad Pro is closer to a laptop than a phone in capability. Do we treat tablets as desktop or mobile? **Recommendation:** treat as mobile by default (touch-first interactions), but use the desktop tier for data and rendering — gate on `'ontouchstart' in window` for interactions, on `navigator.deviceMemory >= 6` for render tier.
- **Accessibility on mobile.** Screen-reader users on iOS VoiceOver — does the tour overlay text get read? Does pause/resume have an alternative? Out of scope here, defer to a future `06-accessibility.md`.

## 12. Files touched

New files (created by this work):

- `src/services/tour/mobileDetect.ts` — `isMobile()`, `supportsWebGPU()`, `recommendedTier()` helpers.
- `src/components/MobileWebGPUFallback.tsx` — the "Best on desktop" copy + free-fly link.
- `tests/services/tour/mobileDetect.test.ts`.

Existing files modified:

- `src/services/engine/cloudLoader.ts` — gate tier selection on `isMobile()`.
- `src/services/tour/shellLabels.ts` — multiply `pixelSize` by `0.85` on mobile.
- `src/services/tour/script.ts` (when it exists) — per-shell `mobilePlan` field driving §4 fallbacks.
- `src/services/gpu/textureAtlas.ts` — mobile-gated 1024×1024 size.
- `src/services/engine/renderScheduler.ts` — 30 fps cap on mobile; release rAF loop at tour end.
- `public/data/*-small.bin` — already exist for some sources; ensure all shell-relevant catalogs have a `small` variant.
- `src/components/TourButton.tsx` (when it exists) — disable when WebGPU absent; bottom-centre layout on mobile.

Cross-references:

- [`../vision/00-product-vision.md`](../vision/00-product-vision.md) — success criterion 4.
- [`../shells/00-shell-overview.md`](../shells/00-shell-overview.md) — load-failure fallback table, separate from this spec's mobile-default table.
- [`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md) — tour clock, ease functions.
- [`../rendering/04-text-overlay.md`](../rendering/04-text-overlay.md) — MSDF label sizing, DOM overlay layout.
