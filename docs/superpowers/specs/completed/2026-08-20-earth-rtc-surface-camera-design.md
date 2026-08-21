# Earth RTC surface foundation + surface navigation — design

> **Status.** Drafted, awaiting user review; not yet built.
> **Date.** 2026-08-20.
> **Relationship to prior work.** Builds on the shipped
> [Earth surface virtual texture](completed/2026-07-28-earth-surface-virtual-texture.md)
> and [EOX deep tile bands](completed/2026-08-19-eox-deep-tile-bands-design.md)
> (the manifest band list, the CPU quadtree planner, the page-table/atlas
> residency machinery). It **replaces** those specs' page-table addressing
> path for Earth only and **absorbs** four backlog items filed against the
> gaps that work left open. Other bodies keep the current unit-sphere path
> unchanged.

## 1. What we're building

Two sequenced pieces, one spec:

**Plan 1 — RTC surface foundation.** Earth's geometry and per-tile addressing
move to a receiver-centric (camera-relative) representation: a per-frame CPU
quadtree cut over the tile pyramid, static curved patch meshes positioned
relative to their own tile origin, and per-instance GPU data carrying
`originRelCamMpc` — the same precision seam the star catalog renderer already
ships (`starNodeOriginRelCamMpc`). This dissolves three `f32` precision walls
that the unit-sphere-plus-page-table representation cannot: a ~0.4 m
camera-motion step, a ~2.4 m equirect-UV quantum baked into the vertex
buffer, and a ~10 m ocean-glint cancellation in the fragment shader's view
vector.

**Plan 2 — surface navigation.** Cursor-directed zoom (bias the eye position
toward the hovered ground point, converging as altitude shrinks), the
cursor-anchored orbit-drag fix (exact rotation-to-keep-point-under-cursor
instead of a single damped rate), and surface-fixed camera follow (stop the
ground sliding under a live sim clock below an altitude threshold). All three
need a cursor→surface hit; all three read or write the orbit pivot without
moving `target` off the body centre.

### Why now, and why together

Plan 2's three items were filed as separate backlog entries between
2026-07-30 and 2026-08-19, each explicitly blocked on "a cursor-to-surface
raycast that does not exist anywhere in the codebase yet." The raycast itself
is cheap (`raySphereRoots` already exists as a CPU/WESL-mirrored primitive)
but every camera-side consumer of it collides with the same fact: at the
altitudes where surface navigation matters, the unit-sphere-plus-`f32`-VP
representation is already visibly broken, independent of any camera-gesture
work. Landing Plan 2 against the current geometry would mean re-deriving its
bias/follow math against a representation Plan 1 immediately invalidates.
Sequencing them in one spec — foundation first, navigation second, against
the foundation's post-migration shapes — avoids that throwaway work.

### Current numbers (as of this branch, superseding the stale figures in the backlog files this spec absorbs)

`SURFACE_STANDOFF_RADII` was `1.02` (~127 km altitude) when the surface-fixed
follow backlog item was filed on 2026-08-19, and `1.0000024` (~15.3 m
altitude) as of the same day's later commit (`482facb7d`,
`clampDistance.ts`). The near-plane floor `MIN_NEAR_MPC` sits at `2e-22` Mpc
(~6.2 m). **The surface-fixed-follow backlog item's "~1 km floor" and
"~0.26 km/s" framing, and `runFrame.ts`'s `LIVE_IDLE_TICK_MS` comment's "127
km standoff / ~147 km viewport," are now stale by roughly two orders of
magnitude** — the camera can already sit at ~15 m, not ~1 km, above the
surface. This does not change any conclusion in this spec (surface-fixed
follow is still needed; `LIVE_IDLE_TICK_MS` still needs re-deriving) — it
makes the motivating problem worse, not better, and the re-derivation target
in §4.6 uses today's real floor, not the backlog file's number. See §9 for
the full account of where this was found and why it matters for Plan 2's
altitude-threshold tuning.

### Goals

- Smooth, step-free camera motion and stable, non-quantized imagery down to
  the practical zoom floor (today ~15 m; the foundation itself imposes no
  floor tighter than that).
- Cursor-directed zoom converges the hovered ground point under the cursor as
  altitude shrinks, and reverts cleanly to centre-directed zoom on zoom-out
  and on a cursor miss.
- Orbit-drag keeps the grabbed ground point under the cursor exactly, not
  approximately, at every latitude.
- The ground stops visibly sliding under a live sim clock once the camera is
  close enough for the slide to read as drift rather than as "the planet is
  rotating."
- The tile-pyramid `(kind, z, x, y)` addressing, the manifest, the band
  predicates, the atlas/LRU residency machinery, and the fetch/bake pipeline
  are all **untouched** — this is a consumption-side (mesh + per-frame
  addressing) change, not a re-bake.

### Non-goals

