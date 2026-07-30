# Grill Session: Photorealistic Earth renderer — 2026-07-18

Source: user request — "improve the earth renderer … very photo realistic, realistic
atmosphere, PBR rendering … night lights … performant … most of the code reusable for
other planets." Retires the `docs/BACKLOG.md` "Ultra-real Earth" `needs-design` item.

Goal: turn the flat Lambert-shaded Blue-Marble sphere (`earthRenderer`) into a
photorealistic Earth — physically-based surface, day/night city lights, a translucent
cloud layer, and physically-based atmospheric scattering — while keeping the descent
performant and making the atmosphere / shading maths reusable by other bodies. Earth's
surface renderer stays separate because it will eventually grow person-level terrain
(mountains, 3D buildings, tile streaming).

Starting state (verified in-repo):
- `earthRenderer` — UV-sphere geometry, single equirectangular Blue Marble day map,
  Lambert + 0.08 ambient floor (`lib/bodyLighting.wesl`), mip-chained, opaque into the
  `foreground:0` row (`rgba16float` colour + `depth32float` depth, full-res).
- `texturedBodyRenderer` — the other 12 bodies; Earth was *deliberately* split off
  because its atmosphere/specular path diverges.
- Textures shipped: day maps only. No night/cloud/specular/normal maps fetched.
- No time-of-day / Earth-rotation model anywhere (`sunDirLocal` derives the terminator
  from orbital position; the globe does not spin).
