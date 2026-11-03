# Sky rung, clip-only slice — design spec

> **Status.** Drafted 2026-11-03 from the grill session
> [`tour-opens-on-earth-2026-11-03.md`](../../grill-sessions/tour-opens-on-earth-2026-11-03.md) (Q4–Q6,
> Q10) and the refactor-ground checkpoint the same day. Rulings in §2 are the user's.
> **Scope.** Two PRs off main: the prep (§3.3) first and alone, then the slice (§4–§6). The tour PR
> (`clockTo`, clock freeze, the Earth beats) builds on the slice and is not this spec.
> **Relation to sky mode.** This is the camera rung of
> [`2026-10-28-sky-mode-design.md`](https://github.com/rulkens/skymap/blob/sky-mode/docs/superpowers/specs/2026-10-28-sky-mode-design.md)
> (branch `sky-mode`), cut to what a clip needs. It **changes that spec's shape**: the place moves
> from the pose into the frame tag (R2). Sky mode's spec and plan take this shape when they resume.

## 1. What this is

A clip can stand a person on a planet: the eye planted 1.7 m above the live terrain at a lon/lat,
looking in compass azimuth and altitude, horizon level. While the clock runs, the person stays
planted and keeps looking at the same local azimuth/altitude. A clip leg tagged with this frame
interpolates those local angles, and a later leg in the body frame rises away from the spot.

The first user is the grand tour's opening: stand in Søndermarken at local noon, look up, run the
clock to night, rise.

Not in this slice (sky mode keeps them): drag-to-look, wheel/pinch lens, the takeover, "Sky from
here", the place picker, the zoom-out exit, grids.

## 2. Rulings

| #  | Ruling |
| -- | ------ |
| R1 | The standing eye is a **new rung**, the `{ sky }` rung of the sky-mode spec, landed first as a clip-only slice (grill Q6). |
| R2 | **The place lives in the frame tag**, not the pose (checkpoint, 2026-11-03). Clip channels carry only the look angles. |
| R3 | Eye height **1.7 m** above the live terrain (sky-mode R7). |
| R4 | Packaging: **a separate prep PR** off main, then the slice PR on top of it (checkpoint). |
| R5 | #952's P4 (the 1.7 m surface render check) is the slice's first eye check (grill Q10). |

## 3. Ground preparation

### 3.1 Ideal shape

```ts
// src/@types/camera/ — one type per file
type SkySpot = { readonly body: SceneBodyId; readonly lonRad: number; readonly latRad: number };
type SkyPose = { readonly azimuthRad: number; readonly altitudeRad: number }; // az north→east; alt ±π/2
type RungKind = 'absolute' | 'body' | 'site' | 'sky';
// FrameOf.sky = { readonly sky: SkySpot }   PoseOf.sky = SkyPose
// MemOf.sky = null                          ParentOf.sky = 'body'

// prep 1 — a frame tag is ONE key, the kind; its value is the rung's identity, read by the row
RungRow<K>.identity(frame: FrameOf[K]): string   // 'earth' · 'sondermarken' · 'earth,<lon>,<lat>'

// prep 2 — clip legs fold against the live ground
DriverCtx.terrainHeightAt: TerrainHeightAtLookup          // required
ClipFrameOptions.terrainHeightAt?: TerrainHeightAtLookup  // absent ⇒ datum, as today

SKY_EYE_HEIGHT_M = 1.7   // src/data/camera/
```

`SkySpot` sits inside the `sky` key rather than beside it so that every tag keeps the shape
`{ [kind]: value }`. `rungKindOf` reads that one key, and `refoldTo` already builds parent tags
that way.

### 3.2 Verdicts

Sites from searching `rungKindOf(` (12) and `is(Site|Body|World)Arm(` (21) under `src/` and
`tools/`, each read and classified.

| Touchpoint | Verdict | Why |
| --- | --- | --- |
| `CAMERA_RUNGS`, `RungKind`/`FrameOf`/`PoseOf`/`MemOf`/`ParentOf` | **Growth** | A key and a row. The maps and `CAMERA_RUNGS`' type force the getter. |
| `rungKindOf.ts:8` | **Prep 1** | `'body' in frame ? 'body' : 'site'` sends a fourth kind into the site row (and `rowFor`, `climbRowFor`, `isSiteArm` with it). |
| `frameKey.ts` / `frameBodyId.ts` | **Prep 1** | Identity is `kind:id`, read through a `Record<RungKind, SceneBodyId>` cast that already lies for a site (a `SurfaceSiteId`). A spot is not an id: two sky frames at different places must not compare equal, or `frameLegsOf` merges their legs. The row answers its own identity, typed per kind, and `frameBodyId` (its only caller is `frameKey`) is deleted with the cast. |
| `evaluateClip.ts:563`, `cameraDrivers.ts:224` | **Prep 2** | A leg change converts through `datumOnlyTerrainHeight`. The sky → body rise would open with the eye at datum + 1.7 m, the park's terrain height below the eye on screen. |
| ~8 table sites (`rowFor`, `climbRowFor`, `stepRung`, `refoldTo`, `foldToWorld`, `frameContext`, …) | **Growth** | They go through the row. `stepRung` finds two children under body; sky's `engage` is always null, so site still engages as before. |
| ~22 one-kind sites (world-only, body-only, site-only) | **Not touched** | A sky pose skips them. `applyWheelZoom` routes a non-world wheel to the rung's step, which this slice declines. |
| `encodeFramedPose` / `decodeFramedPose` | **Growth** | Tag letter `k`. The encoder's else (absolute) stops compiling once the pose union widens; the decoder returns null for an unknown letter. |
| `tools/site/utils/turnCameraArm.ts:7` | **Not touched** | A hand-rolled `'site' in` test; it throws on sky, which is safe. Backlogged (§8). |
| `siteEyeFrame`, `lookedSurfacePose` | **Reuse** | The spot's ENU basis and the az/alt turn. |

### 3.3 Prep (PR 1, its own commits, in order)

- **P1. One tag key, identity on the row.** `rungKindOf` returns the tag's one key (`'absolute'`
  for the bare string). Each row gains `identity(frame)`: absolute `''`, body `frame.body`, site
  `frame.site`. `frameKey` becomes `kind` plus `:identity` and `frameBodyId` is deleted.
  Behaviour-preserving: every existing key string is unchanged (`frameKey.test.ts`), and
  `oneTagReader.test.ts` stays green. Watch the import cycle: `frameKey` reaching `rowFor` goes
  through the getters in `cameraRungs.ts`, which exist for exactly this.
