# Cluster + Void Visualization Research for skymap

> **Research-only document.** Not committed. Survey of design space for layering galaxy-cluster and cosmic-void visualization on top of the existing point-cloud renderer.
>
> **Note on sources:** WebSearch and WebFetch were denied at runtime in the agent environment, so external claims (catalog row counts, exact paper figures, third-party visualization URLs) below are drawn from training data and should be re-verified before being cited or relied on for implementation. URLs that are well-established project homepages (`tng-project.org`, `risa.stanford.edu/redmapper`, `cosmicweb.uchicago.edu`) are given without independent live confirmation.

---

> **Verification (2026-05-03, WebFetch-only):** A subset of claims were checked against authoritative sources. Strikethrough = corrected; ⚠ = unverifiable from URLs available in this doc. WebSearch was unavailable so claims without a pre-cited URL could not be verified.

## Executive summary (5 lines)

1. Use **pre-existing catalogs** (redMaPPer for clusters, Pan/Sutter SDSS voids) — do not run FoF/ZOBOV in-browser. They are tiny (low MB) and already physically meaningful.
2. **Phase 1 MVP:** load the cluster catalog, render each as an **additive billboard glow halo** (size from richness/R200) plus optional **wireframe sphere outline**; load the void catalog and render each as a **soft inverted-glow translucent sphere** with anchored hover-only labels.
3. **Phase 2 polish:** add **per-galaxy membership tinting** for cluster galaxies, **anisotropic ellipsoid fits** computed at build time, **filament tubes** between cluster pairs above a density-edge threshold, and a **camera-distance fade** so structure only appears when zoomed out.
4. The **hardest unsolved problems** are 3D label placement, translucent-volume depth interaction with the existing additive-blended point cloud, and choosing a principled linking-length / void-significance threshold — these eat more time than rendering.
5. Build phases are small (Phase 1) and medium (Phase 2); no marching-cubes, no volumetric raymarching in scope — those would push to large.

---

## 1. Detection algorithms

The recommendation up front: **do not run detection in-browser at runtime.** Detection of clusters and voids on millions of points is a minutes-to-hours job in Python, the parameter choices matter scientifically, and there are excellent published catalogs derived from the same SDSS/2MRS data skymap already uses. Treat detection as a build-time concern (a `tools/` script that produces a small JSON/binary alongside the existing point cloud), or skip it entirely and ship a published catalog.

### Clusters

