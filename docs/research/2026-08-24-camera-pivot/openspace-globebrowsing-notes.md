# OpenSpace globe navigation — the handoff, read from source (2026-08-24)

Source read directly at `/Users/rulkens/Development/vendor/cpp/openspace` (2014-2026 copyright
headers; same refactored generation as the earlier clone, navigation split into
`orbitalnavigator/` satellites). All paths below are relative to that checkout.

**Scope note.** This extends, does not repeat,
`openspace-camera-notes.md` (mechanism inventory) and
`openspace-camera-comparison.md` (strategy verdicts). Those already cover: the
local/global rotation split, the signed smoothstep follow-rotation interpolator,
`DampenedVelocity`, `SurfacePositionHandle` as a virtual interface, path-navigation
precision fallbacks, and the ranked keep/adjust/never list. This file answers the six
questions the pivot grill needs and corrects/sharpens three things the earlier notes left
implicit.

Headline, stated once up front:

> **There is no handoff.** OpenSpace has exactly one camera state — `{glm::dvec3 position,
glm::dquat rotation}` in absolute world doubles, parented to the scene root and never
> re-parented (`src/scene/scene.cpp:316` is the only `_camera->setParent` call in the
> tree). "Globe-surface navigation" is not a mode: it is the same per-frame pipeline with
> the _basis vectors_ for the deltas recomputed from the anchor's surface handle. Every
> distance-dependent behaviour is a continuous scalar, not a branch. The one genuine mode
> switch in the whole system (`DirectManipulation`) is bolted on outside the pipeline and
> arbitrates by clobbering — see §3.2.

---

## 1. THE HANDOFF

### 1.1 Anchor/aim machinery, and what an anchor change actually does

`OrbitalNavigator::_anchor` / `_aim` are `StringProperty` node identifiers
(`include/openspace/navigation/orbitalnavigator/orbitalnavigator.h:151-155`). The onChange
handlers (`src/navigation/orbitalnavigator/orbitalnavigator.cpp:380-414`) resolve to
`SceneGraphNode*` and call `updateAnchorNode()` / `updateAimNode()`.

`updateAnchorNode()` (`orbitalnavigator.cpp:859-882`) is the whole switch:

```cpp
const bool changedAnchor = _anchorNode != anchorNode;
_anchorNode = anchorNode;
_syncedAnchorNode = anchorNode ? anchorNode->identifier() : "";
if (_resetVelocitiesOnAnchorChange) { resetVelocities(); }   // default true
if (changedAnchor) { markCameraInteraction(); updatePreviousAnchorState(); }
_resetVelocitiesOnAnchorChange = true;                        // one-shot opt-out
```

Three things happen and nothing else:

1. **All input velocities are hard-zeroed.** `resetVelocities()` (`:556-565`) →
   `OrbitalInputHandler::resetVelocities()` (`orbitalinputhandler.cpp:152-158`) →
   `DampenedVelocity::setImmediate(0)` on all five axes across all five device classes
   (`orbitalcamerastates.cpp:64-70`). Not damped — _set_.
2. **The follow-rotation interpolator is snapped**, not ramped:
   `shouldFollowAnchorRotation(camera->position()) ? _followRotationInterpolator.end()
: .start()` (`:559-564`) — i.e. `t` jumps straight to 1 or 0 for the _new_ anchor.
   This is the single deliberate discontinuity in the design.
3. **The previous-anchor snapshot is re-stamped** (`updatePreviousAnchorState()`,
   `:904-913`, writes `_previousAnchorNodePosition` and `_previousAnchorNodeRotation` from
   the new node). Without this, the next frame's `anchorDisplacement`
   (`:609-611`) and `anchorNodeRotationDiff` (`:668-670`) would be deltas _between two
   different bodies_ — an instant teleport. This is the bug class skymap's
   `followPanOffset` shares.

The camera **pose is untouched** by an anchor change. The camera only moves if you come in
through the high-level API: `NavigationHandler::setFocusNode()`
(`src/navigation/navigationhandler.cpp:121-125`) does
`_camera->setPosition(anchorNode()->worldPosition())` — a hard teleport _to the body
centre_, which is then pushed back out by `pushToSurface` on the next frame. Blunt, and
the reason the UI normally routes through `PathNavigator` instead.