- **P2. Clip legs fold against the live ground.** `stepCameraRuntime` puts its `terrainHeightAt`
  on the driver bag. The clip driver passes it into `evaluateFramedClip`, and `convertChannels`
  and `framedClipArm` use it, falling back to datum when it is absent. Behaviour-preserving: no
  row's `channels`, `toParent` or `fromParent` reads the lookup today (only `bodyRung.host`'s floor
  closure does, at input time), so nothing moves until the sky row reads it. No new test in PR 1:
  plumbing. The slice's "a sky → body leg starts at the standing eye" test is its guard. The
  datum caveat at `evaluateClip.ts:557` is rewritten to say the lookup now reaches the evaluator.

## 4. The sky rung

### 4.1 Eye and basis

- **Eye.** On the host, at the spot's lon/lat, at `radius + terrainHeightAt(lon, lat) +
  SKY_EYE_HEIGHT_M` along the sphere radial, derived each time and never stored. Earth's terrain is
  geodetic WGS84 laid straight onto the sphere (`SurfaceFixedSite.latDeg`), so the radial is the
  same up the terrain renderer draws.
- **Basis.** `siteEyeFrame` at the spot, turned by azimuth about up and then by altitude. Roll is
  identically zero.

### 4.2 Row cells

| Cell | This slice |
| --- | --- |
| `host` | `hostOf({ body: frame.sky.body })`. |
| `identity` | `body,lonRad,latRad`, joined with `String(n)`. |
| `channels.encode` | `refoldTo` the world pose into the sky frame; `yaw = azimuthRad`, `pitch = altitudeRad`, `target = [0, 0, 0]`, `distance = 0` (as site leaves `target` unused). |
| `channels.decode` | The channels as authored: `{ azimuthRad: yaw, altitudeRad: pitch }`. No clamp, matching site. |
| `toParent` | A `BodyFixedPose` from the eye and basis of §4.1. |
| `fromParent` | `azimuth = atan2(east, north)` and `altitude = asin(up)` of the view direction in the spot's ENU, with altitude clamped. Near the zenith (`|up| > 1 − ε`) azimuth comes from the camera's up vector instead, so a look straight up round-trips. The eye's position is dropped: the tag fixes it. |
| `step`, `nudge` | Decline: return `framed.pose` by reference (§`RungRow`'s identity rule). Sky mode fills them. |
| `engage` | Always `null` (sky-mode D3): only a tag enters this rung. |
| `release` | `true` when the focus leaves the host's subtree, as site does; otherwise `false`. |

### 4.3 Clips

- A leg tagged `{ sky: SPOT }` interpolates `yaw`/`pitch` as any leg does. `yaw` lerps along the
  shortest arc (`evaluateClip.ts:377`), so a pan wider than 180° is authored as two tweens.
- Leg changes go through `convertChannels`. Into sky, the start's azimuth and altitude come from
  `fromParent`, and the eye snaps to the spot (it is the tag's). Out of sky (the rise), the start is
  the standing eye, at the live ground after P2.
- **Terrain refinement.** As deeper tiles stream in, the ground under the eye can step by
  centimetres to metres, and the eye steps with it. Accepted for this slice: the tour's opening
  waits for the park's terrain (a cold-load gate, left to the tour PR). If a step shows in the eye
  check, smoothing the eye's height is the fix, inside the row.

### 4.4 URL

`k,<body>,<lonRad>,<latRad>,<azimuthRad>,<altitudeRad>`, `String(n)` throughout. Decode checks the
body with `isRegistryBodyId` and that every number is finite. Altitude must lie in [−π/2, π/2],
or decode returns null.

## 5. Tests

- `skyRung.test.ts`:
  - `toParent` then `fromParent` returns the pose, including altitude ±π/2 (azimuth kept);
  - the eye sits at terrain + 1.7 m under a stubbed `terrainHeightAt`;
  - the horizon is level (the basis's right vector is perpendicular to up);
  - two spots differing only in longitude have different `frameKey`s.
- `encodeFramedPose` / `decodeFramedPose`: the sky round-trip; a bad body or an out-of-range
  altitude returns null.
- `clipKeyframeFrames.test.ts`:
  - a pitch tween in a sky leg holds the eye fixed in the body frame while the body turns
    (the clock runs);
  - a sky → body leg starts at the standing eye (P2).
- Prep: P1 is guarded by the existing `frameKey.test.ts`, `oneTagReader.test.ts` and the rung
  tests. P2 is plumbing with no reader yet; the sky → body test above guards it.

## 6. Eye checks

Shots with `npm run shot`, one dash check each:

1. **The 1.7 m surface render (R5)**: a debug clip standing in Søndermarken, at the horizon and
   at −30°, by day.
2. The same spot at azimuth 180° and altitude 60°, at noon and at night. Stars come out at night.
3. A coastal spot looking out to sea at the horizon.
4. The rise: the first frames of a sky → body leg, with no drop.

Any surface defect at 1.7 m is fixed with a failing shot or test first. If nothing reproduces,
the shots go in the ledger and P4 closes.

## 7. Packaging and order

`main ← PR 1 (P1, P2) ← PR 2 (the slice: types, row, URL letter, tests, eye checks) ← tour PR`.
Each PR has its own plan. PR 2 reports `dependsOn` PR 1's branch.

## 8. Adjacent findings (backlog, not this effort)

- `tools/site/utils/turnCameraArm.ts:7` tests `'site' in arm.frame` by hand, outside `rungs/`.
- `framedClipArm` (`cameraDrivers.ts:217`) decodes with the current basis where the clip pinned
  another; harmless until a decode cell reads a basis.
- The sky-mode spec and plan (branch `sky-mode`) must take R2's shape when they resume.

## 9. Left to the builder

- The zenith ε in `fromParent`.
- Whether the decode keeps `distance` at 0 or 1, if any reader of the distance channel minds.
- Debug-panel and log fields for a sky pose (`cameraDebugSnapshotOf`, `logCameraState`), if the
  eye checks want them.