- House idiom: "branch on data, not code" (Saturn's ring shadow is a per-body ratio).

---

## Q1: Renderer architecture — the reusability seam

**The question:** The user wants photorealistic Earth *and* "most of the code reusable
for other planets," but Earth is currently a *separate* renderer precisely because its
path diverges. How do we resolve that tension without either (a) one über-renderer that
leaks Earth features onto other bodies, or (b) trapping the reusable pieces inside Earth?

**Considerations:**
- **Option A (one unified data-driven PBR body renderer):** fold `earthRenderer` +
  `texturedBodyRenderer` into a single PBR sphere; every advanced feature becomes a
  per-body capability flag + optional binding. Pure house idiom. Con: Earth's future
  person-level terrain (mountains, buildings, LOD streaming) is a fundamentally
  different geometry problem that would conflate with / risk breaking other bodies.
- **Option B (keep Earth special, extract shared libs):** Earth keeps a bespoke surface
  renderer free to grow terrain; the reusable parts (atmosphere shell, PBR BRDF,
  night-light blend) live in `shaders/lib/` that other renderers opt into. Isolation +
  reuse without a monolith.
- **Option C (two-tier):** a new "PBR body" renderer for atmosphere-bearing worlds
  (Earth/Mars/Venus/Titan) + keep the cheap flat one for airless rock.

**Decision:** **Option B.** The user's terrain endgame is the deciding factor: Earth's
surface renderer will diverge massively (tiled terrain, buildings) and must not be
conflated with other bodies. Crucially, the features requested *now* (PBR, night,
clouds, atmosphere) decompose along a **different axis** than surface geometry — they
don't care whether the mesh beneath them is a UV sphere or a terrain tile — so the
"Earth features leak onto other bodies" risk comes from a shared *renderer* (A), not
from shared *shader libs*. A `lib/atmosphere.wesl` that Mars never imports cannot break
Mars. Reuse is delivered by libs + body-agnostic shell renderers, not by unification.

---

## Q2: Atmosphere as its own renderer vs. baked into `earthRenderer`

**The question:** Given B, where do the reusable pieces physically live so reuse is real
and not aspirational?

**Considerations:**
- **Bake atmosphere into `earthRenderer`:** simplest wiring, but traps the single most
  reusable piece inside Earth — the exact conflation (in the other direction) B is
  trying to avoid. Mars/Venus/Titan would have to re-import or duplicate it.
- **Atmosphere as its own body-agnostic shell renderer:** `atmosphereShellRenderer`
  draws a translucent shell slightly larger than the body, parameterized by scattering
  coefficients + planet radius. Earth invokes it now; other bodies invoke it later with
  zero Earth code involved. Surface-shading maths (PBR specular, night blend, fresnel)
  go in `shaders/lib/` for Earth to compose now and others to opt into later.

**Decision:** **Atmosphere = its own shell renderer; surface-shading maths = `shaders/lib/`.**
The atmosphere shell wraps *whatever* geometry is inside it, so it's decoupled from
Earth's terrain future by construction. This gives B's isolation (Earth's surface path
is free to evolve) *and* real reuse (atmosphere + BRDF shared by construction). User
also confirmed: **prep the geometry for tile-based rendering now** (see Q4) so the
terrain phase isn't a rewrite.

---

## Q3 (geometry): SDF sphere vs. rasterized geometry

**The question:** Render Earth's surface as a raymarched SDF sphere or as rasterized
geometry?

**Considerations:**
- **SDF sphere:** perfect silhouette + analytic normals, and atmosphere raymarching is
  natural in the same framework. But: the terrain endgame (streamed heightmap tiles +
  vector buildings) is inherently *rasterized geometry* — nobody raymarches planet-scale
  streamed buildings — so an SDF Earth is a dead-end seam thrown away at the first
  terrain milestone. Also would have to manually write `@builtin(frag_depth)` into
  skymap's fragile NEAR0 depth bracket, doesn't share the mesh/pick/uniform stack, and
  long branchy raymarch fragments are an iOS-WebKit freeze risk.
- **Geometry:** survives all the way to terrain, integrates with the existing
  depth/pick/glint/ring geometry stack, simple safe fragment.

**Decision:** **Geometry for the surface; raymarch only the atmosphere shell.** Standard
hybrid every real planet renderer uses: rasterize the surface (writes depth), draw the
atmosphere as a larger proxy shell whose fragment does the scattering, bounded by the
surface. Forward-compat note (not blocking this feature): the tile-friendly base mesh is
a **cubesphere** (6 quadtrees), adopted in Q4.

---

## Q4: How far does "prep for tiles" go now?

**The question:** The user asked to "prep the geometry for tile-based rendering now so we
don't rewrite everything." Where's the YAGNI line between cheap-forward-compat and
premature tile-engine build-out?

**Considerations:**
- **In scope now (cheap, expensive-to-change-later):** the mesh parameterization + tile-
  addressing coordinate system. Replace the UV sphere with a `cubeSphereMesh` (6 faces,
  even, pole-pinch-free — also an *immediate* silhouette/specular win), parameterized by
  `(face, level, tileX, tileY)` even though only the 6 whole faces (level 0) are drawn
  today. Cubesphere→equirect UVs for sampling the maps.
- **Out of scope now (premature — the terrain feature proper):** the quadtree itself,
  LOD selection, frustum tile loading, per-tile draws, heightmap displacement,
  buildings, streaming. Still one mesh, one draw.

**Decision:** **Adopt the cubesphere + tile-addressing coordinate system now; defer all
streaming/LOD/displacement.** Gets the "don't rewrite" win (coordinate system) plus an
immediate quality win, without speculatively building a tile engine.

---

## Q3 (atmosphere technique): analytic single-scatter vs. precomputed LUT vs. fake

**The question:** How physically-based is the atmosphere, given it's a raymarched shell?

**Considerations:**
- **Option A (analytic single-scattering, marched per-fragment):** O'Neil/Nishita-lite;
  blue limb + red sunset ring, per-body-tunable, no precompute. But the full-screen
  worst case (Earth+atmosphere filling the viewport at closest zoom) pays the march cost
  per pixel.
- **Option B (precomputed multi-scattering LUTs — Bruneton/Hillaire):** bake
  transmittance + multi-scatter LUTs; per-pixel cost becomes a couple of LUT samples,
  not a march. Most physically accurate (multiple scattering, aerial perspective).
- **Option C (cheap fresnel rim glow):** no march; flat-looking, won't read as photoreal.

**Decision:** **Option B.** User chose it for accuracy + reuse across terrestrial
atmospheres. Two clarifications that shaped the design:
- The bakeable LUTs (transmittance + multi-scatter) are **view-independent, 2D, tiny**
  (~128 KB + ~8 KB). The sky-view LUT (2D) and aerial-perspective froxel (**3D**) are
  **view-dependent** — regenerated every frame, *cannot* be baked/shipped.
- The 3D froxel (aerial perspective) is the expensive + iOS-risky piece and only matters
  *inside* the atmosphere (descent). **Deferred to the terrain phase**; ship
  transmittance + multi-scatter + sky-view now (the orbital look).
- **Gas giants do NOT fit Bruneton** (no solid surface / no shell — the visible disk *is*
  the scattering atmosphere). They get a **`lib/limbDarkening.wesl`** term (Minnaert /
  cosine-power) composed in the PBR surface fragment instead. Clean "branch on data": a
  body is either has-scattering-shell (terrestrial), has-limb-darkening (gas giant), or
  airless (neither).

---

## Q4 (bake location): on-device bake vs. offline-baked + shipped LUTs

**The question:** Do we bake the LUTs on-device at startup, or bake offline and ship over
R2? (User asked about 3D-texture sizes.)

**Considerations:**
- **Ship offline-baked LUTs:** only the two *view-independent* LUTs are bakeable, and
  they're 2D + ~136 KB total — trivially shippable. But shipping adds an offline-bake
  tool + R2 sync + fetch path, and **kills the tune-a-coefficient-and-see-it-live loop**
  that matters a lot when dialing Mars/Venus/Titan atmospheres by eye. Each atmosphere
  config becomes another shipped file. The 3D froxel can't be shipped at all
  (view-dependent).
- **On-device bake:** a couple of compute dispatches, single-digit ms, once at startup.
  No data-pipeline dependency; live coefficient tuning; another data row, not a file.

**Decision:** **On-device bake.** The size argument for shipping doesn't apply (bakeable
LUTs are 2D + tiny), on-device baking is milliseconds-once, and it's the *simpler
artifact* (fewer moving parts, live tuning). Shipping only wins when the bake is
expensive — it isn't.

