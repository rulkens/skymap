# OpenSpace camera/navigation — source findings

Repo: `github.com/OpenSpace/OpenSpace`, shallow clone (`--depth 1`), cloned 2026-08-23 into
this scratchpad's `OpenSpace/` subdir. All paths below are relative to that clone root
(i.e. `src/...` = `.../openspace-research/OpenSpace/src/...`). No submodules cloned;
globebrowsing lives in the main tree at `modules/globebrowsing/`.

This is a notably modern/refactored version of OpenSpace: navigation code has already been
split out of a single monolithic `OrbitalNavigator` into satellite classes
(`OrbitalInputHandler`, `DampenedVelocity`, `IdleMotion`, `DirectManipulation`), all under
`include/openspace/navigation/orbitalnavigator/` and `src/navigation/orbitalnavigator/`.

---

## 1. OrbitalNavigator — core model

**Files:**

- `include/openspace/navigation/orbitalnavigator/orbitalnavigator.h` (348 lines)
- `src/navigation/orbitalnavigator/orbitalnavigator.cpp` (1602 lines)
- `include/openspace/camera/camera.h` (175) / `src/camera/camera.cpp` (281)
- `include/openspace/camera/camerapose.h` (74) / `src/camera/camerapose.cpp` (105)

**Anchor vs aim.** Two independently-settable `StringProperty` node references:
`_anchor` (orbit/dolly origin) and `_aim` (look-at target). If aim is empty, camera looks at
anchor; if aim == anchor they're called the "focus" node informally in comments
(`orbitalnavigator.h:150-155`). Changing `_anchor` triggers `updateAnchorNode()`
(`orbitalnavigator.cpp:380-398`), which fires an `EventFocusNodeChanged` event and by default
resets velocities (`orbitalnavigator.cpp:859-882`). Aim change goes through
`updateAimNode()` (`:890-894`), which also ends the retarget-aim interpolator immediately
(no smoothing on aim swap — see §3).

**Pose storage.** `Camera::_position` and `Camera::_rotation` are `SyncData<glm::dvec3>` /
`SyncData<glm::dquat>` — **double precision** (`camera.h:151-152`). `CameraPose` is a bare
`{glm::dvec3 position; glm::dquat rotation;}` struct (`camerapose.h:34-37`). There is no
parent/relative-position field on `Camera` itself; the camera's `dvec3` position is a world
position (the "world" being whatever coordinate system the currently-attached scene graph
node subtree uses — see §4).

**Local/global rotation decomposition.** Every frame, the current combined rotation is split
via `decomposeCameraRotationSurface(pose, anchorNode)` (`camerapose.cpp:55-99`) into:

- `globalRotation`: a `lookAt`-style quaternion that points away from the anchor's surface
  toward the camera (i.e. "camera looks at anchor" component), built from
  `ghoul::lookAtQuaternion(0, -directionFromSurfaceToCamera, cameraViewDir+cameraUp)`.
- `localRotation`: `inverse(globalRotation) * cameraPose.rotation` — the "free look" residual
  (mouse-drag pan/tilt/roll) that the user has added on top of the global lock.

Contract: `cameraRotation = globalRotation * localRotation` (invariant documented at
`camerapose.h:47-51`, recomposed via `composeCameraRotation()` at `camerapose.cpp:101-103`).
This decomposition is what lets rotational friction, roll, and "follow anchor rotation" each
operate on the piece of the rotation they own without fighting each other.

**Per-frame update flow** — `updateCameraStateFromStates()` (`orbitalnavigator.cpp:600-767`),
called from `updateCamera()` (`:567-598`) which is called once per frame from
`NavigationHandler::updateCamera()` (`src/navigation/navigationhandler.cpp:236-241`). Order of
operations inside `updateCameraStateFromStates`:

1. Compute `anchorDisplacement` = how far the anchor moved since last frame (orbital motion,
   e.g. Earth's own orbit around the Sun) and carry the camera along with it (`:606-616`).
2. If an `aim` node is set and distinct from anchor, run `followAim()` (§ below) to keep the
   aim node's screen-space position fixed while the anchor moves (`:628-649`).
3. Decompose rotation into global/local (`:661-662`).
4. Compute the anchor's differential rotation since last frame (`anchorNodeRotationDiff`,
   `:664-672`), then damp it through `interpolateRotationDifferential()` based on the
   follow-rotation threshold (this _is_ the follow-anchor-rotation mechanism; see §2).
5. Apply local rotation input: roll (`:683-685`), then interpolate-to-neutral for
   retarget-anchor (`:687`), then user mouse/joystick local rotation (`:688`).
6. Compute `horizontalTranslationSpeedScale` from camera height above the anchor's surface
   (`rotationSpeedScaleFromCameraHeight`, `:1541-1575` — this is the altitude-dependent
   sensitivity scaling, §7 below).
