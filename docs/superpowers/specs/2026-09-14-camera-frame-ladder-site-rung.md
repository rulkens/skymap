# Camera frame ladder + site rung — design

> **Status.** Drafted 2026-09-14. Ground preparation ran the same day; its
> checkpoint is signed off and every ruling in §0 is binding.
> **Scope.** One spec, two PRs: §3 (prep P1–P5, behaviour-preserving) ships
> first and alone; §4 (feature F1–F4) ships on top. A plan is written per PR.
> **Amended** 2026-09-14 after plan authoring (code-verified corrections).
> **Predecessor.** [camera pivot (spec 2)](completed/2026-09-01-camera-pivot.md)
> built the two-arm design this generalises: §4 regime-as-predicate, §5
> conversions, §6 gesture register, §7 fold, §10 units. Its vocabulary is used
> here without restating it.

## 0. Summary

Today the camera pose lives in one of two frames: heliocentric Mpc
(`'absolute'`) or one celestial body's fixed axes (`{ body }`). A rover parked
on Mars needs a third: a turntable about a **site** — a fixed lat/lon on a host
— where up is the site's radial, the horizon stays level through any drag, and
drag/zoom are rated in metres against the rover's own bounding sphere rather
than against Mars.

Adding that as a third hand-coded arm is not affordable: the two-arm tag is
branched on at **46 sites** across the camera, clip, debug and state code
(refactor-ground survey, 2026-09-14). This spec therefore does two things — it
turns the tag into a **ladder of rungs** described by one table
(`CAMERA_RUNGS`), moving exhaustiveness from 46 consumer branches into one
mapped type, and then adds the site rung as a row.

### Premise correction

The backlog item this spec consumes diagnosed the symptom as "the rover gets
the mesh-body orbit driver, drag damped against the host". That is **false**,
verified against the tree today. `regimeArmFor` engages a body arm only when
the focused body _is_ the nearest roster body (`regimeArmFor.ts:31-33`), and
`nearestBodyHR` scans `SCENE_CELESTIAL_BODIES` only — mesh bodies are
deliberately out of that roster (`nearestBodyHR.ts:5-8`). With `curiosity`
focused, `nearest` is `mars`, the ids differ, and **no arm ever engages**: the
rover is orbited from the world arm. Nor is the drag damped against the host —
`pivotFraming` returns `radiusMpc: null` for a mesh body
(`pivotRadiusMpc.ts:42-47`), so `orbitRadPerPixel` degenerates to the flat rate
`ORBIT_MAX_RAD_PER_PX` (`orbitRadPerPixel.ts:19-20`). The observed symptoms —
rolling horizon, dipping under the ground, wrong-scale feel — are all the world
arm's, and there is no ground plane anywhere in that path.

### Rulings (user, 2026-09-14, binding)

- Feel: **turntable** — yaw about the local vertical, pitch from ground to
  overhead, zoom along the sightline, horizon level.
- A **third arm** (site rung), not a growth of the Mars arm. Chain:
  world ↔ body ↔ site. The site rung disengages **to the body arm**.
- Band on the eye→site range in bounding radii: engage < 40 R, release > 80 R;
  two new `CameraTuning` fields.
- Host-generic: any celestial host with a `surfaceFixed` `PositionDriver` row
  (rovers on Mars today; Earth-hosted sites later). Orbit-driven meshes (whale,
  petunias, the Voyagers) never engage it.
- Consumers: clips, keyframes, the recorder and the debug panel carry the site
  frame. No URL-hash pose codec exists today → **out of scope**, backlogged.
- Tag spelling stays `'absolute' | { body } | { site }`; the rung kind is
  derived from the key name (`rungKindOf`).
- A rung **table** replaces the per-consumer tag branches; the design must
  scale to further rungs ("we will do this a couple more times").
- Packaging: prep P1–P5 is its **own PR** (behaviour-preserving, golden traces
  byte-identical); the feature is a second PR on top.
- The fold steps **at most one rung per at-rest frame**; clips own the rung
  while playing, as today; no fixpoint iteration.
- Site→body disengage lands the body arm anchored **at the site**
  (`anchorLocalM` = the site point), not at the body centre, which keeps the
  stored magnitudes at rover scale.
