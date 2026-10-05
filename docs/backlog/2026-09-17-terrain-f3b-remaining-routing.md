# Terrain F3b — the rest of the per-purpose routing

`needs-design` — spec §12's `F3b` row, ground-truthed against the tree after #704,
#719, #736, #738 and F3a (#744). The table it descends from is largely already
satisfied; §12's row should be replaced by the item below (terrain under an
atmosphere, once listed here as a second item, is owned by the 2026-09-21
local-froxel aerial-perspective spec).

## Item 1 blocks F4's Mars bake

Found in F3a's F3 review, and it sets the order rather than merely suggesting one.

F3a routes site placement, so a rover is **drawn** at `datum + terrain + altitudeM`.
The camera still anchors, pivots and pixel-locks at `datum + altitudeM`:
`siteRung.engage:124`, `sitePoseToBodyArm`/`FromBodyArm` and
`hostedFocusPivotM:22` all pass a bare datum radius. That is item 1's remaining
`radiusM` routing.

The mismatch is invisible in F3a because all four `SURFACE_FIXED_SITES` rows are
Mars-hosted and `terrainHeightAt` answers 0 for any body but the engaged atlas.
The moment F4 gives Mars tiles it becomes visible: Gale sits about 4.5 km below the
MOLA datum, so the camera would orbit a point kilometres off the mesh.
`sitePointBodyFixed`'s own header states the consequence — the rover drifts in frame
as the camera moves.

**So item 1 lands before F4's Mars bake, or F4 ships that drift.**

## What the spec claims, and what is actually left

