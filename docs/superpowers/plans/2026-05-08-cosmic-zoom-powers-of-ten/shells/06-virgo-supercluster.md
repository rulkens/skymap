# Shell 6 — Virgo Supercluster

**Status:** Initial design draft (2026-05-08).
**Native unit:** Mpc.
**Visible volume:** 10–500 Mpc.
**Origin anchor:** M87 (the central giant elliptical of the Virgo cluster) — see [Open questions](#13-open-questions) for the alternative of using the heliocentric origin.
**Tour timing:** `T+0:56` to `T+1:06` (10 s — the second-longest shell after Laniakea).
**Hero data:** the existing GLADE / 2MRS galaxy point cloud + the ROSAT All-Sky Survey diffuse X-ray map + the Abell cluster catalog.
**Hero visual:** galaxy points densifying into the Virgo cluster, M87 marked at the centre, a soft red volumetric halo of intracluster X-ray emission, and a directional arrow pointing toward the Great Attractor.

Related upstream:
- Narrative beat: [`../vision/01-narrative-script.md`](../vision/01-narrative-script.md) section "SHELL 6 — VIRGO SUPERCLUSTER".
- Scale & projection plumbing: [`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md).
- Position in shell stack: [`./00-shell-overview.md`](./00-shell-overview.md).

---

## 1. Overview

Shell 6 is the **first shell where skymap shows what skymap is already best at — and then changes the framing.** Up to here the tour has been pulling back through scales the user has personal intuition for (planets, stars, our galaxy, our local clump). Shell 6 is where the user crosses the line from "things humans named because we could see them" to "things humans named because they show up in surveys." The Virgo Supercluster is the first structure on the tour the user almost certainly cannot picture.

The shell has two jobs:

1. **Make the user feel they ARE inside the Virgo Supercluster, not visiting it.** Of the ~1300 known Virgo cluster member galaxies in our cross-matched data, roughly 720 (~55 %) live in our existing point cloud. We are not pointing at Virgo; we are *part of its content.* The visual must communicate this — the camera moves outward through galaxies that were already on screen in shell 5, and they suddenly cohere into a cluster around M87. The reveal is a re-framing, not a new dataset.
2. **Introduce the first non-point visual.** Every shell so far renders the same primitive (point, billboard, disk impostor). Shell 6 is the first to add a **volumetric** element: the X-ray halo around Virgo. This is the visual signature of *gas at 30 million Kelvin*, and it is the single most photographically iconic feature of a galaxy cluster. It also primes the user for shell 7's much more elaborate Cosmicflows-4 dark-matter volume; if the X-ray halo doesn't read clearly here, Laniakea's flow field won't either.

The shell's secondary role is to **set up the Great Attractor.** A directional arrow, anchored to the supergalactic plane and pointing at the Norma cluster region, foreshadows the Laniakea reveal. The user should leave shell 6 thinking "wait, why are we falling that way?"

## 2. Visible elements

In rendered z-order (back to front):

- **Background galaxy point cloud.** The existing GLADE + 2MRS catalog at full density. Within the visible volume (10–500 Mpc from M87) this is roughly 1.2–1.8 M points; outside it the cloud is faded out by the per-shell crossfade. No change to the point shader; only the shell-relative coordinate transform is new.
- **Cluster densification.** Within ~3 Mpc of M87, point density spikes by a factor of ~50× over the field. This is *not* a re-rendering; it is the same point cloud plotted in cluster-relative coordinates. The visual punch comes from the X-ray halo overlaid on top of an organic, real-data overdensity.
- **M87 marker.** A small, pulsing yellow-white billboard at M87's catalog position (RA 12h30m49.4s, Dec +12°23'28"). The pulse is gentle — `0.85 + 0.15 * sin(t * 2π / 1.6)` — and exists primarily to make the cluster centre visually obvious for the 4 s the camera is closest. Sub-pixel size at start and end of shell; ~6 px at peak approach.
- **Virgo X-ray halo.** A translucent red volumetric blob centred on M87, with a soft Gaussian falloff, peak optical depth ~0.45, scale radius ~0.6 Mpc, hard cutoff at ~3 Mpc. See section 7 for the falloff curve.
- **Surrounding cluster centres.** Soft yellow-white markers at the other cluster centres in the visible volume — Fornax (~20 Mpc, below the SGP), Centaurus (~50 Mpc, near the GA direction), Hydra (~50 Mpc), Coma at the very edge if the camera frames it (~100 Mpc). These markers are smaller and dimmer than M87's; they exist to give the user *peripheral* depth cues.
- **Subtle inter-cluster filaments.** Short, low-opacity line segments hinting at the filamentary skeleton between cluster nodes. Reuses the existing DisPerSE filament renderer at very low alpha (~0.08) and only segments wholly inside the visible volume.
- **Great Attractor direction arrow.** A 2D screen-space arrow + small text label, anchored to the supergalactic plane direction `l ≈ 325°, b ≈ −7°` (Norma cluster region). Fades in at `T+1:03` and persists through the shell-7 transition. This is the foreshadowing element.

Excluded on purpose: thumbnail quads (the existing per-galaxy WebP atlas) — the camera is too far out for them to be legible, and the X-ray halo is the visual focus.

## 3. Data requirements

This shell consumes three datasets, two of which already exist in the runtime.

- **GLADE + 2MRS galaxy point cloud.** Already loaded for the wide view. Reused unchanged — the cluster densification is a property of the data, not new code.
- **Abell + Virgo cluster member catalog.** New asset slot. Provides cluster centre positions, cluster radii (R200 or estimate), and member-galaxy lists for the cross-match that produced the "720 of 1300" count. See [`../data/06-cluster-catalogs.md`](../data/06-cluster-catalogs.md) for source URLs (Abell 1958/1989, Virgo VCC, NORAS), ingestion scripts, and the binary format additions to `src/data/pointCloudFormat.ts` (a new `clusters.bin` sidecar file with a 32-byte-per-cluster layout).
- **ROSAT All-Sky Survey diffuse X-ray map.** New asset slot. We need the 0.1–2.4 keV diffuse map as an all-sky HEALPix-projected texture, plus per-cluster X-ray luminosities and characteristic radii so we can fit a 3D Gaussian to each. See [`../data/08-rosat-xray.md`](../data/08-rosat-xray.md) for the FITS-to-binary conversion and the per-cluster halo-parameter table format. The eROSITA alternative is discussed there and in [Open questions](#13-open-questions).

The new data weighs roughly:
- `clusters.bin`: ~30 KB (~1000 clusters × 32 bytes).
- `xrayHalos.bin`: ~6 KB (per-cluster halo parameters for the ~150 X-ray-detected clusters in the visible volume).
- `rosatSky.webp`: ~400 KB (a downsampled Mollweide projection — only used as a fallback or for the screen-space arrow's background tint, not the primary halo render).

Total new payload: under 500 KB. Cheaply preloaded.

## 4. Visual design

The shell's visual language is **calm, dense, slow.** Compared to shell 5's flat-pancake reveal, shell 6 is *spherical and warm*. Two design pillars:

**Pillar A — The X-ray halo as an emotional anchor.** The halo must read as *gas, not paint.* This means:
- Soft Gaussian falloff (not a hard sphere or a billboard texture).
- A red-orange tint with a slight magenta core, mimicking how X-ray false-colour images are typically rendered in popular astronomy media. Hex centres approximately `#ff5a3c` at the core, `#a01818` at the edge.
- Density-additive blending — the halo *adds* light to whatever is behind it, never subtracts. Galaxy points behind the halo become visibly warmer.
- A subtle low-frequency noise modulation (Perlin or a precomputed 3D texture) at ~5 % amplitude, so the halo is not a perfect ellipsoid. Real intracluster medium is turbulent.

**Pillar B — Cluster-centre markers as ranked typographic peers.** The markers are not all the same. Virgo (M87) is largest and pulses; Fornax, Centaurus, and Hydra are smaller, static, and dimmer. Coma — if visible — is dimmer still. This visual hierarchy is the user's first lesson in "clusters have different masses" without any text.

**Pillar C — Filaments as connective tissue, not skeleton.** The DisPerSE filament render is reused but at an alpha low enough that the user perceives them as "hints of structure" rather than a defined wireframe. The intent is for the cosmic web reveal in shell 8 to be the moment filaments become explicit; here they are subliminal.

**Colour palette summary:**
- Galaxy points: existing palette (cool blue-white through warm yellow-white), unchanged.
- X-ray halo: `#ff5a3c` core → `#a01818` outer → transparent.
- Cluster markers: `#fff2c8` (warm white).
- Filaments: `#7a8bc4` (desaturated blue-violet) at alpha 0.08.
- Great Attractor arrow: `#ffd070` (sodium yellow) — distinct from everything else so it draws the eye.

## 5. Camera path

The camera spends the shell doing one slow approach and one slow withdrawal. No orbit, no spin — the visual story is driven by what fades in, not by camera motion.

| Time | State | Position (M87-relative, Mpc) | LookAt | FoV |
|------|-------|------------------------------|--------|-----|
| `T+0:56` | Entry from Local Sheet shell | `(0, 0, +60)` (60 Mpc out, on the supergalactic +Z axis) | M87 | 35° |
| `T+0:59` | Approach midpoint | `(0, 0, +25)` | M87 | 30° |
| `T+1:01` | Closest approach | `(+2, +1, +12)` (slight off-axis to give 3D parallax) | M87 | 28° |
| `T+1:03` | Pull-back begins; GA arrow fades in | `(+5, +2, +30)` | M87 | 38° |
| `T+1:06` | Exit to Laniakea | `(+15, +5, +90)` | toward GA direction | 50° |

**Easing:** the camera path is a single continuous Catmull-Rom spline through the five waypoints, with `easeInOutCubic` time warping so the closest-approach beat is perceptually held longer than its 2 s budget. The camera **never crosses the X-ray halo** — at closest approach it is still ~10 Mpc from M87, well outside the 3 Mpc halo cutoff. (This is deliberate: rendering volumetric density from inside a Gaussian blob is a special case we don't want to handle in v1.)

The slight off-axis perturbation at `T+1:01` exists for one reason — to make M87 and the X-ray halo move in mild parallax against the background point cloud, so the user perceives the halo as a 3D object rather than a screen-space sticker.

## 6. Render pipeline

The shell adds **one new render pass** to the existing chain. The composite order (back to front) for shell 6 is:

```
1. sky color clear (black)
2. distant point cloud — galaxies outside the halo region (existing pointRenderer)
3. cluster X-ray volumetric pass        ← NEW
4. near point cloud — galaxies inside the halo region (existing pointRenderer, drawn after the halo so they "punch through")
5. cluster-centre markers (small billboard pass, reusable from M87 marker)
6. inter-cluster filaments (existing filamentRenderer at low alpha)
7. labels (MSDF) — Virgo, M87, Fornax, etc.
8. Great Attractor arrow (screen-space pass)
```

The trick in step 2 vs step 4 is **depth-sorting the point cloud relative to the halo.** Naively rendering all points before the halo causes points inside the halo to vanish under additive blending; rendering them after causes points behind the halo to appear in front. We split the cloud into two draws using a per-instance distance-to-M87 test (already cheap — we have the cluster centre as a uniform). Galaxies within ~6 Mpc of M87 are deferred to the second pass; the rest go first.

### The volumetric pass — two implementation paths

There are two reasonable ways to render the X-ray halo. Both are sketched here; the implementation spike will choose one based on visual quality.

**Option A — Sphere-imposter billboard.** A single quad per cluster, oriented to face the camera, with a fragment shader that evaluates a 3D Gaussian along the view ray analytically (the integral of a Gaussian along a line is also a Gaussian, scaled by the perpendicular distance). This is *extremely cheap* — ~150 quads, one Gaussian eval per fragment. The downside is it doesn't account for occlusion by foreground galaxies *inside* the halo (they always render on top), and the analytic form requires the halo to be spherically symmetric (no axis ratios, no rotation).

```ts
type ClusterHalo = {
  centerMpc: [number, number, number];  // M87-relative
  scaleRadiusMpc: number;                // sigma of the Gaussian
  peakDensity: number;                    // 0..1, drives output alpha at centre
  colorCore: [number, number, number];
  colorEdge: [number, number, number];
};
```

**Option B — True raymarched volume.** A unit cube around each cluster, raymarched with ~32 steps, sampling the Gaussian density at each step. ~150 clusters × 32 steps × maybe 100 K covered fragments → ~500 M fragment samples per frame in the worst case. Manageable on a desktop GPU; tight on mobile. Pays off when we want non-spherical halos (Virgo's X-ray map is mildly elongated along the SGP), occluder integration, or noise modulation.

**Recommendation:** ship **Option A** for v1 and reserve B for a follow-up. The Gaussian-imposter is essentially free and looks correct from the camera distances Shell 6 actually visits. We can revisit if the visual review flags Virgo's elongation as a missing detail.

The volumetric pass uses **additive blending** (`src=ONE, dst=ONE`) into the colour attachment. It writes no depth — galaxies in step 4 use the existing depth state and naturally appear in front of/behind the halo based on their own depth.

Per-shell projection: `near = 1 Mpc`, `far = 1000 Mpc` (per the table in [`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md)). This gives plenty of depth precision for both M87 (~0.0 at centre) and Coma at the back of the visible volume (~100 Mpc out).

## 7. The X-ray halo

The halo is the single most important new visual in this shell, so it deserves explicit math.

**Density profile.** Each cluster halo is a 3D isotropic Gaussian:

```
ρ(r) = peakDensity * exp(-r² / (2 * sigma²))
```

For Virgo we use `sigma = 0.6 Mpc` (consistent with ROSAT's measured X-ray scale radius), `peakDensity = 0.45` in shader units (chosen so the centre saturates at ~80 % opacity given the additive blend). Hard cutoff at `r > 3 * sigma` (~1.8 Mpc, effectively `5*sigma` for very high `peakDensity`) where the contribution is below display threshold; the imposter quad is sized accordingly (~3 Mpc radius).

**View-ray integral.** Because the integral of a Gaussian along a straight line is also a Gaussian (with the perpendicular distance as the variable), the imposter shader can compute the line-of-sight optical depth analytically:

```
tau(d_perp) = peakDensity * sigma * sqrt(2π) * exp(-d_perp² / (2 * sigma²))
```

where `d_perp` is the closest distance from the view ray to the cluster centre. This is cheap — one `exp` per fragment.

**Colour mixing.** The output colour blends `colorCore` to `colorEdge` based on the *fraction* of the integrated density relative to the peak — i.e., where the line of sight is centred on the cluster, we get the warm core colour; where it grazes the edge we get the deep red:

```
mix_t = clamp(tau(d_perp) / max_tau, 0, 1)
out_color = mix(colorEdge, colorCore, mix_t) * tau(d_perp)
```

**Alpha curve.** Output alpha is implicit in the additive blend: `out_color` is added directly into the framebuffer. There is no separate alpha channel. This means the halo's perceived opacity is monotonic in scene brightness — over a black sky it reads as a saturated red blob; over the brighter regions of the cluster it reads as a warm tint over the existing pixels. This is exactly the desired behaviour and is why we chose additive over alpha-blended.

**Subtle noise modulation.** A 3D Perlin noise sample (precomputed into a small `R8` texture, ~64³ = 256 KB) is multiplied into `tau` at ~5 % amplitude. The noise is sampled in halo-local coordinates (so the texture moves with the halo) and gives the volume a subtle non-uniformity that reads as "gas" rather than "decal."

**Per-cluster parameters** are preloaded from `xrayHalos.bin` (see [`../data/08-rosat-xray.md`](../data/08-rosat-xray.md)) and uploaded as a uniform array. With ~150 X-ray-detected clusters in the visible volume this is ~6 KB of GPU memory.

## 8. Cluster identification

Within the 10–500 Mpc visible volume, the clusters we identify (and render with markers + halos) are:

| Cluster | Distance (Mpc) | Marker | X-ray halo? | Visible at closest approach? |
|---------|----------------|--------|-------------|------------------------------|
| Virgo (M87) | 16.5 | large pulse | yes — hero | always |
| Fornax (NGC 1399) | 19 | small | yes (faint) | yes, below frame centre |
| Centaurus (Cen A region for navigation; cluster A3526) | 50 | small | yes (faint) | edge of frame |
| Hydra (A1060) | 50 | small | yes (faint) | edge of frame |
| Norma (A3627) | 65 | small | yes (faint) | only at exit, in the GA direction |
| Coma (A1656) | 100 | dim small | yes (visible due to ICM brightness) | only if camera angle includes it |
| Perseus (A426) | 75 | dim small | yes (visible due to ICM brightness) | usually off-frame in this shell, kept for completeness |

Coma sits right at the boundary of what shell 6 should show — it is nominally a Laniakea-scale structure. We render it because (a) the X-ray halo is bright enough to be legible and (b) it gives the user a peripheral hint of "more clusters out there" that primes shell 7. If visual testing shows Coma overpowers Virgo, we drop it; the renderer just doesn't include it in the cluster list for this shell.

Cen A is interesting because the *galaxy* (Centaurus A, NGC 5128) is in the local sheet at ~3.8 Mpc, while the *cluster* (A3526) is at ~50 Mpc. We render the cluster marker, not the galaxy — the galaxy itself was already a labelled feature in shell 5.

## 9. Labels

Per the MSDF label convention from [`2026-05-07-msdf-labels-design.md`](../../specs/2026-05-07-msdf-labels-design.md), we attach world-anchored labels to the cluster-centre marker positions. Active labels for shell 6:

- **Virgo Cluster** — anchored at M87, fades in `T+0:58 → T+1:00`, persists through shell.
- **M87** — anchored at M87, smaller font, only legible at closest approach (`T+1:00 → T+1:03`); fades out as camera pulls back.
- **Fornax** — anchored at Fornax centre, fades in with Virgo, persists.
- **Centaurus** and **Hydra** — only fade in at closest approach (`T+1:01 → T+1:04`), to avoid label clutter on the entry shot.
- **Coma** — only fades in if the camera's FoV includes it at the pull-back (`T+1:03 → T+1:06`).
- **Great Attractor →** — screen-space text+arrow combo, fades in at `T+1:03` and persists through the shell-7 transition. Anchored to the SGP direction `l = 325°, b = -7°`, projected onto the screen edge if off-frame.

Label LOD: cluster labels use the medium-size MSDF atlas; the GA arrow's text uses the small atlas (it's a peripheral hint, not a primary label). Z-fighting between Virgo and M87 labels at closest approach is avoided by the time-staggered fade-in.

## 10. Transitions

**In (`T+0:55 → T+0:57`).** Crossfade from shell 5 (Local Sheet). At `T+0:55` shell 5's flat-pancake supergalactic plane visualization is at full opacity; over 2 s it fades to zero. Simultaneously, shell 6's X-ray halo around Virgo fades in from zero — Virgo "lights up" red-orange as the user moves outward. The point cloud is shared between shells (same data, different per-shell tint), so the points themselves don't fade; only the structural overlays swap.

The visual moment at `T+0:57` should be: the user sees a galaxy concentration that was already visible in shell 5 *acquire a halo*, and immediately understand "ah, this is a cluster, that red glow is what makes a cluster a cluster."

**Out (`T+1:05 → T+1:08`).** As the camera pulls back, the X-ray halo shrinks (it is in world-space, so this is automatic). At `T+1:05` we begin fading in shell 7's Cosmicflows-4 dark-matter density volume at low opacity. By `T+1:06` the cluster markers have shrunk to small dim points; by `T+1:07` the GA arrow has been replaced by the actual flow-vector field of shell 7, with the same arrow direction in roughly the same screen position (deliberately — visual continuity). The X-ray halo persists at low opacity through `T+1:08` to give the user a "Virgo is still there, embedded in this larger flow" reading, then fades to zero.

The framing trick: **the GA arrow in shell 6 is the seed of the flow field in shell 7.** Same direction, same screen position, same colour. The user perceives it as the same element evolving rather than a new visual.

## 11. Performance budget

Target: **4–6 ms per frame** for the entire shell-6 composite, on the reference desktop machine (M2 Pro / RTX 3060 class).

| Pass | Estimated cost | Notes |
|------|----------------|-------|
| Distant point cloud | 1.8 ms | ~1.5 M points, existing renderer, no change |
| X-ray volumetric (Option A) | 0.4 ms | ~150 imposter quads, full-screen worst case ~80 K covered fragments |
| Near point cloud (within halo) | 0.3 ms | ~5 K points, second draw call with the same renderer |
| Cluster-centre markers | <0.1 ms | ~10 small billboards |
| Filaments | 0.6 ms | existing renderer at lower alpha; same vertex count |
| Labels | 0.3 ms | ~6 active labels via MSDF |
| GA arrow | <0.1 ms | screen-space, single quad |
| Compositor / shell crossfade | 0.4 ms | additional sample of shell 5/7 attachments during transitions only |
| **Total** | **~4 ms steady, ~5 ms during crossfades** | comfortably within budget |

The point-cloud cost dominates. Halo cost is essentially free with Option A; with Option B (raymarched) the budget jumps to ~7 ms, which is why A is the v1 recommendation.

If a frame slips, the first cut is the noise modulation on the halo (saves ~0.1 ms), then the filament render (saves ~0.6 ms), then the near-point-cloud second pass (galaxies inside the halo render in front of it — visually wrong but acceptable as a degradation). The cluster markers and labels are cheap and not candidates for cutting.

## 12. Mobile fallback

Mobile GPUs (Apple A15 / Adreno 730 class) cannot hold the per-frame budget for the volumetric pass at full quality. The fallback drops to:

- **No volumetric halo.** Replaced by a **flat halo overlay**: a screen-space radial gradient billboard centred on M87, additive-blended, with a fixed angular size (~12° at closest approach). This is visually less convincing — it doesn't respond to camera angle and reads more like a "lens flare" than a 3D blob — but it preserves the warm-red-glow-around-Virgo cue.
- **No noise modulation** (drops the 256 KB 3D texture entirely on mobile).
- **No filament render** (the cosmic-web shell 8 drops it too on mobile).
- **No GA arrow noise**: the GA arrow stays as a flat sprite — it was already cheap.

The mobile fallback is gated by a `gpu.tier` runtime detection (existing in [`src/services/gpu/`](../../../../src/services/gpu/)), not a user toggle. The detection is conservative: anything not on the desktop allowlist gets the fallback path.

## 13. Open questions

1. **ROSAT vs eROSITA.** ROSAT is older (1990–1999), lower resolution (~2 arcmin), and definitively in the public domain. eROSITA (2019–2022) is roughly 100× better in resolution and sensitivity, but its data release has staggered embargoes (DR1 is open as of 2024; some cluster catalogs are still proprietary to the German consortium). For v1 we plan to ship ROSAT — the visual difference at the 10–500 Mpc camera distance is negligible because we are sampling an analytic Gaussian fit, not the pixel data. **RECOMMENDATION:** ROSAT in v1; revisit eROSITA if we ever do a per-cluster cutout view that benefits from higher resolution.
2. **Origin: M87 vs heliocentric.** Anchoring the shell-6 origin at M87 gives clean coordinates inside Virgo but makes the supergalactic plane and the heliocentric origin asymmetric — the user is "off to one side" of their own coordinate frame. The alternative is the heliocentric origin (`shellOrigin = (0, 0, 0)`), which keeps continuity with shell 5 but means coordinates within Virgo are dominated by Virgo's distance vector (~16 Mpc on every position). **RECOMMENDATION:** M87 origin. The precision argument from [`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md) favours putting the origin near the "interesting region," and shell-5-to-shell-6 already requires a re-anchor.
3. **Is 720/1300 the right narrative beat?** The cross-match count was computed against a specific Virgo membership catalog (VCC + extensions). If we widen the membership definition, the count changes. We should pin the catalog version in [`../data/06-cluster-catalogs.md`](../data/06-cluster-catalogs.md) and quote the exact same number in the overlay copy and in any future blog post about the tour, so the figures don't drift.
4. **Should the GA arrow always be visible, or only at pull-back?** Drafted as "fade in at `T+1:03`" but a case can be made for showing it from `T+0:56` to give the user a sense of compass direction throughout the shell. **RECOMMENDATION:** late fade-in. It is a foreshadow, not a navigation aid.
5. **Coma membership.** Coma is conventionally part of Laniakea, not Virgo's supercluster. Including it here is a visual choice, not a structural one. If shell 7's Laniakea reveal includes a "Coma highlight" beat, we should drop Coma from shell 6 to avoid stealing the thunder.

## 14. Test criteria

Before this shell ships, the following must be verifiable:

- **T1 — Visual correctness.** The X-ray halo around M87 sits at the right world position (verified by overlaying the rendered frame on a downloaded ROSAT image at matching projection — should align to within ~5 % of the halo radius).
- **T2 — Cluster densification reads.** A side-by-side comparison of a frame at `T+0:56` (shell 5 view of the same volume) and `T+1:01` (shell 6 closest approach) must show the cluster overdensity unambiguously. If a naïve viewer cannot point at "the cluster" within 3 s, the densification effect is failing and the camera path needs adjusting.
- **T3 — Performance.** Frame time stays under 8 ms (50 % of the 16 ms 60 fps budget) on the reference desktop machine for the entire 10 s shell duration, including crossfades. Mobile fallback stays under 14 ms on iPhone 14 Pro.
- **T4 — Halo quality at edge cases.** The halo renders correctly when (a) the camera is exactly on-axis with M87 (no NaN from `d_perp = 0`), (b) the halo is partially off-screen, (c) the halo is occluded by a galaxy point in the foreground.
- **T5 — Label readability.** All labels (Virgo, M87, Fornax, GA arrow) are legible at the camera's closest approach without overlap. Verified by screenshot comparison against [`../ux/01-information-overlays.md`](../ux/01-information-overlays.md) typographic standards.
- **T6 — Crossfade continuity.** The shell-5-to-shell-6 and shell-6-to-shell-7 transitions show no visual pop, no flash of black, no sudden geometry appearance/disappearance. A frame-by-frame review of the crossfade band (≤ 60 frames) is required.
- **T7 — Mobile fallback parity.** The mobile fallback shows the warm-red glow around Virgo unambiguously, even without the volumetric pass. A user shown both on side-by-side phones should describe both as "Virgo cluster glowing red."
- **T8 — Cross-match count is current.** The "720 of 1300" narrative figure matches the actual count from the latest catalog ingest; a unit test in [`tests/data/`](../../../../tests/data/) asserts the count and fails when the catalog is updated, forcing a copy review.

## 15. Files touched

New:

```
src/services/gpu/xrayHaloRenderer.ts        — Option A imposter pass for cluster halos
src/services/gpu/shaders/xrayHalo.wesl      — fragment shader: analytic Gaussian along view ray
src/services/engine/shells/virgoShell.ts    — ShellRenderer for shell 6 (composes the passes above)
src/services/engine/shells/clusterMarkers.ts — small billboard pass for cluster centres
src/services/engine/shells/gaArrow.ts       — screen-space Great Attractor arrow + label
src/data/clusters.ts                         — type definitions + decoder for clusters.bin
src/data/xrayHalos.ts                        — type definitions + decoder for xrayHalos.bin
public/data/clusters.bin                     — preloaded asset (built from Abell + VCC)
public/data/xrayHalos.bin                    — preloaded asset (built from ROSAT fits)
tools/buildClusterCatalog.ts                 — pipeline: Abell + VCC → clusters.bin
tools/buildXrayHalos.ts                      — pipeline: ROSAT FITS + cluster centres → xrayHalos.bin
tests/services/gpu/xrayHaloRenderer.test.ts
tests/services/engine/shells/virgoShell.test.ts
tests/data/clusterDecoder.test.ts
tests/data/virgoMembership.test.ts           — pins the "720 of 1300" figure
```

Modified:

```
src/services/engine/runFrame.ts              — registers virgoShell in the orchestrator
src/services/engine/shellRendererRegistry.ts — adds shell 6 entry
src/data/shellDefinitions.ts                 — shell 6 row (unit, near, far, origin = M87)
src/services/gpu/pointRenderer.ts            — accepts the per-instance "near M87" flag for the split-draw trick
src/services/camera/tourScript.ts            — shell 6 waypoints (per section 5)
src/services/gpu/labelRenderer.ts            — adds GA arrow as a label class
docs/superpowers/plans/2026-05-08-cosmic-zoom-powers-of-ten/data/06-cluster-catalogs.md
docs/superpowers/plans/2026-05-08-cosmic-zoom-powers-of-ten/data/08-rosat-xray.md
```

The biggest single piece of new work is the X-ray halo renderer; everything else is wiring or content. The catalog ingestion tools (`tools/buildClusterCatalog.ts`, `tools/buildXrayHalos.ts`) run once per data refresh and are not on the runtime path.