- **The body arm serves ONE point**: under a focus _hosted_ on the arm's body
  that point is the focus's own — its body-fixed point re-derived from
  `focusBodyId` each drain, carrying the follow memory's `panOffset` wherever
  the reader works in world Mpc. Everything the arm does about a point reads
  it: the eye's own scaling and all three settle turns pivot on it, the hold
  asks whether it is still above the eye's horizon, and the disengage commits
  the arm looking at it. So the rover is pixel-locked in both directions, the
  tilt ramps back to the remembered value about it (ruling 12), and neither
  crossing has anything to re-aim. With no hosted focus the wheel keeps its
  cursor-pick anchor (ruling #7), and the accepted cost is that a focused rover
  has no cursor-directed zoom in its host's arm, exactly as it has none in the
  world arm.

## 1. Goals / non-goals

### Goals

- A rover can be approached, orbited and zoomed at metre scale with a level
  horizon and an eye that never enters the ground.
- One generic path per consumer concern (fold, host, identity, routing, codec),
  so a fourth rung is a row plus its conversions and nothing else.
- The tag stays the only regime discriminant; `noStoredRegimeFlag` keeps
  passing unchanged.
- Prep lands behaviour-preserving: `driverGoldenTrace`, `settleGoldenTrace` and
  `poseFold` are byte-identical across P1–P5.

### Non-goals

- **A URL-hash pose codec.** None exists (`HASH_PARAM_SOURCES` carries `focus`,
  `t`, `orientation` only). Backlogged — §8.
- **The atmosphere-over-rover stopgap.** `mesh-bodies` after `atmosphere-shell`
  in `FRAME_ORDER` stands until the froxel work gives the inside path scene
  depth. Nothing here is blocked on it and nothing here touches it.
- **Orbit-driven mesh bodies.** The Voyagers, the whale and the petunias keep
  the world arm; a site rung needs a `surfaceFixed` driver row.
- **Terrain.** Bodies stay analytic spheres, so the floors below are sphere
  floors. A future DEM changes the floor's input, not the rung.
- **Rung-generic follow/approach drivers.** The approach stays absolute-arm
  only; §4.8 keeps the descent from stranding it instead.

## 2. The ladder model

### 2.1 Rung kinds and the derived tag

The tag keeps its spelling; everything else is derived from a table of kinds,
so adding a rung is one entry in three mapped types and one row.

```ts
// src/@types/camera/RungKind.d.ts
export type RungKind = 'absolute' | 'body' | 'site';

// src/@types/camera/FrameOf.d.ts — the tag spelling, per kind
export type FrameOf = {
  readonly absolute: 'absolute';
  readonly body: { readonly body: BodyId };
  readonly site: { readonly site: BodyId };
};

// src/@types/camera/PoseFrame.d.ts — now DERIVED; the spelling is unchanged
export type PoseFrame = FrameOf[RungKind];

// src/@types/camera/PoseOf.d.ts
export type PoseOf = {
  readonly absolute: CameraPose;
  readonly body: BodyFixedPose;
  readonly site: SitePose;
};

// src/@types/camera/FramedPose.d.ts
export type FramedPose<K extends RungKind = RungKind> = {
  readonly frame: FrameOf[K];
  readonly pose: PoseOf[K];
};

// src/@types/camera/FramedCameraPose.d.ts — now DERIVED from the kinds
export type FramedCameraPose = { [K in RungKind]: FramedPose<K> }[RungKind];
```

Every listing in §2 shows the **post-feature** shape. Prep (§3) lands the ladder
**two-kinded** — `RungKind` is `'absolute' | 'body'` and each mapped type carries
two entries — because a third kind without a complete row fails the compiler gate
and prep must stay behaviour-preserving; the feature (§4) adds `'site'` as the
third entry in the same commit as its row.

`rungKindOf` is the one reader of the spelling:

```ts
// src/services/engine/camera/rungs/rungKindOf.ts
export function rungKindOf(frame: PoseFrame): RungKind;
```

It answers `'absolute'` for the string and otherwise picks the kind off the
single key present. Every other consumer takes the kind, never the key.

### 2.2 The parent relation

The ladder is a chain, root first: `absolute ← body ← site`.

```ts
// src/@types/camera/ClimbableKind.d.ts
export type ClimbableKind = Exclude<RungKind, 'absolute'>;

// src/@types/camera/ParentOf.d.ts
export type ParentOf = { readonly body: 'absolute'; readonly site: 'body' };
```

A body rung's parent is the world; a site rung's parent is its host's body
rung. `absolute` has no parent, which is why the row type splits in two below
rather than carrying four cells the root would have to stub out.

### 2.3 Frame identity

```ts
// src/services/engine/camera/rungs/frameKey.ts
export function frameKey(frame: PoseFrame): string; // 'absolute' | 'body:mars' | 'site:curiosity'

// src/services/engine/camera/rungs/sameFrame.ts
export function sameFrame(a: PoseFrame, b: PoseFrame): boolean; // frameKey equality

// src/services/engine/camera/rungs/isWorldArm.ts
export function isWorldArm(framed: FramedCameraPose): framed is FramedPose<'absolute'>;
```

`frameKey` adopts the debug panel's grammar (`CameraStateSection.tsx:53`,
today's only `body:<id>` spelling) and retires the second, unprefixed one
(`evaluateClip.ts:486-487`). Key equality is the only frame comparison anywhere
after P1; `isWorldArm` is the single predicate the absolute-only drivers keep.
It is a **type guard on the framed value**, not on the bare tag: eight of the
twelve gates it replaces use the tag test to narrow the _pose_ before reading it
as a `CameraPose` (`cameraDrivers.ts:103`, `applyWheelZoom.ts:24`, …), and
TypeScript narrows a discriminated union through a direct comparison on the
discriminant property but never through a predicate applied to that property —
a `(frame: PoseFrame) => boolean` spelling would force eight `as` casts that
§2.6.3 confines to `rowFor`/`climbRowFor`. All twelve sites already hold a
`FramedCameraPose`.

### 2.4 The row and the table

```ts
// src/@types/camera/RungRow.d.ts
export type RungRow<K extends RungKind> = {
  readonly kind: K;
  /** The celestial body this rung's numbers are expressed against, or null. */
  host(frame: FrameOf[K], ctx: RungBasisCtx): HostBody | null;
  /** Rung-local gesture memory; the runtime wipes it when `frameKey` changes. */
  readonly emptyMemory: MemOf[K];
  /**
   * `tilt` rides beside `memory` rather than inside it: the tilt memory is keyed
   * by HOST, not by frame, so a frame change must not wipe it. A row that does
   * not author tilt passes the slot back unchanged.
   */
  step(
    memory: MemOf[K],
    tilt: TiltMemory,
    framed: FramedPose<K>,
    input: InputStep,
    ctx: RungCtx,
  ): { readonly pose: PoseOf[K]; readonly memory: MemOf[K]; readonly tilt: TiltMemory };
  readonly channels: RungChannels<K>;
};

// src/@types/camera/ClimbRow.d.ts
export type ClimbRow<K extends ClimbableKind> = RungRow<K> & {
  readonly parent: ParentOf[K];
  toParent(framed: FramedPose<K>, ctx: RungBasisCtx): FramedPose<ParentOf[K]>;
  fromParent(parent: FramedPose<ParentOf[K]>, frame: FrameOf[K], ctx: RungBasisCtx): FramedPose<K>;
  /** Band-in against the parent, focus rule included; null = stay put. */
  engage(parent: FramedPose<ParentOf[K]>, ctx: RungCtx): FrameOf[K] | null;
  /** Band-out; wider than `engage` by construction. */
  release(framed: FramedPose<K>, ctx: RungCtx): boolean;
};

// src/services/engine/camera/rungs/cameraRungs.ts
export const CAMERA_RUNGS: { readonly absolute: RungRow<'absolute'> } & {
  readonly [K in ClimbableKind]: ClimbRow<K>;
};
```

Supporting types, one per file under `src/@types/camera/`:

```ts
export type HostBody = {
  readonly id: BodyId;
  readonly state: BodyState;
  /** Ground radius, metres — `SCENE_CELESTIAL_BODIES`, never a bounding hull. */
  readonly radiusM: number;
};

export type MemOf = { absolute: null; body: SurfaceGestureMemory; site: null };

export type RungChannels<K extends RungKind> = {
  /** Absolute world channels → this rung's channels. */
  encode(world: CameraPose, frame: FrameOf[K], ctx: RungBasisCtx): CameraPose;
  /** This rung's channels → the framed pose they name. */
  decode(channels: CameraPose, frame: FrameOf[K], ctx: RungBasisCtx): FramedPose<K>;
};

export type RungBasisCtx = {
  readonly bodies: ReadonlyMap<BodyId, BodyState>;
  readonly poseBasis: Readonly<Mat3>;
  readonly upBasis: Readonly<Mat3>;
};

export type RungCtx = RungBasisCtx & {
  readonly focusBodyId: BodyId | null;
  readonly pivot: PivotFraming;
  readonly viewportPx: Readonly<Vec2>;
  readonly fovYRad: number;
  readonly tuning: CameraTuning;
};
```

The ctx splits **by reader**, not by value. Four sites resolve a world arm or a
host outside the input path and hold none of the gesture-time group — no
viewport, pivot, focus or tuning is in scope at `liveWorldPose.ts:15`,
`watchFlyToLonLatSaga.ts:47`, `clipFrameChannels.ts:62` or
`frameContext.ts:146`, and fabricating a zero viewport and a default tuning
there is the stub-the-root-cell shape §2.2 rejects. So `host`, `toParent`,
`fromParent`, `channels` and the free readers `hostOf` / `hostOrThrow` /
`refoldTo` / `foldToWorld` declare `ctx: RungBasisCtx`; `engage`, `release`,
`step` and `stepRung` declare `ctx: RungCtx`. A `RungCtx` satisfies both.

`channels.encode` takes the **absolute world channels**, not a `FramedPose`:
`BodyFixedPose` carries no orbit target (`decodeBodyFixedChannels.ts:36` anchors
at `[0,0,0]` and folds the target into `eyeRelAnchorM`), while today's
`toBodyFixedChannels` preserves the **authored** `pose.target` through provider A
(`clipFrameChannels.ts:40-44`). An `encode` fed only a `FramedPose<'body'>` would
have to re-derive that target from `toWorldArm`'s graze rule, moving the
`distance` channel on every absolute→body clip leg.

The mapped type is the compiler gate: a new kind that lacks a row, a
conversion, a `channels` codec or an `emptyMemory` fails to typecheck.

### 2.5 The generic consumers

```ts
// src/services/engine/camera/rungs/rowFor.ts
export function rowFor<K extends RungKind>(frame: FrameOf[K]): RungRow<K>;
// src/services/engine/camera/rungs/climbRowFor.ts
export function climbRowFor<K extends ClimbableKind>(frame: FrameOf[K]): ClimbRow<K>;

// src/services/engine/camera/rungs/refoldTo.ts
export function refoldTo(
  framed: FramedCameraPose,
  target: PoseFrame,
  ctx: RungBasisCtx,
): FramedCameraPose;
// src/services/engine/camera/rungs/foldToWorld.ts
export function foldToWorld(framed: FramedCameraPose, ctx: RungBasisCtx): CameraPose;

// src/services/engine/camera/rungs/hostOf.ts
export function hostOf(frame: PoseFrame, ctx: RungBasisCtx): HostBody | null;
// src/services/engine/camera/rungs/hostOrThrow.ts
export function hostOrThrow(frame: PoseFrame, ctx: RungBasisCtx): HostBody;

// src/services/engine/camera/rungs/stepRung.ts
export function stepRung(current: FramedCameraPose, ctx: RungCtx): PoseFrame;

// the narrowings a display or a gate needs, one symbol per file
// src/services/engine/camera/rungs/isBodyArm.ts
export function isBodyArm(framed: FramedCameraPose): framed is FramedPose<'body'>;
// src/services/engine/camera/rungs/isSiteArm.ts
export function isSiteArm(framed: FramedCameraPose): framed is FramedPose<'site'>;
// src/services/engine/camera/rungs/frameBodyId.ts
export function frameBodyId(frame: PoseFrame): BodyId | null;
```

- `refoldTo` is the one conversion in the system, and it moves **whichever end
  is deeper**: it climbs `toParent` from the deeper frame until the two meet,
  then descends `fromParent` to the target. That is what keeps a rung's trip to
  **its own host arm** a single `toParent` — a site reaches its planet's arm in
  one hop and never round-trips through heliocentric Mpc, where metre-scale
  numbers lose their resolution to the 1 Mpc seam (spec 2 §10). A pose already
  in the target frame comes back by reference. `foldToWorld` is its
  `'absolute'` specialisation returning the pose, climbing to the root however
  many rungs deep the frame sits; like today's `resolveWorldArm` it returns the
  world arm's own pose **by reference** (`poseFrameConversion.ts:141-145`),
  which is what keeps the per-frame fold free on the world arm.
- `hostOf` walks up from the given frame and answers the first non-null `host`
  cell. **One failure policy**: `hostOf` answers `null` when the body is
  unresolved this instant; `hostOrThrow` is the single throwing wrapper, used
  by `foldToWorld` and the channel codecs, keeping today's message shape
  (`poseFrameConversion.ts:160-162`). The nine ad-hoc host derivations and
  their three policies (throw / hold / `!`-assert) collapse onto this pair.
- Input routing is `rowFor(frame).step` — every `InputStep` kind, the two
  gesture edges included, so the body rung's latch stops being `replayInput`'s
  business. `replayInput` keeps arbitration, the store commits and the driver
  memories (follow's `panOffset`, the roll ride's epoch bookkeeping).
- `stepRung` replaces `regimeArmFor`: it asks the current rung's `release`,
  then each child's `engage`, and answers the frame at most one rung away. Both
  halves are kind-generic. A release answers the parent **frame**, taken from
  `climbRowFor(current.frame).toParent(current, ctx).frame` — the parent kind
  alone does not name a frame, since a site's parent is its own host planet's
  arm, and only the row can resolve which body that is. An engage asks every row
  whose `parent` equals `rungKindOf(current.frame)`, so a rung parented on a
  body is reachable from a body arm exactly as one parented on the world arm is
  reachable from `'absolute'`.

### 2.6 Invariants

1. **The tag is the regime.** No boolean shadows it;
   `tests/services/engine/camera/noStoredRegimeFlag.test.ts` sweeps
   `src/state`, `src/services/engine/camera`, `src/services/camera` and
   `src/@types/camera` with an empty allow-list and must stay that way — a
   string-keyed rung table passes it by construction.
2. **Consumers never branch on the tag** except through `rungKindOf`,
   `frameKey`/`sameFrame`, `isWorldArm`/`isBodyArm`/`isSiteArm`, `frameBodyId`,
   `hostOf`, `refoldTo`/`foldToWorld`, `stepRung` and `rowFor(...).step` /
   `.channels`. Once a third rung exists, "not the world arm" stops meaning
   "body-fixed metres", so a display that wants a body arm's anchor and basis
   asks `isBodyArm` and a display that wants the turntable's angles asks
   `isSiteArm`; `frameBodyId` answers the body a frame **names** (its own, not
   its host, which is `hostOf`'s question).
3. **The narrowing is confined to the vocabulary.** Every `as` expression that
   asserts a rung fact the value's type cannot carry lives in
   `src/services/engine/camera/rungs/`: `rowFor` and `climbRowFor` (the table
   lookup), `refoldTo` (the descent's child frame and its parent's), `stepRung`
   (the engage loop's parent-framed pose) and `frameBodyId` (the tag's id keyed
   by its kind). Each is guarded by a stated structural argument beside it. No
   file outside that folder narrows a frame or a pose, which is what
   `oneTagReader.test.ts` enforces directory-wise.
4. **One rung per at-rest frame.** `stepRung` moves by one; a two-rung descent
   takes two frames, both invisible (the frame draws the pre-flip world arm —
   `projectFramePose.ts:57-58`). The fold's own flip is kind-generic to match:
   it crosses when the step's answer differs from the displayed frame **and**
   the displayed pose is the one the step judged — the world arm on an engage,
   or the regime's own rung on a descent between two rungs. A produced pose in
   some third frame (a clip leg's) is not this crossing's to convert.
5. **Clips own the rung while playing.** A playing clip authors its own tag per
   leg and keeps it for the leg's duration, as today
   (`cameraDrivers.ts:182-184`, `replayInput.ts:116-117`).
6. **`host` is ground radius.** A bounding hull is never a host radius; a mesh
   body is never a host.

## 3. Ground preparation

**Prep is its own PR** and is behaviour-preserving. Each P below is its own
commit. `driverGoldenTrace.test.ts`, `settleGoldenTrace.test.ts` and
`poseFold.test.ts` must come out **byte-identical**; a trace may be re-recorded
only with a parse-compared diff in the commit message justifying every changed
field. The one deliberate string change is `frameKey`'s grammar (P1), which
reaches no trace and no serialized artifact — only the debug panel and
`logCameraState`'s `frame` field, which goes from `mars` to `body:mars`.

Survey site numbers below are the refactor-ground survey's (2026-09-14); the
line numbers were re-verified against the tree.

### P1 — frame identity

**Creates:** `frameKey`, `sameFrame`, `isWorldArm`.

**Re-homes:** the four hand-rolled equalities — `projectFramePose.ts:167` (6),
`replayInput.ts:206-208` (13), `cameraDebugSnapshotOf.ts:29-31` (36),
`evaluateClip.ts:486-487` (40) — and the eleven `=== 'absolute'` gates:
`cameraDrivers.ts:82` (17), `:103` (18), `:294` (20), `:300` (21),
`applyWheelZoom.ts:24` (22), `applyFocusedBodyPivot.ts:29` (23),
`approachTiltedPose.ts:41` (24), `replayInput.ts:234` (14), `:268` (15),
`selectors.ts:39` (32), `watchOrientationChangeSaga.ts:39` (33). The two
display grammars — `CameraStateSection.tsx:53` (39) and `logCameraState.ts:64`
(29) — read `frameKey`.

**Joint:** one grammar for "which frame is this" and one for "is this the world
arm", so a third tag cannot be added by editing eleven `!== 'absolute'` tests.

### P2 — the table skeleton, `host`, and the fold

**Creates:** `RungKind`/`FrameOf`/`PoseOf`/`FramedPose`, the two row types,
`CAMERA_RUNGS` with the `absolute` and `body` rows populated for `host`,
`toParent`, `fromParent`; `rowFor`, `climbRowFor`, `refoldTo`, `foldToWorld`,
`hostOf`, `hostOrThrow`.

**Re-homes:** `resolveWorldArm` (`poseFrameConversion.ts:150-164`, site 1) and
its six call sites — `projectFramePose.ts:108`, `replayInput.ts:152,243` (16),
`stepCameraRuntime.ts:128` (31), `liveWorldPose.ts:15` (30),
`watchFlyToLonLatSaga.ts:47` (34), `clipFrameChannels.ts:62` (26). The nine
host derivations: `poseFrameConversion.ts:158-159`, `regimeArmFor.ts:43-44`
(7), `replayInput.ts:118` (9), `:126` (11), `cameraDebugSnapshotOf.ts:82` (37),
`cameraDofAnglesOf.ts:66-67` (38), `projectFramePose.ts:136` (4), `:155` (5) —
both `!` assertions go with them — `clipFrameChannels.ts:31` (26),
`watchFlyToLonLatSaga.ts:39` (34), `frameContext.ts:146-149` (27).
`toBodyArm`/`toWorldArm` stay where they are and become the body row's
`fromParent`/`toParent` bodies.

**Joint:** the host triple and the fold each get one home, so a rung that
introduces a new host relation (site → its host body) has somewhere to say so.

### P3 — engage / release and `stepRung`

**Creates:** the `engage`/`release` cells on the body row, `stepRung`.

**Re-homes:** `regimeArmFor.ts` whole (7) — deleted; `projectFramePose.ts`'s
disengage block `:127-152` (3) and engage block `:153-163` (5) become
`toParent`/`fromParent` calls driven by `stepRung`'s answer, and the crossing
commit `:164-170` (6) compares `frameKey`s.

**`toParent` is the conversion, not the whole disengage.** `toParent` **is**
`toWorldArm`, which ranges to the near root / grazing point on the forward ray
(`poseFrameConversion.ts:93-103`) and runs on every world-arm resolution, so it
must not re-aim. The body→world disengage additionally commits a **centre-looking
absolute arm** (`projectFramePose.ts:136-149`): the pivot pin re-reads an
absolute `target` as the body's centre one frame later, and committing
`toWorldArm`'s on-ray surface target teleported the eye one body radius inward
(pop-2). That normalization stays the fold's own post-step on the disengage
direction, extracted as **`centreLookingArm`** (`src/utils/camera/`). Site→body
is different and needs no post-step: there, the disengage _is_ `toParent`
(§4.3, it lands anchored at the site).

**Note:** the focus rule stays exactly today's "focus == the rung's id"
(`regimeArmFor.ts:33,39`) in prep. The subtree rule is a feature commit (F2).

**Joint:** the band edges live beside the rung they belong to, so a rung with a
different band unit (the site rung's bounding radii, not h/R) needs no chooser
edit.

### P4 — the `step` cell and the memory split

**Creates:** the `step` cell on the absolute and body rows; the runtime memory
envelope `{ key: frameKey, value: MemOf[K] }` with a generic wipe on key
change; `SurfaceGestureMemory` (the latch alone).

**Re-homes:** `replayInput.ts:113-146`'s `routeToSurface` — gate (8), register
pick (10) and re-tag (12) all become the generic route; `surfaceStep.ts:46-50`'s
`noteBody` and `SurfaceMemory.memoryBodyId`; the `surfaceGestureEdge` calls at
`replayInput.ts:198,210`. The absolute row's `step` carries
`applyInputToCamera` plus the roll ride; the follow `panOffset` bookkeeping
(`replayInput.ts:175-189`) stays in `replayInput`, because it writes a _driver_
memory that outlives the rung.

**The split (deviation from the checkpoint, deliberate).** `SurfaceMemory`
today carries two unrelated things: the gesture latch, which belongs to the
body rung, and `rememberedTiltRad` + `memoryBodyId`, which do **not** — the
remembered tilt is read by `approachTiltedPose` while the camera is in the
**world** arm, and `noteBody` keys it on the _focused_ body there
(`projectFramePose.ts:91-95`). Keying that memory by `frameKey` would wipe the
tilt on every disengage and change behaviour, which prep may not do. So:

- `MemOf[K]` — the rung's gesture memory, keyed by `frameKey`, wiped on change.
  `absolute: null`, `body: SurfaceGestureMemory`.
- `TiltMemory = { readonly hostId: BodyId | null; readonly rememberedTiltRad: number }`
  — keyed by `hostOf(frame)?.id ?? focusBodyId`, which reproduces `noteBody`'s
  behaviour exactly for both incumbent rungs and gives the right answer for the
  site rung for free (a site's host is its planet, so descending
  world → body → site keeps the tilt rather than wiping it).

**Joint:** a rung owns its gesture register; nothing about the register is
spelled in `replayInput` any more.

### P5 — the `channels` cell

**Creates:** `channels` on the absolute and body rows.

**Re-homes:** `framedClipArm` (`cameraDrivers.ts:182-184`, 19),
`convertChannels`'s fold (`evaluateClip.ts:543-556`, 42) — which becomes
`decode → foldToWorld → encode`, since clip channels always bridge through the
world arm and `refoldTo` would re-derive the target §2.4 keeps authored — and
`clipFrameChannels.ts` whole (26): its
`toBodyFixedChannels`/`fromBodyFixedChannels` are the body row's `encode` and
`decode`. `evaluateClip.ts:508`'s absent-tag default (41) and
`effectHelpers.ts`'s authoring DSL (46) are unchanged.

**Joint:** the wire encoding of a rung's pose sits in the rung's row, so a new
rung's keyframes work without an `evaluateClip` edit.

## 4. The site rung

### 4.1 The pose

```ts
// src/@types/camera/SitePose.d.ts
export type SitePose = {
  readonly siteId: BodyId;
  /** Azimuth of the EYE as seen from the site, radians, north → east. */
  readonly headingRad: number;
  /** Elevation of the eye above the site's tangent plane, radians. */
  readonly elevationRad: number;
  /** Eye ← site distance, metres. */
  readonly rangeM: number;
};
```

Four numbers, roll-free, always looking at the site: the turntable's whole
state. `siteId` is the mesh body's id, which is also its `SURFACE_FIXED_SITES`
row id and its `PositionDriver` id.

### 4.2 The site point and its ENU

The site point, in the **host's body-fixed metres**:

```
P = surfacePointBodyFixed(site.latDeg, site.lonDeg, hostRadiusM + site.altitudeM)
```

This is the expression `deriveBodyStates.ts:82-85` uses to _place_ the rover,
reading the same `SURFACE_FIXED_SITES` row and the same
`SCENE_CELESTIAL_BODIES` ground radius. That identity is the cross-file
contract: if the camera's site point and the body's placement ever diverge, the
rover drifts in frame as the camera moves.

The ENU at `P`, in the same host-fixed axes:

```
up    = normalize(P)
north = the host pole flattened onto the horizon at `up`
east  = north × up
```

whose `east`/`north` are exactly `blendedEnuAt(up, 1, BODY_LOCAL_FRAME.pole,
null)` — at `blendW = 1` that helper is the pure body ENU
(`blendedEnuAt.ts:1-6,19-20`) and its degenerate branch already covers a polar
site. It returns `{ east, north }` **only**; the site frame supplies its own
`up = normalize(P)`. Reuse it; do **not** reuse
`rotationSurfaceLocked` (`rotationSurfaceLocked.ts:24-38`), which is the same
derivation in **world Mpc** for placing the body — routing the camera through
it would put an Mpc↔metre conversion inside the camera path, which spec 2 §10
forbids.

The eye's basis is
`canonicalBasisAt(siteFrame, headingRad + π, π/2 − elevationRad)`
(`canonicalBasisAt.ts:7`), where `siteFrame` is the ENU above: that yields
exactly the roll-free basis whose forward is `−dir` and whose up lies in the
vertical plane through the sightline. No new orientation math is introduced.

### 4.3 Conversions

`dir` is the unit vector from the site to the eye:

```
dir = cos(elevationRad) · (cos(headingRad) · north + sin(headingRad) · east)
    + sin(elevationRad) · up
```

**`toParent` (site → body arm), which is also the disengage (F4):**

```
anchorLocalM  = P
eyeRelAnchorM = rangeM · dir
basisLocal    = canonicalBasisAt(siteFrame, headingRad + π, π/2 − elevationRad)
```

The body arm lands anchored **at the site** rather than at the body centre, as
ruled — which is also what keeps `BodyFixedPose`'s stored magnitudes at rover
scale instead of Mars-radius scale (`BodyFixedPose.d.ts:5-8`). The disengage
needs no code of its own: it _is_ `toParent`.

**`fromParent` (body arm → site), which is also the engage:**

```
eye          = bodyFixedEyeM(pose)
rel          = eye − P
rangeM       = |rel|
elevationRad = asin(clamp((rel/rangeM) · up, −1, 1))
right        = basisLocal's first column
headingRad   = atan2(right · north, −(right · east))
```

then the floors of §4.5. Each site coordinate is read from **whichever incoming
quantity fixes it**. Range and elevation come from the eye. The heading comes
from the **basis**, because the eye does not fix it: the engage lands at the
remembered top-down tilt, where the eye sits over `P` and its azimuth about the
site is float noise — three identical zoom-outs and zoom-ins measured headings
−1.396, −0.939 and −1.144 rad, so the rover landed spun by a different angle
every time (adverse 8, 2026-09-15). `right` is the axis to read it off: the
basis of §4.2 is `canonicalBasisAt(siteFrame, headingRad + π, π/2 − elevationRad)`,
whose `right` works out to `horiz × localUp`, independent of the tilt — so it stays
in the tangent plane at every elevation, where screen-up's tangent projection
shrinks as `sin(elevationRad)` and dies at the horizon.

Reading the heading off the basis costs nothing when the view is already on the
site, which is the case engage fires in: the follow approach frames the focus
(`cameraDrivers.ts:154-160`) and the body arm serves it at the centre, so the
incoming `forward` is `−dir` to 1e-12 and the two readings agree. Where they
differ, the **eye** is what moves and the screen orientation is kept, which is
the right way round — an eye off the turntable's azimuth by `Δheading` is at
most `2 · rangeM · cos(elevationRad) · sin(Δheading/2)` away (9 cm at the tilt
the engage lands at), while an orientation off by `Δheading` is the whole
screen. The round-trip asymmetry is therefore the same shape as before with the
projected quantity swapped: `fromParent(toParent(s))` is the identity for every
`SitePose` within float tolerance; `toParent(fromParent(b))` is **not** the
identity for an arbitrary body pose — it keeps the basis and projects the eye.
Both are pinned as tests (§6).

### 4.4 Engage and release

Two new `CameraTuning` fields, in **bounding radii of the site's own mesh
body**, not in host radii. The rung reads the **scene** seed's
`boundingRadiusM` (`src/@types/scene/MeshBody.d.ts`, the field
`pivotRadiusMpc.ts:42-47` reads) — there is a second, bake-time
`boundingRadiusM` on `MeshAssetRow` in `meshAssets.generated.ts`, which is
where the seed's value comes from but is not what the rung looks up:

```ts
// src/@types/camera/CameraTuning.d.ts (added)
/** eye→site range, in the site body's bounding radii, at which the site rung takes over. */
readonly siteEngageR: number;
/** …and at which it hands back (hysteresis). */
readonly siteDisengageR: number;
```

Defaults `siteEngageR: 40`, `siteDisengageR: 80` in `DEFAULT_CAMERA_TUNING`
(`src/data/camera/cameraTuning.ts`). For Curiosity (`boundingRadiusM` 2.479 m,
`meshAssets.generated.ts:79`) that is engage inside ~99 m, release beyond
~198 m.

**`engage(parentFramed, ctx)`** answers `{ site: focusBodyId }` when all hold:

1. `ctx.focusBodyId` is non-null and its `PositionDriver` has
   `kind === 'surfaceFixed'` (the union is `@types/scene/PositionDriver.d.ts`;
   the table and `positionDriverById` are `data/bodies/positionDrivers.ts`, the
   site rows `data/bodies/surfaceFixedSites.ts`);
2. that driver's `hostId` equals the parent body rung's id — the site hangs off
   _this_ body;
3. `|bodyFixedEyeM(parent.pose) − P| / boundingRadiusM < ctx.tuning.siteEngageR`.

**`release(framed, ctx)`** answers true when
`framed.pose.rangeM / boundingRadiusM > ctx.tuning.siteDisengageR`, or when the
focus leaves the site's subtree (§4.8's generic rule).

`clampCameraTuning` gains the pair with the same shape as the incumbent edges —
range-clamped, then `siteDisengageR ≥ siteEngageR × minRatio`, the knob the
caller moved wins and the other yields (`clampCameraTuning.ts:15-29`) — plus
`siteEngageMin/Max` and `siteDisengageMin/Max` in `CAMERA_TUNING_LIMITS`. Two
slider rows land beside the existing band sliders in
`components/DebugPanel/OrientationTuning.tsx:66-86`.

### 4.5 Floors

- **Range floor:** `standoffRadii × boundingRadiusM`, both read off the scene
  `MeshBody` seed — the _same_ two fields `pivotFraming` already floors the
  world-arm zoom on for a mesh body (`pivotRadiusMpc.ts:42-47`). `standoffRadii`
  is **per-seed** (`MESH_BODY_STANDOFF_RADII = 2` unless the seed overrides it,
  `data/bodies/makers/meshBody.ts:16`), not the Earth-tuned global
  `SURFACE_STANDOFF_RADII`. Curiosity: 2 × 2.479 ≈ 4.96 m. `pivotFraming`'s
  other floor, `MIN_DISTANCE_MPC` (1e-24 Mpc ≈ 3 × 10⁻⁸ m), can never bind on a
  metre-scale body and **must not** enter the site rung's metres path — it would
  drag an Mpc constant across the §10 seam for nothing.
- **Elevation floor:** the eye's height above the site's tangent plane is
  `rangeM · sin(elevationRad)`, and must be at least
  `SITE_RUNG.eyeFloorBoundingRadii × boundingRadiusM` (0.2), i.e.
  `elevationRad ≥ asin(min(1, 0.2 · boundingRadiusM / rangeM))`. At the range
  floor that is ≈ 5.7°. This is the rung's ground: the eye cannot reach the
  horizon plane and cannot pass under it, at any range. The site's own floor is
  the ONLY one here — the rung exists to get under the host's standoff, and
  folding the host's in saturates the `asin` at close range, pinning every pose
  at the ceiling. The hand-back therefore lands the body arm BELOW that arm's
  own descent floor, and the arm's floor is what answers for it: with a hosted
  focus it lifts the eye by raising its elevation ABOUT THAT FOCUS at constant
  range (`flooredBodyPose`), so the rover holds the sightline the settle pivots
  on. A radial push there instead takes the rover 0.030 rad off centre on the
  first notch and leaves it there for the rest of the climb.
- **Elevation ceiling:** `SITE_RUNG.elevationCeilRad`, π/2 minus 1e-3. At
  exactly π/2 the heading has nowhere to go — the same degeneracy
  `CameraPose.roll` documents at nadir (`CameraPose.d.ts:15-21`).

The two ratios and the ceiling are data, in `src/data/camera/siteRung.ts`. They
get no sliders; only the band edges are tunable.

### 4.6 Gesture register

The site rung's `step` cell. A drag carries absolute pixels with `startPx` =
the previous frame's end pixel (`InputStep.d.ts:6-7,19`), so the rung needs
**no memory at all**: `MemOf['site'] = null`, and the gesture edges are no-ops
for it.

- **Drag** — one mode, the turntable; no pan/strafe/look/tilt latch, so none of
  `SurfaceGesture`'s machinery applies. The rate is the body arm's 1:1 ground
  tracking (`anchoredDragRotation`) re-derived on the site's bounding sphere —
  one pixel spans `rangeM · fovYRad / viewportPx[1]` metres of that sphere, so
  it turns that over the sphere's radius, capped at `ORBIT_MAX_RAD_PER_PX`
  exactly as `orbitRadPerPixel` caps the same law:

  ```
  gain          = min(ORBIT_MAX_RAD_PER_PX,
                      (fovYRad / viewportPx[1]) · rangeM / boundingRadiusM)
  headingRad   += (endPx[0] − startPx[0]) · gain
  elevationRad += (endPx[1] − startPx[1]) · gain
  ```

  Both signs are the body arm's **orbit** handle, re-derived: an orbit drag
  there rotates the eye by `−yaw` about the local up and `−pitch` about the
  camera right (`draggedSurfacePose.ts:54-62`), which is `+Δx` → azimuth up and
  `+Δy` → the eye rises. The grabbed side of the rover follows the cursor in
  both axes. This is deliberately **not** the body arm's _tilt_ handle, whose
  heading and pitch are both negated by ruling
  (`draggedSurfacePose.ts:105-117`); the site rung is a turntable orbit, not a
  KML look-around, and the signs must not be "fixed" toward that sibling.
  Heading wraps; elevation clamps to §4.5.

- **Zoom** — `rangeM *= spentZoomFactor(factor)` (`spentZoomFactor.ts:7`,
  clamped to [0.5, 2] per folded notch), then the range floor, then the
  elevation floor re-evaluated at the new range. No cursor anchoring: the
  turntable's pivot is the site, by definition.

- Every other input kind returns its input pose by reference, which is what the
  full-pose byte bar needs (`draggedSurfacePose.ts:131-133`).

### 4.7 Keyframe channels

The site row's `channels` cell maps `SitePose` onto the four animation
channels:

| channel    | site rung                                                       |
| ---------- | --------------------------------------------------------------- |
| `yaw`      | heading                                                         |
| `pitch`    | elevation                                                       |
| `distance` | range, metres                                                   |
| `target`   | `[0, 0, 0]` — the tag names the site, so the point is redundant |

A tween between two site keyframes therefore interpolates heading, elevation
and range linearly, which is the turntable move an author wants. `encode` emits
clamped values and `decode` does not: a leg's endpoints were clamped when they
were captured, and re-flooring them here would bend a tween's ends — so a
hand-authored `distance: 0` puts the eye at the site until the next input step.
The absent-tag rule is unchanged: a segment with no `frame` is `'absolute'`
(`evaluateClip.ts:509`). Known limit, inherited from the body arm: heading
takes the short way only if the author keeps the pair inside a turn — linear
channel interpolation does not unwrap.

### 4.8 The focus-subtree rule and the descent (F2)

Today the rung chooser releases whenever the focused body differs from the
engaged one (`regimeArmFor.ts:39`) and blocks engage the same way (`:31-33`).
With a rover focused, that keeps the Mars arm permanently unreachable — the
premise correction in §0.

The rule becomes generic: **a focus fixed to a rung's surface — directly, or up
a chain of surface-fixed hosts — keeps (and admits) that rung.** The walk reads
each driver's host (`positionDrivers.ts:34-54`) and follows it only while the
row's kind is `surfaceFixed`, so `curiosity → mars` holds the Mars arm under a
rover focus and stops there. That restriction is what keeps the rule off the
fifteen moons, Pluto/Charon and the two Voyagers: an _orbiting_ focus inside a
host's subtree leaves a body-fixed arm behind rather than riding it, so
admitting or holding that arm would sail the focus out of frame with follow
gated off. `PositionDriver` is the chain's only reader; there is no second host
notion here (`utils/scene/hostBodyId` resolves a _texture_ key's host and is
unrelated).

The hold is bounded by what the arm can serve: **a hosted focus keeps (and
admits) the arm only while its site point is above the eye's horizon** —
`dot(E − P, P) > 0` in body-fixed metres, the eye first lifted to the descent
floor so an approach parked under the datum is judged from where the arm would
put it (`hostedFocusOverHorizon.ts`). Unbounded, the hold stranded every switch
between two rovers: no driver runs inside a body arm, so a focus 142° around
Mars was held by an arm that could never reach it.

That rule alone would strand the approach. `followActive` is gated on the world
arm (`cameraDrivers.ts:81-83`) because the ease has no meaning once the state
co-rotates; a rover's framing distance is metres, so an approach with the
subtree rule in place would cross Mars's engage band ~1500 km out, the follow
row would go inactive mid-flight, and the camera would park there. The fix is
uniform with the rule the fold already has for gestures: **an approach owns the
rung until it reaches its focus.** While a follow row is winning and its memory
is not yet `saturated` (`FollowMemory.saturated`, set at
`cameraDrivers.ts:166`), the rung step is skipped — exactly as the fold is
skipped while `intent.dragging` (`projectFramePose.ts:112-114`) — **for a
descent into a rung the focus merely hangs off**, and only for that:

```ts
approaching && frameBodyId(target) !== ctx.focusBodyId;
```

A descent into the focus's **own** rung is the arrival, and it must land. A body
focused from inside its own band — the ordinary tour landing, parked at h/R 0.1
over Mars with Mars focused — engages on the next fold today, and that engage is
what cuts the fresh approach short. Defer it and the approach's `distanceTarget`
is `bodyFocusDistance`, h/R ≈ 3.3: the ease spends its whole duration pulling the
camera **out** of the band, and when the gate finally opens the camera is outside
`engageHR` and never engages again. Gating only the hangs-off case closes the
rover strand without reopening that one; both are the same predicate read from
the two sides, so there is no second rule to keep in step.

The gate lives **in `projectFramePose`, beside that `intent.dragging` skip** —
not inside `stepRung`. `RungCtx` carries no driver state, and widening it to
carry follow memory would braid the driver table into every row's context for
one caller's benefit; `stepRung` stays a pure function of the ladder. What the
fold needs instead is the one boolean "an approach is in flight and has not
saturated", which `stepCameraRuntime` computes from its existing `winnerId` and
follow memory and passes in as `approaching`.

With both, focusing Curiosity from far away plays out as: follow approaches in
the world arm and saturates at rover framing distance → next at-rest frame,
`absolute → { body: 'mars' }` (h/R over Mars ≈ 1e-6, focus in Mars's subtree) →
the frame after, `{ body: 'mars' } → { site: 'curiosity' }` (range in metres,
well inside 40 R). Two invisible frames, one rung each. Follow stays inactive
from then on and nothing is lost by it: the rover is body-fixed on Mars and the
Mars rung co-rotates with it, so there is nothing left to follow.

### 4.9 Displays

`logCameraState` and the debug panel label the frame with `frameKey`, so a site
frame reads `site:curiosity`; the panel's site rows are heading, elevation and
range plus the derived eye height above the tangent plane.

The panel reads nothing but `CameraDebugSnapshot`, so the snapshot carries
`siteHeadingRad`, `siteElevationRad` and `siteRangeM`, each null off a site arm
and written together. Eye height is **not** a fourth field: it is
`siteRangeM · sin(siteElevationRad)`, derived at the readout, so the snapshot
cannot carry a value that disagrees with the two it is computed from.

Clip authoring
accepts `frame: { site: <id> }` wherever it accepts `{ body: <id> }` today
(`src/@types/animation/CameraAction.d.ts:72,82`,
`effectHelpers.ts:86-101,122-137`) with no
authoring-DSL change — the tag is passed through.

## 5. Consumers matrix

All 46 survey sites, grouped by what they become. "P" is the prep task that
moves them.

| Sites                                          | Today                                          | Becomes                                  | P   |
| ---------------------------------------------- | ---------------------------------------------- | ---------------------------------------- | --- |
| 1, 16, 30, 31                                  | `resolveWorldArm` + its call sites             | `foldToWorld(framed, ctx)`               | P2  |
| 26, 42                                         | the channel-space second fold                  | `decode → foldToWorld → encode`          | P5  |
| 4, 9, 11, 27, 34, 37, 38                       | host triple re-derived, 3 failure policies     | `hostOf` / `hostOrThrow`                 | P2  |
| 6, 13, 36, 40                                  | frame equality hand-rolled                     | `sameFrame` / `frameKey`                 | P1  |
| 14, 15, 17, 18, 20, 21, 22, 23, 24, 25, 32, 33 | `=== 'absolute'` driver/liveness gates         | `isWorldArm(framed)`                     | P1  |
| 29, 39                                         | two display grammars for the tag               | `frameKey(frame)`                        | P1  |
| 7                                              | `regimeArmFor` — both arms hard-coded          | `engage`/`release` cells + `stepRung`    | P3  |
| 3, 5                                           | engage/disengage blocks in the fold            | `fromParent` / `toParent` via `stepRung` | P3  |
| 8, 10, 12                                      | `routeToSurface` — gate, register pick, re-tag | `rowFor(frame).step`                     | P4  |
| 2                                              | tilt-memory key, engaged body else focus       | `hostOf(frame)?.id ?? focusBodyId`       | P4  |
| 19                                             | `framedClipArm` branches per arm               | `rowFor(frame).channels.decode`          | P5  |
| 28, 35                                         | arm construction                               | unchanged — root-rung constructors       | —   |
| 41, 46                                         | absent-tag default, authoring DSL              | unchanged                                | —   |
| 43, 44, 45                                     | opaque `FramedCameraPose` pass-through         | unchanged                                | —   |

Sites 28, 35, 41, 43, 44, 45 and 46 carry the tag without inspecting it and
stay as they are; they are listed so the matrix accounts for all 46.

## 6. Testing

Per [`testing.md`](../conventions/testing.md) — each test below can fail on a
real bug that no other test and no compiler check catches. No constant
restatements, no clamp-boundary mirrors.

**Prep (P1–P5).**

- `driverGoldenTrace`, `settleGoldenTrace`, `poseFold` — byte-identical across
  every prep commit. These are the prep's whole safety argument.
  `tests/services/engine/frame/poseFold.test.ts:163-424`'s **nine** cases stay
  two-rung in prep and gain the third state in the feature PR.
  `settleGoldenTrace.test.ts` is under `tests/services/engine/frame/` too, not
  under `.../camera/`.
- `noStoredRegimeFlag` — unchanged, allow-list still empty.
- `rowFor`/`climbRowFor` return the row whose `kind` matches `rungKindOf`, for
  one frame of each kind. This is the test that covers the two `as`
  expressions; without it a mis-keyed table is a silent wrong-row dispatch.
- `hostOf` answers null — not a throw, not an assertion — for a body absent
  from the state map, and `hostOrThrow` throws with the engaged id in the
  message. Three incumbent failure policies collapsing to one is exactly where
  a silent teleport could be introduced.

**Feature (F1–F4).**

- **Round-trip exactness.** `fromParent(toParent(s))` reproduces every field of
  a `SitePose` within tolerance, over a fixture set spanning a polar site, the
  prime meridian, elevation at the floor and at the ceiling, and range at the
  floor and at the release edge. And the whole ladder: `refoldTo` site → world
  → site reproduces the pose within tolerance for the same set.
- **Aim projection is asymmetric on purpose.** `toParent(fromParent(b))` for a
  body pose aimed _away_ from the site returns a pose aimed _at_ it, with the
  eye unmoved. A test asserting full symmetry here would be asserting the wrong
  contract.
- **Band hysteresis.** A camera crossing `siteEngageR` inward engages and does
  not release until it crosses `siteDisengageR` outward; a camera parked
  between the two edges holds whichever rung it arrived in.
- **Focus-subtree hold.** With focus `curiosity` and the frame
  `{ body: 'mars' }`, `stepRung` holds the Mars rung (today's chooser answers
  `'absolute'`); with focus `earth` it releases.
- **Approach owns the rung.** With a follow row winning and `saturated: false`,
  `stepRung` returns the current frame unchanged even when the band admits a
  descent; once saturated it descends one rung.
- **One rung per frame.** From the world arm with a rover focused at rover
  range, two successive `stepRung` calls reach `{ site }` and not before —
  neither a single-frame teleport nor a third frame.
- **Turntable feel.** After an arbitrary sequence of drag steps, the eye's
  height above the tangent plane never goes below the floor. The level horizon
  is structural rather than a named test: `SitePose` carries no roll and
  `canonicalBasisAt` takes none, so the incumbent's rolling horizon is
  unrepresentable here; the basis itself is covered by
  `tests/utils/camera/canonicalBasisAt.test.ts`.
- **Channels.** A site keyframe's `encode`/`decode` round-trips; an untagged
  segment still reads as `'absolute'`.

## 7. Open questions

1. **Does the approach gate (§4.8) disturb an existing approach?** It changes
   behaviour wherever a follow approach currently crosses an engage edge
   mid-flight — a latent stranding bug, not a feature, but a behaviour change
   all the same. _Recommend:_ adopt it in the feature PR (never in prep), and
   check `driverGoldenTrace` for a trace that engages mid-approach; if one
   exists, re-record it with the diff justified. _Settled:_ adopted in the
   narrowed form §4.8 now states — the literal predicate breaks arrival into a
   focus's own band. No recorded step engages mid-approach, so the three golden
   traces stay byte-identical.
2. **Are 40 R / 80 R the right edges?** _Recommend:_ ship them as the defaults
   with sliders; the sliders make a re-tune a one-line data change, and the
   eye-check settles it faster than analysis does.
3. **Drag signs.** Derived in §4.6 from the body arm's orbit handle, not ruled.
   _Recommend:_ ship as derived and confirm on the first eye-check; if the feel
   is inverted the fix is two signs in one file.
4. **Site up: the host radial, or the mesh body's own up?** They differ once a
   rover sits on a slope. _Recommend:_ host radial, as specced — the bodies are
   analytic spheres, so there is no slope to read, and the alternative needs
   the `body-bounds-vs-surface` backlog item first.
5. **Any Earth-hosted site in this PR?** The rung is host-generic but
   `SURFACE_FIXED_SITES` holds only the four Mars rovers. _Recommend:_ author
   none; the host-generic code is the deliverable and a test fixture covers a
   non-Mars host.

## 8. Backlog hygiene

- **Consumed and deleted in this change:**
  `docs/backlog/2026-09-12-rover-surface-camera-regime.md` and its index line in
  `docs/BACKLOG.md`. Its diagnosis was stale (§0); its requirements are carried
  by §4.
- **Added:** "Camera pose in the URL hash" (`needs-design`), with
  `docs/backlog/2026-09-14-camera-pose-url-hash.md`.
- **Unchanged, noted:**
  `docs/backlog/2026-09-11-clip-per-endpoint-tag-authoring-validation.md` gets
  cheaper after P5 (per-endpoint tag validation becomes a `channels`-cell
  question); `docs/backlog/2026-09-12-body-bounds-vs-surface.md` is the shape
  the site row's `boundingRadiusM` read would eventually use, and nothing here
  requires it.

## References

- Refactor-ground checkpoint, survey and greenfield cross-check, 2026-09-14
  (session scratchpad; the rulings are transcribed into §0).
- [camera pivot (spec 2)](completed/2026-09-01-camera-pivot.md) — the two-arm
  design: §4 regime, §5 conversions, §6 gestures, §7 fold, §10 units.
- [`plan-style.md`](../conventions/plan-style.md),
  [`simplicity.md`](../conventions/simplicity.md),
  [`testing.md`](../conventions/testing.md).