**There is no "dynamic friction" in this generation of the code.** Grepped the whole tree:
no `dynamic friction`/`dynamicFriction` symbol exists. The only friction is the static
`Friction.friction ∈ [0,1]` property (`orbitalnavigator.cpp:323`) inverted into
`velocityScaleFromFriction(f) = 1/(f + 1e-7)` (`orbitalinputhandler.cpp:65-67`). If the
grill premise came from older OpenSpace or from a paper, the modern answer is: _anchor
switch = hard velocity reset + snapped interpolator_, and the smoothness the user perceives
comes from (a) velocities being zero anyway at the moment you click a new focus, and (b)
the separate `_retargetAnchorInterpolator` easing the _view direction_
(`startRetargetAnchor()`, `:952-972`; duration `max(angle,1.0) * _retargetInterpolationTime`,
default 2 s).

### 1.2 What happens when the anchor is a `RenderableGlobe` — the actual mechanism

Nothing in `OrbitalNavigator` tests for it. The word "globe" does not appear in the file.
The entire difference arrives through one virtual call, and it changes a _basis_, not a
parameterization:

`decomposeCameraRotationSurface(pose, anchorNode)` (`src/camera/camerapose.cpp:55-99`):

```cpp
posHandle = reference.calculateSurfacePositionHandle(cameraPositionModelSpace);
directionFromSurfaceToCamera = normalize(dmat3(modelTransform) *
                               posHandle.referenceSurfaceOutDirection);
globalCameraRotation = ghoul::lookAtQuaternion(
    dvec3(0.0), -directionFromSurfaceToCamera,        // <-- NADIR, not the body centre
    normalize(cameraViewDirection + cameraUp));
localCameraRotation  = inverse(globalCameraRotation) * cameraPose.rotation;
```

The load-bearing subtlety the earlier notes glossed: **`globalRotation` points down the
local surface normal (nadir), not at the anchor's centre.** For `RenderableGlobe`,
`referenceSurfaceOutDirection` is the _geodetic_ (WGS84 ellipsoid) normal at the camera's
ground point (`modules/globebrowsing/src/renderableglobe.cpp:2052-2081`, via
`_ellipsoid.geodeticSurfaceProjection()`); for a plain node it is just
`normalize(targetModelSpace)` (`src/scene/scenegraphnode.cpp:1161-1177`,
`src/rendering/renderable.cpp:255-265`), which _is_ the centre direction. So:

- Plain node / sphere: nadir ≡ centre direction. The decomposition degenerates to
  "camera looks at anchor" — classic orbit.
- Ellipsoid: nadir differs from centre direction by at most ~0.19° (Earth flattening), at
  **all** distances, continuously. Nothing switches; the frame just tilts slightly.

And the decomposition is **lossless** —
`composeCameraRotation() = globalRotation * localRotation` (`camerapose.cpp:101-103`)
reconstructs the input exactly. It is a per-frame _choice of basis in which to express this
frame's deltas_, never a stored state. That is precisely why there is no re-parameterization
event to smooth: switching anchor from "Milky Way" to "Earth" changes which surface handle
supplies the basis next frame, and the pose carries over untouched.

Consequence for the local rotation: near a globe, `localRotation` _means_ "my tilt and
heading relative to straight-down" — the ENU-ish look-around you want for surface
navigation — and far away the same number means "how far off-centre I'm looking". Same
storage, different reading, no conversion. **This is the single most transplantable idea in
the codebase.**

### 1.3 The distance-keyed behaviours (all continuous, all independent)

There is no one threshold. Five separate distance-driven quantities, none of which gate
each other:

| Mechanism                  | Where                                          | Form                                                                                            | Default scale                                        |
| -------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Follow anchor rotation     | `orbitalnavigator.cpp:1004-1027`, `:1512-1527` | boolean test → _sign_ of dt into a smoothstep `Interpolator<double>`; value is the slerp factor | `5.0 × boundingSphere`, 1.0 s ramp                   |
| Horizontal speed scale     | `:1541-1575`                                   | `clamp(distSurfaceToCam / distCentreToSurface, 0, 1)`                                           | dimensionless, no constant                           |
| Dolly speed                | `translateVertically`, `:1413-1433`            | multiplies the surface-relative _vector_ → exponential by construction                          | no constant                                          |
| Approach/reach/exit events | `navigationhandler.cpp:267-445`                | two nested spheres, hysteresis by last-frame booleans                                           | `interactionSphere × approachFactor / × reachFactor` |
| Direct manipulation        | `directmanipulation.cpp:632-655`               | hard boolean gate                                                                               | `interactionSphere × 5.0`                            |

