# Frame-invariant camera poses

An orientation-frame change moves the camera today. Switching ecliptic → galactic
sweeps the whole sky through a ~60° rotation, because a stored pose's `yaw`/`pitch`
are angles in a basis nothing records, and the render path decodes them through
whichever basis the frame loop happened to resolve. This spec establishes the
missing rule:

> **A frame change never changes where the camera is or what it looks at. It only
> changes which way is up.**

Under that rule `frameTo` becomes a pure image roll over a subject that stays
centred, legal at any point in a clip, and the grand tour can pick the pole that
suits each rung of its scale ladder instead of inheriting whatever the viewer set.

## Goal

- An orientation switch — from the Settings panel or from a `frameTo` cue inside a
  clip — rolls the horizon and leaves eye and aim untouched.
- The grand tour authors its own pole per act, in the clip, via `frameTo`.
- No bearing is stored as a frame-local number anywhere in the tour.
- A `flyPath` flies the path it was authored to fly under any frame.

## Non-goals

- **No new orientation frames.** The registry stays at four.
- **No change to `cam.roll`.** It remains dormant; the frame roll rides `upBasis`,
  not the Rodrigues term in `imagePlaneBasis`.
- **No tour extension.** The solar-system and stellar acts are separate work; this
  spec only makes the pole a per-act authoring choice so they can be built.
- **No clip-local orbit axis.** Orbiting about an axis other than the frame pole
  would decouple motion from the pole entirely. It is the next question after this
  lands, not part of it.

## The defect

`CameraPose` carries `target`, `yaw`, `pitch`, `distance` — and no basis. The
decode is

```
position = target + distance · B(t) · dir(yaw, pitch)
```

so holding `yaw`/`pitch` fixed and rotating `B(t)` rotates the eye through the same
rotation. `watchOrientationChangeSaga` dispatches `setOrientation` +
`startFrameTween` and never touches `camera.base`, so the eye swings for the whole
`FRAME_TWEEN_MS`.

The clip path has the same defect in a different dress. `cameraDrivers.ts:232`
hands `evaluateClip` the _steady_ basis `ORIENTATION_FRAMES[s.settings.orientation]`
to encode against, while `updatePosition` decodes with the _live_ `B(t)`. The two
agree only when no roll is in flight, which is exactly why `frameTo` cannot
currently be used inside a clip that also moves the camera.

### Why this surfaced now