---

## Q5: Surface PBR scope

**The question:** What does "PBR" concretely mean with exactly one light (the directional
Sun) and no environment map (no IBL)?

**Considerations:**
- **Option A (full microfacet):** GGX specular + roughness/ocean map + normal map +
  Fresnel. Metalness = 0 everywhere (dielectric, constant low F0). The load-bearing map
  is **roughness/ocean mask** → the ocean sun-glint, the single biggest "looks real" win.
- **Option B (GGX + roughness now, normal map fast-follow):** ships ocean glint now;
  defers relief. Rationale: faked normal-map relief on *Earth* is superseded by real
  terrain geometry later, so it's partly throwaway — but normal maps stay valuable for
  airless bodies (Moon craters, Mars) that never get terrain geometry.
- **Option C (cheap ocean-glint hack):** not real PBR, won't scale to other bodies.

**Decision:** **Option A** — full microfacet from day one, built as reusable
`lib/pbr.wesl`. No metalness map (constant dielectric F0), no IBL. **Diffuse term =
Oren-Nayar** (not Lambert): a small roughness-driven addition that fixes the too-flat/
too-bright terminator on rough dusty bodies (Moon, Mars), costs nothing at roughness≈0.

---

## Q6: Clouds

**The question:** How are clouds rendered — a cloudless Earth reads as a globe, not a
photo.