- **The cut-planner / SSE frontier.** `SurfaceCutTile[]` (§3) is a
  deliberate step toward a screen-space-error-driven adaptive frontier, but
  this spec's cut walk stays the existing quadtree-with-fixed-rules shape
  (mirroring `planEarthTiles`'s horizon/frustum/LOD-bias tests), just
  re-targeted at RTC output instead of a page-table window.
- **Synthetic detail below the data floor.** z19/z20 EOX/GeoDanmark texels
  magnified at 2 m altitude are expected to look like magnified z19/z20
  texels — no super-resolution, no procedural detail synthesis.
- **GeoDanmark band productionization.** The in-app z14–19 demo
  (`data/raw/geodanmark/README.md`, this branch's debug cockpit) stays a
  spike; folding it into the production manifest is its own spec.
- **Other bodies' migration.** The Moon, Sun, and planets keep the current
  `composeBodyMvp` unit-sphere path. Nothing here changes their renderer,
  their MVP composition, or their camera behaviour.
- **Camera-pose URL deep links.** Out of scope; unrelated to this feature's
  surface.

## 2. Ground preparation

**One prep item, riding Plan 1's PR as its leading commit(s), its own diff,
sequenced before the feature commits (packaging decided by the user; not a
separate PR).**

**P1 — consolidate Earth's twice-derived per-frame frame.**
[`docs/backlog/2026-07-30-earth-frame-derived-twice.md`](../../backlog/2026-07-30-earth-frame-derived-twice.md)
names the fact precisely: `runFrame.ts` (the tile-planning block, currently
around lines 592–612 — `camPosLocal` and `composeBodyMvp` called with
`view.slab.vp`, `earthState.positionMpc`, `radiusMpc`,
`earthState.orientation`) and `earthLayer.ts`'s `draw` (currently around
lines 96–116, the same two calls with the same five arguments) independently
recompute Earth's local frame from the same five inputs, at two call sites
that must each get every argument right, in the same order, for the plan and
the draw to agree. Today that duplication is merely a latent risk (a future
edit to one site and not the other silently desyncs the tile plan from the
drawn pixels). RTC would turn it into a **third** independent derivation —
the per-frame cut walk in §3 needs exactly the same frame (camera position in
Earth's local frame, Earth's live orientation and position) a third time, at
a third call site, to seed the cut root and to place each surviving tile's
`originLocal`.

**Fix:** extract one function, mirroring the shipped `prepareStarCut`
pattern (`src/services/engine/frame/passes/starCatalogLayer.ts`, called once
from `runFrame.ts:658` and memoised per-`ReadyFrameContext` so the walk still
runs exactly once per frame even though multiple passes read its output).
The extracted function computes `earthState`, `radiusMpc`, the local-frame
MVP, and `camPosLocal` once; the cut walk (§3), `earthLayer.draw`, and the
pick-silhouette path (`earthLayer.drawPick`, which independently calls
`composeBodyMvp` off the same slab today) all take the result as an input
instead of re-deriving it. This is the house's existing answer to "a planner
needs the same per-frame derivation the draw pass needs" — no new pattern,
just the third call site landing on the shared seam instead of forking again.

**Verification that prep changed nothing observable:** `earthLayer.test.ts`
and the tile-planning integration path assert byte-identical MVP/camPosLocal
output before and after the extraction — a pure refactor, no behaviour
change, landing before RTC's mesh/addressing changes so RTC is reviewable
against a codebase that already has one frame derivation to build on, not
three to reconcile.

## 3. Plan 1 — RTC surface foundation

### 3.1 The cut: `SurfaceCutTile[]`

```ts
// src/@types/scene/SurfaceCutTile.d.ts
export type SurfaceCutTile = {
  /** Plate-carrée, the SAME grid as `EarthTileId`/the manifest bands — one
   *  grid family end-to-end, so residency lookup is 1:1 (ruling in §9.2). */
  readonly id: { readonly z: number; readonly x: number; readonly y: number };
  /** Tile origin on the unit sphere in Earth's local frame (f64). The
   *  per-instance `originRelCamMpc` (§3.2) is composed from this plus the
   *  camera position at upload time — the (world tile origin − camPos)
   *  subtract happens in f64, narrowed once at the GPU-upload boundary,
   *  never before. */
  readonly originLocal: Vec3;
  readonly resident: {
    readonly slot: number;
    readonly atlasUvOrigin: readonly [number, number];
    readonly atlasUvScale: readonly [number, number];
    /** How many pyramid levels coarser than `id.level` the resolved atlas
     *  tile actually is (0 = exact match). Mirrors the page table's
     *  saturated-ancestor fallback (`buildEarthPageTable.ts`'s "a tile only
     *  claims a cell whose alpha it can match" rule), resolved once here
     *  instead of per-fragment. */
    readonly levelDelta: number;
    /** Which sub-quadrant of the resolved (coarser) atlas tile this cut
     *  tile's footprint sits in, at each level of `levelDelta` — the offset
     *  the fragment needs to crop the ancestor's UV rect down to this tile's
     *  actual footprint. */
    readonly quadrantOffset: readonly [number, number];
  };
};
```

A per-frame CPU walk (f64) over the tile pyramid, rooted at the cut's base
level and descending by the same three tests `planEarthTiles` already runs —
horizon cull (`capAngle`/`centreAngle`/`patchAngle`), frustum + projected
screen extent (the nine-sample NDC bbox with the near-plane-straddle
fallback `planEarthTiles.ts:167–176` already carries), and the LOD-bias
comparison against `screenPx` — but instead of writing an `EarthTilePlan`
(a page-table window + a fetch-priority request list), the walk's **leaves**
become `SurfaceCutTile[]`, each carrying its own resolved residency. The
resident-ancestor fallback — "this leaf's exact tile isn't resident yet, use
the nearest resident ancestor and crop it" — is resolved **CPU-side, at cut
time**, in `levelDelta`/`quadrantOffset`, because the CPU is already walking
the tree to find the leaf; today's page table re-derives that fallback
per-fragment from a lookup table it rebuilds every frame regardless of
whether residency changed (`buildEarthPageTable.ts` fully regenerates a
`windowSide²` array each call). The atlas, its LRU eviction (`textureAtlas.ts`
— LRU by `lastSeenFrame`, unchanged), the fetch queue, and the manifest band
predicates (`earthTileBandRefineAllowed`/`earthTileBandRequestAllowed`) are
all untouched; only the addressing that turns "which tiles are resident"
into "what does this frame draw" changes.

### 3.2 GPU: per-instance storage buffer

One instanced draw over `SurfaceCutTile[]` (N ≈ hundreds — the same order of
magnitude `EARTH_TILE_WINDOW_SIDE`'s working-set sizing already assumes,
now bounded by the frustum-culled leaf count instead of a fixed window),
rebuilt every frame into a storage buffer, mirroring the star catalog
renderer's shipped pattern (`starCatalogRenderer.ts`, `starCatalogLayout.ts`
— per-source `array<NodeParams>` storage buffer sized to the frame's draw
count, its own `writeBuffer`/`submit` ownership per the CLAUDE.md landmine).
Per instance: `originRelCamMpc` (the pair `starNodeOriginRelCamMpc` already
demonstrates — large-minus-large subtraction done in f64, narrowed only
after), a tile basis/scale (the two in-plane axes and extent needed to place
the tile's baked-local vertices in the instance's own frame), and the
resident addressing fields from §3.1 (atlas uv origin+scale,
`levelDelta`/`quadrantOffset` if not pre-resolved to a flat rect CPU-side).