Spec §8.3 opens "`radiusM` ceases to exist. The 215 sites, through ~10 hubs, become
…" and tabulates seven purposes by site count. That sentence describes work **P1
already did**: `3efb77043` (#704) replaced `CelestialBody.radiusM` with
`surface: BodySurface`, and `src/@types/scene/BodySurface.d.ts:11-19` now declares
only `datumRadiusM` and `reliefM`. Every row of the table was routed then.

The site counts are therefore stale in the strict sense — there is no `radiusM` left
to count. The live surface is small: 6 `outerBoundRadiusM(` call sites and 8
`innerBoundRadiusM(` call sites outside their own files, plus two hubs
(`bodyFootprintRadiusM`, 12 readers; `bodyDrawRadiusM`, 2) and ~45 non-declaration
`datumRadiusM` reads, 24 of which are the authored rows in
`src/data/bodies/scenePlanets.ts`.

Two of the table's rows are already **done**, not pending:

- **Occlusion (19 sites).** `src/services/engine/frame/sceneOccluderBodies.ts:44,50,65`
  pass `innerBoundRadiusM(...)` for every occluder. The horizon cap's occludee — the
  row the spec singles out as needing `boundsM(patch).max` — is
  `src/utils/surfaceTiles/cutSurfaceTiles.ts:168,181`, where `reliefHeadroom(z,x,y)`
  (`:253-259`) reads the deepest resident height ancestor's `subtreeRangeM` and widens
  the cap by `acos(1/(1+relief))`. That is a per-node local maximum from real header
  data, which is what the row asked for. It landed with F1/F2 (R14/R15).
- **Atmosphere ground radius (part of the 41).** `src/data/bodies/atmosphereParams.ts:34`
  is `const EARTH_RADIUS_KM = innerBoundRadiusM(SCENE_EARTH.surface) * SCALE_UNITS.M_TO_KM`
  — already the inner bound, since #704.

Only Earth carries relief at all (`src/data/bodies/sceneEarth.ts:23`,
`reliefM: [-430, 8849]`); every other body is `[0, 0]`, so the three bounds coincide
and all of this is inert outside Earth until F4 gives Mars a relief interval.

What genuinely remains splits cleanly by whether it needs scene depth.

---

## Item 1 — Terrain-aware surface anchors and cloud-deck clearance (unblocked)

### The pick row

There is no object-pick problem to fix. The GPU pick pass writes identity only
(`src/@types/data/PickResult.d.ts`: `{ sourceCode, localIdx }`), and its disc is an
analytic sphere at the floored datum radius
(`src/services/gpu/shaders/bodies/spherePick.wesl`, driven by
`src/services/engine/helpers/bodySlabFlooredPick.ts:32` from
`prepareBodySurfaceFrame`'s `radiusM`, which
`src/services/engine/frame/passes/earthPass.ts:122` sets to `datumRadiusM`). A peak
8.8 km above the datum shifts that silhouette by 0.14 % of the radius — sub-pixel at
any framing where the body is clickable at all.

The sites that matter are the **camera gestures**, all of which intersect the datum
sphere through `raySphereRoots`:

- `src/utils/camera/pickOnBody.ts:10` — the shared ray/datum intersection, called from
  `latchSurfaceGesture.ts:20`, `draggedSurfacePose.ts:41` and `surfaceZoomStep.ts:59`.
- `src/utils/camera/anchoredDragRotation.ts:33` — `pickDir`, the drag anchor.
- `src/services/engine/camera/poseFrameConversion.ts:94` — the arm's range, near root
  against `bodyRadiusM`.

`bodyRadiusM` there is `HostBody.radiusM`, documented as the datum
(`src/@types/camera/HostBody.d.ts:9-10`), supplied at
`src/services/engine/camera/rungs/bodyRung.ts:80`.

**The spec's "up to 8.8 km of parallax at grazing incidence" is the wrong figure.**
8,849 m is the _radial_ mismatch, which is the whole error at nadir and the least
interesting case. The ground-position error grows as `h·tan θ` with incidence: ~15 km
at 60°, ~177 km at `MIN_INCIDENCE_COS = 0.05` (`anchoredDragRotation.ts:26`), the
guard past which the gesture is refused outright. It shows up as drag _rate_: both
ends of a drag pick the same wrong sphere, so a short drag over the Himalaya does not
teleport, it tracks at the wrong speed and the terrain slides under the cursor.

Spec §8.1 sketches `raycast(origin, dir)` — intersect the outer-bound sphere, march
against `terrainHeightM`, bisect the first crossing — as the answer. It does not
exist; F3a shipped only `terrainHeightM`
(`src/utils/surfaceTiles/terrainHeightM.ts:24`) and
`surfaceTileSubsystem.terrainHeightAt`
(`src/@types/engine/subsystems/SurfaceTileSubsystem.d.ts:68`).

Note the overlap: the **zoom** anchor is already filed separately
(`2026-09-17-terrain-aware-zoom-anchor.md`) and its option 2 is a cheap fixed-point
iteration rather than a march. Whichever lands first sets the shape for the other
four sites; they should not each grow their own.

### The cloud deck

`CLOUD_SHELL_PARAMS.radiusRatio = 1.002` (`src/data/bodies/cloudShellParams.ts:107`)
places the deck at datum × 1.002 = **12,742 m**. The shell is a `uvSphereMesh(128, 64)`
whose facet centres sag by `1 − cos²(π/128)`
(`src/services/gpu/renderers/bodies/cloudShellRenderer.ts:76-85`), bringing the lowest
point of the drawn surface to **8,917 m**. Everest displaces to 8,849 m. The clearance
is **68 m**, and nothing enforces it.

Readers, and what each would need:

- `src/services/engine/frame/passes/cloudShellPass.ts:181` — the drawn shell,
  `datumRadiusM × radiusRatio`. Its own comment already names this as F3's job.
- `src/services/engine/frame/passes/cloudShellPass.ts:129` — the `insideShell` test,
  against the same datum ratio.
- `src/utils/scene/bodyDrawRadiusM.ts:29` — the slab's outermost shell,
  `bodyFootprintRadiusM(body) × radiusRatio`, i.e. the **outer** bound × 1.002. That is
  8,867 m further out than the shell `cloudShellPass` actually draws. Safe direction
  (slab planners over-estimate) but a real disagreement between two derivations of one
  shell, and it dissolves the moment the deck is an altitude.
- `src/services/engine/frame/passes/surfaceTilesPass.ts:104` and
  `src/services/engine/frame/passes/earthPass.ts:189` — `shellRadius` for the cast
  shadow, passed as a unit-sphere ratio into the shaders. Re-expressing the deck as
  metres above the outer bound means these two hand the shaders a ratio derived at the
  call site, or the shaders take metres.
- `src/utils/scene/cloudDeckFade.ts:33-34` reads `fadeStartAltitudeRadii` /
  `fadeEndAltitudeRadii`, which are already altitudes-above-datum in body radii and
  are unaffected. Note `fadeEndAltitudeRadii = 0.0005` (~3.2 km) is _below_ Everest,
  so the deck's own clearance failure is only ever seen from a distant camera, where
  the deck is at full opacity.

### Options

1. **`raycast` for real, deck as altitude.** One shape for all five gesture sites plus
   the zoom anchor; the deck constant becomes `cloudTopAltitudeM` above
   `outerBoundRadiusM(surface)`. Honest, and it is the piece anything later reuses.
2. **Iterate `terrainHeightAt` at the sphere hit** (the zoom-anchor file's option 2)
   and leave `raycast` unbuilt. Two or three fixed-point steps converge for near-nadir
   rays and are wrong across a ridge at the grazing end — which is precisely the end
   where the error is 177 km rather than 15.
3. **Deck only.** The clearance is a constant and a handful of call sites; the gesture
   anchors are a behaviour change that wants an eye-check. Splitting them is defensible
   if the deck's 68 m is judged urgent and the anchors are not.

Price the march before committing: it runs per gesture event, not per frame, but it
walks `terrainHeightAt` — a resident-ancestor lookup and a bilinear per step.

## Not in scope

- The h/R band arithmetic. §8.3 keeps `hOverR`, the regime bands, drag damping and
  the zoom taper on `datumRadiusM`; they are camera feel, and re-basing them is a
  behaviour change with no terrain motivation.
- `ceilingHeightM` / `bestHeightM` / `boundsM` and the compiled §3.4e grid — withdrawn
  in §8.2, and §8.3's remaining mentions of them are historical. There is one
  estimator, `terrainHeightM`.
- Mars. Body-generic by construction; the relief interval arrives with F4.
- Terrain self-shadowing (`2026-09-12-mesh-body-shadows.md`) and vertical
  exaggeration, both out of the parent spec's scope.

## See also

- Spec `docs/superpowers/specs/2026-09-13-per-planet-terrain-design.md` §8.1 (the
  `raycast` sketch), §8.3 (the routing table), §2 (the depth-aware external
  dependency), §12 (the `F3b` row this replaces).
- `docs/backlog/2026-09-17-terrain-aware-zoom-anchor.md` — the sixth anchor site,
  already filed, sequenced immediately after F3a.
- F3a plan `docs/superpowers/plans/2026-09-16-terrain-f3a-height-lookup.md:331-334`,
  the deferral boundary this file discharges.
