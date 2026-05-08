# Shell 7 — Laniakea Supercluster

**Native unit:** Mpc
**Visible volume:** 100 – 1000 Mpc (camera distance from origin)
**Tour timing:** `T+1:07` → `T+1:18` (11 s — the longest shell, the hero moment)
**Camera origin:** heliocentric (Mpc), with a soft re-anchor to the supergalactic axis so the Great Attractor / Shapley basin frames cleanly.
**Hero data:** Cosmicflows-4 (CF-4) reconstructed dark-matter density volume + CF-4 reconstructed velocity field.
**Hero visual:** translucent volumetric DM density (cool-blue voids → glowing filaments → white-hot cluster nodes), galaxy points embedded in the volume, colored velocity-flow vectors visibly converging toward the Shapley / Great Attractor basin.
**Render budget:** 8 ms per frame on desktop, with a hard mobile fallback.

This is the most ambitious shell in the entire plan. Every other shell is either "data we already have, restyled" (4, 5, 8) or "a new but well-scoped renderer" (1, 2, 3, 9). Shell 7 introduces volumetric ray-marching of a 3D density texture, an instanced flow-vector glyph pass, and the trickiest coordinate handoff in the plan (heliocentric Mpc ↔ supergalactic Cartesian h⁻¹ Mpc). It also carries the heaviest narrative weight: this is the one beat where the user sees, with their own eyes, the literal definition of where they live.

---

## 1. Overview — why this shell exists

Until 2014, "what supercluster do we live in?" had a fuzzy answer: the Local Supercluster, a loosely-defined concentration centered on Virgo. The 2014 Nature paper by Tully, Courtois, Hoffman, and Pomarède ("The Laniakea Supercluster of Galaxies") **redefined the question.** Instead of asking "where are the galaxies clumped?", they asked "where do the galaxies *flow*?" Using peculiar velocities reconstructed from the Cosmicflows-2 catalog, they drew a **basin of attraction** — the set of points whose mass flow converges to a single great attractor — and named that basin Laniakea, "immeasurable heaven" in Hawaiian.

This shell shows the user the literal procedure:

1. The galaxy point cloud thins out to context, no longer the focus.
2. A translucent volumetric scalar field (the CF-4 dark-matter density reconstruction) fills the visible volume, revealing the filaments and clusters that the discrete galaxy positions only sketch.
3. Flow vectors — small instanced arrows colored by speed — point from every grid cell along the local velocity field. Their convergence pattern *is* the Laniakea boundary.
4. The Great Attractor (~50 Mpc, Hydra-Centaurus direction), Shapley Supercluster (~200 Mpc, the dominant attractor for the basin), Perseus-Pisces Supercluster (~70 Mpc, opposite side of the void from Laniakea), and the Local Group (a tiny pulse at the origin) are labelled.

The user should leave this shell with a single sentence of intuition: **"my galaxy is a leaf in a river that empties into Shapley."** That is what justifies 11 seconds of tour budget on one shell.

This shell also operationalises the "acknowledged ignorance is a feature" principle from the product vision. The CF-4 density reconstruction is a single MAP-like sample with significant uncertainty at the box edges; the ensemble standard deviation is non-trivial. Shell 7's overlay copy can implicitly nod at this ("flow direction inferred from peculiar velocities of ~56,000 galaxies — uncertain at the edge"), and the volumetric transfer function fades opacity beyond half the box so we never render confident-looking structure that the data does not support.

---

## 2. Visible elements

In rendering order (back-to-front composite):

1. **DM density volume** — translucent ray-marched 3D texture, 256³ voxels, ~5 Mpc per voxel, covering a ~1000 Mpc cube centered on the observer. This is the dominant visual; everything else sits inside it.
2. **Galaxy points** — the existing point cloud, but at this scale only the brightest ~10⁵ galaxies contribute meaningfully. They appear as faint specks embedded in the volume, providing a "yes, this is real galaxies, not just CGI" anchor.
3. **Flow vectors** — small instanced arrow glyphs at a regular grid (default 32³ subsampled from the 256³ velocity field), colored by speed magnitude (cool blue ~0 km/s to hot red ~600 km/s). Length proportional to speed, head-to-tail aligned with velocity direction.
4. **Local Group highlight** — a small pulsing white marker at the origin (1 Mpc visual radius, well below the apparent size of any other rendered structure at this distance) labeled "YOU ARE HERE". This gives the user the visceral "we are this small, we are *embedded* in this basin" reaction.
5. **Great Attractor marker** — a soft warm-yellow pulsing point at supergalactic (SGX, SGY, SGZ) ≈ (−40, +10, +5) Mpc, distance ~50 Mpc in the Hydra-Centaurus direction. Labeled.
6. **Shapley Supercluster marker** — a brighter warm-orange pulse at SG ≈ (−140, +75, −10) Mpc, distance ~200 Mpc. Labeled. This is the dominant attractor; the flow vectors should visibly point at it.
7. **Perseus-Pisces marker** (optional, only if camera-frame visible) — a small magenta pulse at SG ≈ (+50, −20, −15) Mpc, distance ~70 Mpc. Labeled if not occluded.
8. **Laniakea boundary surface** (stretch goal, see open questions) — a translucent isosurface of the basin-of-attraction membership, drawn as a soft warm-tinted shell. This is the "literal Laniakea." If we cannot derive it cleanly from the CF-4 velocity field, we omit it and let the convergence of flow vectors imply the boundary.

The DM volume and the flow vectors are **two views of the same underlying CF-4 dataset.** The volume shows where matter *is*; the vectors show where it *goes*. Together they make the basin self-evident.

---

## 3. Data requirements

