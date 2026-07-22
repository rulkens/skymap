# Switchable orientation frame — design

> **Status.** Drafted 2026-07-22 against the grill session
> `docs/grill-sessions/coordinate-frame-switch-2026-07-22.md` (8 ratified
> decisions, cited as Q1–Q8 below) and the refactor-ground checkpoint
> (user-ratified 2026-07-22). Written **against the post-prep architecture**
> (§9 Ground preparation): Prep 1 (camera-math consolidation) and Prep 2
> (orientation frame registry) land as their own PRs before the feature.
> Supersedes the backlog item `docs/backlog/2026-07-22-coordinate-frame-switch.md`
> (deleted with this change).
> **Worktree.** `orientation-solar-system-plane`.

## 1. What we're building

The world frame is fixed right-handed **equatorial J2000** (+x vernal equinox,
+z celestial north — `raDecDistToCartesian.ts`). Every catalog position, the
Milky Way model, and the solar-system bodies are baked into that frame by exact
published rotations, so the data layer is principled throughout. The camera is
not: the orbit camera hard-codes world +Y as its pole
(`updatePosition.ts` Y-up spherical math, `computeViewProj.ts` lookAt up
`[0,1,0]`, `orbitControls.ts` pan basis). World +Y is (RA 90°, Dec 0°) — an
astronomically meaningless point on the celestial equator that nobody chose; it
is what falls out of bolting a Y-up graphics camera onto a Z-up dataset. So the
planets ride a visibly slanted line and there is no way to see the scene
ecliptic-up, galactic-up, or supergalactic-up.

This feature adds a user-facing **Orientation** switch with four frames, each
meaning "that frame's north pole is up": **equatorial** (Polaris up),
**ecliptic** (solar-system level — the default), **galactic** (Milky Way level),
**supergalactic** (local-supercluster plane). Switching animates a ~1 s roll
that rights the world without moving the subject; a clip primitive
(`frameTo`) authors the same reorientation inside a tour; the choice persists to
a share URL when non-default.

### Goals

- Four orientation frames, camera-side only: no data rebake, no shader change,
  no picking or engine-logic change (Q3).
- Default **ecliptic** (Q2) — Earth's 23.44° obliquity is *desired* in the
  solar-system view; that tilt is what obliquity looks like from the ecliptic.
- Interactive switch = a hold-the-pose roll (Q4), continuous even mid-tween /
  mid-clip (Q6), via one always-composing basis slerp.
- A `frameTo(frameId, { over, ease })` clip cue (Q6 addendum).
- Persist to the settings slice + a URL hash param written only when non-default
  (Q7); a share link reproduces a galactic-up composition exactly.
- One **Orientation** dropdown row in the Display section (Q8).

### Non-goals (deferred, named)