7. Optional "rotate around up" mode (`:695-702`), horizontal translation / orbit
   (`:705-712`), idle motion (`:717-723`), then the anchor-rotation-follow displacement
   itself is applied to position (`followAnchorNodeRotation`, `:726-730`).
8. Recompute the surface position handle (position changed), rotate globally to re-lock onto
   the (possibly moved) anchor (`rotateGlobally`, `:737-741`), apply horizontal roll
   (`:744-750`).
9. Vertical zoom/dolly translation and surface push-out/clamp (`translateVertically`,
   `pushToSurface`, `:753-762`).
10. Recompose rotation, `_camera->setPose(pose)` (`:764-766`).

**Sensitivity scaling with distance/altitude.** Two independent distance-scaled effects:

- _Rotational/orbital speed_: `rotationSpeedScaleFromCameraHeight()`
  (`orbitalnavigator.cpp:1541-1575`) returns
  `clamp(distFromSurfaceToCamera / distFromCenterToSurface, 0, 1)` — i.e. rotation slows
  linearly to zero as the camera approaches the surface, scaled to the _ratio_ of
  surface-relative distance over center-relative distance (dimensionless, so it's
  independent of the anchor's absolute size). This factor multiplies horizontal-translation
  input in step 6 above. A `_constantVelocityFlight` property (`:1558-1568`) can disable this
  by using distance from the _reference_ ellipsoid instead of the _actual_ (heightmap)
  surface.
- _Zoom/dolly speed_: `translateVertically()` (`:1413-1433`) does
  `cameraPosition - actualSurfaceToCamera * totalVelocity * deltaTime` — the truck velocity is
  multiplied by the current surface-relative distance vector itself, giving exponential-style
  "faster when far, slower when close" dolly motion baked directly into the position update
  (not a separate scale factor).

**Friction / smoothing model** — see §6 (shared with idle-motion/inertia).

---

## 2. Follow-anchor-rotation — engage/disengage mechanism

**Files:** `orbitalnavigator.cpp:1004-1027` (threshold test), `:1512-1527`
(interpolation), `:427-430` (transfer function), `:487-493` (property wiring).

**Threshold test — `shouldFollowAnchorRotation()`** (`orbitalnavigator.cpp:1004-1027`):

```
maximumDistanceForRotation = |modelTransform * (normalize(camPosModelSpace) * boundingSphere)|
                             * _followAnchorNodeRotationDistance
shouldFollow = distanceToCamera < maximumDistanceForRotation
```

`_followAnchorNodeRotationDistance` is a `FloatProperty` default **5.0**, range **[0, 20]**
(`orbitalnavigator.cpp:361`) — a multiplier on the anchor's bounding-sphere radius (converted
to world-space distance via the anchor's model transform, so it scales correctly under
non-uniform scale). `_followAnchorNodeRotation` itself is a `BoolProperty`, default **true**
(`:360`), a global on/off switch — if false, `shouldFollowAnchorRotation()` always returns
false regardless of distance.

**Engage/disengage is a continuous, signed, smoothstepped blend — never a snap.** This is the
single most load-bearing mechanism in the file. `_followRotationInterpolator` is an
`Interpolator<double>` (declared `orbitalnavigator.h:217`) whose transfer function is set once
at construction to smoothstep (`orbitalnavigator.cpp:427-430`):

```cpp
_followRotationInterpolator.setTransferFunction([](double t) {
    return std::clamp(3.0*t*t - 2.0*t*t*t, 0.0, 1.0);
});
```

Every frame, `interpolateRotationDifferential()` (`:1512-1527`) does:

```cpp
double interpSign = shouldFollowAnchorRotation(cameraPosition) ? 1.0 : -1.0;
_followRotationInterpolator.setDeltaTime(interpSign * deltaTime);
_followRotationInterpolator.step();               // clamps internal t to [0,1]
return glm::slerp(identityQuat, rotationDiff, _followRotationInterpolator.value());
```

So the interpolator's internal parameter `t` (see `include/openspace/util/interpolator.inl`,
`step()`: `_t += deltaTime/interpolationTime; clamp(0,1)`) **increases toward 1 while inside
the threshold and decreases toward 0 while outside it**, using the _same_ interpolator
instance across both directions (sign flips per-frame based purely on the live distance
check — there is no separate "disengage" code path or state machine). The slerp factor is
the smoothstepped `t`, so the blend between "rotation frozen relative to camera" (t=0,
identity, not following) and "rotation locked to anchor" (t=1, full `rotationDiff` applied,
following) is symmetric in both directions and eases in/out at both ends because of the
`3t²-2t³` shape. `_followRotationInterpolationTime` (`FollowRotationInterpTimeInfo`,
default **1.0s**, range **[0,10]**, `orbitalnavigator.cpp:375`) sets how long a full 0→1 or
1→0 sweep takes; crossing the threshold repeatedly just keeps nudging `t` back and forth
(hysteresis-free in variable name but effectively soft-hysteresis in behavior since `t` only
fully saturates after ~1 second inside/outside).