Two CF-4 products feed this shell, both built upstream by sibling plans. See [`../../data/07-cosmicflows.md`](../../data/07-cosmicflows.md) for the master ingestion plan; this section only covers what Shell 7 *consumes*.

### 3.1 Density volume (the hero)

- **Source:** Valade et al. 2024 HAMLET 256³ HMC reconstruction.
- **Build pipeline:** owned by [`../../../specs/2026-05-07-cf4-dark-matter-volume-render-design.md`](../../../specs/2026-05-07-cf4-dark-matter-volume-render-design.md) and its sub-plans [`../../../plans/2026-05-07-cf4-dm-volume-01-build-pipeline.md`](../../../plans/2026-05-07-cf4-dm-volume-01-build-pipeline.md) and [`../../../plans/2026-05-07-cf4-dm-volume-02-renderer.md`](../../../plans/2026-05-07-cf4-dm-volume-02-renderer.md).
- **Runtime artifact:** `public/data/cf4_density.bin`, ~32 MB, f16 voxels, R2-hosted.
- **Loader:** `src/services/engine/cf4DensityLoader.ts` (provided by the CF-4 plan).
- **Coordinate frame:** supergalactic Cartesian, h⁻¹ Mpc, observer at cube center (voxel 128, 128, 128).

Shell 7 **does not own** the density-volume build or renderer. Shell 7 *consumes* the existing renderer's public API. This is the single most important coordination boundary in the plan; see Section 9.

### 3.2 Velocity field (for the flow vectors)

- **Source:** the Cosmicflows-4 reconstructed peculiar velocity field, same HAMLET reconstruction. Distributed alongside the density `.sav` (typically as a sibling 256³×3 array — `vx, vy, vz` in km/s in supergalactic Cartesian frame).
- **Build pipeline:** does **not** exist yet. Owned by this plan. We mirror the density-volume pipeline:
  - `tools/cf4VelocityIngest.py` — extract `vx`, `vy`, `vz` from the same `.sav` file the density ingest already opens. Single read, two outputs (density already exists; velocity is the new sibling). Writes `data/raw/cf4/cf4_velocity_256.npy`, shape `(3, 256, 256, 256)` f32.
  - `tools/buildCf4Velocity.ts` — reads the `.npy`, subsamples to **32³** (1 vector per 8 voxels — good enough at 11 s tour pacing, dramatically cuts both the data size and the per-frame instance count), writes `public/data/cf4_velocity.bin`.
- **Runtime artifact:** `public/data/cf4_velocity.bin`, ~1 MB at 32³ resolution (32 768 vectors × 16 bytes per vector after packing position+velocity), R2-hosted.
- **Loader:** `src/services/engine/cf4VelocityLoader.ts` (new, this plan).

A 32³ grid gives the user roughly 30 visible vectors per linear screen-axis at this shell's framing — dense enough to read flow direction, sparse enough that the volume isn't obscured. We can dial this up or down at runtime via thinning (Section 8).

### 3.3 Galaxy points (already loaded)

The existing point cloud (SDSS + 2MRS + GLADE) is already on the GPU from earlier shells. Shell 7 reuses it unchanged, just with the existing `pointRenderer` running at low opacity (~0.4) so the volume reads as the dominant element.

### 3.4 Cluster / supercluster marker positions

A small JSON file `data/cosmography_landmarks.json` (~2 KB, in-repo, not gitignored) holding:

```json
{
  "great_attractor": { "sg_mpc": [-40, 10, 5],   "label": "Great Attractor",      "color": "#FFC857" },
  "shapley":         { "sg_mpc": [-140, 75, -10],"label": "Shapley Supercluster", "color": "#F08A24" },
  "perseus_pisces":  { "sg_mpc": [50, -20, -15], "label": "Perseus-Pisces",       "color": "#C75DAB" },
  "local_group":     { "sg_mpc": [0, 0, 0],      "label": "Local Group",          "color": "#FFFFFF" }
}
```

This is hand-curated, not derived. Coordinates are taken from Tully et al. 2014 and from NED. The file is small enough that a tour author can edit it directly to add structures (Coma, Hercules, Norma) without touching code. Shell 7 reads it once at engine init and converts SG → equatorial via the shared `superGalacticTransform.ts` helper from the CF-4 spec.

---

## 4. Visual design

### 4.1 Volumetric color ramp (transfer function)

The transfer function maps `log(1 + δ)` to RGBA. The CF-4 density spec hard-codes a ramp; for Shell 7 specifically we want a slightly more dramatic version because this *is* the hero shot. The proposed ramp (4 stops, lerp in linear RGB):

| `t = (log(1+δ) − log_min) / (log_max − log_min)` | RGB | A (per unit step) | Notes |
|---|---|---|---|
| 0.00 (deep void, δ ≈ −0.9) | (0.04, 0.06, 0.18) | 0.02 | cool deep blue, almost transparent |
| 0.30 (mean, δ ≈ 0)         | (0.12, 0.10, 0.30) | 0.05 | desaturated indigo |
| 0.60 (filament, δ ≈ 3)     | (0.55, 0.35, 0.85) | 0.18 | luminous purple — the "Pomarède look" |
| 0.85 (cluster, δ ≈ 15)     | (1.00, 0.75, 0.55) | 0.45 | warm bright orange-white |
| 1.00 (cluster core, δ ≈ 30)| (1.00, 1.00, 0.95) | 0.80 | white-hot |

The ramp is hard-coded as a 4-stop inline gradient in the WGSL fragment shader; no LUT texture needed (the CF-4 renderer already does this — Shell 7 just **passes a different ramp identifier** as a uniform).

The aesthetic goal is unambiguous: "this is what the cosmography papers look like." Pomarède's published Laniakea visualizations are the reference. We lean cool-purple in the middle (filaments) so that the warm cluster nodes pop, and we let voids be deep cool-blue rather than literal transparent black so the volume reads as a continuous medium rather than a sparse cloud.