**Considerations:**
- **Option A (baked into day albedo):** cheapest, but clouds are lit like the ground
  (no self-shadow, no cast shadow, no parallax, can't animate). Painted-on.
- **Option B (separate translucent cloud shell):** own cloud+alpha map, lit by the sun,
  casts a soft shadow on the surface, occludes night-side city lights, optional drift.
  One extra draw + one texture. Another body-agnostic shell (reusable for Venus/Titan).
- **Option C (volumetric raymarched):** photoreal but a huge cost + iOS-risk rabbit hole.

**Decision:** **Option B** — separate cloud shell. Sub-decisions:
- **Static (no drift).** skymap has no time-of-day/rotation model, so nothing drives
  drift and there's no "correct" position to animate toward. Drift rides a future
  "live Earth" bundle (Q6b).
- **Cloud-shadow-on-ground + night-light occlusion: INCLUDED** (see Q6c).

---

## Q6b: Real-time cloud coverage (future)

**The question:** Can we source live cloud coverage from an online service?

**Considerations / findings:** Feasible. **NASA GIBS** serves near-real-time global
composites as WMTS tiles in EPSG:4326 (equirectangular), CORS-enabled, free — the
practical browser source. Geostationary composites (GOES+Himawari+Meteosat) are higher
cadence but need self-stitching. The cloud shell already lands its bitmap through a
`setTexture(bitmap)` seam, so the *source* (shipped static R2 vs. live GIBS fetch) is a
swappable detail behind that seam. **Catch:** physically-*correct* live clouds imply also
modeling current time + Earth rotation + real sun/terminator — today the terminator is
orbital-position-derived and the globe doesn't spin, so live clouds without the clock
would sit over the wrong sun-relative position. "True live Earth" is a coherent *bundle*
(live clouds + wall-clock rotation + real terminator).

**Decision:** **Ship a static cloud map now; design the cloud-texture seam to accept a
live provider; treat "live Earth" as a coherent future feature** — don't half-build it.
Noted as an explicit future extension keyed off the same seam.

---

## Q6c: Cloud-shadow-on-ground + night-light occlusion

**The question:** Include the two cloud/surface interactions, accepting the coupling they
introduce?

**Considerations:**
- **Mechanics.** *Shadow:* for a day-side surface fragment, analytic ray→cloud-shell
  intersection along the **sun direction**, sample cloud alpha there, darken the direct
  sun term. *Night occlusion:* multiply the night-light contribution by `(1 − cloudAlpha)`
  sampled at the fragment's **own UV** (cloud straight above). Two cheap samples at
  *different* UVs.
- **The implication:** both require the **surface fragment to bind + sample the cloud
  texture** — so surface and cloud renderers are no longer fully independent; the cloud
  map is a shared input in two pipelines. A small, Earth-specific entanglement (Venus
  reuses the cloud shell but wants no ground shadow — you never see its surface).
  Feature-gated by data, so cloudless bodies pay nothing.

**Decision:** **Include both.** The realism payoff (clouds that shadow the ground and dim
city lights beneath them) is worth ~2 texture samples + the surface↔cloud coupling. Opted
into explicitly rather than discovered later.

---

## Q7: Texture data set

**The question:** Which maps, at what resolution/format, and with what fetch/build/memory
cost?

**Considerations / the set:**

| Map | Source | Format | Res |
|---|---|---|---|
| Day albedo | shipped `world.topo.bathy` | sRGB | 8K tier |
| Night lights | NASA Black Marble (VIIRS) | sRGB | 8K |
| Clouds | NASA cloud composite (alpha from luminance) | sRGB+α | 8K |
| Roughness / ocean mask | NASA water mask (or derive from bathymetry) | linear | 4K |
| Normal (relief) | **baked offline** from an elevation heightmap (GEBCO/SRTM proxy) | linear RG | 4K |

Three bundled decisions:
1. **Resolution split by perceptual need:** albedo/night/cloud carry colour detail → 8K;
   roughness + normal are masks/relief read coarsely → **4K** (halves their memory).
   Top-tier VRAM ≈ 450 MB for one body — heavy but acceptable (Earth is the only body at
   top tier during descent; rides the `build-textures` tier ladder + mips).
2. **Channel-pack the linear masks:** one "material" texture `R=roughness, G=ocean/spec
   mask, B/A=spare` instead of two — standard ORM trick, one material sample.
3. **Normal map is baked offline, not fetched:** `world.topo.bathy` is a *shaded colour*
   image, not a heightmap, so we fetch an elevation proxy (few MB) and `build-textures`
   bakes a tangent-space normal map with a tunable exaggeration factor.

**Decision:** **Accept the full set + 8K-colour/4K-mask split + channel-packed material
texture + offline-baked normal map.** New source fetches (night/cloud/water-mask/
elevation) ≈ **20–40 MB** one-time, resumable — exact URLs + real total pinned and
**user go-ahead obtained before any fetch** (announce-big-downloads convention). Nothing
downloads during design.

---

## Q8: Compositing & depth for the translucent shells

**The question:** How do the translucent cloud + atmosphere shells compose into
`foreground:0`, and how does the atmosphere know where to stop marching — given the depth
texture is currently `RENDER_ATTACHMENT`-only (never sampled)?

**Considerations:**
- **Draw order (all into `foreground:0`, after opaque bodies):** opaque surface
  (depth-write) → cloud shell (depthTest ON, depthWrite OFF, OVER) → atmosphere shell
  (depthTest ON, depthWrite OFF, OVER, drawn **last**). Atmosphere OVER blend
  `out = inScatter + dst·(1−opacity)`, `opacity = 1−transmittance`, is exactly correct
  compositing (everything behind attenuated by transmittance + in-scatter added). Clouds
  before atmosphere so the atmosphere tints them.
- **The fork — atmosphere march bound:**
  - *Analytic ray–sphere intersection with Earth's surface (now):* the surface *is* a
    sphere this phase, so bound the integral analytically — **no depth-texture sampling**,
    doesn't touch the depth target's `RENDER_ATTACHMENT`-only usage. Occlusion by *other*
    opaque bodies (Moon in front) handled by the ordinary **depth-test**.
  - *Depth-buffer sampling (later):* once the surface is tiled terrain (non-spherical),
    make the depth texture `TEXTURE_BINDING` and read it. One-flag change, deferred.
- **Robust inside/outside:** draw the atmosphere proxy's **back faces** + analytic shell
  intersection for `[tNear, tFar]`, clamp `tNear→0` when inside — geometry robust for
  orbital + descent for free; only the aerial-perspective *refinement* (froxel) deferred.
- **NEAR0 safety:** shells reuse the exact NEAR0 `depth32float` profile and **write no
  depth** → zero new z-fighting. **Picking:** shells non-pickable; `bodyPickRenderer`
  unchanged.

**Decision:** **The above plan, with analytic-surface-intersection-now / depth-sample-
later.** Keeps the feature from disturbing the depth-target contract and the fragile
NEAR0 bracket, and degrades gracefully to depth-sampling when terrain lands.

---

## Q9: Performance envelope & device floor

**The question:** What's the frame budget / device floor, and do we need adaptive quality
scaling?

**Considerations:** The Hillaire LUT choice (Q3) already resolves most cost — the
expensive march happens once into the LUTs at startup; the per-pixel atmosphere cost in
the main pass is a couple of LUT samples + the analytic intersection, **not a march**, so
even full-screen at closest zoom stays cheap. The heaviest existing pass (volume
raymarch) is heavier than this. iOS safety comes from keeping bakeable LUTs 2D (the 3D
froxel WebKit would choke on is deferred).

**Decision:** **Target 60 fps desktop / 30–60 fps iOS; no adaptive-quality machinery in
v1.** Keep LUT dimensions + any march-sample counts as **named tunable constants** (lower
a number if a weak device shows up in testing) rather than speculatively building half-res
fallbacks. Cubesphere stays a single fixed subdivision (LOD is the terrain phase). No hard
weak-device floor set that would justify the fallback now.

---

## Q10: PR sequencing & process path

**The question:** How is this big feature split into shippable PRs, and what's the path to
code?

**Considerations:**
- **Fine-grained (six PRs):** prep → A cubesphere+PBR surface → B night → C normal →
  D cloud shell → E atmosphere. Six visual checkpoints, small diffs, one TDD plan per
  increment. Dependency order A → {B,C} → D → E, prep first.
- **Coarse (2–3 PRs):** fold B+C into A, clouds+atmosphere together. Fewer checkpoints,
  bigger diffs.

**Decision:** **Fine-grained six-PR split.** Matches the house "one clean increment per
PR" + TDD-plan-per-increment convention. Data fetches land with the PR that first
consumes each. **Docs placement: spec + plans committed in the SAME first PR as the
ground-prep code** (user's explicit call — not a separate docs PR).

**Process path from here:** brainstorm converged → **`refactor-ground`** (sketch the
ideal diff, growth/bolt-on verdicts, checkpoint the shape) → **one spec** covering the
whole design with a filled "Ground preparation" section → **per-increment plans** via
`writing-plans`. Picking this up **deletes the `docs/BACKLOG.md` "Ultra-real Earth" line**
in the same change.

---

## Summary of decisions

- **Architecture:** Earth keeps its own *surface* renderer (grows terrain later);
  atmosphere + clouds are body-agnostic **shell renderers**; PBR / night-blend / Oren-
  Nayar / limb-darkening maths live in `shaders/lib/`.
- **Geometry:** rasterized **cubesphere** base + `(face,level,tileX,tileY)` tile-
  addressing now; streaming/LOD/displacement deferred to the terrain phase.
- **Atmosphere:** Bruneton/Hillaire, **on-device-baked** 2D LUTs (transmittance +
  multi-scatter) + per-frame sky-view LUT; **3D aerial-perspective froxel deferred**. Gas
  giants use `lib/limbDarkening`, not the shell.
- **Surface PBR:** full microfacet — GGX specular + channel-packed roughness/ocean map +
  offline-baked normal map + Fresnel + **Oren-Nayar** diffuse; dielectric constant F0, no
  IBL. `lib/pbr.wesl`.
- **Night + clouds:** Black Marble night lights + day/night blend; static translucent
  **cloud shell** with **cloud-shadow-on-ground + night-light occlusion** (surface↔cloud
  coupling accepted); **live-cloud provider seam** designed in; drift deferred.
- **Textures:** day (have) + night + cloud + roughness/ocean + normal; **8K colour /
  4K mask**, channel-packed material texture, normal baked offline from an elevation
  proxy; ~20–40 MB one-time fetch, announced + user-approved before download.
- **Compositing:** opaque → cloud shell → atmosphere shell (last), OVER, depthTest-on/
  depthWrite-off; atmosphere march bounded by **analytic surface-sphere intersection now**
  (depth-sample later); back-face proxy + analytic shell intersection for robust
  inside/outside; no depth writes → NEAR0-safe; shells non-pickable.
- **Performance:** LUT technique keeps per-pixel atmosphere cheap; target 60/30–60 fps;
  no adaptive-quality machinery in v1, tunable constants instead.
- **Delivery:** fine-grained six-PR split (prep → surface → night → normal → clouds →
  atmosphere); spec + plans in the same first PR as the ground-prep code; retires the
  BACKLOG "Ultra-real Earth" item.

**Next step:** `refactor-ground` pass, then spec, then per-increment plans.