- **Auto-select frame by scale** (Q1's Option B) — ecliptic inside the solar
  system, galactic inside the Milky Way, equatorial in the survey, no UI. A
  policy that writes the same setting; it can grow on top of this manual switch
  later. Deferred because it forces "when exactly does the frame flip during a
  descent" before a reoriented view has even been validated.
- No keyboard shortcut in v1 (crowded namespace, low-frequency toggle — Q8).
- No StatusBar indicator (Q8).
- Supergalactic-as-*data* is untouched: `superGalacticTransform.ts` keeps
  rotating the CF-4 / MCPM volumes into world coordinates; this feature only
  *reads* its rotation as one camera pole among four.

## 2. Decisions summary (Q1–Q8)

| Q | Decision |
| - | -------- |
| Q1 | Global manual switch (Option A); auto-by-scale deferred. Four frames. |
| Q2 | Each option = "that frame's north pole is up". Default **ecliptic**. The legacy Y-up pole is deleted, not enshrined as an option. |
| Q3 | Frame-aware camera pole (Option A): the camera gains a frame basis; position/target stay world-equatorial. No world rebase. |
| Q4 | The switch holds `position`+`target` and animates only the up-vector — geometrically a pure roll around the view axis. |
| Q5 | Authored yaw/pitch are always interpreted in the active frame via one shared encode/decode pair; the few absolute literals get a one-time re-tune under the ecliptic default. |
| Q6 | One mechanism: the basis `B(t)` itself slerps (~1 s), always composing. Idle → roll; driven → decode-through-moving-basis. Plus a `frameTo` clip cue. |
| Q7 | Settings slice + URL hash param written only when non-default; boot applies the URL frame **before** the camera seeds (snap, no slerp). |
| Q8 | "Orientation" dropdown row in the Display section; no shortcut, no StatusBar. |

## 3. Architecture — data delta first

### 3.1 The frame registry (Prep 2 lands this)

```ts
// src/@types/camera/OrientationFrameId.d.ts (one type per file)
export type OrientationFrameId = 'equatorial' | 'ecliptic' | 'galactic' | 'supergalactic';

// src/data/orientation/orientationFrames.ts
export const ORIENTATION_FRAMES: Record<OrientationFrameId, Mat3>;
```

Each entry is a flat column-major `Mat3` mapping **frame-local → world** whose
**middle column (local +Y) is the frame's north pole** and whose other two
columns are the plane's in-plane axes. The middle-column-is-pole convention is
deliberate: the orbit camera's spherical formula (`updatePosition`) already puts
its pole on local +Y, so a basis that swizzles local +Y onto the physical pole
is exactly what reorients the camera — the same swizzle `milkyWayModelMatrix`
uses to drop the disk (local +y = disk normal = North Galactic Pole).

Every basis is built from **existing sources only** — the feature introduces no
new astronomical constants:

- `equatorial` — pole = celestial north = world +z. Columns `[+x, +z, −y]`
  (the swizzle that puts +z up). This is **not** identity; identity is the
  deleted accidental Y-up pole (Q2).
- `ecliptic` — from `ECLIPTIC_FRAME` (`orbitPlaneFrames.ts:81-85`,
  ε = `OBLIQUITY_DEG` 23.44° at `:72`): middle column = `ECLIPTIC_FRAME.normal`,
  side columns = its `xAxis` / `yAxis`.
- `galactic` — from the galactic basis literals (moved to the registry home in
  Prep 2; `milkyWayModelMatrix.ts:62-64` consumes them): middle column =
  `GAL_Z_EQ` (NGP), side columns `GAL_X_EQ` / `GAL_Y_EQ`.
- `supergalactic` — from `SG_TO_EQ_MATRIX` (`superGalacticTransform.ts:86`):
  middle column = its SGZ column (supergalactic north), side columns SGX / SGY.

Per-frame quaternions for the slerp derive from these via the existing
`matrixToQuaternion` (already imported by `superGalacticTransform.ts`).

The in-plane axis choice fixes only the **yaw origin** in each frame (a free
choice — rotating the plane's reference axis just renames where yaw = 0 points),
so any right-handed in-plane pair is correct; the pole column is what carries the
visible reorientation.

### 3.2 Settings — the persisted choice

A bare scalar view preference (a lone field, unlike the multi-field clusters):

```ts
// src/state/settings/initialState.ts — buildInitialSettings()
orientation: DEFAULT_ORIENTATION,          // 'ecliptic' (data/defaults.ts)

// src/state/settings/settingsSlice.ts
setOrientation: (settings, action: PayloadAction<OrientationFrameId>) => {
  settings.orientation = action.payload;
},

// src/state/settings/selectors (existing settings read seam)
export const selectOrientation = (s: RootState): OrientationFrameId => s.settings.orientation;
```

`setOrientation` snaps the persisted target. It does **not** start the slerp;
the animation is a separate, orthogonal concern (§3.3) so a URL-boot apply and a
tour cue can both set the frame without an animation they don't want.

### 3.3 Camera slice — the transient slerp

The reorientation animation is a value on the camera slice, resolved per frame
like every other camera input — never a fifth driver row (the winner-scan
authors *pose*; the basis is orthogonal to it and composes over whatever pose
won):

```ts
// src/@types/camera/FrameTween.d.ts (one type per file)
export type FrameTween = {
  readonly fromQuat: Vec4;          // the basis quaternion captured at switch start
  readonly to: OrientationFrameId;  // destination frame (its quaternion is the slerp end)
  readonly durationMs: number;
  readonly easing: Ease;
};

// cameraSlice.ts
frameTween: FrameTween | null,      // null when the basis is at rest
startFrameTween: (camera, action: PayloadAction<FrameTween>) => { camera.frameTween = action.payload; },
clearFrameTween:  (camera) => { camera.frameTween = null; },
```

`selectCameraActive` (`selectors.ts:48`) gains `|| c.frameTween !== null` so the
render loop keeps ticking through the slerp — the one definition of "the camera
is moving" that `shouldKeepTicking` ORs, so no separate wake term is needed.
`cameraClock` gains a `frameTweenElapsed(clock, frameTween, nowMs)` accessor
that resets on `frameTween` reference identity (the same idiom `tweenElapsed`
uses); the produce path clears the tween once elapsed ≥ `durationMs`.

### 3.4 The resolved basis `B(t)`

One pure resolver, called once per frame in the produce path:

```ts
// src/services/engine/camera/resolveFrameBasis.ts (sketch)
resolveFrameBasis(orientation, frameTween, clock, nowMs): Mat3
//   frameTween === null  → ORIENTATION_FRAMES[orientation]                       (steady)
//   else                 → quatToMat3(slerp(frameTween.fromQuat,
//                            quatOf(frameTween.to), ease(elapsed / durationMs)))  (in flight)
```

`assembleOrbitCamera` (`assembleOrbitCamera.ts`) gains a `frameBasis: Mat3`
parameter and writes it onto the returned `OrbitCamera` (a new `frameBasis`
field). Every consumer of the camera's up / decode reads `cam.frameBasis`:

- **decode** — `updatePosition`: `dir_world = frameBasis · yawPitchToDir(yaw, pitch)`
  (§9 Prep 1 extracts `yawPitchToDir`, the local-frame Y-up spherical formula).
- **encode** — `orbitAnglesLookingAlong`: `dir_frame = frameBasisᵀ · (−forward)`,
  then extract `pitch = asin(dir_frame.y)`, `yaw = atan2(dir_frame.x, dir_frame.z)`.
  Encode and decode share the one basis, which is what makes derived poses
  (path tangents, foci framing, relative spins) world-invariant (Q5).
- **camera-up** — the shared roll-aware up helper (§9 Prep 1) takes
  `frameUp = frameBasis · [0,1,0]` (the middle column) instead of the hardcoded
  `[0,1,0]`, feeding `computeViewProj` lookAt-up, `cameraBillboardBasis`,
  `orbitControls` pan, `slabs`, `buildPathTrack`, and `horizonShellRenderer`.

Because position and target never move, the only world-space delta a switch
produces is the up-vector rotating from old pole to new — a pure roll about the
view axis (Q4).

### 3.5 Why idle-roll and driven-decode are one mechanism (Q6)

Nothing branches on "is the camera idle or driven". Every frame:

1. the winning driver authors a pose (`{ target, yaw, pitch, distance }`) in the
   **active frame's** yaw/pitch convention;
2. `resolveFrameBasis` produces `B(t)` for that frame;
3. decode maps that pose to a world position through `B(t)`.

- **Idle** camera: the resting driver returns the committed base pose unchanged;
  as `B(t)` slerps, decode re-derives the *same* world eye/target with a rotating
  up — the Q4 roll, for free.
- **Driven** camera (tween @60, clip @95, follow, drag): the driver's yaw/pitch
  decode through the moving `B(t)`, so the view swings slightly during the ~1 s
  overlap but stays continuous, with no end-of-transition jump. No disabled UI,
  no queued switch (Q6 rejects both).

Quaternion slerp keeps every midpoint basis orthonormal for free.

**Edge case (Q4, needs a test).** If the view direction is nearly parallel to
the *new* pole, the end-state yaw is ill-conditioned and post-switch pitch lands
at the existing `PITCH_LIMIT` clamp (`orbitControls.ts:91`). The clamp already
handles it; the test pins that a switch into a near-pole-aligned view resolves to
a finite pose at the clamp rather than NaN.

## 4. The `frameTo` clip primitive (Q6 addendum)

A **cue-style Effect arm**, like `scene` / `focus` — not a fifth `Channel`. It
fires at its beat position and dispatches `startFrameTween`, driving the exact
same slerping basis the UI switch drives; the primitive only *authors the
timing*.

```ts
// src/@types/animation/Effect.d.ts — new arm on the union
| { readonly kind: 'frameTo'; readonly frame: OrientationFrameId; readonly over: number; readonly ease: Ease }

// src/services/engine/animation/effectHelpers.ts
export function frameTo(frame: OrientationFrameId, opts: { over: number; ease?: Ease }): Effect
```

`compileClip`'s exhaustive `switch` (`compileClip.ts`, `never` guard at
`:275-279`) forces handling: `frameTo` joins the cue accumulator arm
(`show`/`hide`/`fade`/`scene`/`focus` at `:255-262`) — pushed to `acc.cues`,
returning 0 awaited duration (fire-and-forget, exactly like `scene`). At fire
time `applySceneEffect` dispatches `startFrameTween` (capturing `fromQuat` from
the live resolved basis, `to = frame`, `durationMs = over·1000`, `easing = ease`)
plus `setOrientation(frame)` so the frame persists past the clip. An author who
wants a beat to *dwell through* the reorientation sequences a `wait(over)` after
it — the same idiom the timeline already uses for fire-and-forget cues.

## 5. Boot / URL ordering (Q7)

A new `orientation` source in `HASH_PARAM_SOURCES` (`hashParamSources.ts`),
alongside `focus` and `t`:

```ts
const orientationSource: HashParamSource = {
  key: 'orientation',
  // Write null at the default so 95% of URLs stay clean; a non-default frame
  // reproduces exactly.
  write: (input) => (input.orientation === 'ecliptic' ? null : input.orientation),
  // A parseable frame id snaps the settings frame — no slerp on arrival. An
  // absent / unknown value is a no-op (bare-URL default = ecliptic).
  read: ({ value, dispatch }) => {
    if (value && isOrientationFrameId(value)) dispatch(setOrientation(value));
  },
};
```

- `DesiredHashInput` (`useUrlSync.ts:68-76`) gains `orientation: OrientationFrameId`;
  `useUrlSync` reads `selectOrientation` and threads it into `computeDesiredHash`,
  and adds it to Effect B's dependency array `[focused, time, orientation]` so a
  switch re-writes the hash.
- **Boot apply precedes the camera seed.** Effect A's mount read dispatches
  `setOrientation` before bootstrap runs `computeInitialCamera` →
  `commitCameraPose`, so the boot pose is decoded in the URL's frame with no
  animation. Because the read dispatches `setOrientation` (snap) rather than
  `startFrameTween`, there is no slerp at load — the slerp is only for
  interactive switches and `frameTo` cues (Q7).

## 6. Authored-literal re-tune (Q5)

Yaw/pitch are always interpreted in the active frame through the one shared
encode/decode pair, so **derived** poses (path tangents, foci framing, relative
`spin`/`rate` moves — the bulk of choreography) are world-invariant. Only the
handful of **absolute** literals shift meaning under the new ecliptic default and
get a one-time re-tune in the feature PR (visual-gated, same style as prior
body-relocation gates):

| Site | Anchor | Note |
| ---- | ------ | ---- |
| Boot bearing | `cameraFraming.ts:39-40` (`BOOT_YAW_RAD` 4.4889, `BOOT_PITCH_RAD` −0.0644) | The real first-paint pose. Re-tune under ecliptic. |
| `cameraSlice` base pose | `cameraSlice.ts:56-57` | yaw 0 / pitch 0 is a **placeholder** bootstrap overwrites via `commitCameraPose`; no re-tune needed beyond the boot bearing above. |
| Cosmic Flows opening | `cosmicFlows.ts:72` (`yaw 4.44, pitch 0.2932`) | Absolute start pose. |
| Earth flyout opening | `earthFlyout.ts:78-79` (`yaw 0, pitch 0`) | Absolute opening angles. |
| Grand-tour waypoint pins | `grandTourBeats` absolute waypoint bearings | Re-tune the pinned absolutes only; relative legs hold. |

If a specific beat genuinely breaks when *played in a non-default frame*, that is
a targeted waypoint-pin fix, not a framework (Q5 rejects a per-clip
authoring-frame tag and a playback frame-pin).

## 7. Consumption path unchanged everywhere else

No shader, `.bin`, picking, slab-selection, or engine-logic edit. `cam.position`
and `cam.target` remain world-equatorial, so every CPU-side comparison of camera
position against world positions (thumbnail gating, slabs, foci resolution, pick)
straddles no coordinate seam — "world space" keeps meaning one thing. The frame
basis touches only the yaw/pitch↔direction encode/decode and the camera-up
vector.

## 8. UI surface (Q8)

An **Orientation** dropdown row in the Display section, copying the tone-map
curve select in `DisplaySection.tsx:80-95` — a `<label>` + `<select>` over an
options array with a label fn. Two differences from the tone-map row:

- `OrientationFrameId` is a **string** union, so the `onChange` handler passes
  `e.target.value as OrientationFrameId` with **no `parseInt`** (tone-map's
  `parseInt` exists only because its curve codes are numeric GPU-contract values).
- The row is a top-level Display control, not inside the power-user disclosure —
  it is an explorer-facing view choice, so the labels carry their own
  explanations.

Option labels (user-facing copy — parenthetical qualifiers, no em dashes):

- `Ecliptic (solar system)` *(default)*
- `Equatorial (Polaris up)`
- `Galactic (Milky Way)`
- `Supergalactic (superclusters)`

The parentheticals ship shorter than the plane-naming form above (dropping the
trailing "plane"/"supercluster plane" wording) because the longer strings
clamped the settings-panel dropdown width; see `orientationFrameLabel.ts` for
the canonical strings.

`DisplaySectionContainer` wires `selectOrientation` → the row and dispatches
`setOrientation` **plus** `startFrameTween` (capturing the live resolved basis as
`fromQuat`, ~1 s `durationMs`, an `inOut` ease) so an interactive switch animates
while a URL/boot apply (which dispatches `setOrientation` alone) snaps.

## 9. Ground preparation

Refactor-ground checkpoint ratified 2026-07-22. Two prep PRs land before the
feature, each with zero behaviour change except the one deliberately surfaced
horizon-shell roll fix.

### Prep 1 — camera-math consolidation

The feature needs two shared seams to become frame-aware in one place instead of
five. Extract them as pure refactors first:

- **`yawPitchToDir(yaw, pitch): Vec3`** — the local-frame Y-up spherical formula.
  Reroute the three inlined duplicates onto it: `buildPathTrack.ts:237-242` and
  `:599-601`, `sampleClipPath.ts:30-38` (the `eyeOf` decode), and
  `updatePosition.ts:50`.
- **A shared roll-aware camera-up helper** — currently the Rodrigues roll block
  is duplicated verbatim in `computeViewProj.ts:85-109` and
  `cameraBillboardBasis.ts:70-89` (its module header documents the duplication as
  intentional — this reverses that call, since a single frame-aware helper is now
  load-bearing), and the `WORLD_UP`-cross basis is open-coded in
  `orbitControls.ts:398-406` (pan), `slabs.ts:95`, `buildPathTrack.ts:149`, and
  `horizonShellRenderer.ts:75` + `:156-158`. Reroute all onto the one helper.
  `resolveClipFoci.ts:152-159`'s `strafeId` bakes an XZ-horizontal `forward ×
  worldUp` simplification (`[-fz, 0, fx]`) that assumes world +Y up — reroute it
  through the helper so it is expressed against the shared up rather than a baked
  plane.

Pure refactor **except `horizonShellRenderer`**, which today has **no roll
support** (its `:92-94`-style comment defers roll parity) and silently diverges
from `computeViewProj` under any roll. Rerouting it onto the shared helper makes
it roll-correct — a latent divergence fixed deliberately, surfaced in the PR
description and visual-gated.

### Prep 2 — orientation frame registry

- Create `ORIENTATION_FRAMES` (§3.1) from the existing sources.
- Move the galactic TS literals (`GAL_X_EQ` / `GAL_Y_EQ` / `GAL_Z_EQ`,
  `milkyWayModelMatrix.ts:62-64`) into the registry home; `milkyWayModelMatrix`
  consumes them from there. **The WESL literals themselves stay** in
  `util.wesl:173-175` (shader constraint — the procedural galaxy samples them on
  the GPU).
- **Anchor correction vs the refactor-ground note.** That note assumed the
  parity test scraping `util.wesl`'s `GAL_*_EQ` literals was *missing* and that
  `milkyWayModelMatrix.ts`'s header comment claiming one exists was a doc-reality
  gap. It is **not**: the test exists and does scrape the shader —
  `tests/services/gpu/galaxy/milkyWayModelMatrix.test.ts:34-49` reads `util.wesl`
  as text, regexes each `vec3<f32>(...)` literal, and asserts the model matrix's
  rotation columns match. Prep 2 therefore **repoints** that existing parity test
  onto the new registry home (so the registry's galactic basis, not a soon-stale
  TS copy in `milkyWayModelMatrix.ts`, is what the shader is checked against)
  rather than adding a test that already exists. No new test to close a
  nonexistent gap.

### Growth / bolt-on verdicts

| Touchpoint | Verdict |
| ---------- | ------- |
| `yawPitchToDir` extraction | Growth — the decode was always one formula copied four times. |
| Shared camera-up helper | Growth — un-braids the up-vector from four open-codings; also fixes horizon-shell roll. |
| `ORIENTATION_FRAMES` registry | Growth — the natural single home for the four bases (two already existed as `ECLIPTIC_FRAME` / `SG_TO_EQ_MATRIX`; galactic moves in). |
| `frameBasis` on `OrbitCamera` | Growth — one field the existing decode/encode/up consumers read; no new call graph. |
| `frameTween` on camera slice | Growth — mirrors the existing `tween` / `clip` transient-value pattern; `cameraClock` already hosts identity-reset elapsed accessors. |
| `frameTo` Effect arm | Growth — joins the existing cue accumulator; the exhaustive switch forces it. |
| `orientation` hash source | Growth — third row in the existing `HASH_PARAM_SOURCES` table. |

### Adjacent findings deliberately NOT in scope

- **`Mat3` vs `{ xAxis, yAxis, normal }` dual representation** outside the
  registry. `OrbitPlaneFrame` stays as-is for orbital-element math (satellite
  Laplace planes); the registry converts on ingest. Not un-braided here.
- **`elapsedForWinner` id-dispatch** in `cameraDrivers.ts:112-128`. The basis is
  not a driver, so this scan is untouched — noted only so a future reviewer knows
  it was considered and left.

## 10. Testing (what can break)

Per `testing.md` — behaviour, not restatements. No runtime type tests, no
constant restatements, no clamp-mirror tests.

- **Encode/decode round-trip under a non-identity basis.** For each of the four
  frames, `orbitAnglesLookingAlong` ∘ `updatePosition` returns the original
  yaw/pitch (away from the pole). This is the invariant that makes derived poses
  world-invariant; it fails on any encode/decode basis mismatch.
- **Slerp endpoints.** `resolveFrameBasis` at elapsed 0 equals
  `ORIENTATION_FRAMES[fromQuat's frame]` and at elapsed ≥ `durationMs` equals
  `ORIENTATION_FRAMES[to]`; every sampled midpoint is orthonormal.
- **Hold-pose invariance during an idle switch.** With the resting driver and a
  frameTween in flight, the decoded world `position` and `target` are constant
  across the transition (only the up-vector rotates) — the Q4 roll, proven not to
  translate the eye.
- **`PITCH_LIMIT` edge.** A switch into a frame whose pole is near the current
  view direction resolves to a finite pose at the clamp, not NaN.
- **WESL parity (repointed, Prep 2).** The existing scrape test asserts the
  registry's galactic basis equals `util.wesl`'s `GAL_*_EQ` literals.
- **URL write-null-at-default.** The `orientation` source's `write` returns
  `null` at `'ecliptic'` and the frame id otherwise; parse/compose round-trips a
  non-default frame; boot read snaps (no frameTween dispatched).
- **`frameTo` cue.** Compiling a clip with `frameTo` emits one cue at the beat
  and returns 0 awaited duration; firing it dispatches `startFrameTween` +
  `setOrientation`.
- **Not tested:** the label strings, the four registry `Mat3` values as literals,
  the select's option count.

## 11. Delivery

1. **Prep 1 PR** (camera-math consolidation) — pure refactor + surfaced
   horizon-shell roll fix; visual gate on roll parity.
2. **Prep 2 PR** (orientation frame registry) — registry + galactic-literal home
   move + repointed parity test.
3. **Feature PR** — `OrientationFrameId` + settings field + `frameTween` slice +
   `resolveFrameBasis` + frame-aware decode/encode/up + `frameTo` + URL source +
   Display row + authored-literal re-tune. Visual gates: the four frames level
   the intended plane; the ~1 s switch reads as a roll; a `frameTo` beat plays
   continuously mid-tour. iOS WebGPU check (shared-encoder frame-drop class of
   bug is renderer-adjacent — confirm no shader path regressed).

Each via subagent-driven development; draft PR at the first task.

## References

- Grill transcript: `docs/grill-sessions/coordinate-frame-switch-2026-07-22.md`.
- Frame sources: `orbitPlaneFrames.ts` (`ECLIPTIC_FRAME`, `planeFrameFromPole`),
  `milkyWayModelMatrix.ts` + `shaders/lib/util.wesl` (galactic basis),
  `superGalacticTransform.ts` (`SG_TO_EQ_MATRIX`).
- Conventions: `plan-style.md`, `testing.md`, `simplicity.md`.