The vertex shader composes each instance's placement as `rebaseViewProj`-style
rotation-only view (camera at the origin of its own frame) plus a per-instance
translation — never a per-instance full MVP recompute, and never narrowing
`originRelCamMpc` before the camera subtract. This is the same seam
`rebaseViewProj`/`composeBodyMvp` already document for label anchors and body
MVPs; RTC is the third consumer of the same f64-compose-then-narrow rule
ADR 0010 states as the project's precision core.

### 3.3 Static geometry: baked curved per-tile meshes

Each resident tile's mesh is baked **once** (on first need) as a curved
patch — a grid over the tile's lon/lat footprint sampled onto the sphere via
`equirectUvToDirection` (the same mapping `planEarthTiles` already uses for
its corner/centre samples), so the mesh grid and the imagery grid are the
same plate-carrée family (§9.2's ruling). `cubeSphereMesh` is NOT used for
tile patches — it stays in service for the base globe only, and its
forward-compat `(face, level, tileX, tileY)` parameters remain unused at
tile depth. Vertex positions are **relative to the tile's own origin** (not
the sphere centre, not the render origin) — `|v|` is on the order of the
tile's physical extent, which stays `f32`-safe at every pyramid depth,
including the deepest baked level. Intra-tile UV is `[0, 1]²`, mapped to the
resolved atlas rect by the per-instance `atlasUvOrigin`/`atlasUvScale`
uniform rather than baked into the vertex buffer — this is what dissolves
the 2.4 m equirect-UV quantum: today's single whole-globe mesh bakes one
`f32` `u = lon/2π + 0.5` per vertex (`cubeSphereMesh.ts:164-166`), and an
`f32` UV's mantissa resolution at `u ≈ 0.5` is already coarser than a single
z19 texel; a per-tile-relative UV never accumulates that error because the
tile itself is the unit the mantissa has to resolve, not the whole globe.

**LRU mesh cache**, sized to the cut's working set, mirroring `TextureAtlas`'s
existing eviction shape (`textureAtlas.ts`: LRU by `lastSeenFrame`, touched
every frame a key is requested) — a baked mesh is CPU-side geometry (position
+ UV + tangent buffers, the same three streams `cubeSphereMesh` already
returns), not itself atlas-resident, so its cache is a second, independent
LRU from the atlas's texture-slot LRU, keyed by tile id rather than by atlas
slot.