| Method                             | Cost                                                                                                                                                                                                      | Output                                    | Bundle vs. runtime                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------- |
| **Friends-of-Friends (FoF)**       | O(N log N) with KD-tree; minutes for 3M points in Python; not great in JS/WebGPU                                                                                                                          | List of member-galaxy indices per cluster | Build-time only                        |
| **DBSCAN**                         | Similar order to FoF but more robust to outliers; one density parameter ε plus minPts                                                                                                                     | Same as FoF                               | Build-time only                        |
| **HDBSCAN**                        | Slower, but produces a multi-scale hierarchy (great for "show clusters at multiple zoom levels")                                                                                                          | Tree of clusters with stability scores    | Build-time only                        |
| ✓ **redMaPPer catalog (SDSS DR8)** | Already computed; ~25k clusters in DR8 over 0.08<z<0.55 (confirmed: Rykoff+ 2014, https://arxiv.org/abs/1303.3562; doc said ~26k, paper says ~25k); columns: RA, Dec, z, λ (richness), R_λ (radius proxy) | Center + richness                         | **Bundle directly.** Drop-in.          |
| ✓ **Abell catalog**                | Historical, optical; ~4k clusters (confirmed: 4,073 rich clusters per https://en.wikipedia.org/wiki/Abell_catalogue)                                                                                      | RA/Dec/z/richness                         | Bundle directly (small)                |
| ✓ **MCXC** (X-ray)                 | 1,743 clusters with M500 and R500 (confirmed: Piffaretti+ 2011, https://arxiv.org/abs/1007.1916)                                                                                                          | Bundle directly                           |
| ✓ **Yang+ group catalog**          | Halo-based (NOT FoF — original doc was wrong) group finder run on SDSS DR4; 301,237 groups including isolated galaxies (confirmed: Yang+ 2007, https://arxiv.org/abs/0707.4640)                           | Member lists                              | Bundle directly; richer than redMaPPer |

For shape information beyond a center+radius, the right move at build time is: take the catalog's member-galaxy list, compute the **3D covariance matrix** of member positions, and store the three eigenvalues + eigenvectors per cluster. That is enough to draw an ellipsoid. Runtime cost: ~24 floats per cluster (cheap).

### Voids

| Method                                                 | Cost                                                                                                                                                                                                                                                                               | Output                                                   | Bundle vs. runtime                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| ✓ **VIDE / ZOBOV** (watershed on Voronoi tessellation) | Heavy; not feasible at runtime (confirmed: VIDE = Sutter+ 2015, https://arxiv.org/abs/1406.1191, builds on ZOBOV = Neyrinck 2008, https://arxiv.org/abs/0712.3049; VIDE explicitly does Voronoi+watershed; ZOBOV abstract says Voronoi-only and does not use the word "watershed") | Set of Voronoi cells per void → irregular polyhedron     | Build-time precompute, ship a simplified ellipsoid fit per void                              |
| **Sphere-growth (e.g. Hoyle & Vogeley)**               | Moderate                                                                                                                                                                                                                                                                           | Sphere center + radius                                   | Build-time                                                                                   |
| ⚠ **Pan+ 2012 SDSS DR7 voids**                         | Already computed; ~1000 voids in SDSS volume                                                                                                                                                                                                                                       | Center, effective radius, member galaxies                | **Bundle directly.** (still unverified — no arxiv ID tried; paper not on the candidate list) |
| ✓ **Sutter+ 2012 / public void catalog**               | Already computed for SDSS DR7 (modified ZOBOV); voids with effective radii 5–135 h⁻¹ Mpc; total count not in abstract — see cosmicvoids.net (confirmed: Sutter+ 2012, https://arxiv.org/abs/1207.2524)                                                                             | Center, R_eff, member Voronoi cells (per public catalog) | Bundle (a stripped subset)                                                                   |

**Recommendation:** ship a Sutter+ or Pan+ catalog reduced to `{center_xyz, R_eff, ellipticity_axes, ellipticity_basis}`. ~1000 voids × ~64 bytes = trivially small.

The honest caveat: _VIDE voids are not spheres or ellipsoids._ They are watershed basins with concave boundaries. Drawing them as spheres or ellipsoids is a **deliberate visual lie** in service of legibility — accept it, but do not pretend the boundary is the real thing. (See "Hard problems" at the end.)

---

## 2. Rendering techniques

Cost annotations assume "millions of points already on screen at 60 FPS" — i.e. the budget is _small_.

### Convex hull / α-shape envelopes

_Look:_ a translucent crinkly bag wrapping the dense knot of cluster galaxies. _Data:_ member positions + QHull at build time → indexed mesh. _GPU:_ trivial — a few hundred triangles per cluster, alpha-blended. _WebGPU:_ one extra render pass with depth-write-disabled, sorted back-to-front per frame. Looks good for clusters with >50 members; degenerate for small ones.

### Ellipsoid fits

_Look:_ smooth, anisotropic ovoid; can rotate to show the cluster is not round. _Data:_ per cluster, eigendecomposition of position covariance → 3 axes + orientation matrix. _GPU:_ draw a unit sphere mesh, push the per-instance affine transform via instanced rendering. ~26k clusters × one sphere = ~26k draws, easily one instanced call. **Best cost/quality tradeoff for clusters.**

### Density isosurfaces (Marching Cubes)

_Look:_ organic, blobby surfaces tracing the full cosmic web — gorgeous but heavy. _Data:_ runtime kernel-density-estimate on a 3D grid → MC. _GPU:_ compute pass for KDE (~64³ to 256³ grid), MC produces 0.5–5M triangles for 256³. _WebGPU:_ feasible but it's the largest single feature in this list. **Defer.** Fits Phase 3 not Phase 2.

### Volumetric density rendering (raymarching)

_Look:_ glowing nebular fog over the whole sky. _Data:_ same density grid stored as a 3D texture. _GPU:_ fragment shader that marches per-pixel through the volume; expensive per-pixel cost but no triangle count. **Risk:** depth interaction with the additive-blended point cloud is genuinely tricky (see Hard Problems). Defer.

### Glow halos at cluster centers

_Look:_ warm soft circular glow at each cluster center — exactly the effect Aladin and the WorldWide Telescope use for nebula/cluster overlays. _Data:_ center + size scalar. _GPU:_ additive billboard sprite, one quad per cluster, smooth radial falloff. **Cheapest possible win.** Pairs perfectly with the existing additive point cloud aesthetic. Recommended for Phase 1.

### Filaments / cosmic-web skeleton

_Look:_ glowing tubes connecting clusters along density ridges. _Data:_ ✓ DisPerSE (confirmed: Sousbie 2011, https://arxiv.org/abs/1009.4015 — operates on Delaunay tessellation, identifies filaments connected at cluster nodes via persistence-based topology) / NEXUS skeleton at build time; output is a graph of vertices with positions. _GPU:_ extruded tube mesh or fat-line shader. Real DisPerSE pipelines are heavy; cheating by drawing edges of an MST-of-cluster-centers is visually 80% as good for 5% of the cost. Phase 2.

### Wireframe outlines

_Look:_ thin glowing lines around the cluster shape. _Data:_ same hull/ellipsoid mesh, drawn as line list with an alpha falloff to avoid moiré. _GPU:_ trivial. Communicates shape without occluding the underlying galaxies. **Excellent default for "always-on" cluster mode.**

### Per-galaxy membership tint

_Look:_ the existing point cloud, but cluster members shifted to a warmer hue (e.g. +20 K toward red on the existing color map, or a per-cluster categorical color). _Data:_ per-galaxy `clusterId` (int32, 0 = field). _GPU:_ one new vertex attribute, branch in the existing fragment shader. **Almost free.** Communicates "which galaxies belong to which structure" better than any envelope. Phase 2.

### Negative-space treatment for voids

_Look:_ a faint, slightly-darker-than-background spherical region with a soft inner glow at the boundary; surrounding galaxies inside the sphere are dimmed slightly to emphasize emptiness. _Data:_ center + radius. _GPU:_ additive sphere shell with a fragment shader that has a fresnel-like rim term; optionally a stencil-style dimming pass on enclosed points. The rim glow trick is what makes voids "pop" — without a boundary indicator, voids are by definition invisible. **Recommended as the void primary.**

### 2D projection silhouettes

_Look:_ a thin circle facing the camera at each cluster/void. _Data:_ center + projected radius. _GPU:_ trivial. Useful as a fallback or as a labeling anchor. Honestly underrated — astronomers are trained to read 2D circles.

---

## 3. UX considerations

**Toggles.** Add three boolean toggles to `SettingsPanel`: `showClusters`, `showVoids`, `showFilaments`. Each independently toggleable; default off so the existing aesthetic is preserved. Add a single overarching "Large-scale structure" section header.

**Labels.** Anchor labels to cluster/void centers in 3D, project to screen each frame, render in an overlaid HTML/CSS layer (consistent with the existing InfoCard pattern — keep DOM and WebGPU separated). For density: only render labels for clusters with richness > threshold _or_ whose screen-space projected radius exceeds N pixels. **Hover-only by default**, with a "always-on for major clusters" config option (✓ Coma, ✓ Virgo, ✓ Perseus, ✓ Hercules, ✓ Norma — all confirmed as real galaxy clusters via Wikipedia; there are perhaps 30 names worth knowing). Avoid the de-occlusion-solver rabbit hole: greedy "skip if overlapping a higher-priority label" is good enough.

**Auto-LOD interaction.** Large-scale structure is meaningless at <50 Mpc camera distance and meaningful at >500 Mpc. Implement a **distance-based fade-in** that is the inverse of the existing per-galaxy LOD: cluster halos and void shells should fade _in_ as the user zooms out. This is a single uniform `lssOpacity = smoothstep(50_Mpc, 200_Mpc, cameraDistance)`. Crucial for keeping the close-up galaxy view uncluttered.

**Selection + focus.** Reuse `focusOn(xyz)` from the recent feature. Click a cluster halo → focus on its center, highlight member galaxies (Phase 2). Click a void center → focus, optionally invert background tint slightly to make the emptiness visually pop (low priority). Picking: extend the existing pick render pass with a separate ID range for clusters/voids (e.g. high bit = LSS feature, low bits = id).

**Color / palette.** Two competing options:

- _Shape-language only:_ clusters and voids both rendered in the existing K-corrected galaxy palette, distinguished by **shape** (filled glow vs. hollow rim). More elegant. More confusing.
- _Warm/cool:_ clusters in warm orange/red, voids in cool blue/purple. More legible, slight clash with the existing redshift-driven coloring. Recommended for the MVP — distinctive shape language can be added later.

---

## 4. Beautiful-UI inspiration

I could not WebSearch from this environment so the URLs below are from training data and **must be verified before being cited**. The descriptions are accurate to my training knowledge.

- ✓ **IllustrisTNG public visualizations** (`tng-project.org/media/`) (confirmed live: page lists TNG300 cosmic-web stills, raymarched volumetric renders of dark-matter density, gas temperature/velocity, magnetic fields, X-ray; color schemes vary — DM is white/orange-on-black, temperature blue→green→white, X-ray purple-to-orange). They publish raymarched volumetric renders of the dark-matter density and gas temperature fields. The "TNG300 cosmic web" stills are the canonical reference for what a beautiful cosmic-web shot looks like: deep blue-black background, warm orange filaments, cool blue voids. _What translates:_ the color palette and the use of thin glowing filaments. _What doesn't:_ the offline raymarched volume — they took hours per frame on supercomputers.

- ⚠ **DESI Year-1 / Year-3 visualizations** (`desi.lbl.gov`) (unverified — WebFetch denied for this host). DESI's outreach team has produced spinning fly-throughs of the BOSS/eBOSS volume showing concentric redshift shells with structure overlays. _What translates:_ fly-through camera path, soft cluster glow halos. _What doesn't:_ most DESI public renders are pre-rendered video.

- **"Cosmography of the Local Universe" (Tully et al.)** Their Cosmicflows-3 visualizations explicitly show voids as labeled, transparent spheroidal regions (✓ the Local Void [confirmed: ~60 Mpc / 200 Mly extent in Hercules, per https://en.wikipedia.org/wiki/Local_Void], ✓ Bootes Void [confirmed: ~62 Mpc radius (~124 Mpc / 400 Mly diameter), centre ~700 Mly distant, per https://en.wikipedia.org/wiki/Bo%C3%B6tes_void]). This is the closest published reference to the void-visualization UX I'm recommending. _What translates:_ the label-the-named-voids approach.

- **Mark Subbarao's planetarium SDSS visualizations** (Adler Planetarium). Subbarao's "SDSS in 3D" planetarium show is widely cited. From training-knowledge it uses a moving camera through a real galaxy point cloud with soft cluster glows. _What translates:_ the aesthetic restraint — they do _not_ draw envelopes around every cluster, only the most famous ones get a label and a halo.

- **AstroBlend / Blender-cosmology renders.** Several papers (Naiman, Vogelsberger collaborators) have used Blender with PBR shaders to render N-body data; output is the most "beautiful, not-physics-diagram" thing in the field. _What translates:_ a careful single-direction key-light feel for ellipsoids. _What doesn't:_ offline Cycles raytracing.

A pattern from all five: **less is more.** None of these label every cluster. None draw envelopes around every cluster. The "wow" comes from a _few_ well-placed labels and from the cosmic web filaments themselves, not from cluster bounding shapes.

---

## 5. Recommendation for skymap

### Phase 1 (MVP — small)

**Goal:** prove that explicit cluster+void overlay works without hurting the existing aesthetic or framerate.

**Data sources (build-time):**

- redMaPPer DR8 cluster catalog (~26k clusters), reduced to `{xyz_mpc, richness, r_lambda}`.
- Pan+ 2012 or Sutter+ 2014 SDSS void catalog (~1000 voids), reduced to `{xyz_mpc, r_eff}`.
- A hand-curated list of ~30 named clusters/voids for always-on labels.

**Rendering:**

- Clusters: **additive billboard glow halo**, size ∝ R_λ, color warm orange. One instanced draw call.
- Voids: **inverted-glow translucent sphere with rim shader**, color cool blue. One instanced draw call.
- Both fade in via `lssOpacity` based on camera distance.

**UX:**

- `showClusters`, `showVoids` toggles in SettingsPanel.
- Hover labels for any LSS feature; always-on labels for the curated 30.
- Click → `focusOn(center)`.

**Files:**

- `tools/buildClusterCatalog.ts` — read redMaPPer FITS/CSV → binary blob alongside point cloud.
- `tools/buildVoidCatalog.ts` — same for voids.
- `src/data/lssCatalog.ts` — types + loader for cluster/void blobs (`type ClusterCatalog = { ... }`).
- `src/gpu/lssRenderer.ts` — instanced billboard renderer for halos + rim spheres.
- `src/gpu/shaders/lss-cluster.wgsl` — cluster halo billboard shader.
- `src/gpu/shaders/lss-void.wgsl` — void rim sphere shader.
- `src/components/SettingsPanel/SettingsPanel.tsx` — add two toggles.
- `src/components/LSSLabels/` — new HTML overlay component for 3D-anchored labels.
- `src/engine.ts` — register the new render passes after the point pass.

**Scope:** small. Estimate: ~600–900 LOC total including build scripts.

### Phase 2 (Polish — medium)

**Adds:**

- **Per-galaxy cluster-membership tint** (one new vertex attribute, 4 lines of WGSL). Visible only when the cluster overlay is on.
- **Ellipsoid fits** computed at build time from redMaPPer/Yang member lists; rendered as instanced unit-sphere with affine transform. Replaces the spherical halo for clusters with >50 members; small clusters keep the billboard.
- **Wireframe outline option** (a settings toggle) for users who want shape but minimal occlusion.
- **MST-of-clusters filament tubes** (cheap proxy for DisPerSE), with edges culled at length > 50 Mpc.
- **Picking integration** — clusters/voids participate in the existing pick pass with a high-bit ID range.
- **Color-palette work** — make the cluster/void palette feel native to the existing K-corrected colors, possibly via a chroma shift rather than a hue swap.

**New files:**

- `src/cluster/ellipsoidFit.ts` — build-time covariance + eigendecomposition.
- `src/cluster/filamentMst.ts` — Prim/Kruskal MST over cluster centers.
- `src/gpu/shaders/lss-ellipsoid.wgsl`, `src/gpu/shaders/lss-filament.wgsl`.

**Scope:** medium. Estimate: ~1500 LOC additional.

### Explicitly out of scope (Phase 3+)

Marching-cubes density isosurfaces, volumetric raymarching, runtime FoF/HDBSCAN, DisPerSE skeleton extraction, label de-occlusion solver. Each is a multi-week project on its own.

---

## 6. Hard problems that look easy

1. **Voids are not ellipsoids.** A bounding sphere or ellipsoid is a deliberate fiction; the real watershed boundary is concave and overlaps neighbors. Users sophisticated enough to know what a void is will notice the lie. Mitigation: add a tooltip note ("approximate spheroidal extent") and resist the urge to label small/marginal voids.

2. **3D label placement is genuinely unsolved.** Planetarium software (Stellarium, WWT, Celestia) all still ship imperfect label-overlap algorithms after decades of work. Do not try to invent one. Greedy priority-ordered placement with hover-only fallback is the correct engineering choice.

3. **Translucent depth interactions with the additive point cloud.** The existing renderer almost certainly uses additive blending with depth-test enabled and depth-write disabled — that is the standard for star-field renderers. Translucent void shells need _back-to-front sorting_ per frame to look right against an opaque reference, but against an additive cloud the order is less visible — except where the void shell rim crosses the cloud, where you'll see a brightness artifact. Plan for an extra 1–2 days of shader iteration here.

4. **Linking length is a free parameter, not a fact.** redMaPPer hides this from you; if you ever do run FoF yourself, the choice of linking length (typically 0.2 × mean inter-particle separation) changes your cluster list dramatically. Pick a published catalog with a published parameter choice, cite it, and move on.

5. **Camera-distance fade introduces a sharp visual transition.** Users zoom in and out continuously. The fade band needs careful tuning and the band itself needs to be large (~50–200 Mpc) to avoid a visible "pop". Tying the fade to the existing per-galaxy LOD curve, not a separate one, will give a more cohesive feel.

6. **Build-time catalog freshness.** redMaPPer/VIDE catalogs are released asynchronously from the SDSS/DESI underlying data. A user's point cloud and the bundled catalog may be from different epochs — clusters in the catalog may sit slightly off the densest knot in the cloud. Document the catalog version in the UI.

---

## Verification log

WebFetch-only verification on 2026-05-03. WebSearch was globally denied; only sources reachable from URLs already in the doc (or canonical Wikipedia entries for named features) were checked.

| Claim                                                                               | Status              | Source / Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WebFetch end-to-end works                                                           | ✓                   | Smoke test on `https://en.wikipedia.org/wiki/Galaxy_cluster` returned a real summary                                                                                                                                                                                                                                                                                                                                                                                        |
| Abell catalog has ~4k clusters                                                      | ✓                   | https://en.wikipedia.org/wiki/Abell_catalogue — exact figure 4,073                                                                                                                                                                                                                                                                                                                                                                                                          |
| Coma is a galaxy cluster                                                            | ✓                   | https://en.wikipedia.org/wiki/Coma_Cluster — Abell 1656, >1000 galaxies                                                                                                                                                                                                                                                                                                                                                                                                     |
| Virgo is a galaxy cluster                                                           | ✓                   | https://en.wikipedia.org/wiki/Virgo_Cluster — ~53.8 Mly, 1300–2000 members                                                                                                                                                                                                                                                                                                                                                                                                  |
| Perseus is a galaxy cluster                                                         | ✓                   | https://en.wikipedia.org/wiki/Perseus_Cluster — Abell 426                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Hercules is a galaxy cluster                                                        | ✓                   | https://en.wikipedia.org/wiki/Hercules_Cluster — Abell 2151, ~200 galaxies                                                                                                                                                                                                                                                                                                                                                                                                  |
| Norma is a galaxy cluster                                                           | ✓                   | https://en.wikipedia.org/wiki/Norma_Cluster — near Great Attractor, ~68 Mpc                                                                                                                                                                                                                                                                                                                                                                                                 |
| Boötes Void is a real named void                                                    | ✓                   | https://en.wikipedia.org/wiki/Bo%C3%B6tes_void — radius ~62 Mpc, centre ~700 Mly distant                                                                                                                                                                                                                                                                                                                                                                                    |
| Local Void is a real named void                                                     | ✓                   | https://en.wikipedia.org/wiki/Local_Void — ~60 Mpc extent, in Hercules, adjacent to Local Group                                                                                                                                                                                                                                                                                                                                                                             |
| redMaPPer DR8 has ~26k clusters                                                     | ✓                   | Rykoff+ 2014, https://arxiv.org/abs/1303.3562 — abstract says "~25,000 clusters over 0.08<z<0.55" on ~10,000 deg² of SDSS DR8. Doc said ~26k; close enough but corrected inline to ~25k.                                                                                                                                                                                                                                                                                    |
| MCXC has ~1700 clusters with M, R500                                                | ✓                   | Piffaretti+ 2011, https://arxiv.org/abs/1007.1916 — exact figure 1,743 clusters, with z, coords, L500, M500, R500.                                                                                                                                                                                                                                                                                                                                                          |
| Pan+ 2012 SDSS DR7 voids ~1000 voids                                                | ⚠                   | No arxiv ID supplied for Pan+ 2012; not in this round's candidate list. Still unverified.                                                                                                                                                                                                                                                                                                                                                                                   |
| Sutter+ 2014 / V² catalog details                                                   | ✓                   | Sutter+ 2012, https://arxiv.org/abs/1207.2524 — "modified ZOBOV", void radii 5–135 h⁻¹ Mpc; total count not in abstract (need cosmicvoids.net for full count). Doc cites "Sutter+ 2014" but the canonical SDSS-DR7 catalog paper appears to be Sutter+ 2012.                                                                                                                                                                                                                |
| Yang+ group catalog scale claim                                                     | ✓ (with correction) | Yang+ 2007, https://arxiv.org/abs/0707.4640 — 301,237 groups in SDSS DR4. **Method is halo-based, NOT FoF** as the doc originally claimed. Body table corrected.                                                                                                                                                                                                                                                                                                            |
| IllustrisTNG visualizations on `tng-project.org`                                    | ✓                   | https://www.tng-project.org/media/ — confirmed TNG300 cosmic-web stills, raymarched volumetric DM density / gas temp / velocity / magnetic / X-ray; multiple color schemes.                                                                                                                                                                                                                                                                                                 |
| DESI public renders on `desi.lbl.gov`                                               | ⚠                   | Host still returns 403; cannot verify outreach gallery.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Cosmicflows-3 by Tully et al.                                                       | ⚠                   | Not retried this round (no arxiv ID supplied); Wikipedia 404 stands.                                                                                                                                                                                                                                                                                                                                                                                                        |
| Subbarao "SDSS in 3D" Adler Planetarium show                                        | ⚠                   | No URL or arxiv ID supplied; not retried.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| AstroBlend / Naiman, Vogelsberger Blender renders                                   | ⚠                   | No URL or arxiv ID supplied; not retried.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| DisPerSE / VIDE / ZOBOV existence and behaviour                                     | ✓                   | DisPerSE: Sousbie 2011, https://arxiv.org/abs/1009.4015 (Delaunay + persistence, identifies voids/walls/filaments/clusters). VIDE: Sutter+ 2015, https://arxiv.org/abs/1406.1191 (Voronoi + watershed, built on ZOBOV). ZOBOV: Neyrinck 2008, https://arxiv.org/abs/0712.3049 (Voronoi tessellation density, finds voids+subvoids — abstract does not actually use the word "watershed"; doc's "watershed" attribution to ZOBOV may be slightly imprecise vs. VIDE proper). |
| Friends-of-Friends linking length convention (0.2 × mean inter-particle separation) | ⚠                   | No citation supplied this round; not retried.                                                                                                                                                                                                                                                                                                                                                                                                                               |