Consumers: `followingAnchorRotation()` (`:1029-1034`) reports "fully following" only once
`_followRotationInterpolator.value() >= 1.0` (used by `NavigationHandler::navigationState()`,
`src/navigation/navigationhandler.cpp:460-463`, to decide whether to save the nav-state
relative to the anchor node or to scene root). `resetVelocities()` (`:556-565`) snaps the
interpolator directly to `.end()`/`.start()` (t=1 or t=0) based on the current threshold test
— this is the one place a _snap_ happens, deliberately, on anchor-change/reset (see §3).

---

## 3. Anchor/aim retargeting — avoiding pose jumps

**Files:** `orbitalnavigator.cpp:859-927` (anchor/aim swap bookkeeping),
`:952-1002` (retarget-to-look-at start), `:1191-1287` (interpolated application).

Two distinct problems are solved separately:

**(a) Anchor node changes (different node becomes the orbit center).**
`updateAnchorNode()` (`:859-882`) does _not_ attempt to preserve screen-space framing across
the swap — it snaps the follow-rotation interpolator immediately (via `resetVelocities()`,
called unless `resetVelocities=false` was explicitly passed) and calls
`markCameraInteraction()` + `updatePreviousAnchorState()` (`:877` / `:904-913`), which
re-stamps `_previousAnchorNodePosition`/`_previousAnchorNodeRotation` from the _new_ anchor.
This matters because the very next frame's `updateCameraStateFromStates()` computes
`anchorDisplacement` and `anchorNodeRotationDiff` as deltas from "previous" state
(`:609-611`, `:668-670`) — without the reset, the first frame after a swap would compute a
delta between the old anchor's last position and the new anchor's current position, causing
a pose jump. The actual camera _position_ is not moved here; `NavigationHandler::setFocusNode`
(`src/navigation/navigationhandler.cpp:121-125`) separately does
`_camera->setPosition(anchorNode()->worldPosition())` when a _focus_ (both anchor+aim) change
is requested through the high-level API — i.e. jumping to look at a brand new node does move
the camera, but pure anchor reassignment (e.g. from a path-navigator arrival) does not.

**(b) Retargeting the _view direction_ back to the anchor or aim (`RetargetAnchor` /
`RetargetAim` triggers, e.g. after free-look drift).** This is a genuine interpolated
transition, not a snap:

- `startRetargetAnchor()` (`:952-972`) computes the angle between current view direction and
  the direction-to-anchor, then sets `_retargetAnchorInterpolator`'s interpolation time to
  `max(angle, 1.0) * _retargetInterpolationTime` — i.e. **duration scales with how far the
  camera has to turn**, floored at `_retargetInterpolationTime` (`FloatProperty`, default
  **2.0s**, range **[0,10]**, `:373`). It also starts `_cameraToSurfaceDistanceInterpolator`
  with a fixed `_stereoInterpolationTime` (default **8.0s**, `:374`) to simultaneously smooth
  the stereo depth scale.
- The actual rotation blend happens in `interpolateLocalRotation()` (`:1191-1222`): while
  `_retargetAnchorInterpolator.isInterpolating()`, it `slerp`s the _local_ rotation component
  toward a neutral "looking straight down local view axis" target, using
  `min(t * deltaTimeScaled, 1.0)` as the slerp factor (note: this is `t` re-scaled by
  `deltaTimeScaled()`, not `t` itself — an unusual double-application of the timing that's
  specific to this function). It self-terminates via `_retargetAnchorInterpolator.end()` when
  the result quaternion's angle drops below `0.01` rad or `w` gets within `1e-13` of 1
  (numerical near-identity, `:1217-1220`) rather than strictly at `t==1`.
- `startRetargetAim()` / `interpolateRetargetAim()` (`:974-994`, `:1224-1287`) do the harder
  version: keeping the _anchor_ fixed in screen space while interpolating a virtual point
  toward the _aim_ node, bailing out (`_retargetAimInterpolator.end()`, `:1284`) if the
  required angle exceeds what's geometrically reachable without moving the anchor off-screen
  (`requestedAngle <= maxAngle` check, `:1260`) — an explicit "no solution, don't jump"
  guard rather than forcing a discontinuous correction.
- `followAim()` (`:1064-1169`) is the steady-state (non-retargeting) version of aim-following:
  it decomposes the position update into an angular "spin" component (keep aim's _screen
  position_ fixed as anchor moves) and a radial "distance" correction component, and
  explicitly fades out the distance correction as its required solution approaches a
  mathematical singularity (`ratio > 1` has no `asin` solution) via
  `correctionFactor = clamp(1 - ratio^50, 0, 1)` (`:1126-1128`) — again, smooth fade rather
  than a snap/clamp discontinuity, with the exponent 50 called out in a comment as "picked
  arbitrarily" (`:1126`).