### 3.4 Rejected alternatives

**Fragment-side page table for the tile path — rejected, `buildEarthPageTable`
deleted from Earth's tile-detail draw path.** The page table's whole reason
to exist is to let ONE draw call (the globe's single indexed mesh) sample a
window of many resident tiles per-fragment. RTC draws each tile as its own
instance already, so the fragment never needs to ask "which tile am I in" —
the instance answers that. Keeping the page table alongside per-instance
draws would be two addressing schemes doing the same job. The **base globe
below the tile floor** (the whole-globe BMNG/EOX-composited texture below
`baseLevel`) keeps a plain base texture sampled by the existing
`cubeSphereMesh`-built low-res mesh — RTC only replaces the **detail** tiles'
addressing, not the always-present backdrop every failure path already falls
back to (`earthRenderer.ts`'s module header: "every failure path lands on the
picture Earth draws without it").

**Shared flat unit-grid instancing — rejected.** An alternative RTC shape
instances one shared flat quad mesh per tile, relying on the vertex shader to
curve it via a per-instance projection. Rejected: correct curvature at a
tile's own scale requires sampling the sphere at the tile's own resolution
(a flat quad linearly interpolated between four corners undershoots the
sphere's curvature inside the quad), and the undershoot is worst exactly
where it matters most — coarse tiles near the cut's root, where a flat quad's
sagitta error is largest. Baking each tile's own curved mesh (§3.3) pays the
bake cost once per resident tile (LRU-cached) rather than paying a curvature
correction every vertex, every frame, for tiles that rarely change shape.

**In-shader curved reconstruction from a flat base — rejected.**
Reconstructing sphere curvature per-fragment or per-vertex from a flat
tile-local frame reintroduces exactly the `f32` cancellation RTC exists to
remove: the reconstruction needs the tile's position relative to the sphere
centre, which is the same large-radius-relative-to-tile-extent ratio that
makes the CURRENT whole-globe mesh's per-vertex math coarse at depth. Baking
the curve CPU-side, once, in f64, and shipping only the already-curved
tile-relative vertices to the GPU is what keeps the GPU-side math
well-conditioned.

## 4. Plan 2 — surface navigation

Sequenced after Plan 1 lands: cursor-directed zoom and cursor-anchored drag
both bias/rotate the camera against the body's surface, and both read
altitude-gated behaviour that is only meaningfully tunable once the
foundation's true zoom floor (§1's "today ~15 m") is the one in effect.

### 4.1 Cursor → surface hit

Analytic ray-sphere in f64 (`raySphereRoots`, already shipped and unit-tested
as the CPU twin of the WESL shadow-ray primitive): unproject the cursor to a
ray through the near plane, intersect the focused body's sphere. The hit is
stored **body-fixed**, not world-fixed:

```ts
// stored as, e.g., a field on the camera-gesture register
hoveredSurfacePoint: { bodyId: BodyId; point: LonLatDeg } | null
```

Body-fixed survives the body's own rotation for free — a hit computed this
frame and consumed several frames later (the bias in §4.2 converges over
multiple frames) still names the same physical ground point, not a world
position the planet has since rotated out from under. `LonLatDeg` and the
`directionToLonLatDeg`/`lonLatDegToDirection` conversions already exist
(built for the debug cockpit's fly-to-lon/lat instrument on this branch,
`src/utils/camera/lonLatFocusPose.ts`); this reuses them rather than
inventing a second geodetic pair type. A cursor miss (off-globe, or no body
focused) leaves `hoveredSurfacePoint` at whatever it already was, per §4.3's
lifecycle rule.

### 4.2 Cursor-directed zoom — an eye-position correction, not a target move

The bias is applied as a **correction to the camera's eye position**, computed
fresh each frame from the anchor and the current altitude — never by moving
`target` and never by writing into `cam.distance`'s meaning. `target` stays
the body centre; `cam.distance` keeps meaning camera-to-centre. This is a
deliberate, load-bearing choice: `docs/backlog/2026-07-30-camera-target-vs-origin-distance-gates.md`
documents that `cam.distance` is read, unmodified, by roughly a dozen
NEAR0 content layers as a scale/distance gate, by `scaleBar.ts`'s
`effectiveDistance = cam.distance − pivotRadiusMpc`, and by the altitude-keyed
near plane (`foregroundFrustum.ts`, keyed off `cam.distance − pivotRadiusMpc`
via `deriveSlabs`) — every one of those stays correct **by construction**
under an eye-position correction, because none of them reads eye position;
they read `target`/`distance`. A target-lerp implementation (the shape
`orbitRadPerPixel`'s header and the surface-directed-zoom backlog file
initially sketch as "the standard move") would silently detune every one of
those gates the moment the body isn't the origin, reopening exactly the
distance-semantics confusion that backlog item was filed to record.

Contract:

```ts
// src/utils/camera/surfaceZoomBias.ts (new)
export function surfaceZoomBias(
  anchor: LonLatDeg,
  bodyOrientation: Readonly<Mat3>,
  bodyCentreMpc: Readonly<Vec3>,
  radiusMpc: number,
  altitudeMpc: number, // distance - radiusMpc, the pivot's own altitude term
): Vec3; // eye-position DELTA, in world Mpc, to add after the orbit eye is computed
```

`altitude → 0` converges the bias toward "the anchor point sits exactly under
the eye"; `altitude → ∞` (or past a tuned falloff) the bias returns to zero,
so zooming back out reverts to centre-directed for free — a pure function of
altitude, not a stateful ease, so it needs no clock and cannot desync from a
paused/resumed gesture. The anchor is written once, at zoom-gesture start
(the first wheel tick after a hit, or pinch start), from `hoveredSurfacePoint`
— not re-picked every tick, so a zoom gesture converges on one fixed point
even as the cursor's projected position drifts under the converging camera.

### 4.3 Drag-while-biased — decided rule (flagged for user review)

The spec must define what happens when an orbit-drag gesture starts (or
continues) while a zoom bias anchor is standing. **Proposed rule:**

- Orbit-drag works exactly as today — it rotates about `target` (the body
  centre), using the exact-rotation fix in §4.4, not the anchor.
- The bias correction (§4.2) continues to apply on top of the drag's
  resulting eye position, unmodified, for as long as the anchor stands — so
  a drag mid-zoom-in still visibly converges toward the anchor while also
  responding to the drag.
- The anchor clears on **focus change** (a new body focused, or focus
  cleared) — not on drag start, not on drag end, not on zoom direction
  reversal. Zooming back out past the bias's falloff (§4.2) already zeroes
  its visible effect without needing to clear the anchor; clearing only on
  focus change keeps the anchor's lifetime simple (one write site, one clear
  site) rather than threading a second invalidation rule through every
  gesture transition.

This is a **decided-by-spec rule**, called out per the brief's instruction —
the alternative (clearing the anchor on drag start, so a drag always
recentres zoom) was considered and rejected: it would make "drag a little,
then keep zooming" silently drop the convergence the user had just been
watching build, for no benefit over letting the bias simply keep applying
through the drag.

### 4.2/4.3 amendment — 2026-08-21: classic zoom-to-cursor replaces the eye bias

The eye-bias mechanism above shipped and was **withdrawn at the T7 gate**. Held
as a standing correction between the logical pose and the rendered eye, it made
a second camera the user could not see, and all three reported symptoms came
from that split: a drag moved the eye, which changed the pull vector, so
dragging apparently zoomed; each wheel tick re-captured the anchor and swapped
the pull vector discontinuously ("Earth pops"); and a standing ~848 km offset at
21,216 km altitude snapped the pose the moment a drag handed the register back.

The replacement is classic zoom-to-cursor as genuine pose motion: each tick
re-picks the surface point under the cursor and scales the EYE's distance to it
(`zoomedEyeStep`), decomposed into the pose's own terms — a distance scale plus
a lateral pivot shift that rides `clock.followPanOffset`, the one lateral
channel the per-frame pivot-pin does not erase. No anchor is remembered between
ticks; there is no bias state and no second camera. Altitude is now EYE-based
everywhere (`eyeAltitudeMpc`), and the standoff floor with it.

### 4.4 Cursor-anchored orbit-drag — exact rotation, not a damped rate

`orbitRadPerPixel` is explicitly documented as "correct only at screen
centre" (`orbitRadPerPixel.ts:22-24`) and its header already names this
backlog item as the deferred exact fix. With §4.1's raycast now available,
the drag solves for the rotation that keeps the grabbed hit point under the
cursor, rather than integrating a single altitude-damped rad/px rate
uniformly across the drag. This fixes both failures the backlog file names:
off-centre drift (the rate no longer assumes the grab started at screen
centre) and the missing `cos(pitch)` term (yaw's effect on the sub-camera
point's ground track is a direct function of the actual hit geometry, not a
separately-derived latitude correction bolted onto a flat rate).
`orbitRadPerPixel`'s altitude-damped rate is not deleted — it remains the
`pivotRadiusMpc === null` / no-hit fallback (dragging in empty space, or
past the globe's limb), so the exact fix and the existing approximation
coexist as hit/miss branches of one drag path rather than two parallel drag
implementations.

### 4.5 Pan stays separate from zoom bias — considered and rejected consolidation

Translate-pan (`orbitControls.ts`'s `dragMode === 'pan'` branch, right/middle
mouse) already shifts `cam.target` by a screen-aligned world delta computed
at `pxToWorld = 2 · cam.distance · tan(fovY/2) / cssHeight` (`orbitControls.ts:427`).
A consolidation — route pan through the same eye-correction mechanism §4.2
introduces — was considered and rejected: pan and zoom-bias solve different
problems in different frames with different lifetimes. Pan is a **persistent,
view-space** reframe (the user explicitly relocated where they're looking,
and it should stick until they pan again or refocus); zoom-bias is a
**transient, body-fixed** convergence that decays to zero as the gesture
that created it recedes (§4.2). Folding them into one mechanism would force
one of the two into the other's lifecycle rule, reintroducing the kind of
"must remember which case this is" branch `docs/superpowers/conventions/simplicity.md`
flags. They stay two offsets, composed independently at eye-position
resolution time.

**Currency fix, riding this plan (named in the decided design, not a new
finding):** pan's `pxToWorld` uses raw `cam.distance` (`orbitControls.ts:427`)
where the orbit-drag rate (§4.4) and the wheel zoom (`zoomedDistance.ts`)
both already use **altitude** (`distance − pivotRadiusMpc`) once a body is
focused. Near the surface, `cam.distance` is dominated by the body's own
radius (exactly the problem `zoomedDistance.ts`'s header describes for the
undamped zoom case) — a pan gesture's screen-to-world conversion should use
the same altitude currency the other two gestures already converged on, so a
pan near the surface moves the target by a sane ground distance instead of
one dominated by Earth's radius.

### 4.6 Surface-fixed camera follow

Below an altitude threshold (tuned against today's real ~15.3 m floor, not
the stale ~1 km premise — see §1), with **two-threshold hysteresis** (engage
below threshold A, disengage above threshold B > A, so altitude noise near a
single threshold can't flicker the mode), compose
`inverse(orientationAtFlip) · currentOrientation` into the camera basis — the
same shape `zoomedDistance.ts`/`orbitRadPerPixel.ts` already use for
"a behaviour that only needs to change near the surface, gated on distance
rather than always on," per the backlog item's own "suspected fix." Snapshot
`orientationAtFlip` at the frame the mode engages: the composed delta starts
at `inverse(orientationAtFlip) · orientationAtFlip = identity`, so the flip
frame introduces no pose jump — the camera reads as continuing exactly where
it was, then holds its footing on the ground as Earth spins underneath
rather than sliding in the inertial frame `applyFocusedBodyPivot`'s current
pin uses.

**Re-derive `LIVE_IDLE_TICK_MS`** (`runFrame.ts:144`, currently `500`, derived
in the comment at `runFrame.ts:120-143` against "the 127 km standoff" and a
"~147 km viewport") against the real ~15.3 m floor and whatever altitude
range surface-fixed follow now holds steady. The derivation's shape (tick
length × rotation rate ≤ some screen-space drift budget, screen-space drift
scaling inversely with altitude) is unchanged; only the altitude the
constant is tuned against needs updating, since the viewport at ~15 m
altitude spans metres, not ~147 km — the existing 500 ms cadence would read
as a large multi-metre jump at today's floor, not the sub-1.5 px drift the
comment currently claims.

## 5. Acceptance criteria

- Smooth, step-free camera motion and stable imagery down to ~2 m altitude
  (below today's floor — this exercises the floor being lowered further as
  part of validating Plan 1, since the foundation itself imposes no tighter
  limit than atlas/data depth). Magnified z19 texels at that altitude are
  expected and acceptable; synthetic super-resolution is out of scope.
- No blocky UV quantization at z15 and deeper.
- Ocean glint stays stable (no visible jitter/z-fighting-like artifacts) below
  10 m altitude.
- Cursor-directed zoom visibly converges on the hovered point; zooming back
  out reverts to centre-directed with no snap.
- Orbit-drag keeps the grabbed ground point under the cursor at every
  latitude and every screen position, not only near centre.
- Ground does not visibly slide under the camera below the surface-follow
  engage threshold, with the sim clock set to LIVE.
- `npm run perf` measured before and after on every renderer/GPU-side change
  in Plan 1 (per the `perf` skill: MERGED vs PER-LAYER vs FLOOR, measured
  against this worktree's own dev server URL). A neutral-or-negative
  measurement halts the landing pipeline per `feedback_code_is_liability` —
  land/park is the user's ruling.
- Full suite green (`npm test`, `npm run typecheck`).

## 6. Out of scope

- The cut-planner / SSE frontier (§1) — `SurfaceCutTile[]` is a step toward
  it, not the frontier itself.
- Synthetic detail below the z19/z20 data floor.
- GeoDanmark band productionization — its own spec, once the sommer-2008 vs
  forår-2025 vintage question resolves.
- Other bodies' migration to RTC (Moon, Sun, planets stay on
  `composeBodyMvp`'s unit-sphere path).
- Camera-pose URL deep links.

## 7. File inventory (indicative — plans confirm exact paths)

New:

```
src/@types/scene/SurfaceCutTile.d.ts
src/utils/scene/cutSurfaceTiles.ts            (or split per the walk's natural seams)
src/utils/camera/surfaceZoomBias.ts
src/utils/camera/surfaceDragRotation.ts        (§4.4's exact-rotation solve)
src/services/gpu/renderers/bodies/earthSurfaceTileRenderer.ts  (or similar; RTC instanced draw)
src/services/engine/frame/passes/earthFrame.ts (or similar; P1's shared-derivation extraction)
tests/** mirroring the above
```

Modified:

```
src/services/engine/frame/runFrame.ts          (P1 extraction; cut call site replaces plan call site)
src/services/engine/frame/passes/earthLayer.ts (P1 extraction; RTC draw replaces unit-sphere draw)
src/services/gpu/renderers/bodies/earthRenderer.ts  (RTC instanced pipeline; buildBindGroup reshape)
src/services/gpu/shaders/bodies/earth/{vertex,fragment}.wesl  (per-instance placement + atlas addressing)
src/services/camera/orbitControls.ts           (§4.4 exact-rotation drag; §4.5 pan currency fix)
src/services/engine/camera/cameraDrivers.ts    (§4.6 surface-fixed follow composition, if it needs a new driver row or an addition to an existing one — plan decides)
src/services/engine/camera/applyFocusedBodyPivot.ts (interaction with §4.6's basis composition — plan decides whether these compose or one subsumes the other)
src/services/engine/frame/runFrame.ts          (LIVE_IDLE_TICK_MS re-derivation)
```

Deleted (from Earth's tile-detail draw path only — the manifest/planner/atlas
machinery underneath is untouched):

```
src/utils/scene/buildEarthPageTable.ts
```

Untouched: `src/utils/scene/planEarthTiles.ts`'s band predicates
(`earthTileBandRefineAllowed`/`earthTileBandRequestAllowed`), the manifest
shape, `earthTileSubsystem`'s atlas/fetch/LRU machinery, `TextureAtlas`,
`cubeSphereMesh`'s base-globe use, all non-Earth renderers.

## 8. Verification plan

**Unit:** the cut walk's horizon/frustum/LOD-bias tests against known camera
poses (mirroring `planEarthTiles.test.ts`'s existing fixtures, retargeted at
`SurfaceCutTile[]` output); `surfaceZoomBias` altitude-convergence curve
(near-zero at large altitude, full convergence at the floor, monotonic in
between); the exact-rotation drag solve against a known hit point and drag
delta; the surface-follow basis composition's identity-at-flip-frame
property.

**Visual (dev server, user's eyes):** the six acceptance-criteria behaviours
in §5, plus a specific check that the base-globe fallback (§3.4) still
renders correctly below the cut's finest resident level and on every failure
path (no manifest, no atlas, a 404 on every tile) — RTC must not regress the
"every failure path lands on the picture Earth draws without it" guarantee
`earthRenderer.ts`'s header currently states.

**Then:** `npm run perf` before/after (§5); full suite; `/feature-done` audit
per plan.

## 9. Contradictions found while reading the code (flagged, not resolved here)

Surfaced rather than silently written around. Both are now resolved: §9.1 in
this draft's numbers, §9.2 by the ruling recorded below (which §3.1/§3.3
already reflect).

**9.1 — Stale altitude numbers (resolved in this draft, see §1).** The
surface-fixed-follow backlog item (filed 2026-08-19) and the eox-deep-tile-bands
spec's §10 (merged as PR #594, this same branch) both describe a ~1 km
surface standoff. As of this branch's `482facb7d` commit (2026-08-20, earlier
today), `SURFACE_STANDOFF_RADII` is `1.0000024` (~15.3 m) and `MIN_NEAR_MPC`
is `2e-22` Mpc (~6.2 m) — both roughly two orders of magnitude tighter than
the backlog file's premise. This spec's §1 and §4.6 already account for the
real numbers; flagged here so the discrepancy against the source backlog
files is visible rather than silently corrected without a trace.

**9.2 — Cube-sphere tile addressing vs. the imagery pyramid's plate-carrée
addressing (RESOLVED — ruling below).** The checkpoint design's
`SurfaceCutTile.id` shape was `{face, level, x, y}` — cube-sphere addressing,
matching `cubeSphereMesh`'s forward-compat `(face, level, tileX, tileY)`
parameters (`cubeSphereMesh.ts:16-23`, "the future quadtree subdivides ...
without a signature change"). But the imagery tile pyramid this cut must
address for residency — `EarthTileId`, the manifest bands, the atlas, the
page table it replaces — is **explicitly, deliberately NOT cube-sphere**:
`EarthTileId.d.ts`'s docblock states "Deliberately NOT cube-sphere: both
imagery sources are EPSG:4326 rasters, so that would resample every pixel
twice," and is addressed as plate-carrée `(kind, z, x, y)` with `x` counting
east from -180 and `y` south from +90. These are two different grids over
the same sphere; a cube-sphere face tile and an EPSG:4326 pyramid tile do not
nest or align, especially near cube-face edges and corners, where a
cube-sphere cell's footprint in equirect space is a highly non-rectangular
region.

Today's base globe reconciles this per-**vertex**, analytically:
`cubeSphereMesh` computes each cube-sphere vertex's `lon`/`lat` and derives
its equirect UV directly (`cubeSphereMesh.ts:149-166`) — no tile-grid
alignment needed, because the globe samples one continuous equirect texture.
RTC's `resident` addressing (§3.1) is coarser than per-vertex: it names a
**tile-level** atlas rect (`atlasUvOrigin`/`atlasUvScale`) per cut leaf,
which requires the cut leaf's footprint to correspond to a resolvable region
of the equirect pyramid — not just an analytic per-vertex UV. `levelDelta`/
`quadrantOffset` (§3.1) already anticipate a level MISMATCH (this cut leaf's
exact level isn't resident, use a coarser ancestor and crop) within the
**same** grid family, mirroring the page table's existing ancestor-fallback
rule — but they do not by themselves resolve a grid-**family** mismatch
between a cube-sphere cut leaf and the equirect pyramid it must look up
against.

Two resolutions were considered:

1. **(CHOSEN) The cut walk operates on the equirect pyramid's own `(z, x, y)` grid**
   (the same grid `planEarthTiles` already walks), and the "face" in
   `SurfaceCutTile.id` is dropped or reinterpreted as a bookkeeping field
   rather than a true cube-sphere face index. The curved per-tile mesh (§3.3)
   is then baked per equirect tile using `equirectUvToDirection`
   (`planEarthTiles.ts` already imports and uses this for the same
   corner/centre sampling the cut needs), not `cubeSphereMesh`'s cube-face
   parameterization. This keeps one grid family end-to-end and sidesteps the
   mismatch entirely, at the cost of `cubeSphereMesh`'s forward-compat
   `(face, level, tileX, tileY)` parameters staying unused for tile-level
   work (they would remain in service only for the level-0 base globe).
2. **The cut walk stays cube-sphere-addressed**, and each cut leaf resolves
   its equirect-pyramid residency via an explicit reprojection step (compute
   the cut leaf's lon/lat footprint bounds, then look up the covering
   equirect tile(s) at an appropriate level) — closer to the decided design's
   literal shape, but needs a new, currently-unspecified mapping function,
   and needs a ruling on what happens when one cube-sphere leaf's footprint
   spans more than one equirect tile at the resolvable level (expected near
   cube edges at shallow cut levels).

**Ruling: option 1.** One grid family end-to-end makes residency lookup 1:1
and deletes the reprojection layer option 2 would need (including its
one-cube-leaf-spans-many-equirect-tiles edge near cube-face boundaries).
Equirect's pole distortion never bites at tile depth: detail tiles exist only
inside manifest bands (none polar today), and coarser levels belong to the
cube-sphere base globe, which keeps rendering exactly as it does now. The
accepted cost — `cubeSphereMesh`'s forward-compat tile parameters staying
unused for tile-level work — is recorded in §3.3. `SurfaceCutTile.id` in
§3.1 and the mesh baking in §3.3 are written to this ruling.

## References

- [Earth surface virtual texture — design](completed/2026-07-28-earth-surface-virtual-texture.md)
- [EOX deep tile bands — design](completed/2026-08-19-eox-deep-tile-bands-design.md) — §10's band-fallback ruling and the standoff/near-plane numbers this spec updates (§9.1)
- [ADR 0010 — continuous per-object floating origin for interactive free zoom](../../adrs/0010-continuous-floating-origin-for-free-zoom.md) — the f64-compose-then-narrow precision core RTC is a third consumer of
- `docs/superpowers/conventions/plan-style.md`, `simplicity.md`
- `src/services/gpu/renderers/starCatalog/starNodeOriginRelCamMpc.ts`,
  `starCatalogRenderer.ts`, `starCatalogLayout.ts` — the shipped RTC pattern
  this plan replicates for Earth's surface tiles
- `src/utils/camera/composeBodyMvp.ts`, `rebaseViewProj.ts` — the two existing
  f64-compose-then-narrow seams RTC's per-instance placement follows
- `src/utils/math/raySphereRoots.ts` — the cursor→surface hit primitive
- `src/utils/camera/lonLatFocusPose.ts`, `src/utils/scene/{directionToLonLatDeg,lonLatDegToDirection}.ts` — existing geodetic-point plumbing Plan 2 reuses
- Absorbed backlog items (deleted by this change, alongside their `docs/BACKLOG.md` index lines):
  `docs/backlog/2026-07-30-surface-directed-zoom.md`,
  `docs/backlog/2026-07-30-cursor-anchored-orbit-drag.md`,
  `docs/backlog/2026-08-19-surface-fixed-camera-follow.md`,
  `docs/backlog/2026-07-30-earth-frame-derived-twice.md`
- Honored, not absorbed:
  `docs/backlog/2026-07-30-camera-target-vs-origin-distance-gates.md` — §4.2
  cites this as the reason the zoom bias is an eye-position correction, never
  a `target` move
