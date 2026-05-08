# Shell 8 — Cosmic Web

**Native unit:** Gpc.
**Visible volume:** 1–10 Gpc (camera path mostly stays inside 1–5 Gpc).
**Tour timing:** `T+1:19` to `T+1:27` (8 s).
**Camera origin:** heliocentric (the Sun, by historical accident — every catalog we have is reduced to heliocentric coordinates, so it is also the cheapest origin).
**Hero data:** the full existing skymap point cloud (SDSS large + 2MRS + GLADE large) plus the DisPerSE filament network already shipping in `public/data/filaments.bin`.
**Hero visual:** galaxies as a faint haze, bright filaments threading between cluster nodes, vast empty voids between them. The Sloan Great Wall highlighted when the camera angle exposes it. The CMB sphere from [Shell 9](09-observable-universe.md) starts to fade in at the back.

This is the easiest shell in the tour. **It is what skymap already does.** Almost no new infrastructure is needed; the work is camera framing, intensity tuning, and a few cinematic flourishes (Great Wall outline, cluster pulses, CMB pre-fade). Treat this document as a styling and choreography brief on top of an existing renderer, not a build spec.

## 1. Overview — the famous "cosmic web" image

By Shell 8 the user has been pulled steadily outward for 79 seconds and is looking at our familiar default view: the entire loaded catalog, viewed from outside, with filaments glowing through it. This is the moment the tour delivers the picture every popular-science article uses to mean "the universe": a luminous spider's web of matter, with empty bubble-like voids in between.

The visual goal is **not novelty** — every other shell has shown the user something they have never seen. Shell 8 gives them something they have probably *seen in a textbook* and lets them realise that **the textbook image is real data**, sitting in skymap, free to fly through. The pacing is intentionally short (8 s, the joint shortest with [Shell 5](05-local-sheet.md)) because the picture is iconic enough to land in seconds.

There is also a structural reason for the brevity: Shell 8 is sandwiched between [Shell 7 (Laniakea)](07-laniakea.md), which is the tour's biggest visual reveal, and [Shell 9 (Observable Universe)](09-observable-universe.md), which is the tour's emotional landing. Shell 8 functions as the cinematic exhale between two heavy beats — the "we are here, this is what it all looks like" pause before the camera turns inside out and shows the CMB.

## 2. Visible elements

In back-to-front render order:

- **Black sky.** Same `clear` as every other shell.
- **CMB pre-fade (background).** The Shell 9 sphere renderer starts drawing at very low alpha (~5–10%) so that by the end of Shell 8 the user senses a halo at the back of the scene. See [section 9](#9-transitions).
- **Galaxy point cloud as haze.** All ~3 M loaded galaxies from SDSS, 2MRS, and GLADE, rendered through the existing `pointRenderer`. At Gpc viewing distance individual galaxies are sub-pixel; the visual reads as a *density field* of soft dots — the haze. The exact opacity-per-point is tuned downward from the live default so that the filaments read more strongly (see [section 4](#4-visual-design)).
- **Filaments.** The `filamentRenderer` pass already in main, drawing the DisPerSE skeleton. These become the visual subject of the shell.
- **Cluster-node pulses.** A small number of well-known clusters (Coma, Hercules, Shapley, Perseus-Pisces) get a soft per-frame pulse — a slow sin-modulated brightness multiplier on a billboard halo at their barycenters. Decorative, not data-bearing.
- **Sloan Great Wall outline.** When the camera angle exposes it, a faint annotated polyline (or low-alpha hull) traces the Great Wall's spatial extent. See [section 7](#7-the-sloan-great-wall-highlight).
- **Labels.** MSDF labels for "Coma Cluster," "Hercules Cluster," "Sloan Great Wall," and (if visible) "CMB →" pointing at the brightening sphere.

There is no new render pass here. The composition is exactly the existing point + filament + label stack with a few decorative billboards layered in.

## 3. Data requirements — existing skymap data

Shell 8 introduces **zero new datasets.** It consumes:

- `public/data/sdss-large.bin` — SDSS DR18 catalog, large tier (~1.7 M points). Decoded by `cloudLoader` per `src/data/pointCloudFormat.ts`.
- `public/data/2mrs.bin` — 2MRS, tier-agnostic (~44 k points).
- `public/data/glade-large.bin` — GLADE v2.3, large tier (~1.1 M points).
- `public/data/filaments.bin` — DisPerSE filament skeleton, format in `src/data/filamentBinaryFormat.ts`. Per the project memory note on SDSS wedge pollution, the filaments are computed from **2MRS + GLADE only**; SDSS is intentionally excluded so the filament density field is not biased by SDSS's wedge geometry. That decision is load-bearing and stays.
- `public/data/famous.bin` — the existing famous-galaxy catalog, used here to fish out cluster anchor positions for the pulse markers and labels (Coma cluster centroid is the brightest galaxy in the cluster's neighbourhood; same trick we use everywhere else).

All five files are already present in any production skymap deploy — Shell 8 needs no extra pre-fetch. By the time the tour reaches `T+1:19` they have either been loaded from R2 (production) or from `public/data/` (dev) on session start, because the default skymap view *is* this data. The asset-slot state machine described in [`shells/00-shell-overview.md`](00-shell-overview.md) marks Shell 8 as `READY` immediately on session bootstrap.

The Sloan Great Wall outline (section 7) is the one piece of new shipped content. It is a tiny JSON file (`public/data/sloan-great-wall.json`, ≤ 4 kB) listing a hand-curated polyline of vertices in equatorial-Cartesian Mpc — drawn from the published bounding box (z ≈ 0.073–0.086, RA ≈ 8h45m–14h, Dec ≈ −1° to +6°). It is not derived from a catalog; it is editorial annotation.

## 4. Visual design

The default skymap view is tuned for *exploration* — galaxies bright enough to pick out individually, filaments strong enough to read as a network. The cinematic Shell 8 view tunes both differently to push the **filament-haze contrast** further apart.

```ts
type CosmicWebStyle = {
  pointAlphaMultiplier: number;   // 0.55 — galaxies dimmer than default to push haze read
  pointSizeMultiplier: number;    // 0.85 — slightly smaller billboards so they merge into haze
  filamentAlphaMultiplier: number; // 1.4  — filaments brighter than default for hero look
  filamentColor: [number, number, number]; // warm ivory (1.0, 0.96, 0.86)
  voidDarkenStrength: number;     // 0.0  — see open question below; 0 means no extra void darkening
  clusterPulse: { period: number; amplitude: number }; // 4 s, 0.25 of base brightness
};
```

### Point density tuning

We do not change the point cloud. We multiply its per-fragment alpha by `0.55` for the duration of this shell. Because the camera is at Gpc distance, each galaxy already covers a small fraction of a pixel; halving its contribution turns the cloud from a "swarm of dots" into a "fog with structure," which is the right read for the haze role.

This multiplier is exposed through the existing `cloudFade` uniform path in `src/services/gpu/cloudFade.ts` — the same uniform we already use to fade individual sources in/out. No new shader work.

### Filament intensity

Filaments are pushed up by 1.4× and warmed slightly. The default colour (cool white) reads as data; the warm ivory reads as *light*. This is the only part of the shell that genuinely diverges from the default visual, and it is a one-line uniform change.

The filament edge thickness stays at the default — at this viewing distance the existing line width already integrates to a clean glow. Boosting thickness as well as alpha would make filaments look *painted* rather than *radiated*.

### Void emphasis through dark central regions

The voids are *negative space* — the absence of haze in regions between filaments. They emerge naturally from the data; we should resist the urge to "draw" them.

Two reasons for restraint:

1. **The data already does it.** The void-filament contrast in the existing render is already striking; the user spends Shells 5–7 watching density build, and Shell 8 is the first shell where they see the *anti-density* clearly. We do not need to paint emptiness; emptiness paints itself.
2. **Active darkening is a lie.** A "void darkening" pass would amplify any region that happens to lack catalog coverage — a coverage hole reads identically to a real void. The SDSS wedge boundary, the Galactic Plane Zone of Avoidance, and the GLADE incomplete-sky region would all be falsely emphasised as cosmic structure. (See open question 1 in [section 12](#12-open-questions).)

`voidDarkenStrength = 0` is the recommended default. The struct field exists for future experimentation only.

## 5. Camera path

The camera enters Shell 8 from Laniakea's exit waypoint and pulls outward through the shell, finishing pointed at empty space where the CMB sphere will appear.

| Beat | Time | Camera state |
|------|------|--------------|
| Enter | `T+1:19` | Position ~1.2 Gpc from origin, look-at = origin, FoV = 50°. Same orientation Laniakea ended in (no jump cut). |
| Settle | `T+1:20` | Position ~1.6 Gpc; gentle deceleration so the user has a moment to see "ah, the cosmic web." |
| Rotate | `T+1:21–1:25` | Slow orbital rotation around the heliocentric origin: ~12° around the supergalactic north axis, combined with a ~6° tilt. The 3D structure of the filaments is the visual point — filaments going *into* and *out of* screen depth, not just ones lying on the projection plane. |
| Pull-out | `T+1:25–1:27` | Position recedes to ~3 Gpc; FoV opens to 60°. The galaxy points compress into a denser haze. The CMB pre-fade in the back becomes perceptible. |
| Exit | `T+1:27` | Position ~3 Gpc, look-at = origin, FoV = 60°, orientation tilted to reveal the most CMB sphere area possible at the back. Hand-off to [Shell 9](09-observable-universe.md). |

The rotation is gentle on purpose — fast camera rotation at this scale makes the filaments smear and lose readability. The "show the depth of the structure" goal is best served by 1–2°/s rather than a snappy orbit.

The camera is purely orbital around origin throughout the shell. There is no internal landmark to push toward (we passed the last meaningful landmark — Laniakea — in the previous shell). The cosmic web has no *somewhere*; it is everywhere, equally. The tour acknowledges that by giving the camera a slow, contemplative arc instead of a destination push.

## 6. Render pipeline

Per-frame, in order:

```
clear(black)
├── cmbPreFade.render(alpha = lerp(0, 0.10, t_in_shell))      ← Shell 9's renderer, low alpha
├── pointRenderer.render(style = COSMIC_WEB_STYLE.points)      ← existing, dimmed via cloudFade
├── filamentRenderer.render(style = COSMIC_WEB_STYLE.filament) ← existing, brightness pushed
├── clusterPulseBillboards.render(style = COSMIC_WEB_STYLE.pulse) ← small new billboard pass
├── greatWallOutline.render(visibilityMask = computeVisibility(camera))
└── labelRenderer.render(MSDF, shellId = COSMIC_WEB)
```

Five of the six passes already exist in main. The two new pieces:

- **`clusterPulseBillboards`** — a tiny billboard renderer reusing `quadRenderer` infrastructure. ≤ 6 instances. Each pulse is a soft radial-gradient billboard ~1° on the screen, modulated by `(0.75 + 0.25 * sin(t * 2π / 4s))`. This costs essentially nothing.
- **`greatWallOutline`** — a line-strip renderer for the polyline JSON. Reuses `filamentRenderer`'s line shader path with a different colour (faint cyan, alpha 0.2–0.4 depending on visibility). See [section 7](#7-the-sloan-great-wall-highlight).

No new uniform layouts. No new bind groups beyond the line-strip's. The filament renderer's existing alpha multiplier uniform handles the brightness push.

## 7. The Sloan Great Wall highlight

The Sloan Great Wall is a real structure — a galaxy concentration ~1.4 Gly long at z ≈ 0.073–0.086, discovered in SDSS data in 2003 and at the time the largest known structure in the universe. It is a recognisable name to readers who follow astronomy news; calling it out gives the shell an editorial anchor.

Two practical points:

- **It is mostly an SDSS structure.** It lies inside the SDSS spectroscopic footprint, which the project memory notes is wedge-shaped and dominant in our point cloud. The Great Wall is therefore *visible* in the haze; the outline gives the user permission to *see it as a thing*.
- **It is only visible at certain camera angles.** From some directions the Great Wall is end-on (a clump) and from others it is broadside (a long curtain). The outline should fade in only when the camera angle gives a broadside view.

Visibility heuristic:

```ts
type GreatWallVisibility = {
  outlinePolyline: Vec3F32[]; // ~12 vertices, equatorial-Cartesian Mpc
  centroidMpc: Vec3F32;       // approximate barycentre
  longAxisMpc: Vec3F32;       // unit vector along the wall's long extent
};

function greatWallAlpha(camForward: Vec3F32, wall: GreatWallVisibility): number {
  // Maximum alpha when camera looks roughly perpendicular to the wall's long axis
  const dot = Math.abs(camForward.dot(wall.longAxisMpc));
  // dot=1 means looking along the wall (end-on, hide); dot=0 means broadside (show)
  return Math.max(0, 1 - dot * dot) * 0.35;  // never fully opaque
}
```

The polyline is hand-curated — we pick ~12 vertices that bound the SDSS galaxies attributed to the wall in the literature, store them in `public/data/sloan-great-wall.json`, load once at boot, and project per-frame. The shape does not need to be precise; it is a hint, not a measurement.

The label "**Sloan Great Wall**" attaches to the outline's centroid at the same alpha as the outline — when the wall fades in, so does its name.

## 8. Famous galaxy markers

Cluster-node pulses are restrained — the shell already has a lot of visual energy and adding more billboard noise dilutes the filament read. We mark only four:

| Cluster | Distance | Why it earns a marker |
|---------|----------|------------------------|
| Coma Cluster | ~100 Mpc | Iconic; the canonical "this is what a cluster looks like" example. Sits cleanly within the visible volume. |
| Hercules Cluster | ~150 Mpc | Visible in the same hemisphere as Coma; lets us show two clusters on screen at once. |
| Perseus-Pisces Supercluster | ~70 Mpc | A long filament structure in its own right; lets the user connect "filament" to "real named thing." |
| Shapley Supercluster | ~210 Mpc | Already mentioned in Shell 7 (Laniakea) overlay copy; the marker here pays off the earlier reference. |

Each marker is:
- A soft radial billboard (warm white, ~1° on screen).
- A pulse modulation `(0.75 + 0.25 * sin(t * 2π / 4s))`, period 4 s, so each pulse cycles roughly twice during the shell.
- An MSDF label tethered to the cluster centroid, fading in over 0.5 s starting at `T+1:21` and fading out at `T+1:26`.

The cluster centroids come from the existing `famous.bin`. We do not need a new catalog.

## 9. Transitions

### In: from Laniakea

[Shell 7 (Laniakea)](07-laniakea.md) ends with the volumetric dark-matter density volume and flow-vector field at full strength. The Shell 7 → Shell 8 crossfade is:

- Volumetric density volume → fade alpha 1.0 → 0 over 1 s starting at `T+1:18`.
- Flow vectors → fade alpha 1.0 → 0 over 1 s starting at `T+1:18`.
- Galaxy points → already at near-full alpha in Shell 7; smoothly slide from Shell-7 style to Shell-8 (`pointAlphaMultiplier: 0.55`) over 1 s.
- Filaments → were dim/absent in Shell 7; fade up to Shell-8 boost (1.4×) over 1 s.

The "volumetric Laniakea fades to skeletal cosmic web" transition is intentional — the user sees the dark-matter cloud resolve into the lit skeleton it actually traces. Same structure, different rendering choice.

### Out: to the Observable Universe

The Shell 8 → Shell 9 hand-off is built around the CMB sphere coming forward from the back of the scene:

- CMB sphere alpha rises slowly throughout the shell (`0 → 0.10` from `T+1:19` to `T+1:25`, then `0.10 → 0.5` from `T+1:25` to `T+1:27`).
- At `T+1:27` the camera passes the Shell 9 boundary (5 Gpc); the CMB renderer takes over as the dominant pass and the shell-8 point/filament layers begin their own fade-down (handled by Shell 9, not here).

The CMB is rendered *behind* the cosmic web in Shell 8 because we are still inside the volume — the user sees galaxies in front of a faint glow, not the other way round. This is geometrically correct and emotionally correct: the cosmic web is *between* us and the CMB, in space and in time.

## 10. Performance budget

**Target: ≤ 4 ms per frame** for the entire shell. Rationale: the existing wide-view skymap render already holds ~16 ms with all sources visible at full opacity, of which ~3 ms is the point + filament passes that this shell relies on. The decorative additions (cluster pulses, Great Wall outline, low-alpha CMB sphere) cost <1 ms combined.

| Pass | Budget |
|------|--------|
| Point cloud (3 M instances, alpha-modulated) | 2.0 ms |
| Filaments | 1.0 ms |
| CMB pre-fade (low-LOD sphere, ~80k tris) | 0.5 ms |
| Cluster pulses (≤ 6 billboards) | 0.05 ms |
| Great Wall outline (≤ 12 vertices) | 0.05 ms |
| Labels (≤ 6 MSDF instances) | 0.1 ms |
| **Total** | **~3.7 ms** |

The 4 ms ceiling matches the budget category in [`rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md) for middle shells, even though Shell 8 is technically an outer shell — its data is the existing pipeline, which is already optimised, so it gets the cheaper budget.

### What if we are over budget on mobile

The point cloud is the long pole. Two release-valves, in priority order:

1. **Drop SDSS-large to SDSS-medium during the tour only.** SDSS-large is ~1.7 M points; SDSS-medium is ~600 k. The visual difference at Gpc viewing distance is barely perceptible — every point is sub-pixel anyway. The tier swap is a single `cloudLoader` call.
2. **Skip the CMB pre-fade.** It is decorative; Shell 9 still introduces the sphere from black at `T+1:28` if Shell 8 never showed it.

Either of these reclaims ≥ 1 ms with negligible visual cost.

## 11. Mobile fallback

Mobile devices in general can render this shell, but the GLADE-large tier (~1.1 M points) is the most likely culprit for a slow GPU. On detected mobile, we:

- Default the point cloud to medium tiers across the board (`sdss-medium`, `glade-medium`).
- Disable the CMB pre-fade (Shell 9 introduces the sphere from black, which is fine narratively).
- Keep filaments at full quality — they are the visual subject and are cheap.
- Keep cluster pulses and the Great Wall outline — both are essentially free.
- Reduce the camera rotation rate by 30% so any frame-rate dips during the rotation are less perceptible (slower motion blurs less).

Mobile detection reuses the existing capability flag set on engine bootstrap; we don't add a new probe.

## 12. Open questions

1. **Do we render the SDSS wedge boundary, or hide it?** SDSS has a sharply-bounded sky footprint and a clear far-edge in redshift; from some camera angles the wedge looks like a hard polyhedron face rather than a continuous structure. Three options:
   - **A. Hide it.** Apply a soft radial alpha falloff to SDSS points only, so the wedge edge feathers into the GLADE/2MRS background instead of cutting hard. Costs one shader uniform; risks looking like a cooked-up vignette.
   - **B. Highlight it.** Annotate the wedge as "SDSS spectroscopic footprint" with a faint outline and label, embracing the data-set provenance instead of hiding it. Honest, didactic, but adds visual complexity to a deliberately calm shell.
   - **C. Camera-frame around it.** Choose the Shell 8 camera path so the wedge edge is never broadside to the viewer. Cheapest; constrains future tour edits.
   - **RECOMMENDATION:** A for the v1 cinematic, with B as a future optional toggle in the non-tour exploration mode. The tour should be readable; the wedge boundary is a *production artefact* of the SDSS survey, not a property of the universe, and feathering it is honest within the cinematic frame.
2. **Should the cluster pulse period be locked to the tour clock, or run free?** Locked means the pulses are reproducible across replays; free means each replay looks slightly different. **RECOMMENDATION:** locked, because the tour is a film.
3. **Is 8 s long enough to read both filaments and the Great Wall?** The Great Wall outline only appears for ~3–4 s during the rotation arc. If A/B testing shows users miss it, extend Shell 8 to 10 s by trimming Shell 5 (Local Sheet) by 2 s.
4. **CMB pre-fade alpha curve.** Linear `0 → 0.10` over 6 s is the proposal; an ease-in (slow, then fast) might read better as "the CMB is creeping in from behind." Defer to a tuning pass on real hardware.

## 13. Test criteria

A successful Shell 8 looks like:

- At `T+1:20` the user can identify, without prompting: filaments (bright, threaded), galaxies (haze), voids (dark gaps).
- The Sloan Great Wall outline appears at least once during the rotation arc, paired with its label, both reaching ≥ 0.25 alpha for ≥ 1 s.
- All four cluster pulses are visible at some point during the shell and their labels are legible.
- The CMB halo is *just* perceptible at `T+1:26` (≤ 10% alpha is enough).
- Frame time stays under 5 ms (target 4 ms) on a 2024-class desktop GPU; under 11 ms on a 2024-class mobile GPU with the medium-tier fallback active.
- No visible "edge" to the SDSS wedge during the rotation arc (either feathered per option A, or framed off per option C).
- The transition from Shell 7 (volumetric → skeletal) is continuous — no flash of black, no visible pop in galaxy alpha, no visible pop in filament brightness.
- The hand-off to Shell 9 at `T+1:27` is continuous — the CMB sphere is already faintly visible when Shell 9 takes responsibility for it.

These are subjective acceptance tests. The standard automated suite (`npm test`) does not need new cases for this shell, because every renderer it uses already has its own tests in `tests/services/gpu/`.

## 14. Files touched

**New:**

```
public/data/sloan-great-wall.json     ← hand-curated polyline (≤ 4 kB)
src/services/engine/shells/cosmicWeb.ts ← shell controller (style constants, camera path, transitions)
src/services/gpu/clusterPulseRenderer.ts ← tiny billboard pass for the four cluster nodes
```

**Modified:**

```
src/services/engine/runFrame.ts       ← register cosmicWeb shell in the orchestrator
src/services/gpu/cloudFade.ts         ← expose per-source alpha-multiplier (already partly there)
src/services/gpu/filamentRenderer.ts  ← accept brightness + colour-tint uniform (small extension)
src/data/shellDefinitions.ts          ← add COSMIC_WEB row (per [scale-architecture](../rendering/00-scale-architecture.md))
docs/superpowers/plans/2026-05-08-cosmic-zoom-powers-of-ten/shells/00-shell-overview.md ← cross-link this file
```

**Tests added:**

```
tests/services/engine/shells/cosmicWeb.test.ts   ← style-struct + camera-keyframe smoke tests
tests/services/gpu/clusterPulseRenderer.test.ts  ← billboard layout + pulse-phase math
```

The cinematic acceptance criteria (filaments read as filaments, voids read as voids, Great Wall is identifiable) are not unit-testable; they ride on a manual run of the tour from a fresh dev session, captured as a recorded run for review.

---

**See also:**
- [`shells/07-laniakea.md`](07-laniakea.md) — the previous shell (volumetric → skeletal hand-off).
- [`shells/09-observable-universe.md`](09-observable-universe.md) — the next shell (CMB sphere fully takes over).
- [`rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md) — per-shell coordinate system, the COSMIC_WEB row in the shell table.
- [`rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md) — how the camera path here is encoded as a `ShellBeat` for the tour engine.
- [`vision/01-narrative-script.md`](../vision/01-narrative-script.md) — the `T+1:19`–`T+1:27` beat in the master script.
