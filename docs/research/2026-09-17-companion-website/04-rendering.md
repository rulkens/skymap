# 04 — Rendering: the frame, techniques, precision, performance

Subagent sweep, 2026-09-17, `main` @ `845720549`. Unverified; open the cited file before relying on a claim. Paths are under `src/services/` unless rooted otherwise.

## 1. The frame, in order

Authored list: `engine/frame/frameOrder.ts`; `expandFrameOrder.ts` → `executeFrame.ts`; boot-time cross-check `checkFrameOrder.ts`.

- `compute flow` — CF4++ tracer particle integration — `frame/encodeFlowCompute.ts`, `gpu/shaders/flow/compute.wesl`
- `compute sky-view` — per-frame atmosphere sky-view LUT — `frame/encodeAtmosphereSkyView.ts`
- `capture sgrAStar + solarSystem` — sky cubemap bakes — `frame/scheduleSkyCaptures.ts`
- `capture probe` — reflection probe for the subject mesh body — `frame/scheduleProbeCapture.ts`, `gpu/lib/prefilterCubeGgx.ts`
- `render volume (COSMO)` — half-res scalar-field raymarch — `passes/scalarVolumePass.ts`
- `render zoa (COSMO)` — 1/5-res Zone-of-Avoidance raymarch — `passes/zoneOfAvoidancePass.ts`
- `render hdr·COSMO` roster: point sprites · procedural disks · textured disks · filaments · flow · volume and ZoA upsample · horizon shell · structure markers
- `render star-aggregates (NEAR0)` — half-res flux-mip star glows
- `render mw-aggregate (NEAR0)` — reduced-res Milky-Way billboards
- `render hdr·NEAR0` roster, order load-bearing: Milky-Way upsample → Milky Way (multiplicative dust) → star points → star catalog → star upsample → constellations
- `render hdr·lens` — Sgr A\* Schwarzschild lensing — `passes/sgrAStarLensingPass.ts`
- `render hdr·NEAR0 POST_LENSING` — body glints
- `foreground:0` painter chain (depth-bearing, one depth clear per row): star spheres; `earth` → `surface-tiles` → `cloud-shell` → `planets` → `textured-bodies` → `rings` → `atmosphere-shell` → `mesh-bodies`
- `composite foreground:0 → hdr` — bodies join the accumulator in linear, pre-tonemap — `gpu/passes/compositor.ts`
- `render hdr·NEAR0 POST_FOREGROUND` — orbit trails with analytic sphere occlusion — `passes/orbitTrailsPass.ts`
- `bloom` — 10-pass ping-pong mip pyramid — `frame/runBloom.ts`, `gpu/passes/bloomPyramid.ts`
- `tonemap hdr → swap` — the frame's only tone curve — `gpu/shaders/lib/tonemap.wesl`
- `render swap·COSMO` and `render swap·NEAR0` — selection rings, marker lines, labels (premultiplied OVER, post-tonemap)
- Off-frame sibling: the **pick program** — demand-driven r32uint re-rasterisation per slab — `frame/pickProgram.ts`

## 2. Techniques and cited references

- Instanced point billboards, 52-byte / 13-slot stride — `galaxyPointRenderer.ts`, `gpu/shaders/galaxyCatalog/points/*`, `shaders/lib/billboard.wesl`
- Procedural galaxy impostor (Gaussian bulge + exponential disc) — `shaders/galaxyCatalog/proceduralDisks/fragment.wesl`
- Thumbnail quads off a 2048² LRU atlas — `gpu/resources/textureAtlas.ts`
- Atmosphere scattering with three LUTs + two-wall proxy shell — `gpu/shaders/atmosphere/*` — **Bruneton & Neyret 2008**, **Hillaire 2020**
- Terrain / virtual texturing: quadtree cut, albedo + Terrain-RGB height atlases, skirts, central-difference normals — `utils/surfaceTiles/cutSurfaceTiles.ts`, `engine/subsystems/surfaceTileSubsystem.ts`, `gpu/shaders/bodies/surfaceTile/*`
- PBR mesh bodies: GGX, analytic sphere sun light, split-sum environment — `gpu/shaders/lib/pbr.wesl`, `gpu/lib/prefilterCubeGgx.ts` — **Karis 2013**
- Analytic ray-traced sphere primitive — `gpu/shaders/lib/analyticSphere.wesl`
- Lambert + Minnaert limb darkening, normal maps, night lights, ring shadows — `gpu/shaders/lib/{bodyLighting,limbDarkening,normalMap,nightLights}.wesl` — ring optics **Chandrasekhar 1960**, **Dones et al. 1993**
- Volume raymarching — `gpu/shaders/lib/volumeRaymarch.wesl`
- Closed-form anisotropic-Gaussian line integral (erf / erfc) replacing a march — `gpu/shaders/lib/gaussianIntegral.wesl`
- Black hole: Schwarzschild deflection LUT, capture / escape / annulus ray classification — `gpu/shaders/bodies/sgrAStarLensing/fragment.wesl` — **Bruneton 2020**
- Bloom / HDR / tonemap: soft-knee prefilter + firefly clamp — `gpu/shaders/bloom/bright.wesl`, `shaders/lib/tonemap.wesl` — **Narkowicz 2015**, **Lupton 2004**
- Galaxy generator v1 (GPU compute, stateless hash RNG, ~150k sprites) — `engine/galaxyGenerator/v1/`
- Galaxy generator v2 analytic field: Gaussian-mixture splats, HII Strömgren shells, 4-slice dust attenuation, arm ridges, semi-Lagrangian ISM map — `engine/galaxyGenerator/v2/`, `gpu/renderers/galaxyField/**` — **Reid et al. 2019**, **Freudenreich 1998**, **Drimmel & Spergel 2001**, **Kennicutt 1989**, **Kormendy & Kennicutt 2004**
- MCPM / Polyphorm port: agent propagate + deposit, Woodcock delta-tracking path tracer, Henyey-Greenstein phase — `gpu/shaders/mcpm/**`, `tools/mcpm-workbench/`
- Star rendering: Gaia octree best-first screen-size cut with instance budget, leaf / aggregate split, hue-preserving soft knee — `gpu/renderers/starCatalog/walkStarOctreeCut.ts`, `shaders/lib/{starPhotometry,starKnee}.wesl`
- Dust as multiplicative transmittance — `gpu/shaders/milkyWay/sprites/dust.wesl`, `field/dustAttenuation.wesl`
- Flow particles: Lagrangian pathlines vs Eulerian streamlines, arc-length trail ring buffer — `gpu/shaders/flow/compute.wesl`
- Filaments and constellations: instanced screen-space thick-line quads — `gpu/shaders/lib/segmentQuad.wesl`
- Labels: multi-font MSDF `texture_2d_array`, CPU glyph layout, arc-placed 3D labels, alpha-based (not depth) occlusion — `gpu/labelLayout/*`, `gpu/renderers/labels/occlusionCoverageGroup.ts`
- Picking: r32uint, 6 + 26 bit packing, pick-priority depth bands — `frame/pickProgram.ts`, `shaders/lib/{selectionEncoding,pickDepthBands}.wesl`
- Horizon shell and Zone of Avoidance: analytic marches in camera-relative Gpc
- Support: covering-triangle fullscreen, manual mip-chain blits, cube-face blit, CPU bake of Schechter ratios + HEALPix re-weighting into vertex data (`engine/bake/`)

