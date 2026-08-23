# OpenSpace vs skymap — camera, datasets, renderers

Read of [OpenSpace](https://github.com/OpenSpace/OpenSpace) at `56e29b5` (master, 2026) against skymap at `8fb7a94`. OpenSpace is the NASA-funded astrovisualization
platform out of AMNH + Linköping (descended from Uniview): C++/OpenGL, Lua asset
graph, SPICE ephemerides, SGCT dome/cluster output, AMNH Digital Universe catalogs.

Written to answer two questions: **how do they solve the focus-node camera**, and
**what do the two actually render**. Paths prefixed `os:` are OpenSpace-repo-relative.

## 1. The anchor/focus camera

### The surprise: the anchor is not a coordinate frame

`os:include/openspace/camera/camera.h` stores one `glm::dvec3 _position` and one
`glm::dquat _rotation` in a single absolute world frame, in metres, in doubles.
Switching anchor never re-parents or re-bases anything — the anchor is purely a
_navigation_ concept. Precision is handled separately (§1.4).

`OrbitalNavigator` holds **two** nodes:

- `_anchorNode` — orbited and followed
- `_aimNode` — held screen-stable while orbiting the anchor (empty ⇒ same as
  anchor; equal ⇒ called the _focus_ node)

### 1.1 The per-frame algorithm

`os:src/navigation/orbitalnavigator/orbitalnavigator.cpp:600`,
`updateCameraStateFromStates`, in order:

1. **Ride the anchor.** The camera position gains
   `anchorPos - *_previousAnchorNodePosition` every frame. That single vector add
   is the entire "follow a moving planet" mechanism.
2. **Split the rotation.** `decomposeCameraRotationSurface` factors the camera
   quaternion into `global * local` — _global_ aims at the anchor's surface,
   _local_ is the user's look-around delta off it. Input drives the two
   independently (`roll` / `rotateLocally` / `interpolateLocalRotation` on local;
   `rotateGlobally` / `rotateHorizontally` on global), recomposed at the end.
   This is the load-bearing idea: it is why "orbit the planet" and "look around
   from here" don't fight, and why retargeting is a slerp of _one factor_ to
   identity with the camera never moving (`startRetargetAnchor`, ~:954).
3. **Co-rotate only when close.** The anchor's own rotation differential
   (`prevAnchorRot * inverse(anchorRot)`) is faded out with distance by
   `interpolateRotationDifferential`.
4. **Measure against the surface, never the centre.** A `SurfacePositionHandle`
   (`centerToReferenceSurface + outDirection * heightToSurface`) is recomputed
   _twice_ per frame — once up front, again after horizontal translation (:727),
   because moving sideways changed the height.
5. **Zoom proportional to surface distance** (`translateVertically`, :1413):
   `pos -= actualSurfaceToCamera * velocity * dt`. Exponential approach; identical
   feel at 1 AU and at 10 m, and asymptotically cannot punch through the body.
6. **Orbit speed tapered by altitude** (`rotationSpeedScaleFromCameraHeight`,
   :1541): `clamp(heightAboveSurface / surfaceRadius, 0, 1)`.

### 1.2 The three subtleties

**(a) Switching anchor must not move the camera — and the incremental form makes
that fragile.** `updateAnchorNode` (:859) swaps the pointer and calls
`updatePreviousAnchorState()` (:901), resetting `_previousAnchorNodePosition` to
the _new_ anchor's current position. Miss that and the next frame computes
`anchorDisplacement = newAnchorPos - oldAnchorPos` and teleports the camera by the
inter-body distance. `clearPreviousState()` (:883) nulls the same fields at
session-recording and path-playback boundaries for the identical reason. Three
call sites, one invariant, enforced only by convention.

skymap's `applyFocusedBodyPivot.ts` is the same mechanism in **absolute** form —
`target = bodyPosition + panOffset`, never a delta — and its header records why:
idempotent, cannot double-apply across a commit-on-edge boundary. The bug class
OpenSpace guards against by discipline, skymap cannot express.

**(b) Degenerate at the origin.** `:618` bails on `length(pose.position) == 0.0`;
every downstream calculation is a relative offset. `updateCameraScalingFromAnchor`
carries the same guard.

**(c) Order is load-bearing and non-obvious.** horizontal → recompute handle →
vertical → push-to-surface. Reorder and you get either wrong ground speed or a
camera that clips terrain for a frame.

### 1.3 Convergent evolution

skymap arrived at the same two navigation-feel laws independently, and in both
cases with the better formulation:

| law        | OpenSpace                                                     | skymap                                                                                                                   |
| ---------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| zoom       | `translateVertically` — velocity × surface distance           | `zoomedDistance.ts` — geometric in altitude, explicit about degenerating to proportional scaling for `h >> r`            |
| orbit rate | `rotationSpeedScaleFromCameraHeight` — bare `h/r` ratio clamp | `orbitRadPerPixel.ts` — `2·tan(fov/2)·h / (cssHeight·r)`, referenced to _screen ground coverage_ rather than a raw ratio |

### 1.4 Precision and depth

The related problem, solved very differently:

|               | OpenSpace                                                                                                                                                                                                                                                                                                                                                                 | skymap                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| CPU matrices  | `dmat4` throughout; `combinedViewMatrix()` = `sgctView · viewScale · viewRot · inverse(translate(pos))` (`os:src/camera/camera.cpp`)                                                                                                                                                                                                                                      | `mat4d` (wgpu-matrix f64)                                                                                             |
| rebasing      | camera-relative translation baked into the view matrix                                                                                                                                                                                                                                                                                                                    | `rebaseViewProj.ts` — rebase to the eye, `rebased · (pos − O) ≡ vp · pos`                                             |
| GPU precision | **`uniform dmat4` in GLSL** — fp64 in the geometry shader (`os:modules/base/shaders/pointcloud/pointcloud_gs.glsl`). Desktop GL only.                                                                                                                                                                                                                                     | f32 upload; f64 never crosses the boundary. Portable to WebGPU.                                                       |
| depth         | **clip-z discarded.** `z_normalization()` (`os:shaders/powerscaling/powerscalingmath.glsl`) sets `v_out.z = 0`; the fragment carries view distance in metres and `os:shaders/framebuffer/renderframebuffer_fs.glsl:59` writes `gl_FragDepth = normalizeFloat(f.depth)` — a monotone map of [0, 10²⁷] m onto [−1, 1] (`x > 1 ? x/1e30 : x−1`). One buffer, whole universe. | Two depth slabs (`slabs.ts`): `NEAR0` reversed-Z infinite-far, `COSMO` 0.01–50000 Mpc classic. Hardware Z throughout. |
| frustum       | fixed `setNearFarClippingPlane(0.001f, 1000.f)` (`os:src/rendering/renderengine.cpp:590`); the _scene_ is scaled into it via `camera->setScaling()`                                                                                                                                                                                                                       | per-slab frusta; NEAR0's bracket keys off altitude                                                                    |
| cost          | `gl_FragDepth` written on every fragment ⇒ early-Z dead scene-wide                                                                                                                                                                                                                                                                                                        | two passes instead of one; early-Z intact                                                                             |

Worth stealing regardless: `safeLength()` in `os:shaders/floatoperations.glsl` —
vector length where the components' squares overflow f32.

### 1.5 What skymap lacks, ranked

1. **No aim node.** `followAim` (orbit A while B stays screen-stable) is a tour
   primitive with no equivalent here; the pivot-pin fixes the target only.
2. **No global/local rotation split.** The `(target, yaw, pitch, roll, poseBasis)`
   parameterisation carries a documented pitch singularity at ±π/2 and cannot
   express "stand on a surface and look around" without a mode switch. If
   surface-relative flight is ever wanted, `decomposeCameraRotation` is the shape
   that handles orbit _and_ free-look in one path. If it isn't, the current
   parameterisation is easier to tween and serialise and should stay.
3. **No dynamic origin.** `RENDER_ORIGIN_MPC` is fixed at the Sun with the
   customization point documented but unbuilt. Low priority: per-frame eye-rebasing
   already does the work, which is why OpenSpace doesn't need one either.

## 2. Datasets

### 2.1 What OpenSpace renders (Digital Universe census, from the asset descriptions)

| asset                                                  | census                              |
| ------------------------------------------------------ | ----------------------------------- |
| DESI galaxies (full)                                   | 14,633,224                          |
| SDSS                                                   | 2,862,767                           |
| DESI quasars                                           | 2,182,309                           |
| quasars                                                | 755,850                             |
| 2dF                                                    | 229,293                             |
| stars                                                  | 112,746                             |
| 2MASS                                                  | 43,533                              |
| Tully                                                  | 30,159 (+ 30,159 image planes)      |
| exoplanets                                             | 6,284 in 4,680 systems              |
| open clusters                                          | 3,647                               |
| pulsars                                                | 3,221                               |
| Abell clusters                                         | 2,246                               |
| planetary nebulae                                      | 1,657                               |
| H II regions                                           | 1,108                               |
| globular clusters                                      | 161                                 |
| supernova remnants                                     | 112                                 |
| Local Group dwarfs                                     | 102                                 |
| constellations / bounds                                | 88                                  |
| galaxy groups / superclusters / voids / cluster labels | 62 / 33 / 24 / 15 — **labels only** |
| star orbits (Galactic Centre)                          | 7                                   |

Plus: SPICE spacecraft trajectories, Kepler-propagated satellites/debris,
globe-browsing WMS terrain for planets and moons, all-sky imagery, CMB,
heliophysics fieldlines and flux nodes.

### 2.2 What skymap renders (`src/data/sources.ts`, 32 rows / 11 types)

| type                                              | rows | content                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `galaxyCatalog`                                   | 9    | Synthetic, Famous (80 curated), 2MRS, SDSS, GLADE, Milliquas, and three DESI DR1 **geometric selections**: `desiDeep` (2.5° Corona Borealis pencil beam to z ≈ 3.5 / ~7100 Mpc comoving), `desiWedge` (2.5° dec-band fan), `desiSgw` (Sloan Great Wall as a smooth ellipsoid union on the density peaks) |
| `starCatalog`                                     | 2    | Gaia DR3 G<14 — **16,844,156 rows** + GCNS 331,312 + Hipparcos-2 saturation patch; 6 B/record, 16 B octree nodes, tiers ≈2M/6M/17M at 10/30/75 MB transfer, per-frame cut budget 1.5M typical / 2.5M hard cap, crossfade to the procedural MW cloud over 8–25 kpc. Plus 119 curated famous stars.        |
| `body`                                            | 6    | Sun, planets (24 fact rows, 24 orbital-element sets, moons), Earth, Sgr A\* (captions only, draws nothing), **39 bound S-stars** element-positioned about it                                                                                                                                             |
| `structure`                                       | 4    | cluster / supercluster / void / group — MCXC (M500 ≥ 2, z ≤ 0.15) + MSCC (Nm ≥ 6) bulk, plus 42 curated anchors (16 group / 15 cluster / 8 supercluster / 3 void), curated-wins dedup at 3 Mpc                                                                                                           |
| `volume`                                          | 4    | CF-4 DM density (Valade 2024, 256³), MCPM Cosmic Slime (SDSS DR17 VAC), Polyphorm-2MRS (own 4M-agent run, 1200×752×960), MCPM Workbench (own reimplementation of the algorithm)                                                                                                                          |
| `flow`                                            | 1    | CF4++ peculiar-velocity field, GPU particle advection                                                                                                                                                                                                                                                    |
| `filament`                                        | 1    | DisPerSE skeleton                                                                                                                                                                                                                                                                                        |
| `milkyWay` / `constellations` / `zoneOfAvoidance` | 3    | procedural galactic-disk impostor; 88 figures in 3D from real star positions; the dust-obscured band, pickable                                                                                                                                                                                           |
| debug                                             | 3    | gaussian / cartesian / spherical                                                                                                                                                                                                                                                                         |

In flight: Edenhofer 3D dust (±1.25 kpc, **absorptive** volume — dims and reddens
the stars behind it, teaching the scalar-volume march to be multiplicative rather
than purely emissive).

## 3. Renderers

### 3.1 Where skymap is ahead

|                       | OpenSpace                                                                                                                                                              | skymap                                                                                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| stars                 | 112,746                                                                                                                                                                | ~17M Gaia, octree-LOD, streamed — ~150×                                                                                                                                                                               |
| Galactic Centre       | 7 star orbits                                                                                                                                                          | 39 S-stars with orbital elements about Sgr A\*                                                                                                                                                                        |
| cosmic web as a field | none                                                                                                                                                                   | 4 scalar volumes, two of them self-generated                                                                                                                                                                          |
| filaments             | none                                                                                                                                                                   | DisPerSE skeleton                                                                                                                                                                                                     |
| peculiar velocity     | heliospheric fieldlines only (`renderablefluxnodes`)                                                                                                                   | CF4++ extragalactic flow field                                                                                                                                                                                        |
| Zone of Avoidance     | none                                                                                                                                                                   | first-class, pickable                                                                                                                                                                                                 |
| galaxy at close range | **archetype sprites** — a shipped `sampler2DArray` where a generic "spiral" texture stands in for every spiral (`os:data/assets/scene/digitaluniverse/tully.asset:76`) | procedural 3D-oriented disk impostors (8 px → ∞, crossfaded over 8–14 px), real streamed SDSS/DSS cutouts in an LRU atlas, curated 1024² hi-res LOD for Famous                                                        |
| selection function    | `ScaleExponent = 22.6` for SDSS, `21.7` for Tully — eyeballed constants — plus a colormap column                                                                       | `mLim` per source, `vMaxWeight`, `schechterRatio`, `angularDensityWeight`, `colourSpec` with `kPerZ` K-correction slopes **calibrated against the measured BGS g−r distribution** (p10 0.36 / median 0.61 / p90 0.90) |
| identity              | every survey asset is `Focusable = false` — no galaxy is clickable                                                                                                     | r32uint pick texture (6-bit source + 26-bit index), InfoCard, alias index, search                                                                                                                                     |
| distances             | redshift → distance, linear                                                                                                                                            | flat-ΛCDM Simpson-integrated comoving, **plus** a CF-4 / HyperLEDA measured-distance override inside 30 Mpc with the catalogued z kept separately for display                                                         |
| billboards            | geometry shader, `max_vertices = 4`                                                                                                                                    | instanced quads (WebGPU has no GS)                                                                                                                                                                                    |
| LOD                   | per-asset authored `FadeInDistances` (SDSS `{220, 650}` Mpc)                                                                                                           | tiered `.bin` variants + autoLod + per-galaxy `apparentSizePx` gating                                                                                                                                                 |
| pipeline              | HTTP-synced `.speck`/`.csv`, resolved at runtime                                                                                                                       | build-time parse → 64 B/galaxy binary, content-hashed + manifested                                                                                                                                                    |

The selection-function row is the sharpest difference: skymap renders
survey-aware science, OpenSpace renders a colormapped point cloud sized by a
hand-tuned constant.

### 3.2 Where OpenSpace is ahead

- **Spacecraft + SPICE.** Real mission ephemerides, instrument cones, Kepler
  propagation for ~1M satellites and debris. skymap has no spacecraft and analytic
  elements only.
- **Multi-body terrain.** Globe browsing streams WMS/WMTS for Mars, the Moon,
  Mercury, LRO/Treks. skymap's quadtree virtual texture covers **Earth only**
  (though at 0.15 m/texel EOX, finer than most of their layers).
- **Discrete galactic catalogs.** Exoplanets, pulsars, globulars, open clusters,
  planetary nebulae, H II regions, OB associations, brown/white dwarfs, supernova
  remnants — none of which skymap has.
- **Raw survey volume.** DESI full 14.6M shown whole, vs skymap's three deliberate
  geometric selections. An editorial choice, not a capability gap, but "all of DR1
  at once" isn't available here.
- **Heliophysics.** Space-weather fieldlines, flux nodes, magnetosphere volumes.
- **Output.** SGCT dome/cluster, stereo with adaptive depth-of-focus.

## 4. Verdict

They are a **planetarium instrument**: maximum catalog surface area, everything
drawn at once, presentation authored per-asset in Lua, navigation and scale solved
beautifully at engine level, individual objects mostly anonymous.

skymap is a **cosmological instrument**: fewer catalogs, but each carries its
selection function, distance ladder, completeness limit and identity — and it
renders _derived physics_ (dust density, cosmic-web trace density, peculiar
velocity, filament skeletons) that OpenSpace has no extragalactic equivalent for.

The two places they lead in kind rather than count are SPICE-grade spacecraft
ephemerides and multi-body terrain streaming. Everything else on their list is
data acquisition against a pipeline that already exists: the registry is
discriminated by type and the `add-data-source` skill maps the edit surface, so
pulsars or globulars are a new row plus a parser, not new architecture.

## 5. Candidate follow-ups

Not filed in `BACKLOG.md` — which of these is worth wanting is a product call,
not a research finding.

- **Aim node** (`followAim`) — orbit A while B stays screen-stable. Tour primitive.
- **Global/local rotation decomposition** — prerequisite for surface-relative
  flight or free-look; removes the pitch singularity. Only worth it if that
  capability is wanted.
- **Discrete galactic catalogs** — globular clusters (161), planetary nebulae
  (1,657), open clusters (3,647), pulsars (3,221), H II regions (1,108). Each is a
  `body`- or `structure`-shaped registry row plus a VizieR parser. Globulars are
  the natural first: they sit in the halo at the scale the Gaia field already
  covers, and their distances are well measured.
- **`safeLength()`** — cheap import for any shader doing arithmetic on Mpc-scale
  vectors in f32.