### 4.2 Flow-vector style

Each vector is an instanced **3D arrow glyph**: a thin tapered cylinder (4-segment shaft, 6-segment cone head). About 60 triangles per glyph; with 32 768 instances that's ~2 M triangles, well within budget. Alternative considered and rejected: 2D screen-space line segments — they can't convey direction toward/away from the camera, which is the whole point at a shell where the basin is 3D.

- **Length:** scaled by `clamp(speed_kms / 600, 0.0, 1.0) * 5 Mpc`. So a 600 km/s flow vector is 5 Mpc long; a 100 km/s vector is ~0.8 Mpc. At this shell's apparent scale, that's a comfortable readable length.
- **Color:** cool→hot ramp on speed magnitude. (0.0, 0.4, 1.0) at 0 km/s → (1.0, 0.3, 0.2) at 600 km/s. Linear lerp in HSV-ish space (computed once at build time, baked into the per-instance buffer to avoid shader cost).
- **Alpha:** 0.7 baseline, modulated by camera distance in the fragment shader (Section 8).
- **Glow:** a subtle additive pass on the arrow-head only, so the convergence at Shapley reads as a brightness peak.

### 4.3 Galaxy embedding

The point cloud opacity drops to 0.4 for this shell; galaxies become "salt sprinkled in soup." We keep the magnitude-based size and the existing colour-index colouring, so individual bright galaxies still register. The user should be able to recognise that the volume's bright regions correspond to galaxy concentrations — i.e., the volume is *consistent with* the discrete data, not a separate fiction.

### 4.4 Local Group marker

A single white pulsing dot at the origin, with a faint 5-Mpc-radius ring (the approximate Local Sheet extent we left behind in Shell 5). The label "YOU ARE HERE" sits 5° below the marker in screen space, sized so it's always legible regardless of camera distance.

---

## 5. Camera path

The camera enters Shell 7 at `T+1:07` from Shell 6 (Virgo Supercluster). It exits to Shell 8 (Cosmic Web) at `T+1:18`.

### 5.1 Entry waypoint (at T+1:07)

- **Position:** ~250 Mpc from origin, oriented so the supergalactic plane is roughly horizontal in the frame and the Great Attractor direction (SGX-negative, SGY-positive) is right-of-center.
- **Look-at:** origin.
- **Up vector:** SGZ-positive (the supergalactic north pole).
- **FoV:** 45° (matches Shell 6 exit FoV — no FoV jump).

This entry orientation is chosen so the user's "where Virgo was" memory from Shell 6 maps to a small bright spot just below-left of frame center; the new dominant element is the volume filling the rest of the frame.

### 5.2 Internal path (T+1:07 → T+1:18)

Three phases:

1. **`T+1:07 → T+1:10` (3 s) — slow approach toward the Great Attractor direction.** Camera dollies 100 Mpc closer along the SGX-negative axis (i.e., toward the GA marker). Velocity decreases over the 3 s (ease-out). The DM density volume becomes denser-feeling because we're moving into a richer region; flow vectors visibly grow longer because we're approaching higher-speed flow regions.
2. **`T+1:10 → T+1:15` (5 s) — full orbital pan around the Laniakea basin.** Camera holds its distance to the GA-direction approach point and orbits around the supergalactic Z-axis at ~30°/s. This is a 150° arc, not a full 360° — enough to convey 3D structure ("Shapley is *behind* the GA, not next to it") without the dizzying full circle. The orbit is deliberately slow because the volume is dense with detail; the user needs time to read it.
3. **`T+1:15 → T+1:18` (3 s) — pull back to frame the cosmic web.** Camera retreats from ~150 Mpc to ~600 Mpc, with FoV widening from 45° to 60°. The DM volume's hot cluster nodes shrink to bright points; the flow vectors thin out (Section 8); the Shapley label remains anchored to its world position and shrinks. By T+1:18 we are clearly looking at "all of Laniakea + neighborhoods," which is the right framing to hand off to Shell 8 (cosmic web).

### 5.3 Exit waypoint (at T+1:18)