## 3. Precision and scale handling

- **Slabs** — depth sliced into per-content-range brackets (NEAR0, COSMO, body-metre rows); each gets full depth precision; far-to-near composite is the inter-slab occlusion — `src/@types/engine/frame/Slab.d.ts`, `frame/slabs.ts`
- **Reversed-Z, infinite far** — spec `docs/superpowers/specs/completed/2026-07-20-reversed-z-near0-depth.md`
- **Camera-relative / RTC** — body-metre slab VPs built about the eye; star octree node origins rebased per node
- **Unit ladder** — `src/data/scaleUnits.ts`, `src/data/renderOrigin.ts`; the one Mpc → m seam is `engine/camera/bodyRelativePose.ts`, gated by `tests/services/engine/camera/oneMpcSeam.test.ts`
- **f64 compose, then narrow** — `utils/camera/composeBodySlabMvp.ts`; ADR 0010
- **NEAR0 overlay clip rescale** — the rasterizer floors `w` near 1e-20 — `frame/near0OverlayClipScale.ts`
- **Homogeneous far-point ray reconstruction** under reversed-Z — `gpu/shaders/atmosphere/shell/fragment.wesl`

## 4. Performance architecture

- Data tiers small / medium / large; per-body texture tier (`utils/bodyTextures/bodySurfaceTier.ts`).
- Render strategies `merged` / `perLayerTimed` / `auto` — `frame/resolveStrategy.ts`.
- GPU timing: shared 32-slot `GPUQuerySet`, double-buffered staging, slot names derived from `FRAME_ORDER` — `gpu/timing/*`, `frame/timing/timedSlots.ts`.
- Perf harness: `npm run perf`, fixed scenarios, `--sweep` bound classifier, `--compare-tiers` — `tools/perf/README.md`.
- Cost patterns: reduced-res offscreens merged by additive upsample; render-on-demand; liveness projections that skip whole layers; instance budgets; sub-pixel body culling; one baked LUT in place of a per-pixel march.
- Build-time shader linking via `wesl.toml` — no runtime linker cost.

## 5. Liftable nearly as-is

- `docs/RENDERER.md`, `src/layers/README.md`, `src/services/engine/galaxyGenerator/{shared,v1,v2}/README.md`, `tools/perf/README.md`, `docs/references/orbit-trail-*.md`, `docs/adrs/*`.
- `docs/superpowers/specs/` (124 completed + 9 active) — near-publishable design docs, roughly one per technique: analytic sphere, reversed-Z, body render slabs, earth virtual texture, per-planet terrain, atmosphere constituents, render-black-hole, mesh-body PBR, conic orbit trails, gaia star bin, MSDF labels, scalar volume, MCPM volume, flow field, GPU galaxy generation, headless GPU-timing harness, WESL conversion, star and body picking, Earth RTC surface camera.
- `docs/research/*` — adjacent chapters.
- The `wesl-shaders` skill (`.claude/skills`) — linker gotchas not documented upstream; a "shader toolchain" page.

## 6. Gaps — technique documented only in code comments

- **The frame itself** — `FRAME_ORDER`'s per-line rationale exists only in that file. Highest-value page, covered nowhere else.
- **Slab model / depth precision** — no unified "scale and precision" doc.
- **Picking end-to-end.**
- **Star pipeline** — cut heuristic, leaf / aggregate split, flux mips, soft knee.
- **Bloom pyramid + tonemap chain.**
- **MCPM / Polyphorm port** — divergences, Woodcock tracking; no attribution page naming the Polyphorm / Physarum lineage.
- **Galaxy field v2 ISM-map chain** — ~25 files with no README; `createGalaxyFieldRenderer` has **no app-frame consumer** (only `tools/galaxy-renderer`).
- **Label occlusion via alpha transmittance.**
- **Capture system** — sky cubemaps, reflection probes, roster rules.
- **Shared shader lib** — 34 `shaders/lib/*.wesl` modules with good headers, no index page.
- **Bake-time CPU corrections** (Schechter ratios, HEALPix re-weighting).
