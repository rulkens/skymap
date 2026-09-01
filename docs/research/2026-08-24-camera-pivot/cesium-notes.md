# CesiumJS globe camera — source-level reference for skymap's globe-anchored camera pivot

Read against `CesiumGS/cesium` `main` @ `9fda7ab97a762e40c74b1d0e1814c98a2de43337` (fetched 2026-08-24).
Line numbers are from that commit; function names are the durable citation.

Primary files:

- `packages/engine/Source/Scene/Camera.js` — camera state + primitive operations (cited below as `Camera.js`)
- `packages/engine/Source/Scene/ScreenSpaceCameraController.js` — all input→camera policy (cited as `SSC.js`)
- `packages/engine/Source/Scene/CameraEventAggregator.js` — per-frame input aggregation
- `packages/engine/Source/Core/Transforms.js` — `eastNorthUpToFixedFrame`
- `packages/engine/Source/Core/IntersectionTests.js` — `rayEllipsoid`, `rayPlane`, `grazingAltitudeLocation`

The exact sources read (`ssc.js` = `ScreenSpaceCameraController.js`, plus `Camera.js`,
`CameraEventAggregator.js`, `Transforms.js`, `IntersectionTests.js`) were cached beside the original
research scratchpad and were not committed; line numbers are pinned by the commit SHA above and can
be checked by fetching that commit.

Cesium's SCENE3D world frame is **ECEF (Earth-fixed)**. Every claim below is in that frame unless
flagged. Places where the "Earth cannot move" assumption is load-bearing are marked **[EF]**.

---

## 1. Camera state: what is stored vs. what is exposed

### 1.1 The stored state is a position + orthonormal basis, in a _reference frame_

`Camera.js:82` (`function Camera`) stores exactly:

```
position   : Cartesian3   // in the camera's reference frame
direction  : Cartesian3   // unit
up         : Cartesian3   // unit
right      : Cartesian3   // unit, = direction × up
frustum    : PerspectiveFrustum (default fov 60°)
_transform : Matrix4      // reference frame → world; default IDENTITY
constrainedAxis : Cartesian3 | undefined   // default undefined  (Camera.js:204)
```

There is **no** stored heading/pitch/roll, no stored target, no stored "anchor point on the globe".
Heading/pitch/roll are _derived on read_, and the anchor for a drag lives in the controller, not the
camera (§2).

`_transform` is the one piece of statefulness that matters: `positionWC`/`directionWC`/`upWC`/
`rightWC` are `_transform * (position|direction|up|right)`, recomputed lazily in `updateMembers`
(`Camera.js:657`). In plain globe navigation `_transform === Matrix4.IDENTITY`, so camera coords ==
world coords == ECEF. `_transform` becomes non-identity only for `lookAt`/`lookAtTransform`
(entity tracking) — and that flips the controller into an entirely different mode (§5.3).

`_setTransform` (`Camera.js:1179`) is the _frame-change_ primitive and is used everywhere as a
scoped trick: it snapshots `positionWC/upWC/directionWC`, swaps `_transform`, then re-expresses the
same world pose in the new frame. Changing the frame therefore never moves the camera. Cesium uses
this dozens of times as "temporarily work in ENU, then restore".

`updateMembers` also silently **re-orthonormalizes** the basis whenever
`|1 - dot(direction, up×right)| > EPSILON2` (`Camera.js:759-782`), Gram-Schmidting `up` against
`direction` and recomputing `right`. Drift from repeated incremental rotations is absorbed there,
not by the callers.

### 1.2 heading / pitch / roll are derived, in the ENU frame of the camera's own position

`Camera.js:994` (`heading` getter), `:1025` (`pitch`), `:1056` (`roll`) all do the same three steps:

```
old = _transform
_setTransform( Transforms.eastNorthUpToFixedFrame(this.positionWC, ellipsoid) )
value = getHeading(direction, up) | getPitch(direction) | getRoll(direction, up, right)
_setTransform(old)
```