---

## 4. Precision at scale

**Files:** `include/openspace/camera/camera.h`, `include/openspace/scene/scenegraphnode.h`,
`include/openspace/util/updatestructures.h`, `include/openspace/navigation/navigationstate.h`,
`src/navigation/navigationhandler.cpp`, `src/navigation/path.cpp`,
`modules/globebrowsing/src/renderableglobe.cpp`.

**Everything CPU-side is `glm::dvec3`/`glm::dmat4` (double).** `Camera::position()` returns
`const glm::dvec3&` (`camera.h:85`); `SceneGraphNode::worldPosition()` and `modelTransform()`
return `glm::dvec3`/`glm::dmat4` and are cached as doubles
(`scenegraphnode.h:120-122,203,207`). `RenderData` (`updatestructures.h:50-55`) carries
`const Camera&` plus a `TransformData` (`translation: dvec3, rotation: dmat3, scale: dvec3`,
`:38-42`) — all double, passed to every `Renderable::render()` call.

**Single-precision cast happens once, at the very last step, per-Renderable, per-frame.**
E.g. `modules/globebrowsing/src/renderableglobe.cpp:1229-1264`:

```cpp
const glm::dmat4& viewTransform = data.camera.combinedViewMatrix();   // double
const glm::dmat4 vp  = glm::dmat4(projMatrix) * viewTransform;        // double
const glm::dmat4 mvp = vp * _cachedModelTransform;                    // double
...
const glm::mat4 modelViewTransform = glm::mat4(viewTransform * _cachedModelTransform); // -> float, here
```

`Camera::combinedViewMatrix()` is itself built from the camera's double position relative to
whatever node the camera's `SceneGraphNode* _parent` is attached under (`camera.h:154`), so
the model-view product is computed at full double precision and the _only_ place a `float`
appears is the final uniform upload — i.e. classic camera-relative rendering by construction
(subtracting camera position from object position happens implicitly inside
`combinedViewMatrix()`/`viewTransform`, in double, before any float narrowing).

**Scene graph is a tree of independently double-precision transforms, not a single global
frame.** No power-scaled-coordinate (`psc`) system was found in this checkout (historically
OpenSpace used one; this version appears to have moved to the double-precision-everywhere +
late-cast-to-float model instead — no `psc`/`PowerScaledCoordinate` symbols exist under
`include/` or `src/` in this clone, only an unrelated hit in
`include/openspace/properties/property.h` for an enum value abbreviation).

**`NavigationState`** (`include/openspace/navigation/navigationstate.h:40-63`) is the
serialization boundary and itself encodes a precision policy: rather than storing an absolute
world position, it stores `position` as `glm::dvec3` **relative to a chosen
`referenceFrame` node** (`navigationhandler.cpp:499-503`,
`invReferenceFrameTransform * (camera.position() - anchor.worldPosition())`), resolved back
to world coordinates only at load time via the scene graph. `NavigationHandler::navigationState()`
picks the reference frame as the _anchor node itself_ if `followingAnchorRotation()` is true,
else scene root (`:460-463`) — i.e. the follow-rotation engage state (§2) doubles as the
choice of what frame a saved camera position is precision-relative to.

**Path navigation has an explicit, acknowledged precision failure mode.** `Path::Path()`
constructor catches `InsufficientPrecisionError` thrown from curve construction (thrown e.g.
in `AvoidCollisionCurve::removeCollisions()` when a computed control point contains NaN,
`src/navigation/pathcurves/avoidcollisioncurve.cpp:218-222`) and `createPathFromDictionary()`
(`src/navigation/path.cpp:636-652`) falls back to a `Path::Type::Linear` path, which uses a
different interpolation strategy specifically because it's less precision-sensitive
(`linearInterpolatedPose()`, `path.cpp:334-380`, comment at `:277-279`: "so that it can be
used when we are traversing very large distances without introducing precision problems" —
it interpolates _rotation_ by elapsed time rather than by traveled distance/arc-length,
`:367-369`, to avoid needing a stable "fraction of path traveled" number over huge distances).
`Path::speedAlongPath()` also has a hard-coded `MaxDistance = 1E12` (meters) cap on
start/end damping distances with a comment admitting it's "very specific to our space
system" (`path.cpp:485-490`) — an explicit acknowledged magic constant, not a general solution.

---

## 5. Globebrowsing navigation — surface-relative behavior

