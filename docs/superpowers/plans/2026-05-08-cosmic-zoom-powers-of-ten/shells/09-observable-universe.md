# Shell 9 — Observable Universe / CMB

**Status:** Design proposal, awaiting human review.
**Native unit:** Gpc.
**Visible volume:** ~14 Gpc radius (the comoving radius of the observable universe).
**Tour timing:** `T+1:28` → `T+1:35` (7 s — the shortest shell, by design).
**Hero data:** Planck PR4 SMICA all-sky CMB temperature anisotropy map.
**Hero visual:** the camera sits inside a sphere whose inner surface *is* the CMB. The galaxy point cloud and DisPerSE filaments are still faintly visible at the very center, compressed into a thin bright shell of structure no larger than a few percent of the field.

The narrative beat lives in [`../../vision/01-narrative-script.md`](../../vision/01-narrative-script.md); the data acquisition lives in [`../../data/09-planck-cmb.md`](../../data/09-planck-cmb.md); the cross-shell rendering machinery lives in [`../../rendering/00-scale-architecture.md`](../../rendering/00-scale-architecture.md). Read those first if you have not.

## 1. Overview

Shell 9 is the **edge** of the tour. Beyond it we cannot see — not because our telescopes are insufficient, but because the universe is opaque to electromagnetic radiation prior to recombination at z ≈ 1100. Every photon we render left its source 13.8 billion years ago, stretched by cosmic expansion from an emitted blackbody temperature of ~3000 K down to today's 2.725 K. The red and blue patches across the sphere are real density fluctuations in the early universe at the part-in-100,000 level — the seeds from which every galaxy, cluster and filament in shells 4–8 grew.

The didactic point is not "look at this pretty pattern" but "this *is* the boundary." Everything in shells 1–8 fits *inside* this sphere. The tour collapses into a single visual: you, at the center, surrounded. 7 s is the tightest shell budget in the tour and every choice below serves that window — the CMB has to read on first frame, the camera has to communicate "I am inside a sphere" within ~1 s, and the overlay must land before the exit.

## 2. Visible elements

Back-to-front:

- **The CMB sphere.** A textured inverted sphere centered on the camera, ~28 Gpc across (rendered larger than the literal observable-universe radius so it always sits behind everything else; depth-wise it is at the projection's `far` plane). The inner surface carries the Planck SMICA temperature map, color-mapped (§4). Backface culling is inverted — we render back faces because we are inside.
- **A faint cosmic-web core at the center.** The Shell 8 point cloud + DisPerSE filaments keep rendering at low opacity (~15–25% alpha), compressed into roughly 1° of solid angle near screen center. Sells the "everything you have just seen is *that* tiny dot in the middle of *that* sphere" payoff.
- **(Optional) Galactic plane mask hint.** Residual Milky Way contamination near the equator, either acknowledged or visually softened (§8). May or may not be present in v1.
- **Title overlay.** Per [`../../ux/01-information-overlays.md`](../../ux/01-information-overlays.md). One beat:
  > **THE OBSERVABLE UNIVERSE**
  > The Cosmic Microwave Background — light from 13.8 billion years ago. Beyond it, we cannot see. The universe is bigger; we just can't reach it.

That is the entire scene. No per-feature labels, no UI affordances. Minimalism is the point — the universe gets the last word.

## 3. Data requirements

See [`../../data/09-planck-cmb.md`](../../data/09-planck-cmb.md) for the full plan. Summary: **source** Planck PR4 SMICA (NPIPE 2020 reprocessing); **upstream** HEALPix `Nside = 2048` FITS, 50 M pixels, ~600 MB; **on R2** equirectangular 4096 × 2048 RGB8 WebP, ~24 MB (pre-computed via `tools/buildCmbTexture.ts`, new — runtime is a single `texture_2d<f32>` sample); **color mapping** baked into the texture at build time so the runtime asset is already "rendered" and the shader stays trivial; **mobile variant** 2048 × 1024 JPEG ~6 MB (§12). The shell never decodes raw HEALPix in the browser — that is one-time at build time.

## 4. Visual design

### Color map

CMB visualizations conventionally use a divergent palette: cold → blue, mean → white/pale, hot → red. The Planck collaboration uses a perceptually-uniform variant of `RdBu_r` shifted toward cyan in the negatives. We follow that convention because recognition matters — anyone who has seen a CMB image in a textbook should immediately recognize the palette. Stops, in microkelvin relative to 2.725 K: −300 deep blue, −100 mid blue, 0 off-white, +100 orange, +300 deep red. We clip slightly tighter than Planck's published ±400 µK (using ±300) so small-scale structure has more visible contrast; monopole and dipole are subtracted (§7) so what remains is genuinely the anisotropy. Constants live in `src/data/cmbColorMap.ts` as a `type CmbColorStop = { tempUk: number; rgb: [number, number, number] }` array.

### Sphere alpha

The sphere is fully opaque — we are not trying to see *through* it. Alpha mixing applies only to the overlay text (~70% peak), the cosmic-web core (~20%), and the optional galactic-plane mask.

### How does the sphere read as "the boundary of observability" rather than as a literal wall?

The single hardest visual problem here. A naive sphere reads as a *dome* — like a planetarium ceiling. We want it to read as *the past*, not as a surface. Three techniques used together:

1. **No visible edge.** With backface culling and the camera inside, there is no silhouette anywhere; the CMB fills the sky 360° with no horizon line.
2. **Subtle radial vignette toward screen edges.** A gentle ~10% darkening at the corners suggests a curved sky rather than a flat poster. Post-process pass.
3. **The cosmic-web core for parallax.** Without it the user has no depth cue — the CMB could be 1 m or 1 Gpc away. A tiny bright cluster at the center, moving with slight parallax during the camera's rotation (§5), gives stereoscopic-style depth on a 2D display. The user infers "I am surrounded by something *enormous*" from the parallax mismatch.

We deliberately do *not* render any literal "shell thickness" or fogged Last Scattering Surface. The sphere is, for visual purposes, infinitely thin — a sky, not a structure.

## 5. Camera path

The simplest choreography in the tour, by design. **Entry (`T+1:28`):** at the cosmic-web shell origin, looking outward along the Local Group → Virgo direction (continuity with the Shell 8 final frame), FoV ~50°. **Mid-shell (`T+1:28` → `T+1:34`):** smoothly eased to the absolute center (heliocentric origin); total camera translation is small in shell-units. A slow azimuthal rotation of ~30°/s around the up axis shows that the all-sky CMB is *all-sky* — features rotate past the field of view. FoV widens gently to ~60°, reinforcing "I am surrounded." **Exit (`T+1:35`):** see [§10](#10-transitions); open question, hard cut versus reverse flythrough.

The translation budget is tiny by design. Free-fly is technically allowed but the user cannot go anywhere meaningful — the CMB sphere has no near side; you cannot approach it. If the user pauses mid-shell-9 and tries to fly, the camera moves but the scene barely changes; rotation responds normally. Acceptable — "disable input in shell 9" feels broken.

## 6. Render pipeline

The shell registers a single `ShellRenderer` (per [`../../rendering/00-scale-architecture.md`](../../rendering/00-scale-architecture.md)). Its state is a `type ObservableUniverseRenderer = ShellRenderer & { cmbTexture, cmbSphereVbo, cmbSphereIbo, cmbPipeline, cosmicWebCorePipeline, galacticMaskTexture | null }`.

Per-frame pass order, into the same color attachment:

1. **CMB sphere.** Inverted UV sphere at the projection's `far` plane (depth disabled / max-Z so it never occludes anything inside it). Single textured draw, equirectangular sample, no lighting.
2. **Cosmic web core.** Re-run Shell 8's point + filament passes at low alpha. The cosmic-web data does not need re-uploading — we re-bind Shell 8's vertex/index buffers under Shell 9's projection matrix (much larger `far`, so the cosmic web compresses into a tiny solid angle near the center).
3. **Galactic plane mask.** Optional; either a low-alpha layer over the CMB or composited at build time directly into the texture (§8).
4. **Vignette.** ~10% radial darkening at corners, post-process.
5. **Label.** Title overlay via the MSDF pipeline (`2026-05-07-msdf-labels-design.md`), screen-space anchored.

The sphere uses Shell 9's projection (near = 1 Gpc, far = 30 Gpc). The cosmic-web core, sharing Shell 8's data, is projected through *Shell 9's* matrix so its visible solid angle is correct.

## 7. The CMB sphere implementation

### Geometry

A UV sphere, ~64 longitudinal × 32 latitudinal segments (~2k tris). Far finer than needed for a static texture, but cost is negligible and it prevents visible polygonal silhouette at the poles. We do *not* use an icosphere — the equirectangular UV map is far easier on a UV sphere.

### Texture sampling

The fragment shader samples the equirectangular texture using the fragment's world-space direction `dir` (the unit vector from camera = sphere center to fragment): `u = atan2(dir.z, dir.x) / (2π) + 0.5`, `v = asin(dir.y) / π + 0.5`. Pole singularities are mitigated because the build-time texture resolution puts per-pixel area at the poles smaller than a screen pixel at any reasonable FoV.

### Coordinate frame

The CMB is naturally specified in **galactic coordinates** (galactic plane = X-axis equator, galactic center = +X); skymap uses **equatorial J2000** everywhere else. The texture is therefore rotated *at build time* — `tools/buildCmbTexture.ts` applies the galactic→equatorial rotation during the reprojection, so the runtime sphere is already in equatorial coordinates and the UV `(0, 0)` corresponds to RA = 0, Dec = 0. **No runtime rotation matrix.**

### Dipole — subtract or include?

Three components dominate the raw map: monopole (2.725 K, always subtracted), dipole (~3.4 mK from our motion through the CMB rest frame at ~370 km/s toward Leo), and anisotropies (~100 µK). With the dipole left in, the sky is one huge red-blue gradient and the small-scale structure is invisible. The published SMICA product is dipole-subtracted by default. **RECOMMENDATION:** ship dipole-subtracted — the dipole washes out the didactic payload, users have seen the dipole-subtracted version everywhere else, and a future "show the dipole" toggle is just a different texture variant. Captured as open question (§13) only because some planetarium shows use a thoughtful "include the dipole, then dissolve to without" reveal.

## 8. Galactic plane mask

Planck's reconstruction near the galactic plane (|b| ≲ 5°) is dominated by Milky Way emission — synchrotron, free-free, thermal dust. The SMICA component-separation does its best, but residual streaks remain. Three options: **(A)** show residuals honestly (accurate, but the streak overwhelms the cosmic anisotropies and reads as "look at the Milky Way"); **(B)** smoothly mask the equator strip with a cosine taper toward the global mean (clean, but scientifically dishonest); **(C)** B plus a faint dotted equator line and "(Milky Way foreground masked here.)" caption (honest and clean, but more copy in a shell that wants minimal copy).

**RECOMMENDATION:** B for v1, baked into the texture at build time. Defer C until user testing tells us whether the absence of acknowledgement actually misleads viewers.

## 9. Labels

Just the title overlay. No per-feature labels (the CMB has no "named" features at the resolution we display), no constellation lines, no equator markers, no scale bar — the bar is meaningless inside a sphere we can't move within (it would have to read "∞" or "13.8 Gly" depending on what you decide it measures, and either misleads). The scale-bar widget is *hidden* during Shell 9 and reappears on tour exit.

The title uses the standard MSDF pipeline; positioning and fade timing follow [`../../ux/01-information-overlays.md`](../../ux/01-information-overlays.md). Anchor: top-left, screen space.

## 10. Transitions

**In, from Shell 8.** The crossfade begins at `T+1:27`. For the last second of Shell 8 the CMB sphere fades up from alpha 0 to 1 *behind* the cosmic-web rendering (Shell 9's pass runs even though the camera is nominally still in Shell 8 — standard crossfade behavior from the scale-architecture spec). At `T+1:28` the cosmic-web shell drops to ~20% alpha and the camera ease begins. The user perceives the CMB "filling in" rather than as a cut.

**Out, back to default view.** Open question (§13). Two candidates: **Style A — Hard cut (recommended)** — at `T+1:35` the scene cross-fades to black over 0.3 s, then back to the default wide cosmic-web view over 0.4 s; clean and gives the user a moment to absorb, but slightly jarring. **Style B — Reverse flythrough** — camera flies back through every shell in reverse in ~3 s; visually unifying and reinforces "this is one continuous space," but 3 s of fast-zoom-back risks reading as a buggy fast-forward and extends the total tour to 1:46. **RECOMMENDATION:** A for v1; B is beautiful but duplicates the entire tour in reverse with sub-frame timing — high risk for marginal reward.

## 11. Performance budget

Per [`../../rendering/00-scale-architecture.md`](../../rendering/00-scale-architecture.md), outer shells get 8 ms. Shell 9 is far cheaper: CMB sphere draw ~1.0 ms (5k verts, 1 tex sample/frag, full screen); cosmic web core (Shell 8 reuse, ~2.5M points + filaments at low alpha) ~3.0 ms; vignette ~0.1 ms; label MSDF ~0.2 ms; **total ~4.3 ms**. Comfortably inside budget. The dominant cost is the cosmic-web reuse, *not* the CMB sphere. If budget later becomes tight, the cosmic-web core can be downsampled (every 4th point) without visual loss because it compresses to a few percent of the screen.

VRAM: 4096×2048 RGB8 = 24 MB unmipmapped, ~32 MB with a 4-level mipchain (4096²/2048²/1024²/512²) — lets the sampler do trilinear filtering at wider FoVs and avoids aliasing.

## 12. Mobile fallback

Mobile devices get a 2048×1024 JPEG (~6 MB on the wire, ~12 MB unmipmapped VRAM). Same color map, same equatorial frame, half resolution. Mobile viewports are also smaller, so per-screen-pixel sample density is comparable; the shader is unchanged, only the asset slot differs (gated on the mobile detection in [`../../ux/05-mobile.md`](../../ux/05-mobile.md)). If the mobile fetch fails, fall back to a 512×256 ~80 KB JPEG bundled in the static shell (`public/data/cmb-fallback.jpg`). Per the "every shell has a fallback" rule from [`../00-shell-overview.md`](../00-shell-overview.md), the shell never blank-screens.

## 13. Open questions

1. **Dipole inclusion.** Default ships dipole-subtracted (§7). Should we add a "show the dipole, then subtract it" 2-second sub-beat at `T+1:30`? Beautiful didactic moment if it works; distracting flicker if it doesn't. Needs a prototype.
2. **Return-to-default transition style.** Hard cut (A) versus reverse flythrough (B), per §10. RECOMMENDATION: A for v1.
3. **Galactic plane mask honesty.** Option B (silently mask) versus C (mask with caption), per §8. RECOMMENDATION: B for v1; revisit on user testing.
4. **CMB palette nuance.** Several "competing standards" exist (NASA WMAP more saturated; ESA's official Planck press images slightly desaturated). Pick closest to Planck's own publication for v1.
5. **Cosmic web core opacity.** Currently ~20%; exact value is a taste call. Range: 10–30%.

## 14. Test criteria

The shell is "done" when:

- [ ] CMB texture loads from R2 in <500 ms on typical broadband.
- [ ] First-frame render of Shell 9 happens within 1 frame of the transition trigger (no pop-in, no decode hitch).
- [ ] At default desktop FoV (~50°) the visible color range matches published Planck SMICA images to within visual perception (eyeball check against `data/raw/planck-cmb-reference.png`).
- [ ] Title overlay renders at WCAG AA contrast (≥4.5:1) over every part of the sphere — particularly bright red/orange spots, where dark text would fail. Soft text shadow if needed.
- [ ] Cosmic web core remains visible (≥10% relative luminance) at screen center across FoVs in [40°, 80°].
- [ ] On a 2018 iPhone (mobile fallback), the shell renders at ≥30 fps with the 2048×1024 texture.
- [ ] Equatorial coordinates verified: the galactic center (RA = 17h45m, Dec = −29°) sits on the masked galactic plane in the output, not at a pole or 90° offset. (The "did we apply the rotation correctly" check.)
- [ ] Shell 8 → Shell 9 transition has no visible seam in the cosmic-web core (points and filaments are bit-identical between the two shells; only the projection matrix changes).
- [ ] If the CMB texture fails to load, the fallback appears within 200 ms with no error toast and no crash.

## 15. Files touched

**New:**
- `src/services/gpu/cmbSphereRenderer.ts` — the CMB sphere render pass.
- `src/services/gpu/shaders/cmbSphere.wesl` — vertex + fragment, equirectangular sample.
- `src/services/engine/shells/observableUniverse.ts` — `ShellRenderer` registration + state.
- `src/data/cmbColorMap.ts` — divergent palette (also used at build time).
- `tools/buildCmbTexture.ts` — HEALPix → equirectangular reprojection, galactic→equatorial rotation, color mapping, galactic-plane mask (option B), mipchain.
- `public/data/cmb-fallback.jpg` — 512×256 bundled fallback (~80 KB).

**Generated artifacts** (uploaded via [`tools/syncR2.ts`](../../../../../tools/syncR2.ts)): `public/data/cmb-4096.webp` (~24 MB desktop), `public/data/cmb-2048.jpg` (~6 MB mobile).

**Modified:**
- `src/services/engine/shells/registry.ts` — register the Shell 9 renderer.
- `src/data/shellDefinitions.ts` — add Shell 9 entry (Gpc, near=1 Gpc, far=30 Gpc, origin=(0,0,0)).
- `tools/syncR2.ts` — extend ALLOW filter with the new CMB texture filenames.
- `package.json` — add `build-cmb` script for `tools/buildCmbTexture.ts`.

**Read-only reuse:** `src/services/gpu/pointRenderer.ts` and `src/services/gpu/filamentRenderer.ts` are invoked under Shell 9's projection matrix for the cosmic-web core; no edits.

No catalog binary format changes — the CMB is a raster, not a point cloud, and lives entirely outside `src/data/pointCloudFormat.ts`.