- **Position:** ~600 Mpc from origin.
- **Look-at:** origin.
- **FoV:** 60°.
- **Up:** SGZ-positive (consistent with Shell 8's expected orientation).

Shell 8 takes over at T+1:19 with a 1-second crossfade. During the crossfade, the volume's overall opacity drops from 1.0 to 0.0 over the second; the existing point cloud's opacity rises from 0.4 to 1.0; the flow vectors fade out. By T+1:20 the DM volume and flow vectors are no longer rendered, freeing GPU time for the Shell 8 filament pass.

### 5.4 Camera-rotation banking

During the orbital pan (phase 2), the camera's roll is held to zero relative to SGZ-up. We do not bank into the orbit. The cosmography aesthetic depends on a stable supergalactic horizon; banking would break it.

---

## 6. Render pipeline

For Shell 7 specifically the per-frame ordering is (back-to-front, painters-style, all inside the per-shell pass orchestrated by [`../../rendering/00-scale-architecture.md`](../../rendering/00-scale-architecture.md)):

```
Shell 7 active frame:

  1. Clear shell-7 color attachment (HDR, RGBA16F) and depth attachment (reverse-Z).
  2. Volumetric DM pass (cf4DensityRenderer.render)
       — fullscreen triangle, ray-marched from view rays
       — additive into HDR
       — does not write depth
  3. Galaxy point pass (existing pointRenderer) at opacity 0.4
       — writes depth (so galaxies in front correctly occlude vectors behind them)
  4. Flow-vector instanced pass (new — cf4FlowVectorRenderer.render)
       — instanced indexed draw, ~32k arrow glyphs
       — depth test enabled, depth write enabled
       — alpha-blended
  5. Marker pass (Local Group, GA, Shapley, Perseus-Pisces)
       — same point primitive as galaxies but with per-marker pulse uniform
  6. Label pass (MSDF, existing labelRenderer) anchored to marker positions
       — projected through Shell 7's per-shell projection matrix
  7. Composite into final HDR target with shell fade alpha (1.0 mid-shell, ramps in transitions).
```

The DM volume pass is **first** (and additive, no depth interaction) so the rest of the geometry naturally draws on top. This is the same compositional decision the CF-4 spec makes for the standalone overlay; we inherit it.

The flow-vector pass uses depth testing because we *want* a galaxy or marker in front of a vector to occlude it — otherwise the scene reads as "everything overlapping in 2D," which loses the 3D-basin intuition.

---

## 7. The volumetric DM rendering — the hardest single GPU technique in the whole plan

This section is intentionally long. The volumetric pass is the load-bearing visual of the most-watched shell; if it does not look good, the tour does not land.

### 7.1 The technique in one paragraph

We render a fullscreen triangle. For every pixel, we reconstruct a world-space ray from the inverse view-projection matrix and the pixel's NDC. We intersect the ray with the AABB of the CF-4 cube (in Skymap world Mpc). If the ray misses the box, we discard. If it hits, we step along the ray from `t_near` to `t_far` in `step_count` (default 128) uniform steps, sample the 3D density texture at each step (transformed from world Mpc to CF-4 voxel coordinates), apply the transfer function to get an emission RGBA, and accumulate front-to-back compositing with opacity correction. We early-out when the accumulated transmittance drops below 1%.

This is **already implemented** by the CF-4 spec. Shell 7 does not invent it; Shell 7 consumes it. But Shell 7 has slightly different needs from the standalone CF-4 overlay (different transfer ramp, slightly different framing, and a tighter performance budget because it shares the frame with the flow-vector pass). The consumption boundary is described in Section 9.

### 7.2 What can go wrong (and how we mitigate)

The volumetric pass has a long history of failure modes in similar projects. These are the ones that bit other "cosmic visualisation" demos and how we plan around each:

1. **Hard cube edges.** The CF-4 reconstruction is uncertain near the edge of the survey volume. If we render the full cube uniformly, we get a visible cube outline as the ray exits the AABB — this looks like CGI. **Mitigation:** the shader applies a *half-box-sphere* clip (`r_from_observer > 128 voxels → continue`) that fades the volume to zero beyond half the box. Already in the CF-4 shader. We additionally apply a soft window inside that radius (`smoothstep(100, 128, r)` multiplier on opacity) so the fade is gradient, not abrupt.

2. **Banding from low step count.** At 128 steps over a ~1000 Mpc ray, each step is ~7 Mpc — comparable to the voxel size. This is fine for the smooth CF-4 field but can produce visible bands at high-density regions. **Mitigation:** stochastic jitter on the start `t` per pixel (`t_start += hash(pixel) * dt`). One-line shader change. Eliminates banding at the cost of a tiny bit of noise that disappears under temporal accumulation.

3. **Depth fight with galaxy points.** Galaxies are drawn in a separate pass with their own depth values. If the volume samples are depth-tested against the galaxy depth, faraway clusters (which should glow through) get depth-clipped. **Mitigation:** the volume pass does not depth-test. Galaxies drawn after the volume always win the pixel. This is the "additive contextual fog" model from the CF-4 spec; we adopt it unchanged.

4. **Catastrophic opacity at the cluster cores.** A naive transfer function with high opacity at the highest densities saturates the alpha channel after one step, making the cluster cores look like opaque blobs. **Mitigation:** opacity correction with `dt` baked in (`opacity_per_step = base_opacity * dt / 5.0`). This decouples the apparent density from `step_count`, so we can dial step count for performance without changing the look. Standard volume-rendering opacity-correction; the CF-4 shader already does this.

5. **Color clipping at the cluster cores.** RGB values can exceed 1.0 in the HDR target after multiple bright steps accumulate. **Mitigation:** our HDR target is RGBA16F; values up to ~65k are representable. The tonemap pass at frame end maps back to display range. Cluster cores read as "white-hot saturated peak," which is the desired aesthetic.

6. **Ray-march cost on 4K screens.** Per-pixel cost is `step_count` texture samples + a transfer-function evaluation. At 4K (8.3M pixels), 128 steps, that's ~1B samples per frame. Cache-friendly because adjacent rays sample adjacent voxels — texture cache hits dominate — but still heavy. **Mitigation:** render the volume pass to **half-resolution** (1080p on a 4K display) and bilinear-upscale during composite. Volumetric clouds are smooth; the 2× upscale is invisible. This single change is the difference between "8 ms" and "20 ms" on consumer GPUs. We adopt it as the default.

7. **WebGPU 3D texture creation on slow devices.** Uploading a 32 MB 3D texture takes ~50 ms on integrated GPUs. **Mitigation:** the upload happens at engine init (shell 7 data slot LOADING state), not at shell entry. By T+1:07 the texture is already on the GPU, and Shell 7 just runs `render()`. The asset-loading primitive (separate spec) handles this.

8. **Alpha precision on the half-res target.** RGBA16F has plenty of color precision but if we additively accumulate 128 small values into the alpha channel, we still risk precision loss. **Mitigation:** pre-multiplied alpha throughout. Composite uses pre-multiplied formula. The CF-4 shader already does this.

### 7.3 Step count tuning

`step_count` is a uniform; we vary it adaptively:

- Desktop, full-res: 128 steps (target 8 ms volume-only, 16 ms total at 60 fps).
- Desktop, half-res (default): 96 steps (target 4 ms volume-only).
- Mobile: 0 steps — volume disabled (Section 13).

We measure actual frame cost via the existing `engine.ts` GPU timestamp queries (where available) and step the count down by 16 if frame time exceeds budget for 30 consecutive frames. This adaptive degradation matches how the existing point cloud's per-frame galaxy cap works.

---

## 8. Flow vectors — the 3D arrow field

### 8.1 Glyph instancing

The arrow glyph is a static index/vertex buffer, ~24 vertices, ~60 indices. We draw it as `drawIndexedInstanced(60, instance_count)`. Per-instance attributes (one buffer, interleaved):

| Slot | Bytes | Type | Field |
|------|-------|------|-------|
| 0    | 12    | f32x3 | world-space arrow base position (Mpc, supergalactic, transformed at build time to skymap world frame) |
| 1    | 12    | f32x3 | world-space velocity vector (km/s, supergalactic frame, transformed at build) |
| 2    | 4     | f32   | speed magnitude (km/s) — denormalized for fast color/length lookup in shader |
| 3    | 4     | u32   | packed RGBA color (8 bits each) — baked at build time from speed via the cool→hot ramp |

Total: 32 bytes per instance. At 32 768 instances, the buffer is ~1 MB. Fits easily.

The vertex shader builds a per-instance basis from the velocity direction (Gram-Schmidt), scales the glyph by the per-instance length, and translates to the per-instance base position. No per-frame writes to this buffer — it is constant for the shell's lifetime.

### 8.2 Density and thinning

A uniform 32³ grid in a 1000 Mpc cube means a vector every ~31 Mpc — about right at the shell's mid-camera-distance (~150 Mpc) for a readable density, but visually noisy at the shell's wide-angle exit framing (~600 Mpc) where 32k arrows turn into a blur.

Two thinning mechanisms, both shader-side (no buffer rebuild):

1. **Frustum culling.** Per-instance, the vertex shader can `gl_Position.w = -1` (or equivalent NDC-out-of-range trick) to cull instances outside the view frustum. With ~30°-FoV and ~32³ grid, this typically culls ~70% of instances.
2. **Distance-based decimation.** Per-instance, hash the instance ID and compare against a `vector_density` uniform (0.0–1.0). At wide framing, `vector_density = 0.3`; at mid framing, `1.0`. The hash means decimation is consistent across frames (no flickering); the density uniform animates smoothly with the camera distance.

The decimation curve is a simple `smoothstep` driven by camera distance:

```
vector_density = smoothstep(800, 200, camera_distance_mpc);  // 1.0 close, 0.3 far
```

This way, as the exit phase pulls the camera back, the field of arrows smoothly thins out rather than turning into TV-static.

### 8.3 What the user actually sees

Within ~200 Mpc of the camera: a dense forest of arrows, each pointing along its local CF-4-reconstructed flow direction. Coloration cool-blue near voids, warm-red in high-flow regions. The user can trace the local flow with their eyes.

Across the volume: the arrows visibly **converge.** The flow lines all curve toward Shapley. This is the literal Laniakea definition; the user sees it as a physical pattern rather than a verbal claim.

A subtle additive glow on each arrow head ensures the convergence point reads as a brightness peak even when individual arrows are too small to resolve.

---

## 9. Coordination with the existing CF-4 dark-matter volume plan

This is the load-bearing coordination boundary in the entire cosmic-zoom plan, because two specs (CF-4 standalone overlay, Shell 7) produce two consumers of the same renderer. Getting this clean keeps both shippable independently.

### 9.1 What Shell 7 consumes from the CF-4 spec

The CF-4 spec ([`../../../specs/2026-05-07-cf4-dark-matter-volume-render-design.md`](../../../specs/2026-05-07-cf4-dark-matter-volume-render-design.md)) ships:

- `src/data/cf4DensityFormat.ts` — encode/decode + `Cf4DensityField` type.
- `src/data/superGalacticTransform.ts` — supergalactic ↔ equatorial Cartesian helper (shared with CF-4 streamline plan).
- `src/services/engine/cf4DensityLoader.ts` — `loadCf4Density(): Promise<Cf4DensityField | null>`.
- `src/services/gpu/cf4DensityRenderer.ts` — exports a `Cf4DensityRenderer` type with a `render(pass, viewProj, cameraPos, intensity)` method.
- `src/services/gpu/shaders/cf4Density.wgsl` — the ray-march shader.
- `cf4_density.bin` on R2.

Shell 7 imports all of the above as-is. The standalone overlay use case (the CF-4 spec's headline feature) lives at the engine level (toggleable settings panel item, default off, runs every frame on the wide view). Shell 7 just re-uses the renderer at a different scale, with a different transfer-function preset and a fixed intensity.

### 9.2 The minimal API extension Shell 7 needs

The CF-4 spec hard-codes one transfer function. Shell 7 wants its own (more dramatic; see Section 4.1). We extend the renderer's API by **one parameter**:

```ts
export type Cf4TransferPreset = 'standalone' | 'shell7-laniakea' | 'shell8-cosmic-web';

export type Cf4DensityRenderer = {
  render(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    cameraPos: [number, number, number],
    intensity: number,
    preset?: Cf4TransferPreset,        // defaults to 'standalone'; new
  ): void;
  destroy(): void;
};
```

The `preset` argument selects between hard-coded inline transfer functions in the WGSL shader (a 3-way `switch` on a uniform-passed enum). This is a one-line uniform, a one-shader change, zero new files.

If Shell 7 lands first, it adds the preset parameter to the CF-4 spec's renderer (with `'standalone'` as the default for backward compatibility). If the CF-4 spec lands first, Shell 7's plan adds the preset extension as Task 1.

### 9.3 What Shell 7 owns exclusively

- `tools/cf4VelocityIngest.py` — extracts vx/vy/vz from the same `.sav` the density ingest already opens.
- `tools/buildCf4Velocity.ts` — packs velocity vectors into the per-instance binary format.
- `src/data/cf4VelocityFormat.ts` — encode/decode for the velocity binary.
- `src/services/engine/cf4VelocityLoader.ts` — `loadCf4Velocity(): Promise<Cf4VelocityField | null>`.
- `src/services/gpu/cf4FlowVectorRenderer.ts` — instanced arrow renderer.
- `src/services/gpu/shaders/cf4FlowVector.wgsl` — vertex/fragment shader for the arrow glyph.
- `src/services/engine/shells/shell7Laniakea.ts` — shell controller (asset slot, render orchestration, marker positions, label anchoring).
- `data/cosmography_landmarks.json` — landmark positions.

The velocity-related artifacts are deliberately scoped narrowly. They could in principle be useful as a standalone overlay too (a "show local cosmic flow" toggle) but that is a follow-up concern; Shell 7's plan does not commit to wiring them outside the tour.

### 9.4 Sequencing

The CF-4 spec's two sub-plans should land **before** Shell 7 implementation begins. Shell 7 then:

1. Adds the transfer-preset extension (Task 1, ~30 minutes).
2. Builds the velocity pipeline (Tasks 2–8).
3. Builds the flow-vector renderer (Tasks 9–14).
4. Wires the shell controller (Tasks 15–20).
5. Tour-script integration + visual verification (Tasks 21–25).

If the CF-4 spec is delayed, Shell 7 has a graceful degradation: skip the volume pass, render only flow vectors. The narrative still works ("here's the flow that defines Laniakea") but the visual punch is much lower. We avoid this if at all possible.

---

## 10. Labels

All labels go through the MSDF label renderer from [`../../../specs/2026-05-07-msdf-labels-design.md`](../../../specs/2026-05-07-msdf-labels-design.md).

| Label | Anchor (supergalactic Mpc) | Distance (Mpc) | Color | Fade-in | Fade-out | Notes |
|-------|---------------------------|----------------|-------|---------|----------|-------|
| **Laniakea Supercluster** | (−70, 35, 0)  | ~80 (centroid of basin) | warm white | T+1:08 | T+1:17 | The hero label. Larger font, sits in the upper-third of frame. |
| **Great Attractor**       | (−40, 10, 5)  | ~50  | warm yellow | T+1:09 | T+1:17 | Anchored to the GA marker. |
| **Shapley Supercluster**  | (−140, 75, −10) | ~200 | warm orange | T+1:11 | T+1:17 | Fades in slightly later — the user discovers it as the camera orbits. |
| **Perseus-Pisces**        | (50, −20, −15) | ~70  | magenta | T+1:13 | T+1:17 | Only fades in if not occluded by frustum-culling check at T+1:13. |
| **Local Group (YOU ARE HERE)** | (0, 0, 0) | 0 | white | T+1:08 | T+1:17 | Always visible. Smaller font, sits 5° below the marker. |

The Laniakea label gets a subtle one-line subtitle ("our home supercluster — defined 2014") that fades in at T+1:10. This reinforces the narrative beat.

Labels follow the standard skymap label-decluttering pass: if two labels would overlap on screen, the lower-priority one fades out. Priority order: Laniakea > Great Attractor > Shapley > Local Group > Perseus-Pisces.

The MSDF labels are projected through Shell 7's per-shell projection matrix (Section 6 of [`../../rendering/00-scale-architecture.md`](../../rendering/00-scale-architecture.md)). Each label's anchor is stored in supergalactic Mpc and converted at render time to Shell-7-relative coordinates via the shared transform.

---

## 11. Transitions

### 11.1 Entry from Shell 6 (Virgo Supercluster) at T+1:06 → T+1:07

Shell 6 ends with the X-ray glow on Virgo dimming and the camera pulling back. The crossfade lasts 1 second:

- Shell 6's render-pass `fadeAlpha` ramps from 1.0 → 0.0 (linear).
- Shell 7's render-pass `fadeAlpha` ramps from 0.0 → 1.0 (linear).
- During the crossfade, both passes run. Shell 6 has its final point-cloud opacity at full + the X-ray glow fading; Shell 7 has the DM volume fading in + flow vectors fading in.
- Camera position is shared (no abrupt jump) — the entry waypoint of Shell 7 is the exit waypoint of Shell 6, ensured by the tour-script schema.

The user's perceptual experience: the X-ray glow shrinks, the rest of the scene starts to glow purple, vectors appear. No discontinuity.

### 11.2 Exit to Shell 8 (Cosmic Web) at T+1:18 → T+1:19

Shell 8 takes over with a 1-second crossfade. The DM volume fades out, the flow vectors fade out, the existing point cloud's opacity ramps back from 0.4 → 1.0, and the DisPerSE filaments (Shell 8's hero) start to fade in.

The Laniakea label gracefully fades out at T+1:17; Shell 8 has its own label set.

The camera continues its motion (we are pulling back at the end of Shell 7 anyway, and Shell 8 continues that motion outward). FoV smoothly widens from 60° to 75° during the crossfade, matching Shell 8's wide-cosmic-web framing.

---

## 12. Performance budget

Target: **8 ms total per frame** for Shell 7. Out of the 16 ms 60-fps budget, that leaves 8 ms for the rest of the engine (label pass, marker pass, post-process, browser compositor) — tight but achievable based on existing skymap measurements.

Breakdown:

| Pass | Budget (ms) | Notes |
|------|-------------|-------|
| DM volume ray-march (half-res, 96 steps) | 4.0 | Dominant cost. Half-res is mandatory for 4K. |
| Flow-vector instanced draw (post-cull ~10k visible) | 1.0 | Instanced draws are cheap; depth-test cost is negligible. |
| Galaxy points (existing renderer at 0.4 opacity) | 1.5 | Same as Shell 8; not a new cost. |
| Marker pass (4 markers + pulse animation) | 0.1 | Trivial. |
| Label pass (5 labels, MSDF) | 0.5 | Existing renderer; reused. |
| Composite (half-res upscale + shell crossfade) | 0.5 | One fullscreen pass. |
| Headroom | 0.4 | For frame-to-frame variance. |
| **Total** | **8.0** | |

Adaptive degradation triggers (in priority order):

1. If frame > 16 ms for 30 consecutive frames: drop ray-march steps from 96 → 64 (saves ~1.5 ms).
2. If still > 16 ms: thin flow vectors aggressively (`vector_density *= 0.5`, saves ~0.5 ms).
3. If still > 16 ms: drop volume to quarter-res (saves another ~2 ms but visibly blurrier).
4. If still > 16 ms: disable volume entirely, fall back to flow-vectors-only mode.

Each step is reversible if frame time recovers. The thresholds are intentionally generous (30 frames) to avoid flickering between modes.

GPU memory: the 256³ f16 3D texture is ~32 MB. The flow-vector instance buffer is ~1 MB. Total Shell-7-specific GPU memory: ~33 MB. Well under any reasonable budget.

---

## 13. Mobile fallback

Mobile WebGPU support exists but is uneven. Volumetric ray-marching at 256³ on a phone GPU is unrealistic (estimated 40–80 ms on a flagship Android). Shell 7's mobile path:

- **Detection:** `navigator.gpu.requestAdapter({ powerPreference: 'low-power' })` → check `adapter.info.architecture` heuristics + a one-time micro-benchmark (a tiny ray-march on a synthetic 32³ field, measure ms). If the benchmark exceeds 4 ms, treat as mobile-grade.
- **Volume pass:** disabled. The 32 MB 3D texture is not even uploaded (saves bandwidth and VRAM).
- **Flow-vector pass:** enabled, but at **8³ resolution** (down from 32³), giving ~512 instances. Glyphs are slightly larger to compensate (15 Mpc max length instead of 5 Mpc) so each individual arrow is more readable.
- **Galaxy points:** unchanged (at 0.4 opacity).
- **Markers and labels:** unchanged.
- **Camera path:** unchanged, but the Shell-7 duration is preserved — the user still gets 11 seconds, with the flow vectors carrying the narrative weight on their own. The overlay copy is augmented with a one-line subtitle "(reduced detail mode)" in the corner so the user understands they're seeing a degraded visual.

The fallback is not a graceful sliver of the desktop experience — it's a different visual that still tells the same story. The flow vectors alone, even at 8³ resolution, visibly converge toward Shapley; the basin intuition is preserved.

A pre-built artifact `cf4_velocity_8.bin` (~16 KB) is shipped alongside the full-resolution version and selected at load time based on the device tier. This avoids decimating at runtime.

---

## 14. Open questions

1. **Should we render an explicit Laniakea boundary surface (isosurface of the basin-of-attraction membership)?** Pomarède's published Laniakea visualizations include this surface, and it makes the boundary literal rather than implied. Computing it from the CF-4 velocity field requires a basin-of-attraction analysis (integrate flow lines from every voxel, see which converge to the same attractor) — non-trivial preprocessing. **RECOMMENDATION:** defer to v1.1. The flow-vector convergence already implies the boundary; explicit surface is a polish item.

2. **Should we add a Shapley pulse synced to the orbital pan?** During phase 2 of the camera path, the Shapley marker could pulse brighter as the camera reaches its closest approach. This would draw the user's eye to the basin's attractor. **RECOMMENDATION:** yes, subtle (1.0× → 1.4× over 1 s, return). Implement as a per-marker sine-modulated brightness uniform. Trivial.

3. **What if the user pauses the tour during Shell 7?** The render passes keep running on the held camera position. The flow vectors are static (they are *the field*, not animated particles). The volume is static. The pulses on the markers can keep animating subtly to indicate "still alive, just paused." **RECOMMENDATION:** keep marker pulses on; everything else holds.

4. **Should the velocity field animate?** Tempting to advect tracer particles along the flow to convey motion. Beautiful but expensive (compute pass + transparent particle render) and potentially distracting from the static-vector reading. **RECOMMENDATION:** no in v1; revisit if the static-vector look feels too "diagram-like."

5. **What about the CF-4 ensemble uncertainty?** The std-dev field is available (CF-4++) but adds another 32 MB upload and a more complex transfer function. **RECOMMENDATION:** out of scope. The single MAP-like field is the published cosmography aesthetic; the uncertainty field is a research visualization, not a tour visualization.

6. **The Local Void.** It sits roughly opposite the Great Attractor in the supergalactic frame, ~25 Mpc from us. Should it get a label? It's not a Laniakea-defining feature but it's a striking visual hole. **RECOMMENDATION:** label it during the orbital pan (T+1:13 → T+1:16), low priority so it gets decluttered if Shapley/GA labels overlap.

7. **Coordinate-frame mismatch with the rest of the tour.** Shells 1–6 use heliocentric equatorial Cartesian Mpc. Shell 7's hero data is supergalactic Cartesian h⁻¹ Mpc. The transform is well-defined and the CF-4 spec already provides `superGalacticTransform.ts`. But during the orbital pan, "up" for Shell 7 is supergalactic-Z while "up" for Shell 6 was equatorial-Z. The user sees a slight reorientation during the entry crossfade. **RECOMMENDATION:** acceptable. The reorientation reads as "we're moving to a bigger frame," not as a glitch. If user testing flags it, we can ease the up-vector through the supergalactic-equatorial obliquity over the 1-second crossfade.

---

## 15. Test criteria

Shell 7 is feature-complete when **all** of the following pass:

### 15.1 Automated (vitest)

- `cf4VelocityFormat.test.ts` — encode/decode round-trip with a synthetic 8³ velocity field.
- `cf4VelocityFormat.test.ts` — header version-mismatch error throws with regenerate message.
- `cf4VelocityLoader.test.ts` — happy path returns populated `Cf4VelocityField`; 404 returns `null`; malformed header throws.
- `cf4FlowVectorRenderer.test.ts` — instantiate with synthetic 8³ field on the test WebGPU device wrapper; assert no throws, assert per-instance buffer size is `8 * 8 * 8 * 32` bytes.
- `shell7Laniakea.test.ts` — shell controller wires asset slot transitions correctly; `EMPTY → LOADING → READY → ACTIVE → IDLE` in response to mock camera events.
- `cosmographyLandmarks.test.ts` — JSON parses; all four required keys present; SG → equatorial transform produces plausible (RA, Dec, distance) for each.
- All existing tests still green (~590 today + new ones).

### 15.2 Visual verification (manual, dev server)

- Camera positioned at Shell 7 entry waypoint: DM volume visible, Local Group marker visible at origin, GA + Shapley + Perseus-Pisces markers visible (if not frustum-culled), galaxy points visible at 0.4 opacity, no hard cube edges.
- During the orbital pan: flow vectors visibly converge toward Shapley. Basin pattern recognisable.
- Frame time: ≤16 ms on the developer's MacBook Pro at full window; ≤16 ms on a mid-range Windows laptop GPU.
- Crossfade in from Shell 6: smooth, no popping.
- Crossfade out to Shell 8: smooth, no popping; flow vectors and volume fully gone by T+1:20.
- Label decluttering works: at any camera frame, no two labels overlap.
- Pause works: holding the camera shows the same visual indefinitely; marker pulses continue subtly.
- Mobile fallback: on a flagship Android in Chrome Canary, Shell 7 renders flow-vectors-only, no volume, framerate ≥30 fps.

### 15.3 Narrative verification (the actual goal)

A naive viewer (not a cosmologist, not someone who has read this plan) watches the tour from the start. After Shell 7, they can answer "what is Laniakea?" with something like "it's where everything around us is falling toward." If they cannot, the visual did not land and we revise the transfer function, vector density, or camera path.

---

## 16. Files touched

### New files (Shell 7 owns)

```
src/services/engine/shells/shell7Laniakea.ts                shell controller
src/services/engine/cf4VelocityLoader.ts                    velocity loader
src/services/gpu/cf4FlowVectorRenderer.ts                   instanced arrow renderer
src/services/gpu/shaders/cf4FlowVector.wgsl                 arrow vertex/fragment shader
src/data/cf4VelocityFormat.ts                               encode/decode + Cf4VelocityField type
src/data/cosmographyLandmarks.ts                            JSON loader + typed accessors
src/@types/Cf4VelocityField.d.ts                            runtime type
data/cosmography_landmarks.json                             hand-curated landmark positions
tools/cf4VelocityIngest.py                                  one-shot .sav → .npy (sibling of density ingest)
tools/buildCf4Velocity.ts                                   .npy → .bin packer
tests/data/cf4VelocityFormat.test.ts                        round-trip
tests/data/cosmographyLandmarks.test.ts                     JSON load + transform
tests/services/engine/cf4VelocityLoader.test.ts             mocked-fetch loader
tests/services/engine/shells/shell7Laniakea.test.ts         shell controller state machine
tests/services/gpu/cf4FlowVectorRenderer.test.ts            init with synthetic 8³
```

### Modified files (Shell 7 extends)

```
src/services/gpu/cf4DensityRenderer.ts                      add transfer-preset parameter
src/services/gpu/shaders/cf4Density.wgsl                    add 3-way preset switch
src/services/engine/runFrame.ts                             register Shell 7 in shellRendererRegistry
src/data/shellDefinitions.ts                                add Shell 7 entry (id, near=10 Mpc, far=2000 Mpc)
src/data/defaults.ts                                        Shell 7 default vector density, intensity
tools/syncR2.ts                                             add cf4_velocity.bin (and 8³ mobile variant) to ALLOW filter
package.json                                                build-cf4-velocity script
.gitignore                                                  data/raw/cf4/cf4_velocity_*.npy
```

### Files inherited unchanged from the CF-4 spec

```
src/services/engine/cf4DensityLoader.ts
src/data/cf4DensityFormat.ts
src/data/superGalacticTransform.ts
src/services/gpu/cf4DensityRenderer.ts (with the one new parameter, see above)
public/data/cf4_density.bin (R2)
```

### Files inherited unchanged from the cosmic-zoom plan baseline

```
src/services/engine/scale/cameraScale.ts                    floating-origin (per rendering/00)
src/services/engine/scale/perShellProjection.ts             projection matrix per shell
src/services/gpu/labelRenderer.ts                           MSDF labels (per msdf-labels-design.md)
src/services/gpu/pointRenderer.ts                           existing point cloud, Shell 7 uses at 0.4 alpha
src/services/engine/shellTransitions.ts                     crossfade logic (per rendering/00)
```

---

**Summary in one sentence:** Shell 7 is the tour's hero shot — a translucent volumetric dark-matter density field plus an instanced converging flow-vector field, consuming the existing CF-4 volume renderer with one new transfer-preset parameter, owning a new lightweight velocity-vector pipeline, and budgeted at 8 ms per frame with a graceful flow-vectors-only mobile fallback.