**Files:** `include/openspace/rendering/renderable.h:104` (virtual interface),
`include/openspace/util/updatestructures.h:86-95` (`SurfacePositionHandle`),
`modules/globebrowsing/src/renderableglobe.cpp:2052-2081` (globe implementation),
`src/navigation/orbitalnavigator/directmanipulation.{h,cpp}` (touch-surface manipulation),
`src/navigation/pathcurves/avoidcollisioncurve.cpp`, `src/navigation/navigationhandler_lua.inl`
(`flyToGeo`/`flyToGeo2`/`jumpToGeo`, lines 729-887).

**Surface-relativity is a generic virtual interface, not globe-specific code in the
navigator.** `OrbitalNavigator` never mentions "globe" or "ellipsoid" anywhere — all
surface-relative math (§1) goes through `Renderable::calculateSurfacePositionHandle()`
(virtual, `renderable.h:104`), producing a `SurfacePositionHandle` struct
(`centerToReferenceSurface: dvec3, referenceSurfaceOutDirection: dvec3, heightToSurface:
double`, `updatestructures.h:86-95`). A generic sphere-ish object gets a trivial
implementation; **`RenderableGlobe::calculateSurfacePositionHandle()`**
(`renderableglobe.cpp:2052-2081`) is the one that matters for "touch the ground": it computes
`centerToReferenceSurface` via `_ellipsoid.geodeticSurfaceProjection()` (exact WGS84-style
ellipsoid projection, not a sphere approximation) and gets `heightToSurface` from
**`getHeight(targetModelSpace)`** — a real heightmap/DEM query against the currently loaded
terrain tiles, not a fixed radius. This means the min-allowed-distance clamp in
`OrbitalNavigator::pushToSurface()` (`orbitalnavigator.cpp:1454-1498`) is enforced against
actual terrain elevation for globes, transparently, with zero globe-specific code in the
navigator — the genericity is real, not just nominal (confirmed: NaN-guards at
`renderableglobe.cpp:2068-2074` handle missing tile data by falling back to
`interactionSphere()`, so degraded terrain data degrades gracefully to sphere behavior rather
than crashing/jumping).

**Altitude-dependent sensitivity** is the same core-level `rotationSpeedScaleFromCameraHeight`
mechanism from §1 — there is no separate globebrowsing-specific sensitivity curve; it's driven
purely by whatever `heightToSurface` the active anchor's `SurfacePositionHandle` reports.

**goToGeo-style camera paths.** `flyToGeoInternal()` (`navigationhandler_lua.inl:759-814`)
converts lat/lon/altitude to a model-space Cartesian point via `cartesianCoordinatesFromGeo()`
(`src/util/geodetic.cpp`), then builds a `PathNavigator` instruction with
`PathType = "ZoomOutOverview"` (not `AvoidCollision` — geo-targeted flights always use the
zoom-out-and-back-in curve, `zoomoutoverviewcurve.cpp`, rather than the spline-based collision
avoider). `jumpToGeo` (Lua, `:729-757`) wraps this in a fade-to-black transition via
`triggerFadeToTransition()` instead of an animated path. A 10-meter epsilon guards against
starting a path when already at the target (`:788-792`).

**Collision/minimum-altitude handling during flights** (distinct from the real-time zoom
clamp in §1) lives in `AvoidCollisionCurve` (`src/navigation/pathcurves/avoidcollisioncurve.cpp`,
300 lines): it builds a Catmull-Rom spline through hand-picked control points, then
iteratively (`removeCollisions()`, up to `MaxAvoidCollisionSteps = 10`,
`avoidcollisioncurve.cpp:46`) tests each linear segment for sphere intersection against every
"relevant node" (tagged `planet_solarSystem`/`moon_solarSystem` by default,
`pathnavigator.cpp:177-180`) and inserts an orthogonal detour point when a collision is found
(`:202-224`), throwing `InsufficientPrecisionError` if the fix-up produces NaNs (`:218-222`,
feeding the Linear-path fallback described in §4). Named magic-number multipliers:
`CloseToNodeThresholdRadiusMultiplier = 5.0`, `AvoidCollisionDistanceRadiusMultiplier = 3.0`,
`CollisionBufferSizeRadiusMultiplier = 1.0` (`:43-45`).

