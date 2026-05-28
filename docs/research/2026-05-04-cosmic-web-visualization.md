# Cosmic Web Visualization — Research + Implementation Roadmap

**Date:** 2026-05-04
**Scope:** survey current SOTA on supercluster / void / filament identification + visualization, then map options onto skymap's WebGPU + TS architecture.
**Status:** research notes + ranked options. Each option has enough detail to spawn its own implementation plan when picked.

---

## 1. Why this matters for skymap

Skymap currently renders the cosmic web as a sea of point billboards: every galaxy is a dot, sometimes a textured quad on close approach. The **structure** — superclusters, filaments, voids — is implicit in the point distribution but the user has to spot it themselves. Adding explicit structure cues turns the renderer from "dots in space" into "the cosmic web", which is the actual scientific story.

Three independent signals can be surfaced:

1. **Density** — local crowdedness. High = clusters/filaments, low = voids.
2. **Filament skeleton** — the 1-dimensional ridges connecting dense knots.
3. **Named landmarks** — superclusters and voids astronomers have already identified and named (Laniakea, Shapley, Boötes Void, etc.).

Each requires different upstream data and different rendering plumbing. They are complementary rather than alternatives — a fully-featured viewer would have all three with toggles.

---

## 2. State-of-the-art findings

### 2.1 Filament identification — DisPerSE remains the workhorse