So **HPR is defined in the local east-north-up frame of the point directly below the camera**
(the camera's own `positionWC` projected through the ellipsoid normal), _not_ of any look-at target.
Reading `camera.heading` mutates and restores `_transform` — it is not free, and it is not
reentrant-safe. **[EF]** `eastNorthUpToFixedFrame` bakes in the ECEF axes (§1.4).

The angle definitions (`Camera.js:818-845`), evaluated in that ENU frame where x=east, y=north, z=up:

```
getHeading(direction, up):
  if |direction.z| is not ~1:  h = atan2(direction.y, direction.x) - π/2
  else:                        h = atan2(up.y,        up.x)        - π/2     // gimbal escape
  return 2π - zeroToTwoPi(h)          // → heading 0 = north, increasing clockwise/eastward

getPitch(direction):  return π/2 - acosClamped(direction.z)   // 0 = horizontal, -π/2 = straight down

getRoll(direction, up, right):
  if |direction.z| is not ~1:  return zeroToTwoPi(atan2(-right.z, up.z) + 2π)
  else:                        return 0
```

**The pole/zenith singularity is handled by switching the vector used for the azimuth.** When the
view direction is (near) parallel to local up — looking straight down or straight up, which is the
_default_ globe view — `direction.x/direction.y` are ~0 and `atan2` is garbage, so heading is taken
from the **up vector's** horizontal components instead, and roll is defined to be 0. The test is
`equalsEpsilon(|direction.z|, 1.0, EPSILON3)`, i.e. within ~0.0014 rad of vertical.

Note this is the _view-direction_ singularity (nadir/zenith), not the geographic pole. The
geographic-pole singularity is handled separately, inside `eastNorthUpToFixedFrame` (§1.4).

### 1.3 What `setView` / `lookAt` expose

`Camera.prototype.setView(options)` (`Camera.js:1488`) accepts:

- `destination`: `Cartesian3` (world) **or** a `Rectangle` (converted by
  `getRectangleCameraCoordinates`, which computes a position from which the rectangle fills the view)
- `orientation`: **either** `{heading, pitch, roll}` **or** `{direction, up}` — the latter is
  converted to the former immediately by `directionUpToHeadingPitchRoll` (`Camera.js:1391`), which
  expresses the vectors in the destination's ENU frame and calls the same `getHeading/Pitch/Roll`.
  Defaults: `heading 0`, `pitch -π/2` (straight down), `roll 0`.
- `endTransform`: sets `_transform`.

`setView3D` (`Camera.js:1268`) is the whole implementation for the globe case:

```
currentTransform = camera.transform
camera._setTransform( eastNorthUpToFixedFrame(destination) )   // ENU at the DESTINATION
camera.position = ZERO                                          // i.e. exactly at destination
hpr.heading -= π/2                                              // convert north-referenced → x-axis-referenced
rotMat = Matrix3.fromQuaternion(Quaternion.fromHeadingPitchRoll(hpr))
camera.direction = column 0 of rotMat
camera.up        = column 2 of rotMat
camera.right     = direction × up
camera._setTransform(currentTransform)                          // back to world
```

The `-π/2` on heading and the choice of columns 0 and 2 are the bridge between Cesium's
north-referenced heading and `HeadingPitchRoll`'s intrinsic Z-Y-X convention. Get this wrong and
everything is 90° off.

`Camera.prototype.lookAt(target, offset)` (`Camera.js:2331`) is _not_ a pose setter — it is a
**frame binder**: it computes `eastNorthUpToFixedFrame(target)` and calls `lookAtTransform`, which
does `_setTransform(thatFrame)` and then places `position = cartesianOffset` inside it, pointing at
its origin. The `HeadingPitchRange` form is converted by `offsetFromHeadingPitchRange`
(`Camera.js:2360`): pitch clamped to ±π/2, heading normalized then `-π/2`, then
`offset = -range * (Rz(-heading) · Ry(-pitch) · X̂)`.

The critical consequence: **after `lookAt`, `camera.transform !== IDENTITY` forever** (until
`lookAtTransform(Matrix4.IDENTITY)`), and that single fact reroutes the _entire_ controller into
trackball mode (§5.3). Cesium documents this as the way to track a moving entity — the camera
rides the target's frame for free.

Summary of the three vocabularies:

| API                              | What it really is                                  |
| -------------------------------- | -------------------------------------------------- |
| `position/direction/up/right`    | the actual stored state, in `transform` frame      |
| `heading/pitch/roll`             | derived, in ENU **of the camera's own subpoint**   |
| `HeadingPitchRange` via `lookAt` | ENU **of the target**, plus `_transform` rebinding |

### 1.4 `eastNorthUpToFixedFrame` and the pole special-case

`Transforms.localFrameToFixedFrameGenerator` (`Transforms.js:99`), of which
`Transforms.eastNorthUpToFixedFrame` is the `("east","north")` instantiation (`Transforms.js:276`):

```
if origin ≈ (0,0,0):                    use hardcoded degenerate frame
else if origin.x≈0 and origin.y≈0:      // AT A POLE — east is undefined
    use the hardcoded degenerate axes, sign-flipped by sign(origin.z)
    // north = (-1,0,0)·sign(z), east = (0,1,0), up = (0,0,1)·sign(z)
else:
    up    = ellipsoid.geodeticSurfaceNormal(origin)
    east  = normalize( (-origin.y, origin.x, 0) )     // ← ECEF z-axis is the reference  [EF]
    north = up × east
```

Two things to carry forward:

1. **`east` is defined by the ECEF Z axis, hardcoded.** `east.x = -origin.y; east.y = origin.x;
east.z = 0` (`Transforms.js:206-208`). There is no configurable spin axis. **[EF]**
2. **The geographic pole is handled by an epsilon test with a hardcoded fallback frame**, not by
   any continuous formula. Within `EPSILON14` of the axis, east is _chosen_ rather than computed.
   This is fine because nothing continuous depends on it (§2.5 explains why drags don't).

---

## 2. Drag ("spin"): the 1:1 grab

Entry point: `SSC.update` → `update3D` (`SSC.js:2873`) → `reactToInput(enableRotate,
rotateEventTypes /* LEFT_DRAG */, spin3D, inertiaSpin)`.

### 2.1 Input model — per-frame delta, plus a drag identity key

`CameraEventAggregator` collapses all mouse-moves since the last frame into one
`movement = {startPosition, endPosition}` (`CameraEventAggregator.js:296` `listenMouseMove`,
`:470` `getMovement`). `movement.startPosition` is **the previous frame's end**, not the drag start.

Separately, `getStartMousePosition` (`CameraEventAggregator.js:530`) returns
`_eventStartPosition[key]` — the pixel where the **button went down**. `reactToInput`
(`SSC.js:481`) passes this as the `startPosition` argument, and the controller uses it _only as an
identity key_: `Cartesian2.equals(startPosition, controller._rotateMousePosition)` means "still the
same drag gesture". For `WHEEL` it returns the current mouse position instead (§3).

So each frame the controller answers two questions: (a) is this a continuation of the same drag?
(b) what is this frame's pixel delta?

### 2.2 `spin3D` — mode selection, once per drag

`spin3D` (`SSC.js:1906`). Pseudocode of the real control flow:

```
if camera.transform !== IDENTITY:            // look-at / entity tracking
    rotate3D(); return                        // ← globe-anchored drag is OFF entirely  (§5.3)

if startPosition == _rotateMousePosition:     // CONTINUING an existing drag
    if _looking:   look3D(); return
    if _rotating:  rotate3D(); return
    if _strafing:  continueStrafing(); return
    // else: continue panning
    if |camera.position| < |_rotateStartPosition|:  return   // camera dropped below the pan sphere
    r  = |_rotateStartPosition|                     // radius frozen at drag start
    pan3D(movement, Ellipsoid.fromCartesian3(r,r,r)) ; return

// ---- FIRST FRAME OF A NEW DRAG: choose a mode ----
_looking = _rotating = _strafing = false
height = ellipsoid.cartesianToCartographic(camera.positionWC).height

if globe && height < _minimumPickingTerrainHeight:        // < 150 km
    mousePos = pickPosition(movement.startPosition)        // terrain/depth-buffer pick
    if mousePos:
        ray    = camera.getPickRay(movement.startPosition)
        normal = ellipsoid.geodeticSurfaceNormal(mousePos)
        tangentPick = |dot(ray.direction, normal)| < 0.05          // grazing hit
        strafing = tangentPick || (|camera.position| < |mousePos|) // camera below the picked surface
        if strafing:  _strafing = true; strafe(...)
        else:         pan3D on sphere of radius |mousePos| ; _rotateStartPosition = mousePos
    else:
        _looking = true; look3D(..., up)                   // clicked the sky
else if camera.pickEllipsoid(movement.startPosition, ellipsoid):
    pan3D(movement, ellipsoid)                             // TRUE ellipsoid on frame 1
    _rotateStartPosition = thatPick
else if height > _minimumTrackBallHeight:                  // > 7 500 km, cursor off the globe
    _rotating = true; rotate3D()
else:
    _looking = true; look3D(..., up)                       // free-look

_rotateMousePosition = startPosition                       // arm the "same drag" key
```

Note the frame-1 / frame-N asymmetry: frame 1 pans against the **true WGS84 ellipsoid** (or terrain),
every later frame pans against a **sphere of radius |first pick|**. The sphere is the anchor.

### 2.3 The pick point is chosen **once, at drag start** — but re-picked every frame _on that sphere_

This is the heart of the design and it is worth stating precisely, because it is neither of the two
obvious designs:

- It is **not** "pick once, then rotate to keep that world point under the cursor" (which drifts as
  soon as the surface under the cursor is not the picked point).
- It is **not** "pick fresh terrain every frame" (which jitters as tiles load and fails off-globe).

It is: **freeze a sphere at drag start** (radius = |pick|, centred on the ellipsoid centre), then
each frame **ray-cast both this frame's start pixel and end pixel against that frozen sphere**, and
rotate the camera by the rotation that carries `p0` to `p1`.

### 2.4 `pan3D` — the actual rotation

`pan3D(controller, startPosition, movement, ellipsoid)` (`SSC.js:2102`). With a globe present, the
whole first block is skipped (its inner work is gated on `!defined(controller._globe)` — see §2.7),
so the meat is:

```
p0 = camera.pickEllipsoid(movement.startPosition, ellipsoid)   // ray-sphere, world coords
p1 = camera.pickEllipsoid(movement.endPosition,   ellipsoid)

if !p0 || !p1:                       // cursor left the globe (or the sphere) mid-drag
    _rotating = true
    rotate3D(...)                    // fall back to trackball, and STAY there for the rest of the drag
    return

p0 = camera.worldToCameraCoordinates(p0)     // identity in globe mode
p1 = camera.worldToCameraCoordinates(p1)

if !defined(camera.constrainedAxis):         // ← the default path
    normalize(p0); normalize(p1)
    dot  = p0 · p1
    axis = p0 × p1
    if dot < 1 and axis ≉ 0:
        camera.rotate(axis, acos(dot))       // rotate position AND basis about the globe centre
else:
    ... spherical-coordinate decomposition into rotateRight(Δφ) + rotateUp(Δθ) about constrainedAxis
```

`Camera.prototype.rotate(axis, angle)` (`Camera.js:2028`) builds a quaternion about the axis and
applies it to **position, direction and up alike**, then re-derives `right`/`up` by cross products.
`|position|` is preserved exactly — the camera orbits the globe centre at constant radius.

**This is the answer to skymap's `cos(latitude)` bug.** Cesium never maps screen-x to a longitude
increment. The rotation is the single geodesic rotation `p0 → p1` on the sphere, axis `p0 × p1`,
angle `acos(p0·p1)`. Because the axis is derived from the two picked points rather than from a
fixed spin axis:

- horizontal drag speed is automatically correct at every latitude (no `cos φ` term exists to be
  wrong — it falls out of the geometry),
- there is **no pole singularity at all** — dragging over the pole is an ordinary rotation whose
  axis happens to be near-equatorial,
- the picked point stays exactly under the cursor to within one frame's ray-cast, by construction.

The `constrainedAxis` branch (spherical decomposition into Δφ about the axis and Δθ toward it) is the
_old_ Cesium behaviour and **is not active by default**: `Camera.constrainedAxis` is initialized to
`undefined` (`Camera.js:204`) and nothing in `SSC.js` sets it for globe drags — it is only set
transiently to `UNIT_Z` _inside a local ENU frame_ during tilt (`SSC.js:2636`, `:1607`) and by
`rotate3D`'s optional argument. That branch is precisely the "map screen axes to lon/lat rotations"
design skymap currently has, and it is the one Cesium relegated to a non-default path. It carries
visible seams: `deltaTheta`'s sign flips through a three-case `side0/side1` analysis
(`SSC.js:2296-2306`) exactly to survive dragging across the constrained axis.

### 2.5 Behaviour near the poles

Nothing special happens. Confirmed by reading the path: `pan3D`'s default branch has no latitude,
no longitude, no `atan2`. The only pole-aware code that runs is inside
`eastNorthUpToFixedFrame` — and that is _not_ on the drag path; it is on the _heading/pitch getter_
path and on `setView`. Since drag never reads heading, a drag across the pole is numerically
uneventful. The camera's `up` does swing 180° in ENU terms as you cross, which is correct and is
what "the globe rolls under your finger" means.

(By contrast, the `constrainedAxis` branch _does_ degenerate at the axis; `rotateVertical`,
`Camera.js:2081`, has explicit `northParallel`/`southParallel` tests with an `EPSILON2` guard and
clamps `angle` to `angleToAxis - EPSILON4` to stop the camera crossing the axis.)

### 2.6 When the cursor leaves the globe mid-drag

Two distinct escapes:

1. **`pan3D` fails to pick** (`SSC.js:2220`): sets `controller._rotating = true` and calls
   `rotate3D` for the rest of that drag. `spin3D`'s continuation branch then sees `_rotating` and
   keeps routing to `rotate3D` — so the gesture degrades from 1:1 grab to trackball **and never
   recovers within the same drag**. This "sticky mode per gesture" is a deliberate pattern; it
   prevents flip-flopping at the limb.
2. **Camera falls below the pan sphere** (`SSC.js:1930-1936`): `if |camera.position| <
|_rotateStartPosition| return` — the drag simply stops responding rather than inverting.
   Comment in source: _"Pan action is no longer valid if camera moves below the pan ellipsoid"_.

`rotate3D` (`SSC.js:2025`) is the fallback trackball. Its rate law is the one place a screen→angle
mapping does exist:

```
rho        = |camera.position|
rotateRate = _rotateFactor * (rho - _rotateRateRangeAdjustment)
           = (rho - R) / R                         // R = ellipsoid.maximumRadius   [EF]
           = geocentric altitude in earth radii
rotateRate = clamp(rotateRate, 1/5000, 1.77)       // _minimumRotateRate .. _maximumRotateRate
Δφ = rotateRate · (Δx_px / canvasWidth)  · 2π
Δθ = rotateRate · (Δy_px / canvasHeight) · π
camera.rotateRight(Δφ);  camera.rotateUp(Δθ)
```

Watch the clamp at `SSC.js:2061-2065`: `phiWindowRatio = Math.min(ratio, maximumMovementRatio)`
clamps only the **positive** side. A large negative delta (fast drag in the other direction) is not
clamped. Asymmetric, and it looks like an oversight rather than a design.

### 2.7 The globe-less variant (3D Tiles / photogrammetry) — screen-space pan

The first block of `pan3D` (`SSC.js:2121-2213`) is gated on `!defined(controller._globe)` _and_
`height < _minimumPickingTerrainHeight` _and_ `!movement.inertiaEnabled`. `controller._globe` is
undefined when the scene has no globe. In that case Cesium abandons ray-sphere picking and
constructs the world-space displacement directly from pixel dimensions:

```
p0 = depth-buffer pick at drag start (cached in _panLastWorldPosition between frames)
distanceToNearPlane = |proj of (p0 - eye) onto directionWC|
pixelDimensions     = frustum.getPixelDimensions(w, h, distanceToNearPlane, pixelRatio)
dragDelta           = endMouse - startMouse

right     = rightWC * (dragDelta.x * pixelDimensions.x)                  // exact 1:1 horizontally

// vertical splits between "push along the pick ray" and "slide along camera-up",
// weighted by how horizon-facing the view is:
endPickDirection = getPickRay(endMouse).direction
forward   = max(tan(angle(endPickProj, directionWC)), 0.1)               // clamp: avoid ∞
dot       = |directionWC · normalize(positionWC)|
direction = endPickDirection * ( -dragDelta.y * pixelDimensions.y * 2 / sqrt(forward) * (1 - dot) )
up        = upWC             * ( -dragDelta.y * pixelDimensions.y * (1 - |upWC · normalize(positionWC)|) )

p1 = p0 + right + direction + up
_panLastWorldPosition = p1 ; _panLastMousePosition = endMouse
```

then it falls through to the same `worldToCameraCoordinates` + `rotate(p0×p1, acos(p0·p1))`. The
`(1 - dot)` blend is the "horizon view" correction: when looking straight down, `dot≈1` so the
`direction` term vanishes and vertical drag is pure `up` translation; when looking at the horizon,
`dot≈0` so vertical drag pushes along the pick ray (moves you forward/back over the ground). This is
the sub-path skymap would want if it ever drags against a _depth-buffer_ surface rather than an
analytic sphere.

### 2.8 Strafing (camera at/below the picked surface)

`strafe` (`SSC.js:1865`): builds a plane through `strafeStartPosition` with the **camera direction**
as normal, intersects this frame's pick ray with it, and translates the camera by
`strafeStartPosition - intersection`. Pure translation, no rotation. Used when the pick is grazing
(`|ray·normal| < 0.05`) or the camera is below the picked point — i.e. the cases where a rotation
about the globe centre would be violently wrong. `continueStrafing` (`SSC.js:1267`) accumulates the
inertial delta into `_strafeEndMousePosition` so momentum works.

### 2.9 Inertia / momentum

`maintainInertia` (`SSC.js:379`) + `decay` (`SSC.js:356`) + `activateInertia` (`SSC.js:458`):

```
decay(t, coefficient) = exp(-((1 - coefficient) * 25) * t)

on each frame with no button down:
  ts, tr = button press/release times
  if (tr - ts) < 0.4 s:                              // inertiaMaxClickTimeThreshold — flicks only
      d = decay(now - tr, inertiaSpin|Translate|Zoom)   // 0.9 / 0.9 / 0.8
      motion       = 0.5 * (lastMovement.end - lastMovement.start)
      synthetic movement = { startPosition: lastMovement.start,
                             endPosition:   lastMovement.start + motion * d,
                             inertiaEnabled: true }
      if |end - start| < 0.5 px or NaN: stop
      action(controller, aggregator.getStartMousePosition(...), syntheticMovement)
```

Three details worth stealing:

- **Only flicks get inertia.** A drag held longer than 400 ms releases dead. The source comment
  admits the threshold is hardware-dependent and "should be investigated further" (`SSC.js:373-377`).
- **The synthetic movement replays the _same_ `startPosition`**, so `spin3D`'s "same drag" key still
  matches and the frozen pan sphere survives into the coast. Inertia is not a separate code path.
- **Cross-inertia suppression**: `_inertiaDisablers` (`SSC.js:301`) — zoom kills spin/translate/tilt
  inertia; tilt kills spin/translate inertia. Without this, a zoom during a coast fights the coast.
- `movement.inertiaEnabled` is also used as a _behaviour_ flag downstream: `handleZoom` treats it as
  "same start position" (`SSC.js:627-629`), and `pan3D`/`zoom3D` skip terrain picking during inertia
  (`SSC.js:2122`, `:2353`) — coasting must not stall on tile loads.

---

## 3. Zoom

`update3D` → `zoom3D` (`SSC.js:2318`) → `handleZoom` (`SSC.js:559`).

### 3.1 Two different points: the _measure_ point and the _anchor_ point

This asymmetry is easy to miss and is central to how it feels.

- **Distance measure** (`zoom3D`): ray from the **centre of the canvas**
  (`windowPosition = (w/2, h/2)`, `SSC.js:2336-2338`). If `height < _minimumPickingTerrainHeight`
  (150 km), `distance = |pickPosition(centre) - ray.origin|`; else `distance = height above
ellipsoid`. During inertia the terrain pick is skipped unless `|preIntersectionDistance| <
minimumPickingTerrainDistanceWithInertia` (4 km) — i.e. only pick when a collision is imminent.
- **Zoom anchor** (`handleZoom`): `object._zoomWorldPosition = pickPosition(startPosition)` where
  `startPosition` is the **cursor** (for `WHEEL`, `getStartMousePosition` returns the live mouse
  position). Picked **once per gesture**, re-picked whenever `startPosition` changes.

If the anchor pick fails, `_useZoomWorldPosition = false` and it degrades to plain
`camera.zoomIn(distance)` along the view vector (`SSC.js:674-677`).

### 3.2 The zoom rate law

`handleZoom` (`SSC.js:559`):

```
percentage = defined(unitPositionDotDirection)                  // = normalize(position)·direction
           ? clamp(|unitPositionDotDirection|, 0.25, 1.0) : 1.0
diff       = movement.end.y - movement.start.y
approachingSurface = diff > 0
minHeight  = approachingSurface ? minimumZoomDistance * percentage : 0
maxHeight  = maximumZoomDistance                                // default +∞

zoomRate = clamp(zoomFactor * (distanceMeasure - minHeight), _minimumZoomRate, _maximumZoomRate)
         //  zoomFactor = 5.0, min 20 m, max 5 906 376 272 000 m  ("distance from the Sun to Pluto")
rangeWindowRatio = min(diff / canvasHeight, maximumMovementRatio /* 0.1 */)
distance = zoomRate * rangeWindowRatio

// collision clamp
if distanceMeasure - distance < minHeight:  distance = distanceMeasure - minHeight - 1
if distanceMeasure - distance > maxHeight:  distance = distanceMeasure - maxHeight
if already within 1 m of either bound and pushing further: return
```

So zoom step ∝ current distance → geometric zoom, ~constant perceptual rate at every scale. The
`_maximumZoomRate` being _Sun-to-Pluto in metres_ is Cesium admitting the law has no natural ceiling.

**Zoom-in vs zoom-out asymmetry**: `minHeight` applies only when approaching (`diff > 0`); pulling
back is unclamped at the bottom. And `percentage = clamp(|position̂ · direction|, 0.25, 1)` means the
minimum-zoom floor **shrinks to 25 % when the camera is tilted toward the horizon** — you're allowed
closer to the surface when looking sideways than when looking straight down. That is a deliberate
feel choice: a horizon view at 1 m altitude is fine, a nadir view at 1 m is not.

### 3.3 Zoom-to-cursor: three regimes by altitude

Still in `handleZoom`, SCENE3D branch (`SSC.js:727-941`):

```
zoomOnVector = false
if camera.positionCartographic.height < 2 000 000:  rotatingZoom = true

if (new gesture) or rotatingZoom:
    if underground or (height < 3000 and |direction · position̂| < 0.6):
        zoomOnVector = true                                   // near-surface horizon view: no orbit
    else:
        centerPosition = pickPosition(canvas centre)
        if !centerPosition:            zoomOnVector = true    // globe doesn't cover screen centre
        elif height < 1 000 000:
            if direction · position̂ >= -0.5:  zoomOnVector = true   // not pointing down enough
            else:   → REGIME A: exact orbit-and-approach (below)
        else:       → REGIME B: rotate-toward-centre (below)
_rotatingZoom = !zoomOnVector

if zoomOnVector:  camera.move(pickRay(_zoomWorldPosition reprojected to window).direction, distance)
else:             camera.zoomIn(distance)

if !cameraUnderground:  camera.setView({orientation: {heading, pitch, roll} captured BEFORE the zoom})
```

**Regime A — `height < 1 000 000` m and looking down** (`SSC.js:762-911`). A closed-form solve that
moves the camera _and_ rotates it about the globe so the anchor point converges under the cursor.
It builds a virtual look-at `center = position + 1000·forward`, computes
`alpha = acos(-position̂ · (target-position)̂)`, then

```
gamma = asin( clamp(|positionToTarget| / |target| · sin α, -1, 1) )
delta = asin( clamp( (|position| - distance) / |target| · sin α, -1, 1) )
beta  = gamma - delta + alpha
```

and translates both the camera and the virtual centre by `remainingDistance · ((cos β - 1)·up +
sin β·forward)`, then rebuilds direction/up/right. Guard: if `alphaDot >= 0` we have _zoomed past the
target_, so it sets `object._zoomMouseStart.x = -1` (forcing a fresh anchor pick next frame) and
returns (`SSC.js:794-799`). Second guard: `if (targetNormal · positionNormal) < 0 return` — anchor is
on the far side of the globe.

**Regime B — `height >= 1 000 000` m** (`SSC.js:913-939`). Much simpler: rotate the whole camera so
the anchor slides toward the screen centre.

```
dot   = normalize(_zoomWorldPosition) · normalize(centerPosition)
angle = acosClamped(dot)
axis  = normalize(_zoomWorldPosition) × normalize(centerPosition)
denom = |angle| > 20°  ?  height * 0.75  :  height - distance
camera.rotate(axis, angle * (distance / denom))
```

i.e. per zoom step, close a fraction `distance/denom` of the angular gap between anchor and screen
centre. The 20° branch damps the correction for far-off-centre anchors so the globe doesn't lurch.

**Regime C — `zoomOnVector`** (`SSC.js:946-978`): translate along the pick ray through the anchor's
_current_ window position (recomputed each frame via `SceneTransforms.worldToWindowCoordinates`), so
the anchor stays under the cursor by construction. Used underground, in horizon views, and when the
globe doesn't cover the screen centre.

### 3.4 Zoom × tilt interaction — and where the "recenter to top-down" feel comes from

Two mechanisms, both in `handleZoom`:

1. **HPR is captured before the zoom and re-applied after it** (`SSC.js:622-626` capture,
   `:910` and `:980-982` re-apply via `camera.setView({orientation})`). Because HPR is defined in the
   ENU frame of the camera's _current_ subpoint (§1.2), and the zoom has just moved the subpoint,
   this **re-levels the camera against the new local vertical** every zoom step. A camera pitched
   -90° stays pitched -90° relative to local up as it travels around the globe; a camera at -30°
   keeps a constant 30° tilt rather than drifting toward the horizon. This is the mechanism behind
   the "it settles to top-down as you pull out" feel — combined with Regime B rotating the anchor
   toward screen centre, pulling out converges to "anchor centred, camera at its stored pitch".
   Cesium does **not** have an explicit auto-untilt-on-zoom-out (Google Earth does); the feel is
   emergent from these two.
2. **The tilt-dependent minimum-zoom floor** (`percentage`, §3.2).

Note the re-apply is skipped when `_cameraUnderground` — underground the re-levelling would fight
the user.

### 3.5 Minimum height / collision

Three thresholds, all in the `ScreenSpaceCameraController` constructor and all scaled off
`ellipsoid.minimumRadius` when the ellipsoid isn't WGS84 (`SSC.js:227-266`):

| field                                      | WGS84 default | non-WGS84         | meaning                                                     |
| ------------------------------------------ | ------------- | ----------------- | ----------------------------------------------------------- |
| `minimumPickingTerrainHeight`              | 150 000 m     | `R_min * 0.025`   | below this, pick terrain/depth instead of the ellipsoid     |
| `minimumPickingTerrainDistanceWithInertia` | 4 000 m       | `R_min * 0.00063` | pick terrain during zoom inertia only when this close       |
| `minimumCollisionTerrainHeight`            | 15 000 m      | `R_min * 0.0025`  | below this, run terrain collision                           |
| `minimumTrackBallHeight`                   | 7 500 000 m   | `R_min * 1.175`   | above this, off-globe clicks trackball instead of free-look |
| `minimumZoomDistance`                      | 1.0 m         | —                 | closest approach                                            |
| `maximumZoomDistance`                      | +∞            | —                 |                                                             |

All are also passed through `VerticalExaggeration.getHeight` each frame in `SSC.update`
(`SSC.js:3023-3037`) so they track a vertically exaggerated globe.

`adjustHeightForTerrain` (`SSC.js:2909`), run at the end of every `SSC.update` unless an action
already ran it:

```
if cartographic.height < _minimumCollisionTerrainHeight:
    globeHeight = scene.globeHeight
    target      = globeHeight + minimumZoomDistance
    percentDifference = (globeHeight - _lastGlobeHeight) / _lastGlobeHeight
    // only push the camera up when the terrain height has been STABLE across frames,
    // unless the user moved the camera this frame
    if height < target and (cameraChanged or |percentDifference| <= 0.1):
        set height = target
    if cameraChanged or |percentDifference| <= 0.1:  _lastGlobeHeight  = globeHeight
    else:                                            _lastGlobeHeight += difference * 0.1   // ease in
```

The `_lastGlobeHeight` low-pass exists because terrain tiles stream in: without it, every LOD
refinement would teleport the camera. Source comment: _"Unless the camera has been moved by user
input, to avoid big jumps during tile loads only make height updates when the globe height has been
fairly stable across several frames"_ (`SSC.js:2946-2947`). **This is the single most transferable
idea in the file for any streaming-terrain camera.**

---

## 4. Tilt

`update3D` → `tilt3D` (`SSC.js:2421`), bound to MIDDLE_DRAG / PINCH / CTRL+LEFT / CTRL+RIGHT.

### 4.1 Structure

```
tilt3D:
  if camera.transform !== IDENTITY: return              // no tilt while tracking  [see §5.3]
  if startPosition != _tiltCenterMousePosition: _tiltOnEllipsoid = false; _looking = false
  if _looking: look3D(..., geodeticSurfaceNormal(camera.position)); return
  if _tiltOnEllipsoid or height > _minimumCollisionTerrainHeight (15 km):
       tilt3DOnEllipsoid()
  else: tilt3DOnTerrain()
```

Same "sticky mode per gesture" pattern as drag: the branch is decided on frame 1 and latched via
`_tiltOnEllipsoid` / `_tiltCenterMousePosition`.

### 4.2 `tilt3DOnEllipsoid` — tilt about the screen-centre surface point

`SSC.js:2466`:

```
if height - minimumZoomDistance*0.25 - 1 < EPSILON3 and movement is downward: return   // floor
ray = getPickRay(canvas centre)                              // ← CENTRE, not the cursor
intersection = IntersectionTests.rayEllipsoid(ray, ellipsoid)
if intersection: center = Ray.getPoint(ray, intersection.start)
elif height > _minimumTrackBallHeight:
     center = grazingAltitudeLocation(ray, ellipsoid) projected to height 0    // limb view
else: _looking = true; look3D(); return

transform = eastNorthUpToFixedFrame(center)                 // [EF]
// temporarily pretend the world is a unit sphere so rotate3D's rate law is neutral:
_globe = undefined; _ellipsoid = UNIT_SPHERE; _rotateFactor = 1; _rotateRateRangeAdjustment = 1
oldTransform = camera.transform
camera._setTransform(transform)                             // camera now lives in ENU at `center`
rotate3D(controller, startPosition, movement, Cartesian3.UNIT_Z)   // orbit about local UP
camera._setTransform(oldTransform)
restore _globe/_ellipsoid/_rotateFactor/_rotateRateRangeAdjustment
```

**The whole trick is `_setTransform` to the surface point's ENU frame, then reuse the ordinary
trackball with `constrainedAxis = local UP`.** In that frame the camera's `position` is the offset
from the surface point, so `rotate3D`'s `rotateRight`/`rotateUp` become orbit-about-the-anchor —
and `rotateVertical`'s `constrainedAxis` clamping (§2.5) becomes the tilt limiter for free.

The `_ellipsoid = UNIT_SPHERE; _rotateFactor = 1` swap is necessary because `rotate3D`'s rate is
`(|position| - R)/R`; in the local frame `|position|` is the _range to the anchor_, not a geocentric
radius, so R must be neutralized to 1.

### 4.3 `tilt3DOnTerrain` — two frames, one for each axis

`SSC.js:2548`. Below 15 km, the anchor comes from `pickPosition(startPosition)` — the **cursor**,
not the centre — cached in `_tiltCenter` for the gesture. Then it builds **two** ENU frames:

- `transform` — ENU at `center` (the terrain pick), used for the **horizontal** rotation
- `verticalTransform` — ENU at `verticalCenter`, the intersection of the ray through
  `(canvasWidth/2, _tiltCenterMousePosition.y)` with the sphere of radius `|center|`, used for the
  **vertical** rotation

and applies them separately:

```
camera._setTransform(verticalTransform)
tangent = verticalCenter × camera.positionWC
if (camera.rightWC · tangent) < 0:                     // camera is on the "wrong side"
    movementDelta = movement.start.y - movement.end.y
    if (!underground and movementDelta > 0) or (underground and movementDelta < 0):
        constrainedAxis = undefined                    // "Prevent camera from flipping past the up axis"
    camera.constrainedAxis = undefined
    rotate3D(..., constrainedAxis, rotateOnlyVertical=true)
    camera.constrainedAxis = oldConstrainedAxis
else:
    rotate3D(..., constrainedAxis /* UNIT_Z */, rotateOnlyVertical=true)

camera._setTransform(transform)
rotate3D(..., constrainedAxis, rotateOnlyHorizontal=true)

// re-square up against the constrained axis:
right = direction × constrainedAxis; if (right·camera.right)<0 negate
up = right × direction; right = direction × up; normalize both
```

Splitting the two axes across two anchor points is what keeps a near-ground tilt from sliding
sideways: horizontal orbit happens about the point you grabbed, vertical orbit about the point at
the same screen height in the centre column.

Afterwards it runs `adjustHeightForTerrain` and, if that moved the camera, **rotates the orientation
by the same amount the position was pushed** (`SSC.js:2709-2739`): compute the angle/axis between
the pre-collision and post-collision positions, apply that quaternion to direction and up. Without
this, terrain collision during a tilt yanks the view.

### 4.4 Tilt limits

- **Default: none.** `this.maximumTiltAngle = undefined` (`SSC.js:284`) — "If undefined, the angle of
  the camera tilt is unrestricted." You can tilt through the horizon and underground.
- **When set**, it is a _constant_ angle relative to the ellipsoid normal, enforced inside `rotate3D`
  (`SSC.js:2070-2077`), and only on the constrained-axis path:
  `tilt = π - acos(direction · constrainedAxis) + Δθ; if tilt > max: Δθ -= tilt - max`.
- **The real, always-on limiters** are (a) the flip guard above, (b) `rotateVertical`'s
  `angleToAxis - EPSILON4` clamp (`Camera.js:2110-2121`), (c) the height floor at the top of
  `tilt3DOnEllipsoid`, (d) `adjustHeightForTerrain`.
- There is **no height-dependent tilt limit** in Cesium. Google Earth's "you can't tilt much when
  you're high up" is not implemented here.

---

## 5. Transitions and scale — does the globe-anchored frame ever release?

### 5.1 Short answer: no, not by distance

`spin3D`'s branch order (§2.2) has **no upper altitude bound on `pan3D`**. From 10 m or from
10 000 000 km, if `camera.pickEllipsoid(cursor)` succeeds, you get the 1:1 globe-anchored grab.
The `minimumTrackBallHeight` (7 500 km) threshold only decides what happens when the cursor
**misses** the globe:

- cursor hits globe → `pan3D` (anchored), at any altitude
- cursor misses, altitude > 7 500 km → `rotate3D` (trackball about the globe centre — still
  globe-anchored, just not point-anchored)
- cursor misses, altitude < 7 500 km → `look3D` (free-look; you're close to the surface and the
  sky fills much of the screen, so rotating the globe would be absurd)

So the mode ladder is driven by _what the cursor is over_, with altitude only as a tiebreak. That is
a design worth copying wholesale.

The other altitude thresholds (§3.5) switch **the source of truth for the surface**, not the control
model: above 150 km trust the analytic ellipsoid, below it trust terrain/depth-buffer picks. This
decoupling — "control model chosen by what you grabbed, surface representation chosen by altitude" —
is the cleanest idea in the file.

### 5.2 The `enableXxx` flags

`enableInputs` (master, meant for temporary suppression during flights),
`enableTranslate` (2D/Columbus only), `enableZoom`, `enableRotate` (2D/3D),
`enableTilt` (3D/Columbus), `enableLook`, `enableCollisionDetection`
(`SSC.js:44-88`, `:274`). They gate `reactToInput` calls, nothing more — there is no distance-based
auto-toggling of any of them. `enableCollisionDetection = false` additionally makes
`minimumZoomDistance`/`maximumZoomDistance` be ignored (`SSC.js:598-616`) — that is the documented
escape hatch for going underground or inside a tileset.

### 5.3 **The one real frame release: `camera.transform !== IDENTITY`** — and it is total

`SSC.update` (`SSC.js:3010`):

```
if !Matrix4.equals(camera.transform, Matrix4.IDENTITY):
    this._globe     = undefined
    this._ellipsoid = Ellipsoid.UNIT_SPHERE
else:
    this._globe     = scene.globe
    this._ellipsoid = scene.ellipsoid
```

and then `spin3D` (`SSC.js:1912`) short-circuits to `rotate3D`, `tilt3D` (`SSC.js:2425`) returns
outright, `handleZoom` skips anchor picking (`SSC.js:640-641`, "When camera transform is set, such as
tracking an entity, object.\_globe will be undefined, and no position should be picked"), and
`zoom3D` ignores picks farther than `camera.getMagnitude()` (`SSC.js:2365-2372`, added to stop zoom
snapping onto terrain _behind_ the tracked target).

**This is exactly the mechanism a rotating-Earth renderer would have to use, and Cesium's own
"view in ICRF" recipe uses it**: `Transforms.computeIcrfToFixedMatrix` docs (`Transforms.js:720-729`)
show the canonical inertial-frame example —

```js
scene.postUpdate.addEventListener(function (scene, time) {
  const icrfToFixed = Cesium.Transforms.computeIcrfToFixedMatrix(time);
  if (Cesium.defined(icrfToFixed)) {
    const offset = Cesium.Cartesian3.clone(camera.position);
    const transform = Cesium.Matrix4.fromRotationTranslation(icrfToFixed);
    camera.lookAtTransform(transform, offset);
  }
});
```

— i.e. rebind `camera.transform` every frame to the inertial rotation. **The cost is that the entire
globe-anchored control set switches off.** In Cesium's inertial view you get a trackball and nothing
else: no 1:1 drag, no tilt, no zoom-to-cursor anchor. That is the empirical answer to "what does
Cesium do when the world frame isn't Earth-fixed": _it doesn't; it degrades to a trackball._

### 5.4 Precision

- **All camera math is plain JavaScript doubles.** `Cartesian3` is `{x, y, z}` of JS numbers;
  `Matrix4` is a 16-element `Array`/`Float64Array` of doubles. No RTC, no split-double, no
  fixed-point anywhere in `Camera.js` or `ScreenSpaceCameraController.js`.
- That is sufficient for ECEF: |position| ~ 6.4e6 m, double relative precision ~2.2e-16 → absolute
  resolution ~1.4e-9 m. Sub-nanometre at the Earth's surface. Cesium never needed CPU-side RTC for
  Earth-scale.
- **The precision work is entirely GPU-side**: positions are split high/low into
  `Core/EncodedCartesian3.js` and the shaders use `czm_translateRelativeToEye` /
  `czm_modelViewRelativeToEye` (GPU relative-to-eye), described in
  <https://cesium.com/blog/2015/05/26/graphics-tech-in-cesium-stack> (citing Ohlarik's
  "Precisions, Precisions"). The camera feeds the eye position; the encoding happens per-vertex.
- Numerical hygiene in the camera math is instead about _degenerate geometry_, not magnitude:
  `acosClamped` everywhere, `EPSILON2` parallel tests, `EPSILON14` zero-axis tests,
  `max(tan(angle), 0.1)`, `clamp(..., -1, 1)` before every `asin`.
- The one magnitude-flavoured constant is `_maximumZoomRate = 5 906 376 272 000.0` — Sun-to-Pluto in
  metres (`SSC.js:351`). Cesium's camera is explicitly expected to work out to solar-system range.

---

## 6. Landmines and hard-won lessons

Evidence here is from source comments + guard code; the issue-tracker sweep is summarized where it
corroborates. Every item below is a place where the obvious implementation is known to be wrong.

### 6.1 Modal stickiness per gesture is not optional

`_looking`, `_rotating`, `_strafing`, `_tiltOnEllipsoid`, `_tiltCVOffMap` are all latched on the
first frame of a gesture and only cleared when `startPosition` changes (`SSC.js:1922-1947`,
`:2433-2436`, `:1413-1416`). Re-deciding the mode mid-drag makes the camera oscillate between
pan and trackball at the limb. Copy the latch.

### 6.2 The picked anchor must be frozen, and the surface it lives on must be a _sphere_

`spin3D` freezes `|_rotateStartPosition|` and builds
`Ellipsoid.fromCartesian3(r, r, r)` for every subsequent frame (`SSC.js:1937-1941`, `:1991-1994`).
Re-picking terrain each frame would jitter with tile loads; picking against the true oblate
ellipsoid each frame would make the anchor slide (the pick point is at terrain height, not at
ellipsoid height). A sphere through the anchor is the only surface that keeps the grab exact.

### 6.3 The camera must not fall below the pan sphere

`if |camera.position| < |_rotateStartPosition| return` (`SSC.js:1930-1936`) — otherwise the
ray-sphere pick flips to the far intersection and the drag inverts.

### 6.4 Grazing picks must strafe, not rotate

`tangentPick = |ray.direction · surfaceNormal| < 0.05` → strafe (`SSC.js:1972-1982`). At grazing
incidence a 1-pixel cursor move maps to a kilometres-long surface move; rotating by that is a
teleport. The same guard appears as `|direction · position̂| < 0.6` at `height < 3000` in
`handleZoom` (`SSC.js:735-738`) and `direction · position̂ >= -0.5` at `SSC.js:760`.

### 6.5 Streaming terrain will teleport the camera unless you low-pass the ground height

`adjustHeightForTerrain`'s `_lastGlobeHeight` / `percentDifference <= 0.1` logic, with its explicit
source comment (`SSC.js:2938-2966`). Also `cameraChanged` is threaded in so _user-driven_ motion
bypasses the smoothing — the smoothing exists only to reject _data-driven_ height changes.

### 6.6 Terrain collision during tilt must rotate the view too

`SSC.js:2709-2739` (and the identical block in `rotateCVOnTerrain`, `:1680-1714`): after
`adjustHeightForTerrain` moves the camera, apply the same angle/axis rotation to `direction`/`up`.
Otherwise the view jerks whenever you tilt into a hill.

### 6.7 Zoom can overshoot its anchor, and must then re-pick

`if alphaDot >= 0: object._zoomMouseStart.x = -1; return` (`SSC.js:794-799`), with the comment
_"We zoomed past the target, and this zoom is not valid anymore. This line causes the next zoom
movement to pick a new starting point."_ Setting the identity key to an impossible pixel is how
Cesium forces a fresh anchor.

### 6.8 Tilt flips past vertical unless explicitly guarded

Two independent guards: the `dot < 0` + `movementDelta` sign test that drops `constrainedAxis`
(`SSC.js:2648-2656`, comment _"Prevent camera from flipping past the up axis"_), and
`rotateVertical`'s `angleToAxis - EPSILON4` clamp (`Camera.js:2110-2121`) with `northParallel` /
`southParallel` special cases. `look3D` has a third copy of the same clamp (`SSC.js:2840-2867`).
Three copies of "don't cross the pole axis" in two files is a smell, but the underlying lesson is
real.

### 6.9 Heading is undefined looking straight down — fall back to `up`

`getHeading` (`Camera.js:818`). The globe's _default_ view is straight down, so this is not an edge
case, it's the common case. Any camera that stores heading rather than deriving it has to solve this
at write time instead.

### 6.10 Inertia must not run terrain picks, and must not fight other inertias

`movement.inertiaEnabled` gates out picking in `pan3D` (`SSC.js:2122`) and `zoom3D`
(`SSC.js:2349-2355`); `_inertiaDisablers` (`SSC.js:299-311`) cross-cancels. Also the 400 ms
click-threshold with its "probably dependent on the browser and/or the hardware, should be
investigated further" admission (`SSC.js:373-377`).

### 6.11 Pick has two sources and they disagree

`pickPosition` (`SSC.js:1145`) races a **depth-buffer** pick (`scene.pickPositionWorldCoordinates`)
against a **ray/globe** pick (`globe.pickWorldCoordinates`) and takes **the nearer**. Neither alone
is right: the depth buffer sees 3D Tiles and models the globe pick misses; the ray pick works where
depth is unavailable or the fragment wasn't rendered. `cullBackFaces = !_cameraUnderground`.

### 6.12 `NaN` guards on the way in

`setView3D` throws on NaN position components (`Camera.js:1270-1272`),
`localFrameToFixedFrameGenerator` throws on NaN origin (`Transforms.js:129-131`), and
`maintainInertia` bails on NaN end positions produced by the decay underflowing
(`SSC.js:438-449`). All three were clearly added after the fact.

### 6.13 Issue-tracker provenance for the guards above

Sourced from a parallel sweep of the Cesium tracker + `CHANGES.md`. Items marked _(medium
confidence)_ were reported but not re-verified against the PR diff.

| Guard in source                                                                  | Origin                                                                                                                                                                                        | Failure mode it fixes                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `minimumPickingTerrainHeight` (150 km) + `minimumCollisionTerrainHeight` (15 km) | commit `2a2dbc207` (2014-06-10, collision originally 10 km)                                                                                                                                   | pre-PR-workflow; **no motivating issue exists**. These are tuning constants, not hard-won values.                                                                                                                                                                                                            |
| `minimumTrackBallHeight` (7 500 km)                                              | commit `4f69cd4e3` (2014-07-23), _"Add look when close to the ground and the sky is clicked"_                                                                                                 | clicking sky near the ground rotated the globe instead of looking around                                                                                                                                                                                                                                     |
| `minimumPickingTerrainDistanceWithInertia` (4 km) + `preIntersectionDistance`    | [#11107](https://github.com/CesiumGS/cesium/issues/11107) → [PR #11108](https://github.com/CesiumGS/cesium/pull/11108) (2023)                                                                 | fast **inertia** zoom tunnelled through tall 3D Tiles. The old gate was absolute height (`< 50 m`); the fix changed the "about to collide" signal to **the previous frame's pick distance**. Directly relevant to skymap: an altitude gate cannot predict a collision, a closing-distance gate can.          |
| `_lastGlobeHeight` EMA / `percentDifference <= 0.1`                              | [#11824](https://github.com/CesiumGS/cesium/issues/11824) → [PR #11837](https://github.com/CesiumGS/cesium/pull/11837), v1.115                                                                | camera jumped as terrain LOD refined. Author: _"we only adjust the camera when the height is fairly stable between frames (no greater than 10% change)… When the camera moves though, we use what was the previous behavior regardless."_ A stuck-underground-near-cliffs edge case was knowingly left open. |
| `alphaDot >= 0` early return (§6.7)                                              | `52ce5ca` / [PR #4967](https://github.com/CesiumGS/cesium/pull/4967), _"Emergency brakes for runaway camera zoom"_, v1.31 (2017)                                                              | crossing the target's tangent plane made the arc math flip the camera to the far side of the globe                                                                                                                                                                                                           |
| `_zoomMouseStart.x = -1` sentinel (§6.7)                                         | `726bba3` / [PR #4982](https://github.com/CesiumGS/cesium/pull/4982), _"Auto-reset the zoom after zooming past a target"_, v1.31                                                              | same family; forces a fresh anchor pick                                                                                                                                                                                                                                                                      |
| `direction · position̂ >= -0.5` (120°) gate under 1 000 km                        | [PR #9126](https://github.com/CesiumGS/cesium/pull/9126) (2020), _"zoom stuck when looking up"_                                                                                               | the arc-rotate zoom math assumes a downward-looking camera; looking up froze zoom. 90° is the theoretically correct bound but _"doesn't behave well when parallel to the earth surface"_ — 120° chosen empirically. This is the source comment at `SSC.js:756-759`.                                          |
| `minHeight = approachingSurface ? … : 0` (§3.2)                                  | [PR #9932](https://github.com/CesiumGS/cesium/pull/9932)                                                                                                                                      | `minHeight` was being subtracted from the zoom-rate distance in **both** directions, so after hitting `minimumZoomDistance` zooming _out_ was also crushed to a crawl. The `diff > 0` asymmetry is the fix, not an accident.                                                                                 |
| `camera.setView({orientation: HPR captured pre-zoom})` (§3.4)                    | [#4639](https://github.com/CesiumGS/cesium/issues/4639) → [PR #5603](https://github.com/CesiumGS/cesium/pull/5603), v1.38; changelog: _"Zoom now maintains camera heading, pitch, and roll."_ | zoom-to-cursor was **tilting Earth's rotation axis on screen**, worse the further the cursor from centre. _(medium confidence on mechanism)_                                                                                                                                                                 |
| the 2 000 000 m `rotatingZoom` threshold                                         | commit `71683d6` (2016), _"added zoom algorithm that better maintains target point in 3D"_                                                                                                    | **no bug attached** — original tuning constant                                                                                                                                                                                                                                                               |

Orthographic zoom is a recurring casualty of the same code
([PR #12483](https://github.com/CesiumGS/cesium/pull/12483) removed a divergent ortho-only branch that
always zoomed to screen centre; [#12487](https://github.com/CesiumGS/cesium/pull/12487) fixed ortho
zoom at `pixelRatio !== 1`; older #11206, #8853). skymap has no ortho globe path — one fewer
parallel site.

### 6.14 Cesium itself has declared this file unmaintainable

[#13473 — "Extensible camera controller architecture"](https://github.com/CesiumGS/cesium/issues/13473)
is an open Cesium issue proposing to replace the monolith:

> "CesiumJS currently contains most camera navigation behavior in `ScreenSpaceCameraController.js`."
> … "Has become increasingly difficult to extend, reason about, and maintain" … "Build a more
> composable camera navigation architecture for CesiumJS." … "A generic camera controller interface
> would allow targeted controller implementations to be defined independently from one another."
> … "Rather than immediately mutating camera state during input events, controllers may aggregate
> input state and apply updates during the render/update loop."

Two things skymap should take from this. First, **the algorithms are worth copying and the
architecture is not** — that is Cesium's own position. Second, the proposed fix — _aggregate input
state, apply during update_ — is the shape skymap should start with rather than arrive at:
`spin3D`/`tilt3D`/`handleZoom` mutate `camera.position`/`direction`/`up` directly, mid-input, which
is exactly what makes the five mode flags and the `_setTransform` save/restore dance necessary. A
controller that emits a _desired pose delta_ and lets one place apply it needs none of that. This
also happens to be the natural place to put the Earth-fixed → world frame conversion (§"where the
globe doesn't move is hiding"), and the natural place to merge SpaceMouse 6-DoF deltas with mouse
gestures.

A reviewer on [PR #12999](https://github.com/CesiumGS/cesium/pull/12999) accepted a fix as a
deliberate "spot patch" on the grounds that the file's ~3 000 lines of undocumented state make it
impossible to reason about holistically. _(medium confidence — quoted second-hand.)_

### 6.15 Asymmetric movement clamp

`phiWindowRatio = Math.min(ratio, maximumMovementRatio)` and the same for theta
(`SSC.js:2061-2065`) and for `rangeWindowRatio` (`SSC.js:594-595`) clamp only the positive side.
Fast drags/zooms in the negative direction are unclamped. If skymap copies the rate-limiter, clamp
the magnitude.

---

## What skymap should copy / should NOT copy

skymap's constraints that differ from Cesium's: world units are Mpc across solar-system→galaxy
scales; **Earth rotates in the world frame** (Cesium's world frame is ECEF and the globe is nailed
to it); input includes a 6-DoF SpaceMouse.

### First: where "the globe doesn't move" is hiding

Every one of these is a place Cesium silently assumes the Earth is static in world coordinates.
Flagged **[EF]** above; consolidated here because this is the load-bearing difference.

1. **`Transforms.eastNorthUpToFixedFrame` hardcodes the ECEF Z axis as the polar axis**
   (`east = normalize(-y, x, 0)`, `Transforms.js:206-208`). Every ENU frame in the codebase — the
   heading/pitch/roll getters, `setView3D`, `lookAt`, `tilt3DOnEllipsoid`, `tilt3DOnTerrain`,
   `rotateCVOnPlane`, `rotateCVOnTerrain` — is built from this function. skymap must replace it with
   `enuFromEarthOrientation(worldPoint, earthRotationAtTime)`, and every call site must pass a time.
2. **`camera.heading/pitch/roll` are frame-relative but _time-independent_**
   (`Camera.js:994-1078`). Read the heading at t and again at t+Δt with the camera untouched and
   Cesium returns the same number; on a rotating Earth it must change. Any code that _stores_ an HPR
   and re-applies it later (which `handleZoom` does every zoom step, `SSC.js:622-626` / `:980-982`)
   is storing a value whose meaning drifts. skymap must decide explicitly whether stored HPR is
   "frozen in the Earth-fixed frame" (co-rotating; correct for a surface camera) or "frozen in the
   world frame" — and say so at every store/restore site.
3. **`camera.rotate(axis, angle)` rotates about the _world origin_** (`Camera.js:2042`) and the whole
   `pan3D` result assumes the globe centre is at the origin _and stationary_. On a rotating Earth
   the centre is still stationary (Earth spins, it doesn't translate), so `rotate` survives — but
   only if skymap's world origin coincides with the Earth's centre while the surface camera is
   active. If skymap's origin is the Sun or the galactic centre, `rotate` is simply wrong and must
   become "rotate about the Earth's centre" explicitly.
4. **`|camera.position|` is used as "altitude proxy" in three rate laws** — `rotate3D`'s
   `(rho - R)/R` (`SSC.js:2045-2047`), `spin3D`'s below-the-sphere test (`:1930`), `tilt3DOnTerrain`'s
   `|ray.origin| > mag` near/far intersection choice (`:2612-2615`). All assume Earth-centred world
   coordinates.
5. **The anchor is stored as a world-space `Cartesian3`** (`_rotateStartPosition`, `_tiltCenter`,
   `_zoomWorldPosition`, `_strafeStartPosition`, `_panLastWorldPosition`). On a rotating Earth these
   go stale within a frame. **They must be stored in the Earth-fixed frame** (lat/lon/height, or an
   ECEF-equivalent vector) and re-projected to world each frame. This is the single highest-risk
   port: a drag that lasts 2 s at 15°/hr moves the anchor ~125 m at the equator — small, but a tilt
   or a paused inertia coast makes it visible, and at 1:1 grab precision any drift reads as slip.
6. **Inertia replays a synthetic mouse movement against a frozen sphere** (`maintainInertia`,
   `SSC.js:379`). On a rotating Earth the coast must either co-rotate (anchor fixed to the ground) or
   not (anchor fixed in inertial space) — Cesium has no opinion because the question can't arise.
   Pick one and write it down.
7. **`adjustHeightForTerrain` compares `cartographic.height` to a globe height** — cartographic
   coordinates only exist relative to the Earth-fixed frame, so this whole function must run in the
   co-rotating frame, not the world frame.

The clean structural answer, and Cesium hands it to you: **do the drag/tilt/zoom math entirely in the
Earth-fixed frame, and convert to world only at the end.** That is literally what `_setTransform` is
for — Cesium already round-trips through a local frame for tilt and for the HPR getters. skymap's
version is "`_setTransform(earthFixedToWorld(t))` for the duration of the input handler". Note that
Cesium's own inertial-frame recipe does the opposite (rebind `camera.transform` to ICRF) and
consequently _loses_ every anchored control (§5.3) — that is the failure mode to avoid, not the model
to follow.

### Copy

- **The `p0 × p1` drag rotation** (`pan3D`, `SSC.js:2229-2242`). Ray-cast the drag-start pixel and
  drag-end pixel against a sphere frozen at drag start; rotate by `acos(p0·p1)` about `p0 × p1`.
  This _is_ the fix for skymap's `cos(latitude)` bug: there is no latitude in the formula. It is
  ~8 lines, pole-free, exact, and identical at every latitude. **Do not** port the `constrainedAxis`
  branch — that branch is skymap's current bug, preserved in Cesium as a legacy path.
- **Freeze the anchor sphere at drag start** (§2.3), and re-pick both endpoints against it every
  frame rather than tracking a single point.
- **Sticky per-gesture mode latching** (§6.1) — decide pan/trackball/strafe/look once, keep it.
- **Mode chosen by what the cursor hit, altitude only as tiebreak** (§5.1). This gives you a
  controller with no "zoom level" state machine, which matters enormously across skymap's scale range.
- **Grazing-pick → strafe instead of rotate** (§6.4), with the `|ray·normal| < 0.05` test.
- **Geometric zoom rate `∝ distance`, with a tilt-scaled minimum floor** (§3.2). The
  `clamp(|position̂·direction|, 0.25, 1)` trick is a cheap, good feel decision.
- **Distance measure from screen centre, anchor from the cursor** (§3.1) — separating these is why
  Cesium's zoom neither lurches nor loses the anchor.
- **Re-apply captured HPR after every zoom step** (§3.4) — this is the "recenter to top-down" feel,
  and it costs nothing. In skymap it must be HPR in the _co-rotating_ ENU frame.
- **Low-pass the ground height before letting it move the camera**, with a user-input bypass (§6.5).
  skymap's virtual-texture / tile-streaming Earth has exactly this problem.
- **Rotate the orientation by the same amount collision moved the position** (§6.6).
- **`_setTransform`-style scoped frame changes** as the general tool for "do this math in a local
  frame" (§4.2). Cheap, and it makes the rotating-Earth port mechanical rather than invasive.
- **Inertia: flick-only (≤400 ms), replay a synthetic movement through the same action, cross-cancel
  between gesture types** (§2.9).

### Do NOT copy

- **The `constrainedAxis` spherical-decomposition drag path** (`SSC.js:2243-2310`). Screen-x → Δφ
  about a fixed axis, screen-y → Δθ. It needs a three-case sign analysis to survive crossing the
  axis, it degenerates at the poles, and it is the source of the `cos(latitude)` family of bugs.
  Cesium keeps it only for the tilt trick, where the "pole" is the local up and the camera is never
  near it.
- **The `handleZoom` SCENE3D block as written** (`SSC.js:679-978`, ~300 lines). Three regimes,
  altitude thresholds at 3 000 / 1 000 000 / 2 000 000 m, a closed-form α/β/γ/δ solve, and mutually
  entangled `zoomingOnVector` / `rotatingZoom` / `_useZoomWorldPosition` flags. The _ideas_ are good
  (§3.3); the code is a decade of patches. skymap should implement one regime — Regime C
  (`zoomOnVector`: move along the ray through the anchor's current window position) — which is exact,
  ~15 lines, works at every altitude and every tilt, and needs no thresholds. Add Regime B's
  rotate-toward-centre only if the "settles to top-down" feel is missing.
- **The three altitude constants as absolute metres.** 150 km / 15 km / 7 500 km are WGS84 numbers
  with `R_min * k` fallbacks bolted on later (`SSC.js:227-266`). skymap works in Mpc across many
  bodies; express every threshold as a fraction of the body's radius from the start.
- **Reading `camera.heading` on a hot path.** Each read does two `_setTransform` calls, i.e. two
  matrix inversions plus a full `updateMembers` (`Camera.js:994`). `handleZoom` reads all three every
  zoom frame. Derive HPR once and pass it down.
- **`_looking`/`_rotating`/`_strafing`/`_tiltOnEllipsoid`/`_tiltCVOffMap` as five parallel booleans.**
  This is a gesture state machine spelled as flags; it needs the mutually-exclusive invariant
  maintained by hand at four sites. Make it one `gestureMode` union.
- **Columbus View / SCENE2D.** Roughly a third of `SSC.js` is CV/2D variants (`translateCV`,
  `rotateCV`, `zoomCV`, `twist2D`, `translate2D`, and the `Cartesian3.fromElements(y, z, x, …)` axis
  shuffles that pervade them). skymap has no map projection mode; skip all of it, and skip the
  `_maxCoord`/`onMap()`/bounce-tween machinery that goes with it.
- **`maximumTiltAngle` as a constant.** Cesium's default is "unrestricted" and the real limits are
  emergent. If skymap wants a Google-Maps feel it needs a _height-dependent_ tilt limit, which Cesium
  does not have — don't look here for it.
- **The whole file's structure.** `ScreenSpaceCameraController.js` is 3 110 lines with ~60
  module-level `scratch*` singletons for GC avoidance; `pan3D` alone touches 10 of them. That
  pattern predates modern JS engines and is a large part of why the file is unreadable. skymap
  should use ordinary values. **Cesium agrees** — see §6.14 (#13473): they are proposing to replace
  it, and the replacement's core idea (controllers _aggregate input and emit a delta_, one place
  applies it during update, instead of mutating camera vectors mid-event) is what skymap should
  start from. It dissolves the five mode flags, the `_setTransform` save/restore dance, and gives
  the Earth-fixed→world conversion and the SpaceMouse 6-DoF stream one obvious home each.

### The one thing to design before writing any code

Decide **which frame the camera's authoritative pose lives in** while the surface camera is active:
Earth-fixed (co-rotating) or world/inertial. Cesium never has to answer this and therefore gives no
guidance. Everything in §"where the globe doesn't move is hiding" follows mechanically once it is
answered — anchors, stored HPR, inertia, collision, and the SpaceMouse's 6-DoF deltas (which arrive
in _camera_ space and so need the same frame decision at their integration point). Answering it late
means finding the answer seven times, inconsistently.