`ORIENTATION_FRAMES` shipped with `ecliptic` as the default (#490), replacing an
accidental world-`+Y` pole. Screen-up is the frame pole, so a yaw drift rotates the
image by `sin(|pitch|)` per radian — a horizontal pan at the frame equator, a pure
roll at the pole. `dwellDrift` is a yaw spin, and it is the dwell in nearly every
grand-tour beat.

Latitude of each tour subject per frame, with the roll fraction of a yaw drift
there:

| subject         | old accidental Y-up | ecliptic (current) | galactic   | supergalactic |
| --------------- | ------------------- | ------------------ | ---------- | ------------- |
| galactic centre | −60.8° 87%          | −5.6° 10%          | 0.0° 0%    | 42.2° 67%     |
| M31             | 8.0° 14%            | 33.4° 55%          | −21.6° 37% | 12.6° 22%     |
| M81 group       | 10.6° 18%           | 51.6° 78%          | 40.9° 65%  | 0.6° 1%       |
| M101            | −17.4° 30%          | 59.8° 86%          | 59.8° 86%  | 22.6° 38%     |
| M51             | −15.1° 26%          | 50.9° 78%          | 68.6° 93%  | 17.3° 30%     |
| Cen A           | −15.5° 27%          | −31.3° 52%         | 19.4° 33%  | −5.2° 9%      |
| Virgo / M87     | −7.5° 13%           | 14.4° 25%          | 74.5° 96%  | −2.3° 4%      |
| Coma            | −13.2° 23%          | 31.4° 52%          | 88.0° 100% | 8.3° 14%      |
| Boötes void     | −23.5° 40%          | 54.9° 82%          | 64.2° 90%  | 25.9° 44%     |

The tour was authored under a pole that held nearly every subject within ±20° of
its equator, so its orbits read as pans. The pole moved out from under it. The
supergalactic column is low for the same reason the tour exists: it is a tour of
the local supercluster, and that structure defines the supergalactic plane.

## Ground preparation

### Ideal shape

`OrbitCamera.frameBasis` is one field serving two disjoint consumer sets. The
feature is those two diverging.

```ts
// src/@types/camera/OrbitCamera.d.ts
export type OrbitCamera = {
  …
  poseBasis?: Mat3; // renamed from `frameBasis`: the basis yaw/pitch decode through
  upBasis?: Mat3;   // NEW: the basis screen-up is read from
};
```

| consumer                                                                                                      | reads                     |
| ------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `updatePosition` (7 sites), `orbitAnglesLookingAlong` (4 sites)                                               | **poseBasis**             |
| `computeViewProj:98`, `cameraBillboardBasis:66`, `horizonShellRenderer:161`, `slabs:156`, `orbitControls:415` | **upBasis**               |
| `resolveClipFoci:185`, `buildPathTrack:190` (strafe / pass-by lateral axes)                                   | **poseBasis** — see below |

The two authoring-time `frameUp` reads take `poseBasis` deliberately. They resolve
clip geometry once at compile, and binding that geometry to a transient mid-slerp
basis would make the same clip compile differently depending on when it was
resolved. The rule: **draw-time reads take `upBasis`; compile-time reads take
`poseBasis`.**

The two bases are then supplied by one rule each, with no new store state:

```ts
poseBasis = ORIENTATION_FRAMES[settings.orientation]  // jumps once, at switch start
upBasis   = resolveFrameBasis(...)                    // slerps over FRAME_TWEEN_MS
```

At rest the two are equal, so every path that never switches frames is unchanged.

### Verdicts

| touchpoint                            | verdict                                                                                             | blocker                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| pose-space vs up-space basis          | bolt-on — no joint; a second basis would be threaded through 11 sites by hand                       | `OrbitCamera.d.ts`, `assembleOrbitCamera.ts:53` |
| re-expressing a pose in another basis | bolt-on — encode and decode both exist, nothing composes them                                       | absent                                          |
| `spinToId`                            | growth — `resolveClipFoci` already resolves `lookAtId` / `strafeId` against the live pose and basis | none                                            |
| `frameTo` cue                         | growth — wired end to end already                                                                   | none                                            |

### Prep, sequenced before the feature commits

1. **Split `frameBasis` into `poseBasis` + `upBasis`**, both fed the same value.
   A rename plus a duplicated feed: behaviour-neutral, the suite proves it.
2. **`reencodePose(pose, from, to)`** — `src/utils/camera/`, one symbol, one file.

Everything rides one PR as separate commits.

## Design

### `reencodePose`

Decode through the basis a pose was authored in, re-encode through the basis it is
moving to. The world direction from target to eye is the invariant, so eye and aim
are preserved exactly and only the pole changes.

```ts
export function reencodePose(pose: CameraPose, from: Mat3, to: Mat3): CameraPose;
```

`from === to` returns the pose unchanged, by reference — the identity case is the
common one and must not allocate. Composition of the two existing halves
(`yawPitchToDir` under `from`, `orbitAnglesLookingAlong` under `to`), so the
round-trip is exact by construction.

### Switch start re-expresses the committed pose

`watchOrientationChangeSaga` gains one dispatch, in the same tick as
`setOrientation`:

```ts
const previous = yield * select(selectOrientation); // BEFORE the write below
yield * put(setOrientation(frame));
yield *
  put(
    commitCameraPose(reencodePose(base, ORIENTATION_FRAMES[previous], ORIENTATION_FRAMES[frame])),
  );
```

The `from` basis is the **outgoing registry frame**, not the live resolved basis.
A stored pose's angles are only ever valid in a _committed_ frame, because
`poseBasis` is `ORIENTATION_FRAMES[settings.orientation]` and never mid-slerps. The
two choices agree whenever nothing is rolling — which is why the distinction is easy
to miss — and diverge exactly when a switch fires during a roll: there the live
basis is a blend of two frames that `base` was never expressed in, so feeding it as
`from` moves the eye. That is the defect this section exists to prevent.

`startFrameTween`'s `fromQuat` keeps reading the **live** basis, and must. It
governs where the up vector's slerp starts, so a re-switch composes visually from
wherever the pole currently is. Two different questions, two different sources —
the same `poseBasis` / `upBasis` split applied to the switch itself. Do not unify
them.

The re-encode sits ABOVE the null-runtime bail. It is pure store work (store pose,
registry bases), so it needs no camera; only the roll does. Below the bail, a switch
fired pre-bootstrap would persist the new orientation while leaving `base` expressed
in the old basis — wrong the moment the camera boots.

The rejected alternative was holding the pose space at the old basis until the roll
lands. A re-switch mid-roll would leave `base` expressed in a basis that is neither
endpoint, requiring a special case for exactly that path. Re-encoding at every
switch start has no such asymmetry.

### A clip pins its basis at clip start

`evaluateClip`'s compile cache keys on the basis it is handed
(`evaluateClip.ts:114-123`), and the clip driver hands it
`ORIENTATION_FRAMES[s.settings.orientation]` fresh every frame
(`cameraDrivers.ts:232`). So the clip's basis _tracks the setting_: a switch
mid-clip silently recompiles the clip under the new pole and reinterprets every
authored `yaw` against it. There is no lag to correct — there is a moving
reference where a fixed one is needed.

The clip descriptor gains the frame it started under:

```ts
// src/@types/camera/CameraState.d.ts
clip: { data: ClipData; frame: OrientationFrameId } | null;
```

captured by whoever dispatches `playClip` (`visitBeatSaga.ts:97` already selects
the orientation to resolve foci — the same value). The driver then evaluates
against the pinned basis and maps the result into the current pose space:

```ts
pose: (s, _cam, elapsed) => {
  const from = ORIENTATION_FRAMES[s.camera.clip!.frame];
  return reencodePose(
    evaluateClip(s.camera.clip!.data, elapsed, from),
    from,
    ORIENTATION_FRAMES[s.settings.orientation],
  );
};
```

Two consequences: the clip compiles once for its whole run instead of
recompiling on a switch, and a `frameTo` mid-clip becomes a pure roll — the clip
goes on aiming where it was authored while the pole turns beneath it.

The focus-tween driver needs the same pinning, for the same reason: its
descriptor's `from`/`to` poses were captured under the basis live at capture time.

### `spinToId` — bearings become geometry

Six constants exist because a world sightline was transcribed into one pole's
coordinates:

| file               | constants                                          |
| ------------------ | -------------------------------------------------- |
| `approachM31.ts`   | `ARRIVAL_YAW_RAD`, `EXIT_YAW_RAD`                  |
| `localGroup.ts`    | `ARRIVAL_YAW_RAD`, `EXIT_YAW_RAD`                  |
| `cameraFraming.ts` | `GALACTIC_DISC_YAW_RAD`, `GALACTIC_DISC_PITCH_RAD` |

All annotated "Ecliptic-frame". They are re-derivations forced by #490 and they
will be re-derived again by every frame the extended tour adds. A new arm of
`resolveClipFoci` replaces them:

```ts
// "orbit backward one full turn, landing facing the M81 group"
spinToId(focusId('group-m81-group'), { over: DWELL_SEC, turns: -1 });
```

Resolution computes the bearing from the live pose and the resolved focus through
`orbitAnglesLookingAlong`, subtracts the current yaw, adds `turns · 2π`, and emits
the `spin('yaw', { by, over, ease })` that `dwellDrift` already consumes. The
landing is the invariant; `turns` is the visual knob. Constants delete; a frame
change or a catalog re-seed can no longer silently rotate a landing.

### The tour authors its pole

`frameTo` goes in the clip, not on the beat — beats stay caption + dwell + enter.
Near-term assignment for the eleven existing beats: `galactic` for the opening,
you-are-here, and home-again beats (galactic centre at 0% roll, disc horizontal),
`supergalactic` from the M31 approach outward. Median roll fraction across the tour
drops from ~55% to ~15%.

The tour must snapshot `orientation` and restore it, or its `frameTo` permanently
changes the viewer's setting.

**It must NOT ride `SettingsSnapshot`**, which is where this spec first put it.
`guidedTourSaga` merges a settings snapshot before EVERY beat, and
`mergeSettingsSnapshot` spreads every key of the patch — so a scalar living there
is raw-written back at each beat boundary, undoing the pole the previous beat
authored. Beats 03–09 played under the viewer's pre-tour frame until this was
caught by the whole-branch review.

It rides `SceneSnapshot` instead, beside `focus`. `tierSlice` records lifting
`tier` out of settings for exactly this reason; the same trap caught the same
shape of value twice. Restore dispatches `requestOrientationChange` rather than
writing the setting, because a raw write leaves `camera.base` expressed in the
outgoing basis — the defect this spec opens by removing.

### `buildPathTrack` — the basis omission

Independent of everything above, and landing first. Lines 257 and 620 reconstruct
the live eye and the derived look-at target with a bare `yawPitchToDir` while the
aim encodes through `frameBasis`, so the eye is displaced by
`distance · (B·dir − dir)`. Both lines were touched by the frame-switch commit
`2c97e7fe` and neither took the basis; no test covers `buildPathTrack` under a
frame.

Measured on a two-waypoint path, start distance 10, destination framing distance 8:

| basis    | eye at t=end              |
| -------- | ------------------------- |
| identity | 8.0 from the destination  |
| ecliptic | 14.6 from the destination |

**The two omissions cancel exactly at `t=0`.** There the align-in weight is 0, so
the aim is still the live pose and the spline sits on knot 0 — the wrong knot and
the wrong derived target subtract to the correct rendered eye. The defect is that
knot 0 itself is wrong, so the _spline_ is fitted through a wrong start; that shows
up everywhere except the one instant where it cancels. The end-framing distance is
the differentiator, and a `t=0` assertion is not.

Every `flyPath` in the tour therefore flies a curve built from the wrong first knot
and settles mis-framed on its destination. `sampleClipPath.ts:33` carries the same
omission in the debug inspector's eye reconstruction.

## Testing

- `reencodePose` — world direction preserved across a basis pair; identity returns
  the input by reference.
- `buildPathTrack` under a non-identity basis — the reconstructed eye settles at the
  framing distance from the destination. Red first, against the measurement above.
  A `t=0` assertion cannot go red for this bug (see the cancellation note); it still
  earns its place as a guard against fixing only one of the two sites.
- `watchOrientationChangeSaga` — a switch dispatches `commitCameraPose` with a pose
  whose world eye direction equals the pre-switch one.
- A switch fired mid-roll re-expresses from the OUTGOING REGISTRY frame: the
  committed pose's eye position is preserved, with a live basis that is neither
  endpoint. This is the test that separates a correct implementation from a
  plausible wrong one; it must go red against a live-basis `from`.
- `spinToId` resolves to a `spin` whose `by` lands the authored bearing, under two
  different bases (the point of the arm is that the basis drops out).
- The tour round-trips `orientation` via `SceneSnapshot`, and no `mergeSnapshot`
  payload carries it — the per-beat merge must not be able to revert an authored
  pole. Assert the EFFECTIVE orientation per beat, not the authored literals: a
  test that reads the `frameTo` cues passes while the ladder is being reverted
  underneath it.

Per the testing convention, no test restates the frame registry or asserts the
clamp boundaries of `pitch`.

## Risks

- **`poseBasis` / `upBasis` mix-up at a call site** is silent — the two are equal at
  rest, so a wrong choice only manifests during a roll. The prep commit's mechanical
  split is where this gets attention; the draw-time / compile-time rule is the
  discriminator.
- **`lastPose` stays in pose space** throughout. The re-encode happens where a pose
  is produced, never in the frame loop's render path, so commit-on-edge and the
  gesture seed keep reading one space.
- **The camera-intent slice work** (branch `spec/camera-intent-slice`, phase 1 of 6)
  touches the same driver seam. Neither blocks the other, but the `poseBasis` rename
  will need rebasing there.

## Open items

- Whether a clip should be able to orbit about an axis of its own choosing, rather
  than the frame pole. That would make the pole a purely aesthetic choice and remove
  the tour's need to pick a frame per act at all. Deferred; this spec makes the
  choice cheap enough to live with.