**"Touch the ground" direct manipulation** (touch/mouse-drag surface dragging, distinct from
orbit-drag) is `DirectManipulation` (`directmanipulation.h`/`.cpp`, 138+720 lines): it raycasts
each touch/mouse contact point onto the anchor's surface (`computeSurfacePoint`,
`updateNodeSurfacePoints`), then solves for the camera velocity that minimizes L2 screen-space
error between the original contact points and their current projected positions using
Levenberg-Marquardt (`solveVelocitiesFromTouchPoints`, doc comment
`directmanipulation.h:110-115`) — i.e. each finger stays "glued" to the point on the surface
it first touched. Gated by `_enabled` (default true), `_distanceThreshold` (`FloatProperty`,
default **5.0**, range **[0,10]**, a multiplier on the interaction sphere,
`directmanipulation.cpp:265-272,304`), and a `_defaultRenderableTypes` list defaulting to just
`"RenderableGlobe"` (`:274-282,322-323`, with a comment at `:316-322` calling this "a bit of a
hack" pending removal). Mouse input is off by default (`_allowMouseInput = false`) — this
scheme is touch-first.

---

## 6. Idle/inertia

**Files:** `include/openspace/navigation/orbitalnavigator/dampenedvelocity.{h,inl}`,
`include/openspace/navigation/orbitalnavigator/orbitalcamerastates.h`,
`src/navigation/orbitalnavigator/mousecamerastates.cpp`,
`src/navigation/orbitalnavigator/orbitalinputhandler.cpp`,
`include/openspace/navigation/orbitalnavigator/idlemotion.h`,
`src/navigation/orbitalnavigator/idlemotion.cpp` (346 lines).

**Per-axis exponential smoothing/friction, not a physical velocity/impulse model.**
`DampenedVelocity<T>` (`dampenedvelocity.inl`) is the single primitive behind every input axis
(global rotation, local rotation, truck/zoom, local roll, global roll — five independent
instances per input device class, `orbitalcamerastates.h:79-83`):

```cpp
void set(T value, double dt) {           // called when there IS live input
    _targetValue = value;
    _currentValue += (_targetValue - _currentValue) * min(_scaleFactor * dt, 1.0);
}
void decelerate(double dt) {             // called when there is NO live input (friction)
    if (_frictionEnabled) _currentValue *= (1.0 - min(_scaleFactor * dt, 1.0));
}
```

Both are the same discrete-time exponential-decay-toward-target filter (`y = 1 - e^(-t/scale)`
step response per the class doc comment, `dampenedvelocity.h:34-36`); `decelerate` is just
`set(0, dt)` with a friction-enabled gate. `_scaleFactor` comes from
`velocityScaleFromFriction(friction) = 1 / (friction + 1e-7)`
(`orbitalinputhandler.cpp:65-67`), so the user-facing `Friction.friction` property (default
**0.5**, range **[0,1]**, `orbitalnavigator.cpp:323`) is _inverted_ into this scale factor —
friction near 0 → huge scale factor → `min(scaleFactor*dt,1)` saturates at 1 → velocity
snaps instantly (no inertia); friction near 1 → scale factor ≈1 → slow exponential decay
(long coast). Each of roll/rotational/zoom friction is independently toggleable
(`_friction.roll/rotational/zoom`, all default **true**, `orbitalnavigator.cpp:320-322`) and
wired through to each input-device state object's `setRotationalFriction`/etc
(`orbitalinputhandler.cpp:238-257`), so e.g. zoom can coast indefinitely while rotation snaps.

**Multi-device velocity summation.** `OrbitalInputHandler` sums velocities across mouse,
joystick, websocket, script, and touch device states every frame
(`orbitalinputhandler.cpp:160-198`) — i.e. simultaneous input from multiple device classes is
additive, not exclusive (except touch vs mouse, which are mutually exclusive by an explicit
early-out: `:206-215`, "avoids conflicts between touch and mouse input on devices that support
both").

**Idle timeout → automatic motion** (distinct from friction/inertia): `IdleMotion`
(`idlemotion.cpp`) is a separate opt-in feature, not enabled by default
(`_shouldTriggerWhenIdle` default **false**). When enabled, `tickIdleMotionTimer()`
(`:194-206`) counts down `_idleWaitTime` (default **5s**, range **[0,3600]**,
`idlemotion.cpp:121`) and auto-triggers a chosen `Motion` (`Orbit` /
`OrbitAtConstantLatitude` / `OrbitAroundUpVector`) once idle. `OrbitalNavigator::updateCamera()`
only ticks this timer when there was _no_ interaction that frame
(`orbitalnavigator.cpp:576-583`: `hasNonZeroVelocity()` check — note this checks the _input_
velocity, not the post-friction coasting velocity, so idle-motion can start triggering while
the camera is still coasting from released friction). Start/stop of the idle motion itself is
smoothed via a second, independent `Interpolator<double>` (`_dampenInterpolator`,
`quadraticEaseInOut` transfer function, `idlemotion.cpp:181`) over
`_dampenInterpolationTime` (default **0.5s**, `:125`) — so idle motion fades in/out
independently of, and on top of, the per-axis friction model above.
`_abortOnCameraInteraction` (default **true**) makes any real interaction hard-cancel idle
motion via `resetIdleMotionOnCamera()` (`:184-192`), which also zeroes the dampen-interpolation
time on cancel specifically "to avoid weirdness when changing anchor, etc" (`:189`).

---

## 7. Size/complexity inventory

Line counts (this checkout):

| File                                                        | Lines | Responsibility                                                                                                                                                                                          |
| ----------------------------------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/navigation/orbitalnavigator/orbitalnavigator.cpp`      |  1602 | Core per-frame camera update: rotation decomposition, all translate/rotate primitives, follow-rotation, aim-following, retargeting, surface push, property definitions (26 `PropertyInfo` blocks alone) |
| `include/…/orbitalnavigator.h`                              |   348 | Same class's public/private surface — ~15 private math helper methods, 2 nested `PropertyOwner` structs (`Friction`, `LimitZoom`)                                                                       |
| `src/navigation/orbitalnavigator/directmanipulation.cpp`    |   720 | Touch/mouse-to-surface direct manipulation, LMA solver, per-finger surface tracking                                                                                                                     |
| `src/navigation/path.cpp`                                   |   655 | Path traversal, speed/damping profile, rotation interpolation per path type, precision-fallback logic                                                                                                   |
| `src/navigation/navigationhandler.cpp`                      |   637 | Top-level per-frame dispatch (keyframe/path/orbital), approach/reach/exit event transitions, nav-state save/load, Lua library registration (34 functions)                                               |
| `src/navigation/pathnavigator.cpp`                          |   629 | Path creation/lifecycle, node relevance list, arrival-height defaults, 13 `PropertyInfo` blocks                                                                                                         |
| `src/navigation/orbitalnavigator/joystickcamerastates.cpp`  |   445 | Joystick axis→velocity mapping, deadzones, per-axis bindings                                                                                                                                            |
| `src/navigation/orbitalnavigator/idlemotion.cpp`            |   346 | Idle-timeout auto-motion, 3 motion kinds, dampened start/stop                                                                                                                                           |
| `src/navigation/orbitalnavigator/touchcamerastates.cpp`     |   364 | Multi-touch gesture→velocity mapping                                                                                                                                                                    |
| `src/navigation/waypoint.cpp`                               |   251 | Waypoint (pose + node ref) construction helpers from node specs                                                                                                                                         |
| `src/navigation/pathcurve.cpp`                              |   300 | Spline/curve base (arc-length parametrization) shared by path curve types                                                                                                                               |
| `src/navigation/navigationstate.cpp`                        |   337 | Nav-state (de)serialization, JSON/Dictionary conversion, pose reconstruction                                                                                                                            |
| `src/navigation/orbitalnavigator/orbitalinputhandler.cpp`   |   259 | Per-device-class velocity aggregation, sensitivity properties                                                                                                                                           |
| `src/navigation/orbitalnavigator/websocketcamerastates.cpp` |   190 | Remote/websocket velocity input                                                                                                                                                                         |
| `src/navigation/keyframenavigator.cpp`                      |   180 | Keyframe-recording-driven camera (session playback / networked sync)                                                                                                                                    |
| `src/navigation/orbitalnavigator/mousecamerastates.cpp`     |   141 | Mouse button/drag→velocity mapping, sensitivity-ramp (Z/X keys)                                                                                                                                         |
| `src/navigation/orbitalnavigator/orbitalcamerastates.cpp`   |   117 | Shared base for all device-state classes (velocity storage/reset)                                                                                                                                       |
| `src/navigation/orbitalnavigator/scriptcamerastates.cpp`    |    95 | Scripted/Lua-driven velocity input                                                                                                                                                                      |
| `modules/globebrowsing/src/renderableglobe.cpp`             |  2779 | (Not navigation, but the counterpart implementing `SurfacePositionHandle`/height queries the navigator depends on — chunked LOD terrain rendering, far larger than all navigation code combined)        |

**Observations on complexity shape:**

- The split into `OrbitalInputHandler`/`DampenedVelocity`/`IdleMotion`/`DirectManipulation` as
  separate files/classes (all under one `orbitalnavigator/` subfolder) is a clean
  separation-by-concern — friction math, idle-timeout logic, and touch-manipulation solving
  don't leak into the 1602-line core file's per-frame method. This looks like the result of a
  deliberate prior refactor (git history shows dates like "2025-12-19", "2026-03-31" in
  comments suggesting ongoing incremental extraction), not an untouched monolith.
- The remaining core `orbitalnavigator.cpp` still carries real accreted complexity: the
  `updateCameraStateFromStates()` method (`:600-767`, ~165 lines) is a single long sequential
  function with ~10 ordered stages, each mutating a shared `CameraPose pose` +
  `CameraRotationDecomposition camRot` pair by reference-like threading; there is no way to
  test stage 4 (follow-rotation) independent of stages 1-3 having already run. This is
  intrinsic to the domain (camera-relative math genuinely composes sequentially), but the
  function is long enough that reordering two stages by mistake would be easy and would not
  be caught by types.
- Several `@TODO` comments admit acknowledged-but-unfixed complexity/special-casing, not
  hidden landmines: `idlemotion.cpp:242-245` ("Assume north coincides with local z... make
  each SGN aware of its own north"), `directmanipulation.cpp:316-322` ("a bit of a hack...
  ideally this property should not be needed at all"), `path.cpp:485-490`
  (`MaxDistance = 1E12` called out as "very specific to our space content... come up with a
  better more general solution"), `path.cpp:648-651` (linear-path precision fallback flagged
  as a stopgap, with a proposed but unimplemented better fix).
- `followAim()` (`orbitalnavigator.cpp:1064-1169`, ~105 lines) is the single most
  mathematically dense function in the core file — two chained rotation corrections (spin +
  radial), a `ratio^50` singularity-avoidance fade, and a two-branch angle-sign disambiguation
  (`:1130-1137`) whose comment admits "two solutions, depending on whether the camera is in
  the half-space closest to the anchor or aim". This is essential complexity (the geometry
  genuinely has two solution branches) rather than an accidental special case, but it is
  dense and under-decomposed relative to everything else in the file.
- Property-info blocks are extremely verbose (each is a 5-line struct literal with prose
  description) but this is presumably necessary for the in-app property browser/GUI and Lua
  docs generation — a deliberate framework cost, not bloat from this feature.

---

## Mechanisms in one paragraph each (the 5 most load-bearing)

**1. Local/global rotation decomposition (`camerapose.cpp:33-103`).** Every frame the current
camera quaternion is split into a `globalRotation` (a `lookAt` toward the anchor's surface,
rebuilt fresh each frame from current positions) and a `localRotation` (whatever's left:
`inverse(globalRotation) * currentRotation`), with the invariant
`currentRotation = globalRotation * localRotation` enforced by always recomposing through
`composeCameraRotation()`. Every other mechanism in the file — friction, roll, follow-rotation,
retargeting — operates on one side of this split without needing to know about the other,
which is what keeps `updateCameraStateFromStates()`'s ~10-stage pipeline tractable despite its
length.

**2. Follow-anchor-rotation as a signed, smoothstepped interpolator, never a snap
(`orbitalnavigator.cpp:1004-1027`, `:1512-1527`, `:427-430`).** A per-frame boolean distance
test (`distanceToCamera < followAnchorNodeRotationDistance × boundingSphereRadius`) only
controls the _sign_ of the delta-time fed into a persistent `Interpolator<double>` running a
smoothstep transfer function; the interpolator's value is the `slerp` factor between "rotation
frozen relative to camera" and "rotation locked to the rotating anchor." Crossing the
threshold repeatedly just reverses the sweep direction — there is no discrete state machine
and no discontinuity, at the cost of the interpolator needing ~1 second (its configured
interpolation time) to fully saturate in either direction.

**3. `DampenedVelocity<T>` as the single friction/inertia primitive
(`dampenedvelocity.inl`).** One generic exponential-decay-toward-target filter
(`current += (target-current) * min(scaleFactor*dt,1)` when there's input,
`current *= (1-min(scaleFactor*dt,1))` when there isn't) is instantiated five times per input
device class (rotation/pan/zoom/roll×2) and reused identically for mouse, joystick, websocket,
script, and touch input. The user-facing `friction ∈ [0,1]` property is inverted into the
filter's scale factor (`1/(friction+ε)`), so friction=0 collapses the filter to instant
snap-to-target (no inertia) and friction→1 approaches near-frozen coasting — a single knob
governs both "does it coast" and "how long," rather than separate on/off and rate controls.

**4. Camera-relative rendering by construction via double-precision-until-the-last-cast
(`renderableglobe.cpp:1228-1264`, `camera.h:85,151-152`).** The scene graph and camera store
everything in `glm::dvec3`/`dmat4`, and the combined view/model/projection matrix product is
computed entirely in double precision inside each `Renderable::render()` call; the _only_
narrowing to `float` happens at the final uniform-upload line, per renderable, per frame. This
means there is no separate "camera-relative origin" bookkeeping structure anywhere — precision
safety falls out of the invariant "never construct a float matrix from anything except an
already-camera-relative double product," enforced by convention (every Renderable must do it
right) rather than by a shared helper or type.

**5. Surface-relativity as a virtual interface, not conditional logic
(`renderable.h:104`, `updatestructures.h:86-95`, `renderableglobe.cpp:2052-2081`).**
`OrbitalNavigator` calls `anchorNode->calculateSurfacePositionHandle(cameraPosModelSpace)`
polymorphically and only ever deals with the resulting `{centerToReferenceSurface,
referenceSurfaceOutDirection, heightToSurface}` triple — it contains zero knowledge of
ellipsoids, heightmaps, or globes. `RenderableGlobe`'s implementation is where the real
geodetic-ellipsoid projection and live DEM-tile height query happens; a plain sphere or model
gets a trivial implementation instead. This is why altitude-dependent sensitivity, min-distance
clamping, and "touch the ground" all work correctly on textured/terrain-mapped planets without
any planet-specific branches in the navigation code itself.