**[DisPerSE](https://ar5iv.labs.arxiv.org/html/1009.4015)** (Sousbie 2011) is still the canonical filament tracer in the SDSS / DESI literature in 2025-2026. Method: builds a Delaunay tessellation of the galaxy positions, computes the density field via DTFE, identifies critical points (maxima / saddles / minima) using discrete Morse theory, and threads filaments along ridges between them. Output: persistent topological skeleton (`.NDskl` format) with a configurable persistence threshold for how robust each feature must be.

**Recent 2025 applications using SDSS / DESI data:**

- [Wu et al. 2025, MNRAS — "Cosmological imprints in the filament with DisPerSE"](https://academic.oup.com/mnras/article/538/2/830/7917623) ran DisPerSE on N-body simulations to derive a filament-length power law dependent on cosmology; demonstrates DisPerSE outputs are stable + cosmologically informative.
- [Zarattini & Aguerri 2025](https://arxiv.org/html/2601.13309) "Galaxy transformation across the cosmic web: The influence zone of filaments" — same SDSS pipeline, looking at how proximity to filaments affects galaxy properties.
- ["Connecting clustering and the cosmic web"](https://arxiv.org/html/2511.19607) (late 2025) — built a fresh filament catalog on **SDSS DR18 Legacy North** with DisPerSE at `5σ` persistence + 2 smoothing passes (the "most conservative and reliable" parameter set).
- [Tracing missing baryons via tSZ + CMB lensing stacking](https://arxiv.org/html/2507.08561) — DisPerSE filaments on SDSS LOWZ-CMASS, ~30,700 filaments, length 30-100 cMpc, z=0.2-0.6.

**Alternatives, less common:**

- **NEXUS+** (Cautun et al. 2013) — multi-scale tensorial classification (knot/filament/sheet/void per voxel). Modern competitor.
- **Bisous** (Tempel et al. 2014) — stochastic geometry, models filaments as cylinders. Probabilistic.
- **β-skeleton** (Suárez-Pérez et al. 2021; Yin et al. 2024) — graph-based, used now for cosmological constraints. Cheap to compute.

**For skymap, DisPerSE on the merged SDSS+2MRS+GLADE cloud is the obvious choice** — it has the most published validation, accepts plain galaxy catalogs, and the output `.NDskl` is well-defined.

### 2.2 Void identification — multiple maintained catalogs

**[VIDE](https://www.semanticscholar.org/paper/VIDE:-The-Void-IDentification-and-Examination-Sutter-Lavaux/71f49ba709f9a9ca5762161e06a23ae880168a21)** (Sutter et al. 2015) wraps ZOBOV and remains a standard, but the field has bifurcated:

**Modern void catalogs (2024-2025):**

- **[DESIVAST](https://arxiv.org/abs/2411.00148)** (Rezaie et al. 2025, ApJ) — first DESI DR1 void catalog. Three flavours: VoidFinder (1461 voids), V2/REVOLVER (420), V2/VIDE (295). Out to z=0.24. **Highest signal-to-noise local-universe void catalog currently available.** [DESI release page](https://data.desi.lbl.gov/doc/releases/dr1/vac/desivast/).
- **[Updated SDSS DR7 void catalogs](https://iopscience.iop.org/article/10.3847/1538-4365/acabcf)** (Douglass et al. 2023) — re-runs of VoidFinder, VIDE, REVOLVER on SDSS DR7. ~1100-1200 voids depending on algorithm. Available on Zenodo, [doi:10.5281/zenodo.7406035](https://doi.org/10.5281/zenodo.7406035).
- **Persistent-homology void catalog** (2023+) — topology-based; 32 highly robust voids in SDSS Main, more conservative than ZOBOV.
- **[ASTRA](https://arxiv.org/html/2404.01124)** (Stochastic Topological RAnking, 2024) — probabilistic per-galaxy classification (void/sheet/filament/knot). Already applied to [DESI EDR](https://arxiv.org/html/2604.01456) — public catalog at [Zenodo doi:10.5281/zenodo.19358024](https://zenodo.org/doi/10.5281/zenodo.19358024). **This one is interesting because it gives a per-galaxy soft membership probability, which maps trivially to a per-vertex shader attribute.**

**For skymap, two paths make sense:**

- For **named famous voids** (Boötes, Eridanus, Local Void): hand-curate a list with center + effective radius.
- For **comprehensive void overlay**: ingest one of the public catalogs (DESIVAST is freshest; SDSS DR7 has wider sky coverage) as a 4th catalog source rendered as translucent spheres.

### 2.3 Supercluster / large-scale dynamic structure — Cosmicflows

**[Cosmicflows-4](https://projets.ip2i.in2p3.fr/cosmicflows/)** (Tully et al. 2023) is the canonical peculiar-velocity catalog used to define superclusters as **basins of gravitational attraction** (watersheds in the velocity divergence field).

**[Dupuy & Courtois 2023, A&A](https://www.aanda.org/articles/aa/full_html/2023/10/aa46802-23/aa46802-23.html)** "Dynamic cosmography of the local Universe: Laniakea and five more watershed superclusters":

- Confirmed Laniakea volume: 2 × 10⁶ (Mpc/h)³
- Defined Apus, Hercules, Lepus, Perseus-Pisces, Shapley as watersheds
- Located the Boötes and Sculptor void central repellers
- Dipole + Cold Spot repellers appear as a single entity
- **Public data:** basin watershed envelopes as FITS volumes, 1000 Mpc/h grid, 128³ voxels with integer labels per basin

**[Courtois et al. 2025 (CF4++)](https://www.aanda.org/articles/aa/pdf/2025/09/aa53677-25.pdf)** — extends CF4 with DESI-PV-DR1 + WALLABY + FAST-DR1 to ~30,000 km/s. Reveals the **Vela supercluster** hidden in the Zone of Avoidance.

**Visualization heritage:** the [SDvision](https://irfu.cea.fr/vweb) tool from Pomarède et al. produced the canonical Laniakea visualisation — translucent isosurfaces of velocity divergence overlaid on galaxy points + streamlines. Publicly accessible interactive viewer at [cosmicweb.kimalbrecht.com](https://cosmicweb.kimalbrecht.com/) and [The Cosmic V-Web (CEA-Irfu)](https://irfu.cea.fr/vweb). [NASA SVS "Cruising the Cosmic Web" (2024)](https://svs.gsfc.nasa.gov/14598/) is the polished public-facing fly-through.

### 2.4 Density estimators

For local-density coloring (the cheapest path), the standard astronomical-literature options:

- **k-NN distance** to k=5 or k=10 neighbours. [Cooper 2005, Sobral 2011]; widespread but spiky for low k, oversmooth for high k.
- **DTFE** (Delaunay Tessellation Field Estimator) — adapts to local point density, no smoothing parameter. Gold-standard for modern work; what DisPerSE itself uses internally.
- **Voronoi tessellation density** — equivalent at first order; cheaper to compute incrementally if points stream in.
- **kNN-CDF** ([Banerjee 2021](https://academic.oup.com/mnras/article/522/3/3935/7146231); [fnntw](https://github.com/jamesh-banks/fnntw) — fast Rust+Python lib) — modern cosmological summary statistic; doesn't directly give per-galaxy density but useful for parameter inference.

For skymap, the relevant question is: **what attribute do we attach to each galaxy so the shader can color/scale by it?** The answer is the **kth-NN distance** in 3D Mpc, computed once at build time, encoded as a per-vertex f32. k=10 strikes a reasonable balance between robustness and contrast.

### 2.5 Existing in-browser cosmic-web viewers

For inspiration / interop:

- **[Network Behind the Cosmic Web](https://cosmicweb.kimalbrecht.com/)** (Albrecht) — d3-based 2D network viz; not a 3D inspiration per se but the data model (nodes + edges from a filament catalog) is exactly what we'd ingest from DisPerSE.
- **[The Cosmic V-Web (CEA-Irfu)](https://irfu.cea.fr/vweb)** — Pomarède's interactive browser version; uses pre-rendered isosurfaces.
- **[NASA SVS Cosmic Web](https://svs.gsfc.nasa.gov/14598/)** — pre-rendered video flythrough; not interactive but visually striking; the per-galaxy points + glowing-purple-filament aesthetic is exactly what skymap could approximate.
- **[Three.js Roadmap WebGPU galaxy sim](https://threejsroadmap.com/blog/galaxy-simulation-webgpu-compute-shaders)** (Dec 2025) — relevant for compute-shader patterns, not cosmic-web specifically.

No public viewer renders DisPerSE skeletons interactively in WebGPU as of late 2025 / early 2026. **There's a real opportunity here.**

---

## 3. Public data catalogs available

| Catalog                                                              | What                                                                                             | Format                                     | Size                                                                   | Good for                                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [Cosmicflows-4](https://projets.ip2i.in2p3.fr/cosmicflows/) basins   | 6 supercluster watershed FITS volumes (Laniakea, Apus, Hercules, Lepus, Perseus-Pisces, Shapley) | FITS, 128³ int volume                      | ~8 MB                                                                  | supercluster bounding-region overlays                                                               |
| [DESIVAST](https://data.desi.lbl.gov/doc/releases/dr1/vac/desivast/) | DESI DR1 voids (3 algorithms)                                                                    | FITS table per algo                        | ~few MB total                                                          | comprehensive void overlay (z<0.24)                                                                 |
| [SDSS DR7 voids](https://doi.org/10.5281/zenodo.7406035)             | SDSS DR7 voids (3 algorithms)                                                                    | Zenodo (FITS)                              | ~few MB                                                                | wider-sky void overlay (older but comprehensive)                                                    |
| [DESI EDR ASTRA](https://zenodo.org/doi/10.5281/zenodo.19358024)     | per-galaxy void/sheet/filament/knot probability                                                  | Zenodo (table)                             | tens of MB                                                             | per-galaxy environment classification (color overlay)                                               |
| Yang et al. SDSS group catalog                                       | ~500k galaxy groups/clusters                                                                     | text catalog                               | ~tens of MB                                                            | cluster-scale concentrations within filaments                                                       |
| **Self-computed** DisPerSE skeleton                                  | `.NDskl` filament list                                                                           | binary                                     | tens-hundreds of MB                                                    | the cosmic-web skeleton; **only option for filaments** since no comprehensive public catalog exists |
| **Self-computed** kth-NN density per galaxy                          | f32 per cloud point                                                                              | trivially encoded into existing PointCloud | 0 incremental on disk if appended; +4 bytes/point if added as new slot | local-density color overlay                                                                         |

---

## 4. Visualization techniques and how they fit skymap

### 4.1 Per-galaxy density coloring (cheapest)

Compute kth-NN distance per galaxy at build time. Append as a new f32 slot in the v4 PointCloud format (would push to v5 / 11 slots / 44 bytes). Modify `points.wgsl` to mix the existing color ramp with a density-driven hue/saturation: high-density galaxies render warmer/brighter, low-density (in voids) render cooler/dimmer.

**Code surface:** parser changes to compute kNN at build time (~50 LOC; can use a kd-tree library or hand-rolled), format bump to v5, vertex layout extension, shader change. **Two days.**

**Effect:** instantly turns the dot field into a structure-revealing display. Best ROI for the effort.

### 4.2 Named-supercluster + named-void overlays

Extend the famous-galaxies pattern (currently in flight) to a `Source.Structures` catalog. Each entry: name, RA, Dec, distance, "extent" metadata (sphere radius for voids; convex-hull mesh or axis-aligned ellipsoid for superclusters), description.

For voids: render as translucent sphere mesh (back-face only or with custom alpha falloff) at the void's position+radius. Void list: ~30 famous voids (Boötes, Local, Eridanus, Sculptor, etc.) hand-curated.

For superclusters: harder to render geometry-faithfully. Two options:

- (a) Just label them at their centroid like a city on a map. Cheap; "M31 in space" feel.
- (b) Import the Cosmicflows-4 basin FITS volumes, march cubes them to mesh at build time, render as semi-transparent meshes. Very visually striking but more work.

**Code surface for (a):** clone of the famous-galaxies stack with a different thumbnail-renderer (none — just text labels), no per-galaxy bin needed, just sidecar JSON. **Two days.**

**Code surface for (b):** add FITS reader for the basin volumes, marching-cubes mesher (offline, in `tools/`), GLB or custom binary mesh format, new GPU pipeline for translucent triangles. **Two weeks-ish.**

### 4.3 DisPerSE filament skeleton as a render layer

Run DisPerSE offline on the merged SDSS+2MRS+GLADE cloud (~12-24 hours on a workstation; can be parallelised). Output `.NDskl` skeleton: ~500k segments at typical persistence thresholds.

Build-time conversion: write a `.NDskl` → custom binary parser that emits a flat list of line segments (each: from-xyz, to-xyz, ridge density). Ship as `public/data/filaments.bin`.

Runtime: new WGSL render pass with `topology: 'line-list'`. Vertex shader reads from a per-vertex f32 buffer; fragment shader does a soft-glow line. Could optionally fade by ridge density so faint filaments are subtle.

**Code surface:**

- Offline: install DisPerSE (C++ build), wrap in a `tools/` Node script, write parser. ~1 week including DisPerSE build.
- Runtime: new pipeline, vertex/fragment shaders, engine integration. ~3 days.
- Total: **~2 weeks.**

**Effect:** the canonical "cosmic web" look — the visual you see in every paper figure. Extremely high payoff.

### 4.4 DTFE volume rendering (heaviest)

Compute a 3D density grid offline (DTFE → 256³ voxels = 64 MB at f32, or 16 MB at u8). Upload as a 3D texture. New fullscreen WGSL pass that raymarches, accumulating density-weighted color along view rays.

**Code surface:** offline density-grid build, 3D texture upload path, raymarching shader, depth integration with the existing point + quad passes. Tricky compositing because raymarched fog wants to interleave with point billboards (currently the renderer assumes everything is depth-sorted opaque or alpha-blended back-to-front).

**Total:** **~3-4 weeks.** Stunning visuals (think the NASA SVS "Cruising the Cosmic Web" video) but heavy on integrated GPUs and a substantial rewrite of the per-frame compositing logic. Likely the most fragile.

### 4.5 Cosmicflows-4 streamlines (cosmography mode)

For users who want to see _how_ the cosmic web is moving rather than just where things sit: download the Cosmicflows-4 reconstructed velocity field (publicly available), seed N streamlines per galaxy, integrate forward via Runge-Kutta in a Node build script, ship as a binary list of polylines. Render as line-strip with optional flow-direction color.

This is what makes the Laniakea visualisation look like flowing rivers — each streamline is the gravitational fall-line from a galaxy toward its nearest attractor.

**Code surface:** velocity-field reader (FITS), streamline integrator, line-strip render pass. **~2 weeks** assuming the velocity field doesn't need modification.

**Effect:** transforms the renderer from "static map" to "flow visualisation". Very dramatic; pairs naturally with named superclusters.

---

## 5. Ranked options for skymap

Ordered by ROI (visual payoff per implementation effort), assuming each is implemented independently.

| Rank | Option                                              | Effort    | Visual payoff                                         | Dependencies                                |
| ---- | --------------------------------------------------- | --------- | ----------------------------------------------------- | ------------------------------------------- |
| 1    | **Per-galaxy kth-NN density coloring** (§4.1)       | 2 days    | Big — points become structure                         | None                                        |
| 2    | **Named voids + supercluster labels** (§4.2a)       | 2 days    | Moderate — adds context, is searchable via Cmd+K      | Famous-galaxies pattern (already in flight) |
| 3    | **DisPerSE filament skeleton** (§4.3)               | 2 weeks   | Huge — the canonical cosmic-web look                  | None                                        |
| 4    | **Cosmicflows-4 streamlines** (§4.5)                | 2 weeks   | Huge — flow visualisation, complementary to filaments | None                                        |
| 5    | **Cosmicflows-4 supercluster basin meshes** (§4.2b) | 2 weeks   | Big — translucent shells for the named superclusters  | (4) optional                                |
| 6    | **DTFE volume rendering** (§4.4)                    | 3-4 weeks | Spectacular but heavy + fragile                       | None; conflicts with current compositing    |

**My recommendation for the next pass:** ship (1) first (cheap; immediate visual upgrade), then (3) DisPerSE filaments (canonical look). (2) named voids/supers slot in any time the famous-galaxies pattern is reused. (4) and (5) are great follow-ups once filaments + density are in place.

---

## 6. Open questions before implementing any of these

1. **Density encoding format-bump:** option (1) needs an extra f32 per point. Bump v4 → v5 or compute density at runtime via shader access to a kd-tree texture? On-disk bump is much simpler; runtime is more flexible. **Recommend: v5 with `localDensityKpc` slot.**

2. **DisPerSE compute environment:** do we have a workstation that can run DisPerSE offline, or do we need a cloud build? DisPerSE is C++; needs CGAL + boost. **Investigate before scoping option (3).**

3. **Filament rendering detail:** DisPerSE outputs ~10⁶ segments at typical persistence. At line-list rendering, that's 2M vertex draws — plausible on a modern GPU but worth load-testing. **Add a persistence slider in the settings panel** so the user can dial up/down.

4. **Coordinate system parity:** Cosmicflows-4 uses **supergalactic** coordinates by default. Skymap uses equatorial. Need a one-time rotation matrix bake when ingesting CF4 data.

5. **Visualisation polish vs scientific accuracy:** for the renderer to look like Laniakea videos we'd want both filaments (option 3) AND streamlines (option 4) AND named labels (option 2). Doing only one feels incomplete; doing all three takes 4+ weeks. **Recommend: ship in stages, with option (1) as the standalone "first taste" of structure visualisation.**

---

## 7. Suggested next concrete plan

If you want to act on this, the natural next plan is **Option 1 (per-galaxy density coloring)**. Rough sketch — would expand into a full bite-sized TDD plan via the writing-plans skill:

- T0: pre-flight (typecheck + tests green; existing .bin files present)
- T1: pure helper `kthNearestNeighborDistance(positions, k)` in `tools/parsers/common.ts` or `tools/density.ts` (kd-tree based; Vitest)
- T2: `ParsedRecord` and `PointCloud` types gain `localDensityKpc: number | Float32Array`
- T3: bump binary format to v5 (12 slots / 48 bytes per point) + tests
- T4: build pipeline computes the density, applies per-survey k (10 for SDSS, 5 for sparser 2MRS/GLADE)
- T5: vertex layout extension in `pointRenderer.ts` (11→12 slots, 44→48 bytes)
- T6: `points.wgsl` reads the new attribute; mix into intensity/colour ramp
- T7: SettingsPanel exposes a "Density coloring" toggle + slider
- T8: README + visual verification

That's about 2 days of focused work; would produce a renderer that visibly shows the filaments-and-voids structure even before any explicit filament catalog is ingested.

**Sources:**

- [DisPerSE original paper (Sousbie 2011)](https://ar5iv.labs.arxiv.org/html/1009.4015)
- [Wu et al. 2025 — Cosmological imprints in the filament with DisPerSE (MNRAS)](https://academic.oup.com/mnras/article/538/2/830/7917623)
- [Connecting clustering and the cosmic web (2511.19607, 2025)](https://arxiv.org/html/2511.19607)
- [SDSS LOWZ-CMASS missing baryons via DisPerSE (2507.08561, 2025)](https://arxiv.org/html/2507.08561)
- [Galaxy transformation across the cosmic web (2601.13309)](https://arxiv.org/html/2601.13309)
- [DESIVAST: DESI DR1 voids (Rezaie et al. 2025, ApJ)](https://arxiv.org/abs/2411.00148)
- [DESIVAST DESI release page](https://data.desi.lbl.gov/doc/releases/dr1/vac/desivast/)
- [Updated SDSS DR7 void catalogs (Douglass et al. 2023)](https://iopscience.iop.org/article/10.3847/1538-4365/acabcf)
- [VIDE toolkit (Sutter et al. 2015)](https://www.semanticscholar.org/paper/VIDE:-The-Void-IDentification-and-Examination-Sutter-Lavaux/71f49ba709f9a9ca5762161e06a23ae880168a21)
- [ASTRA stochastic topological ranking (2024)](https://arxiv.org/html/2404.01124)
- [DESI EDR cosmic-web environment catalog (2604.01456)](https://arxiv.org/html/2604.01456)
- [Dupuy & Courtois 2023 — Dynamic cosmography of Laniakea + 5 superclusters (A&A)](https://www.aanda.org/articles/aa/full_html/2023/10/aa46802-23/aa46802-23.html)
- [Courtois et al. 2025 — CF4++ extension + Vela supercluster (A&A 2025)](https://www.aanda.org/articles/aa/pdf/2025/09/aa53677-25.pdf)
- [Cosmicflows project home](https://projets.ip2i.in2p3.fr/cosmicflows/)
- [SDvision Cosmic V-Web (CEA-Irfu)](https://irfu.cea.fr/vweb)
- [Network Behind the Cosmic Web (Albrecht)](https://cosmicweb.kimalbrecht.com/)
- [NASA SVS — Cruising the Cosmic Web (2024)](https://svs.gsfc.nasa.gov/14598/)
- [Three.js Roadmap WebGPU galaxy sim (Dec 2025)](https://threejsroadmap.com/blog/galaxy-simulation-webgpu-compute-shaders)
- [WebGPU for real-time 3D data visualization (2025)](https://tectivor.com/webgpu-web-based-interactive-3d-data-visualization/)
- [k-NN density estimator literature review](https://academic.oup.com/mnras/article/522/3/3935/7146231)