`updateCameraTransitions()` (`navigationhandler.cpp:267-445`) deserves a call-out because it
is the closest thing to a declared "we are now near a body" signal — and it is deliberately
_not_ wired into camera math at all. It only fires `EventCameraFocusTransition` and runs
per-node `onApproachAction` / `onReachAction` / `onRecedeAction` / `onExitAction` scripts
(the scene author's hook: enable terrain layers, swap labels, etc.). The state is two
booleans compared against last frame (`_inAnchorApproachSphere`, `_inAnchorReachSphere`,
`:295-303`), with an explicit special case for "the anchor changed between frames" that
fires recede+exit on the _old_ node then approach+reach on the _new_ one (`:401-421`) —
their answer to "how do you not fire a spurious transition on a focus swap".

**Verdict on the handoff question:** one continuous state, behaviour modulated by distance,
with the surface-relative _frame_ supplied polymorphically per-anchor. No
re-parameterization anywhere. The only snap is on anchor change, and it is a snap of
_velocities and the follow-rotation ramp_, never of pose.

---

## 2. ROTATING FRAME — their FW-F/FW-G equivalent, precisely

### 2.1 The differential, with the glm convention spelled out

Per frame, in `updateCameraStateFromStates()` (`orbitalnavigator.cpp:664-680`):

```cpp
const glm::dquat anchorRotation = glm::quat_cast(_anchorNode->worldRotationMatrix());
glm::dquat anchorNodeRotationDiff = _previousAnchorNodeRotation.has_value() ?
    (*_previousAnchorNodeRotation) * glm::inverse(anchorRotation) :
    glm::dquat(1.0, 0.0, 0.0, 0.0);
_previousAnchorNodeRotation = anchorRotation;
anchorNodeRotationDiff = interpolateRotationDifferential(dt, pose.position, anchorNodeRotationDiff);
```

Note it stores `R_prev · R_cur⁻¹` — the _inverse_ of the body's forward increment. That is
not a bug: it is consumed through glm's right-multiply convention
(`followAnchorNodeRotation`, `:1382-1392`):

```cpp
const glm::dvec3 posDiff = cameraPosition - objectPosition;
return cameraPosition + (posDiff * focusNodeRotationDiff - posDiff);
```

`v * q` in glm is `inverse(q) * v`, so the applied rotation is
`(R_prev R_cur⁻¹)⁻¹ = R_cur R_prev⁻¹` — the body's forward increment, applied to the
camera's offset from the body centre. **Landmine worth carrying to skymap:** the stored
quaternion and the applied quaternion are inverses of each other, and the only thing that
makes it correct is the vector-on-the-left multiplication. Two of the three consumers use
`v * q` (`:1389`, `translateHorizontally:1376`) and the third uses
`inverse(diff) * ...` explicitly (`rotateGlobally:1403`). A reader who "fixes" one of them
to `q * v` breaks co-rotation silently and only near a rotating body.

### 2.2 Derived vs integrated — a hybrid, sharper than the earlier notes said

The earlier comparison called this "integrated" wholesale. Read closely, it is split:

- **Position: integrated.** `pose.position` accumulates `followAnchorNodeRotation`'s
  increment every frame (`:726-730`). Nothing re-derives it from an epoch. This is exactly
  the formulation that produces their #3026 jitter under large delta-time.
- **Orientation: re-derived every frame, except one degree of freedom.**
  `rotateGlobally()` (`:1394-1411`) does **not** rotate the stored global quaternion by the
  differential; it rebuilds it from scratch:
  ```cpp
  cameraUpWhenFacingSurface = inverse(focusNodeRotationDiff) * globalCameraRotation * UpDirectionCameraSpace;
  return ghoul::lookAtQuaternion(dvec3(0.0), -directionFromSurfaceToCamera, cameraUpWhenFacingSurface);
  ```
  Direction comes from the freshly-recomputed surface handle (position-derived); only the
  _up vector_ — the roll about the view axis — is carried through the differential. So
  orientation is "look at nadir, with a roll that co-rotates".

That hybrid is why their disengage is free: ceasing to add the position increment needs no
unwind, and the orientation was never accumulating anything except roll. It is also why
their co-rotation drifts under time acceleration where a derived-from-epoch formulation
(skymap's R̃) would not: the position half is a pure Riemann sum of per-frame increments.

### 2.3 Engage/disengage

`shouldFollowAnchorRotation()` (`:1004-1027`):

```
maximumDistanceForRotation = |modelTransform * (normalize(camPosModelSpace) * boundingSphere)|
                             * _followAnchorNodeRotationDistance      // default 5.0, range [0,20]
shouldFollow = distanceToCamera < maximumDistanceForRotation
```

`interpolateRotationDifferential()` (`:1512-1527`) uses that boolean **only to pick the sign
of dt**; the interpolator's smoothstep value (`3t²−2t³`, set at `:427-430`) is the slerp
factor from identity to the full differential. `_followRotationInterpolationTime` default
**1.0 s** (`:375`). One threshold, one scalar, no state machine, symmetric in both
directions. No hysteresis band — the soft hysteresis is emergent, because `t` needs a full
second to saturate, so dithering across the boundary produces a value that hovers mid-range
rather than chattering.

Drift/popping avoidance summary: (a) blend the _differential_, not the pose, so a partial
blend is a partially-applied increment and every intermediate value is physically
meaningful; (b) snapshot re-stamping on anchor change so the differential is never taken
across two bodies; (c) orientation re-derived from position so any accumulated orientation
error is erased every frame — only the roll DOF can drift.

### 2.4 Where they gave up: paths freeze time

`PathNavigator::startPath()` (`src/navigation/pathnavigator.cpp:370-380`):

```cpp
// Always pause the simulation time when flying, to aovid problem with objects moving.
if (!global::timeManager->isPaused()) { global::scriptEngine->queueScript("openspace.time.setPause(true)"); ... }
```

They cannot fly an authored path in a rotating/moving frame, so they **stop the clock** and
restart it on arrival. This is the sharpest admission of camera debt in the tree, and it is
directly skymap-relevant: tour clips over a rotating Earth are the same problem, and
skymap's known landmine "clip pins clock" is the same workaround arrived at independently.

---

## 3. SURFACE INTERACTION

### 3.1 Default drag is rate control, not ground glue

Two facts compose into the answer.

**(a) The mouse delta is measured from the press point, not the previous frame.**
`MouseCameraStates::updateVelocitiesFromInput()`
(`src/navigation/orbitalnavigator/mousecamerastates.cpp:101-113`):

```cpp
if ((primaryPressed || button4Pressed) && !keyShiftPressed && !keyAltPressed) {
    const glm::dvec2 mousePosDelta = _prevMousePos.primary - mousePosition;
    ... updateStates.globalRotation = mousePosDelta * (_sensitivity + _sensitivity * totalSensitivity / 5.0);
}
else { _prevMousePos.primary = mousePosition; }   // <-- only updated when NOT dragging
```

`_prevMousePos.primary` is frozen for the duration of the drag, so `mousePosDelta` is the
cursor's _displacement from where you pressed_ — a joystick deflection. That value becomes a
target **velocity** through `DampenedVelocity::set` (`dampenedvelocity.inl:36-40`). Hold the
mouse still 200 px from the press point and the globe keeps spinning at a constant rate.
This is rate control (a virtual trackball stick), categorically not Google-Maps-style
position control. Mouse sensitivity default 15 → `×1e-4` (`orbitalinputhandler.cpp:74,84`).

**(b) The motion produced is a great-circle orbit about the body centre.**
`translateHorizontally()` (`:1341-1380`):

```cpp
rotationDiffCameraSpace = dquat(dvec3(-gRotVel.y, useX ? -gRotVel.x : 0.0, 0.0) * dt * speedScale);
rotationDiffWorldSpace  = globalCameraRotation * rotationDiffCameraSpace * inverse(globalCameraRotation);
outVector      = |cameraPosition - objectPosition| * normalize(dmat3(modelTransform) * posHandle.referenceSurfaceOutDirection);
return cameraPosition + (outVector * rotationDiffWorldSpace - outVector);
```

The rotation axes are the **camera's own** right/up axes, transported to world space. The
rotated vector has the length of the centre-to-camera distance but the _direction of the
surface normal_ — a small ellipsoid-vs-sphere fudge that keeps the motion tangent to the
local horizontal. Note that radius is measured to the **centre**, not to the terrain: flying
over a mountain does not change your orbit radius.

### 3.2 Ground glue exists, but as a separate bolted-on mode

`DirectManipulation` (`include/.../directmanipulation.h`, `src/.../directmanipulation.cpp`,
138+720 lines) is the Cesium-like "finger stays on the point it touched" scheme. Its
handoff is the only hard mode switch in the system:

- Gate: `isWithinDirectTouchDistance()` (`directmanipulation.cpp:632-655`) —
  `max(|centreToCamera| − R, 0) ≤ R × _distanceThreshold`, threshold default **5.0**
  (`:303`), R = `interactionSphere`.
- Gate: `isValidDirectTouchNode()` (`:617-631`) — renderable type must be in
  `_defaultRenderableTypes`, hardcoded to `{"RenderableGlobe"}` with a self-flagged
  "@TODO ... this is a bit of a hack ... ideally this property should not be needed at all"
  (`:316-322`).
- Gate: `_allowMouseInput` default **false** (`:302`) — touch-first; on desktop the default
  experience is §3.1's rate control, full stop.
- Arbitration: `updateCameraFromInput()` is called from `OrbitalNavigator::updateCamera()`
  at `:595`, i.e. **before** `updateCameraStateFromStates()`. When it applies, it sets the
  camera pose directly and then calls
  `orbitalNavigator().markCameraInteraction(); resetVelocities();` (`:478-485`). So the
  arbitration between the two schemes is "run first, then zero the other one's state" —
  ordering-based, with no shared discriminant. `TouchCameraStates` has no knowledge that
  direct manipulation exists (grepped: zero references).
- Glue target is the **interaction sphere**, not the ellipsoid and not the DEM:
  `computeSurfacePoint()` (`:510-549`) does `glm::intersectRaySphere(camPos, rayDir,
node->worldPosition(), R*R, dist)`. So the "exact" glue is exact to a sphere — over real
  terrain the contact point slides.
- The solve is 6-DOF Levenberg-Marquardt minimising screen-space L2 over ≤3 contact points
  (`solveVelocitiesFromTouchPoints`, `:657-719`), producing `{orbit, zoom, roll, pan}`,
  which `cameraPoseFromVelocities()` (`:551-615`) applies: roll and pan into
  `localRotation`, orbit as a centre-relative rotation plus a `lookAtQuaternion` re-lock.

### 3.3 The cos-latitude question — they never have it

No `cos(lat)` term exists in the navigation code, and no pole special case, because **no
interaction is ever parameterized in lat/lon**. Both horizontal schemes are rigid rotations
of the centre→camera vector:

- `translateHorizontally` rotates about camera-space axes → great-circle motion in the drag
  direction. Bearing is whatever direction you dragged; latitude is an output, never a
  coordinate. Crossing the pole is unremarkable.
- The opt-in `_shouldRotateAroundUp` mode (`rotateAroundAnchorUp`, `:1316-1339`, default
  **false**, axis default local Z per `:526`) is the "spin the globe about its axis" mode,
  implemented as `IdleMotion::orbitAroundAxis` (`idlemotion.cpp:309-340`):
  `spinRotation = angleAxis(angle, axisInWorldSpace)`, applied to the offset vector _and_
  to `globalRotation` so the horizon stays level. Because it is a rigid spin, ground speed
  falls off as cos(lat) **naturally** and reaches zero at the pole — the physically right
  answer, obtained by never dividing by anything. When this mode is on, `translateHorizontally`
  drops the x input entirely (`useX = !_shouldRotateAroundUp`, `:1349`) so the two never
  fight.

The price: drag does not keep the ground point under the cursor. They bought no-singularity
by giving up glue, and bought glue back separately in `DirectManipulation` (§3.2) — which,
being a screen-space minimiser, also has no lat/lon and therefore no pole term.

### 3.4 Altitude-dependent speed

Two independent mechanisms, both without a per-body constant:

- **Horizontal/orbital**: `rotationSpeedScaleFromCameraHeight()` (`:1541-1575`) returns
  `clamp(distFromSurfaceToCamera / distFromCentreToSurface, 0, 1)`. Dimensionless ratio →
  body-size independent → no tuning constant per planet. Computed once at `:690-691` and fed
  to `rotateAroundAnchorUp`, `translateHorizontally`, and `IdleMotion::apply` (`:695-723`)
  so all horizontal motion shares one scale. `_constantVelocityFlight` (default false,
  `:372`) switches the numerator from the _actual_ (DEM) surface to the _reference_
  ellipsoid — their escape hatch for "grazing a mountain brings you to a halt".
- **Vertical/dolly**: no scale factor at all. `translateVertically()` (`:1413-1433`) is
  `position -= actualSurfaceToCamera * velocity * dt` — the step is proportional to the
  surface-relative vector itself, so approach is geometric/exponential by construction and
  asymptotically never reaches the surface.

---

## 4. CONSTRAINTS / FEEL

**Roll.** Enabled by default in this generation: `_disableRoll(DisableRollInfo, false)`
(`:363`). Two independent rolls: `roll()` on the local rotation (`:1171-1177`, gated at
`:683-685`) and `rotateHorizontally()` on the global rotation about the _surface normal_
(`:1435-1452`, gated at `:744-750`) — the latter is "rotate the horizon" and only makes
sense near a surface. Both are pure user input; nothing generates roll automatically.

**Up-vector policy: free, with no auto-levelling anywhere.** The global rotation's up comes
from `normalize(cameraViewDirection + cameraUp)` of the _current_ pose
(`camerapose.cpp:89`) — i.e. your own up, carried forward, nudged only to avoid the
lookAt degeneracy when view and up align. There is no ENU snap, no horizon lock, no
"level out near the ground" tween. The only forced levelling in the tree is
`PathNavigator::removeRollRotation()` (`pathnavigator.cpp:593-613`), applied to _path_
poses, not to interactive ones — and even that is only invoked for path endpoints. A
canonical up appears only in authored waypoints: `Waypoint` uses
`targetNode->worldRotationMatrix() * dvec3(0,0,1)` with the comment "for now, this is
hardcoded to look good for Earth ... A better solution would be to make each sgn aware of
its own 'up'" (`src/navigation/waypoint.cpp:224-229`). `IdleMotion` has the twin admission:
"Assume that north coincides with the local z-direction" (`idlemotion.cpp:242-245`).

**Minimum altitude / collision.** `pushToSurface()` (`:1454-1498`) clamps against
`centerToReferenceSurface + referenceSurfaceOutDirection * heightToSurface` — i.e. the
**actual DEM terrain** for globes, degrading to the reference sphere when tile data is
missing (NaN guards, `renderableglobe.cpp:2068-2074`). Signed by
`sign(dot(actualSurfaceToCamera, referenceSurfaceOutDirection))` so being _inside_ the body
is handled. Defaults: `enableZoomInLimit` **true**, `minimumAllowedDistance` **10 m**
(range 0..10000, `:333-334`); `enableZoomOutLimit` **false**. Per-body tuning is a Lua
call, `setRelativeMinDistance(multiplier)` →
`minimumAllowedDistance = interactionSphere * multiplier`
(`orbitalnavigator_lua.inl:36-47`).

Two ordering traps in that clamp, both real and both citable:

1. **The floor lives inside the zoom branch.** `orbitalnavigator.cpp:753-762`:
   ```cpp
   if (!_disableZoom) {
       pose.position = translateVertically(...);
       pose.position = pushToSurface(pose.position, anchorPos, posHandle);
   }
   ```
   Set `DisableZoom` and the terrain floor stops being enforced entirely — horizontal
   motion over rising terrain can then drive the camera underground. One state deciding two
   things, again.
2. **The height sample is one step stale.** `posHandle` is recomputed at `:733` (after
   horizontal translation and follow-rotation), `translateVertically` then _moves_ the
   camera at `:754`, and `pushToSurface` at `:761` clamps using the pre-move handle. A fast
   dive samples the terrain at the position it started the frame from.

---

## 5. PRECISION

**One representation, doubles all the way to the last cast.** `Camera::_position` /
`_rotation` are `SyncData<glm::dvec3>` / `SyncData<glm::dquat>` (`camera.h:151-152`).
`combinedViewMatrix()` (`src/camera/camera.cpp:196-209`):

```cpp
cameraTranslation = inverse(translate(dmat4(1.0), _position.data()));
_cached = dmat4(sgctInternal.viewMatrix()) * dmat4(viewScaleMatrix()) *
          dmat4(viewRotationMatrix()) * cameraTranslation;
```

All double. Each `Renderable::render()` receives `RenderData` carrying the `Camera&` and a
double `TransformData`, forms `viewTransform * modelTransform` in double, and casts once at
the uniform upload (`renderableglobe.cpp:1229-1264`). **Camera-relative rendering falls out
of that product** — the large-magnitude subtraction happens inside a double matrix multiply,
and no separate RTC bookkeeping structure exists anywhere.

**The camera is NOT dynamically re-parented.** This contradicts the dynamic-scene-graph
paper and is worth stating flatly: `Camera::setParent` is called exactly once, from
`Scene::Scene` — `_camera->setParent(&_rootNode)` (`src/scene/scene.cpp:316`). No sphere-of-
influence traversal, no reattachment rule, no `psc`/PowerScaledCoordinate types anywhere in
`src/` or `include/`. Whatever the papers describe, **the shipping code's precision strategy
is "doubles + late cast", nothing more.** Anyone porting "OpenSpace's dynamic scene graph"
to skymap would be porting a paper, not the program.

**`Camera::setScaling` is not a precision mechanism.** `updateCameraScalingFromAnchor()`
(`:769-815`) sets a _view scale_ = `stereoscopicDepthOfFocusSurface / cameraToSurfaceDistance`
(default 40 m, `:365-370`), smoothed by `_cameraToSurfaceDistanceInterpolator` over 8 s, and
falls back to `10^_staticViewScaleExponent`. It exists so stereo depth stays comfortable
across 30 orders of magnitude. Don't mistake it for scene scaling.

**Where precision-by-reference-frame is applied, and where it leaks.**
`NavigationHandler::navigationState()` (`navigationhandler.cpp:460-515`) stores position as
`inverse(referenceFrame.modelTransform()) * (camera.position() - anchor.worldPosition())` —
relative, not absolute. But the round trip is admitted broken:
`NavigationState::cameraPose()` (`src/navigation/navigationstate.cpp:224-230`):

```cpp
// @TODO (2023-05-16, emmbr) This computation is wrong and has to be fixed! Only works
// if the reference frame is also the anchor node. I remember that fixing it was not
// as easy as using referenceFrameNode instead of anchor node though..
resultingPose.position = anchorNode->worldPosition() + referenceFrameTransform * dvec3(position);
```

Save is anchor-relative-plus-frame-rotated; load adds the frame rotation to the _anchor_
position regardless of which frame was named. Open since 2023. **The serialization boundary
is where their architectural precision safety fails**, exactly as predicted in the earlier
comparison's §4 item 6.

Other precision workarounds worth stealing as _techniques_:
`PathNavigator::removeRollRotation()` computes the roll-free quaternion at the **origin**
with a fixed 10 km lookAt distance "to avoid precision problems when we have large values
for the position" (`pathnavigator.cpp:593-604`) — i.e. do rotation math in a local frame,
never at world magnitude. `PathCurve::initParameterIntervals()`
(`src/navigation/pathcurve.cpp:108-117`) detects arc-length samples that are
"indistinguishable due to precision limitations" and throws `InsufficientPrecisionError`
rather than producing NaN — an explicit precision _assertion_ at a subsystem boundary.

---

## 6. THEIR KNOWN PROBLEMS (from the source itself)

Admissions in this checkout, dated by their own comment convention:

| Site                             | Admission                                                                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `navigationstate.cpp:226-228`    | "This computation is wrong and has to be fixed! Only works if the reference frame is also the anchor node" — the nav-state round trip. Since 2023-05-16.                                                                                         |
| `pathnavigator.cpp:372`          | Simulation time is force-paused for every camera path, "to aovid problem with objects moving" [sic].                                                                                                                                             |
| `directmanipulation.cpp:316-322` | The `RenderableGlobe`-only allowlist is "a bit of a hack ... ideally this property should not be needed at all". 2026-03-31 — still open in the newest code.                                                                                     |
| `idlemotion.cpp:242-245`         | "Assume that north coincides with the local z-direction ... make each SGN aware of its own north". 2021-07-09.                                                                                                                                   |
| `waypoint.cpp:224-227`           | Target up "hardcoded to look good for Earth, which is where it matters the most". 2020-11-17.                                                                                                                                                    |
| `path.cpp:485-490`               | `MaxDistance = 1E12` "very specific to our space system ... come up with a better more general solution".                                                                                                                                        |
| `path.cpp:636-652`               | Curve construction throwing `InsufficientPrecisionError` falls back to a Linear path; `path.cpp:648-651` flags the fallback as a stopgap.                                                                                                        |
| `path.cpp:367-369`               | Linear paths interpolate rotation by _time_ rather than arc length, explicitly "to avoid precision problems".                                                                                                                                    |
| `camera.cpp:167-208`             | Every matrix cache has its `if (isDirty)` guard **commented out** — `viewRotationMatrix`, `viewScaleMatrix`, `combinedViewMatrix` all recompute on every call. Someone hit a staleness bug and disabled the caches rather than fix invalidation. |
| `mousecamerastates.cpp:72-73`    | The Z/X sensitivity ramp is a hardcoded keyboard check inside the mouse device class, flagged as belonging in navigator settings. 2025-12-19.                                                                                                    |
| `camera.h:101-104`               | "@TODO this should simply be called viewMatrix! Or it needs to be changed so that it actually is combined" — the central matrix accessor's contract is admitted confused.                                                                        |

No issue-tracker references appear in code (grepped: zero `github.com/OpenSpace/...issues`
citations in `src/`, `include/`, `modules/`); the `documentation/` directory in this
checkout is empty. The issue-numbered findings (#2305 absolute-position arithmetic, #3026
follow-rotation jitter under time acceleration, #2150 grazing-terrain halt, #3017, #2779,
#3537) are carried in `openspace-camera-comparison.md` and are not
re-derivable from this tree — but note that `path.cpp:485-490` and
`navigationstate.cpp:226` are the in-code footprints of #2305, and
`_constantVelocityFlight` (`:1558-1568`) is the in-code footprint of #2150.

---

## Handoff design lessons for skymap

**What OpenSpace proves works (evidence: it ships, on rotating planets, in planetaria):**

1. **A handoff is unnecessary if the camera state never changes meaning.** One
   `{dvec3 position, dquat rotation}` in absolute world doubles, from interstellar distance
   to 10 m above terrain. Surface-relativity enters as a per-frame _basis_ — the nadir-based
   `decomposeCameraRotationSurface` (`camerapose.cpp:55-99`) — that is mathematically
   lossless (`decompose ∘ compose = id`) and therefore free to compute or discard on any
   frame. Nothing to blend, nothing to snapshot, nothing to unwind.
2. **Making the surface frame a polymorphic query, not a branch.** `SurfacePositionHandle
{centerToReferenceSurface, referenceSurfaceOutDirection, heightToSurface}` is the entire
   interface between "navigator" and "what kind of body is this". The navigator contains
   zero globe/ellipsoid/terrain knowledge; a globe supplies WGS84 + live DEM, a plain node
   supplies a sphere, and the degradation path (missing tiles → sphere) is a NaN check, not
   a mode.
3. **Distance-dependent behaviour as continuous scalars, never booleans.** The
   follow-rotation blend (boolean test → _sign_ of dt into a smoothstep interpolator), the
   dimensionless speed ratio, the exponential dolly. The only boolean-gated behaviour in
   the system (`DirectManipulation`) is also the only one that pops.
4. **Rigid rotations instead of lat/lon.** No cos(lat), no pole case, no singularity — ever
   — because latitude is an output and never a coordinate.

**What they never solved:**

1. **Co-rotation under a non-realtime clock.** Position co-rotation is an integrated
   per-frame Riemann sum (`:726-730`); they mitigate by _pausing simulation time for every
   camera path_ (`pathnavigator.cpp:372`). skymap's accelerated clock is that regime
   permanently.
2. **Ground glue.** The default desktop drag is rate control from the press point
   (`mousecamerastates.cpp:101-113`) — the globe keeps spinning while the cursor is still.
   Glue exists only as a 720-line touch-first LM solver gated on a hardcoded renderable-type
   allowlist, and it glues to a _sphere_, not the terrain.
3. **Precision at the serialization boundary.** Nav-state save is frame-relative, load is
   admitted wrong unless frame == anchor, since 2023 (`navigationstate.cpp:226`).
4. **Any canonical body "up".** Two separate hardcodes ("north = local z", "hardcoded to
   look good for Earth"), both open for 4-5 years.
5. **Arbitration between interaction schemes.** Direct manipulation wins by running first
   and zeroing the other scheme's state, with no shared discriminant.

**The decisions the grill session must make, and how OpenSpace answers them:**

1. **Does skymap keep one camera state across the whole scale range, or re-parameterize
   near a surface?** OpenSpace's answer is unambiguous: **one state**, with the
   surface-relative _frame_ derived per frame from the anchor. If skymap's orbit pose
   `{yaw, pitch, distance, target}` cannot express "tilted look from 200 m up", that is an
   argument for changing the representation once — not for adding a second mode and a
   transition between them. **Their design answers this; skymap's current parameterization
   does not match the answer.**
2. **Where does the surface frame come from — a globe-specific path, or a per-body query?**
   Their `SurfacePositionHandle` is the shape to copy _if and when a second body gets a
   surface_; with one surfaced body it is speculative generality. The decision is
   **"which body-shaped facts does the camera need"** (out-direction, reference-surface
   offset, height-above-terrain — exactly three), not "should we build an interface".
3. **Rate control or position control for surface drag?** OpenSpace picked rate control for
   the default path and paid for glue separately. skymap already has the _better_ half
   (an exact Newton ground-drag solve). The open question their design answers is
   **the fallback**: they degrade glue→rate on a boolean distance gate and accept the pop.
   skymap should decide its degradation currency now — and note that OpenSpace glues to a
   sphere, i.e. even the "exact" scheme is approximate over terrain.
4. **Does co-rotation stay derived-from-epoch (skymap) or become integrated (OpenSpace)?**
   Their integrated form buys a free, symmetric disengage; it costs correctness under time
   acceleration, which they patch by pausing the clock. skymap's accelerated clock makes
   that patch unavailable, so **the derived form must stay**, and the disengage ramp must
   fold the removed increment into the base — there is no third option, and OpenSpace does
   not have one.
5. **What is allowed to read the "near a body" state?** OpenSpace's own answer is a warning
   rather than a model: `updateCameraTransitions()` keeps approach/reach purely as an _event_
   (scene scripts only, zero camera math), which is right; but they then let
   `followingAnchorRotation()` pick the serialization reference frame
   (`navigationhandler.cpp:460-463`) and let `DisableZoom` gate the terrain floor
   (`:753-762`) — two live instances of one state deciding two things. Decide skymap's
   near-body signal is a pure input to exactly one consumer, and write the test.
6. **Where does the terrain floor live in the update order?** Their two ordering traps —
   floor inside the zoom branch, height sample one step stale — are free lessons: the
   collision clamp must be unconditional and must resample after the last position write.
