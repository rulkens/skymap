# Secondary references: globe camera pivot (Google-Maps-style)

Research for a Google-Maps-style globe camera pivot in skymap. Read-only web research,
2026-08-24. Every claim below is cited to spec text, source file, or doc URL fetched
during this session.

---

## 1. KML `<LookAt>` / `<Camera>` — the OGC/Google Earth camera model

Source: Google KML Reference, the de-facto canonical write-up of the OGC KML 2.3
camera model (`developers.google.com/kml/documentation/kmlreference#lookat` and
`#camera`, fetched 2026-08-24).

### `<LookAt>` — target-anchored ("look at a point")

| field          | type/units        | range                                                       | semantics                                                                                                                                                                                          |
| -------------- | ----------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `longitude`    | degrees, angle180 | −180..180                                                   | of the **target** point                                                                                                                                                                            |
| `latitude`     | degrees, angle90  | −90..90                                                     | of the **target** point                                                                                                                                                                            |
| `altitude`     | meters            | any                                                         | target point's height, interpreted per `altitudeMode`                                                                                                                                              |
| `heading`      | degrees           | 0..360, default 0 (true North)                              | direction the camera looks, azimuth                                                                                                                                                                |
| `tilt`         | degrees           | 0..180, default 0 (straight down)                           | rotation around the local X axis                                                                                                                                                                   |
| `range`        | meters            | any positive                                                | **distance from the target point to the camera** — this is the field that replaces `<roll>`; there is no roll in LookAt because the camera is fully constrained by target + range + heading + tilt |
| `altitudeMode` | enum              | `clampToGround` (default) / `relativeToGround` / `absolute` | how `altitude` is interpreted                                                                                                                                                                      |

`LookAt` parameterizes the viewpoint **in terms of what is being viewed** — you specify
the subject (lon/lat/alt) and the camera is derived by walking `range` meters back
along the reverse of the view direction implied by `heading`/`tilt`.

### `<Camera>` — eye-anchored (free camera)

| field       | type/units  | range                                                      | semantics                                                  |
| ----------- | ----------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `longitude` | angle180    | −180..180                                                  | of the **eye point** itself                                |
| `latitude`  | angle90     | −90..90                                                    | of the **eye point** itself                                |
| `altitude`  | meters      | any                                                        | of the **eye point**, per `altitudeMode`/`gx:altitudeMode` |
| `heading`   | angle360    | 0..360, default 0                                          | azimuth of the camera                                      |
| `tilt`      | anglepos180 | 0..180 (values >90 point up into the sky; clamped at +180) | rotation around local X axis                               |
| `roll`      | angle180    | −180..+180                                                 | rotation around local Z axis (bank)                        |

`Camera` parameterizes the viewpoint **in terms of the viewer's position and
orientation** — there is no implicit target point; roll (bank) is meaningful because
the camera is a free 6-DOF rigid body, whereas `LookAt` has no roll because the "up"
vector is implicitly derived from tilt/heading around the look-at target.

**Composition order (load-bearing for reimplementation).** The spec gives an explicit
transform sequence for `<Camera>`, applied to a camera initially at the eye's local
ENU frame:

1. **altitude** — translate along local Z to the given altitude
2. **heading** — rotate around Z (yaw, azimuth)
3. **tilt** — rotate around X (pitch, using the _already-yawed_ frame)
4. **roll** — rotate around Z **again** (bank, in the twice-rotated frame)

This is a classic intrinsic Z-X-Z (yaw–pitch–bank) Euler sequence evaluated in the
camera's **local ENU tangent frame at the eye point**, not a single global rotation —
i.e. heading/tilt/roll are not applied about fixed world axes, they are applied about
the camera's own rotating axes at each step, which is why the order matters and why
`tilt` rotates about "the X axis" post-heading rather than a fixed globe axis.

**Mutual exclusivity.** The spec explicitly says a `<Camera>` and `<LookAt>` are not
used on the same Feature simultaneously — they are alternative parameterizations of
the same one-camera model, convertible into each other given a target distance
(`range` ⇄ eye position along the tilt/heading ray).

---

## 2. MapLibre GL JS — globe projection camera

Source: `maplibre/maplibre-gl-js` GitHub repo, `main` branch, fetched 2026-08-24
(`developer-guides/globe.md`, `src/geo/projection/{globe_transform,globe_camera_helper,
vertical_perspective_camera_helper,vertical_perspective_transform,globe_utils,
globe_projection,mercator_transform,vertical_perspective_projection}.ts`).

**Architecture note (current, post-refactor):** what used to be a monolithic
`GlobeTransform` is now a _facade_. `GlobeTransform` / `GlobeCameraHelper` delegate to
either `MercatorTransform`/`MercatorCameraHelper` or **`VerticalPerspectiveTransform`**/
`VerticalPerspectiveCameraHelper` depending on an internal `isGlobeRendering` /
`useGlobeRendering` flag. The actual sphere-camera math for "globe mode" lives in the
`vertical_perspective_*` files and in `globe_utils.ts`, not in `globe_transform.ts`
itself — a naming trap if searching only for "globe" symbols.

### (a) Drag-pan: keeping the grabbed point under the cursor

`VerticalPerspectiveCameraHelper.handleMapControlsPan` (`src/geo/projection/
vertical_perspective_camera_helper.ts`) does not map screen-pixel deltas to
lon/lat deltas at all. It calls:

```ts
handleMapControlsPan(deltas: MapControlsDeltas, tr: ITransform, preZoomAroundLoc: LngLat): void {
    if (!deltas.panDelta) { return; }
    const anchor = tr.isPointOnMapSurface(deltas.around) ? deltas.around : tr.centerPoint;
    versorSetLocationAtPoint(tr, preZoomAroundLoc, anchor, deltas.panDelta);
}
```

The real rotation math is `versorSetLocationAtPoint` in `src/geo/projection/
globe_utils.ts`. It:

1. Converts both the **currently grabbed lon/lat** and the **cursor's current
   screen-projected surface point** to unit surface vectors via
   `angularCoordinatesToSurfaceVector`.
2. Builds the rotation **axis** as their cross product:
   `w = vec3.cross(vecToTarget, vecToPixelCurrent)` — i.e. the axis perpendicular to
   both vectors, which is the shortest-arc rotation axis between "where the grabbed
   point currently is" and "where it needs to be to sit under the cursor."
3. Builds the rotation **angle** from their dot product:
   `t = acos(clamp(dot(vecToTarget, vecToPixelCurrent), -1, 1)) / 2`.
4. Assembles a quaternion (`versor`) `delta = (w.y/l·s, -w.x/l·s, w.z/l·s, cos t)`
   with `s = sin(t)`, and **composes it with the globe's current orientation
   quaternion** (globe orientation, not camera Euler angles, is the state that
   actually gets mutated frame to frame).

This is the key non-obvious design point: **the globe's orientation is quaternion
state**, and drag-pan is "solve the quaternion that rotates point A to point B,"
not "convert a screen delta to a lat/lon delta." This is what makes the grabbed
point track exactly under the cursor at any bearing/tilt and at any latitude,
including across the poles, without gimbal lock.

**Pole/high-latitude handling.** `globe_utils.ts` has a `fixedBearingLongitude`
helper used when the drag anchor is very close to a pole: within roughly the last
~12° of latitude, the cursor's motion is reinterpreted as **turning a dial around
the pole** (an angular sweep) rather than a normal swing rotation, via a smoothstep
blend between the two behaviors. This avoids the singularity a naive lat/lon-delta
approach would hit at the poles.

**Empty-space drag and pole-crossing consistency (changelog cross-check,
`CHANGELOG.md` on `main`):** two related, dated bug fixes confirm the versor
approach was hardened after users found problems: (1) dragging the globe from empty
space around the sphere used to barely move the map, often in the wrong direction —
fixed; (2) panning near/across the poles used to invert or stall — fixed by "rotating
the globe with a versor, keeping the drag direction consistent at every latitude,"
and panning now eases off approaching the visible edge of the globe (the horizon)
instead of hard-stopping. Bearing is explicitly preserved through all of this.

### (b) Zoom-to-cursor on the sphere

`VerticalPerspectiveCameraHelper.handleMapControlsRollPitchBearingZoom` computes an
**exact** solve via `tr.setLocationAtPoint(zoomLoc, zoomPixel)` (same
`versorSetLocationAtPoint`-backed method used for pan) but blends it against a
cheaper **heuristic** center:

```ts
const factor = (1.0 - zoomScale(-actualZoomDelta)) * slowingFactor;
const heuristicCenter = new LngLat(
  tr.center.lng + dLng * factor,
  clamp(tr.center.lat + dLat * factor, -MAX_VALID_LATITUDE, MAX_VALID_LATITUDE),
);
```

then interpolates between the exact and heuristic centers based on longitude
distance and proximity to the horizon. The developer guide states the reason
explicitly: exact "point stays under cursor" zoom is only guaranteed to have a
solution when the target is on the visible hemisphere; near poles or when zooming
toward a point "behind" the globe (over the horizon, e.g. the antipodal side while
looking at a pole), no exact rotation exists, so the implementation **fades to an
approximation** rather than erroring or snapping. `getZoomAdjustment(oldLat,
newLat)` (in `globe_utils.ts`) additionally corrects the zoom level itself after any
lat change, because the sphere's apparent circumference at a given camera distance
varies with `cos(latitude)` (`planetScaleAtLatitude`) — a pure-mercator zoom number
does not mean the same visual scale at all latitudes on a globe, so panning alone
(no explicit zoom change) still nudges the stored zoom value to keep apparent
on-screen scale constant.

### (c) Globe ↔ mercator transition at high zoom

Two independent, seemingly-conflicting data points surfaced, both worth keeping:

1. **Developer guide (`developer-guides/globe.md`, current `main`):** "globe
   projection automatically switches to mercator projection around zoom level 12" —
   framed as an optimization, since "globe and mercator projections converge at high
   zoom levels" (curvature becomes imperceptible), and this swap is described as
   happening in the **shader's projection function**, controlled by a **`globeness`**
   parameter passed from the transform, blended smoothly/animated rather than a hard
   cut.
2. **Shared lineage with mapbox-gl-js:** a mapbox-gl-js issue (#12100, symbol-flicker
   bug report) cites `src/geo/projection/globe_util.js` exporting
   `GLOBE_ZOOM_THRESHOLD_MIN = 5` and a paired `..._MAX` (observed transition window
   ~zoom 5.99→6.01 in that report), i.e. the _visual curvature fade_ runs over a much
   lower zoom band (~5–6) than the "12" figure above.

These are plausibly describing **two different switches**: a low-zoom (~5–6)
shader-level curvature fade (`globeness` 1→0, this is the one visible to the user as
the globe "flattening out"), and a higher-zoom (~12) switch of the **underlying
transform implementation** from `VerticalPerspectiveTransform` to `MercatorTransform`
for numerical-precision/perf reasons once curvature is already visually zero. I could
not find the exact current-`main` constant/threshold definition for either number by
direct file search (`globe_transform.ts`, `globe_utils.ts`, `mercator_transform.ts`,
`vertical_perspective_projection.ts`, `globe_projection.ts` were all checked and none
contain a `ZOOM_THRESHOLD`-named constant as of this session) — flagging this as
**not independently confirmed in current source**, only in the developer guide prose
and in an mapbox-gl-js issue against the shared-ancestor constant name. Does the
camera model itself change across this transition? Based on the architecture
(`GlobeTransform` delegates to two entirely different transform classes,
`MercatorTransform` vs `VerticalPerspectiveTransform`, each with its own projection
matrix construction), **yes** — it is not the same camera math re-parameterized, it
is a literal implementation swap, hidden behind a shared `ITransform` interface and
masked visually by the `globeness` shader blend so the user never sees a seam.

---

## 3. Google Maps JavaScript API — vector map camera

Source: `developers.google.com/maps/documentation/javascript/vector-map` and
`.../javascript/reference/map` (fetched 2026-08-24). Public docs only.

**Camera params** (`CameraOptions`, and the parallel `Map` getter/setter pairs):
`center` (LatLng/LatLngLiteral), `zoom` (number, fractional supported on vector maps
via `isFractionalZoomEnabled`), `heading` (degrees from true North), `tilt` (degrees,
angle of incidence). `map.moveCamera(cameraOptions)` sets any subset of these at once,
immediately, without animation — the documented example:

```js
map.moveCamera({
  center: new google.maps.LatLng(37.7893719, -122.3942),
  zoom: 16,
  heading: 320,
  tilt: 47.5,
});
```

**User interaction gating:** tilt/heading gestures (shift+drag, shift+arrow-keys) are
only live when `tiltInteractionEnabled` / `headingInteractionEnabled` are set (or
enabled via Cloud Console); `<gmp-map>` custom-element maps default both to on.

**Tilt clamp vs. zoom — documented behavior, undocumented curve.** The docs state
plainly: _"the range of angles that can be used varies with the current zoom level...
[and] values outside this range are clamped to the allowed range."_ `setTilt()`
"restricts the maximum tilt based on the current map zoom level" and `getTilt()`
"returns the current tilt angle, not [necessarily] the value set by `setTilt`" (i.e.
set-then-get is not guaranteed idempotent — the API can silently re-clamp). **No
numeric table or formula for max-tilt-per-zoom is published anywhere in the public
docs** — this is confirmed as an intentional documentation gap, not an omission I
failed to find: the reference page states the restriction exists but gives no
parameters, and no other Google-published page (webgl overview, vector-map guide,
webgl-tilt-rotation example) supplies the curve either. This is the one area of the
three where the **implementation is explicitly undocumented internal behavior** —
skymap's pivot should treat "max tilt shrinks as you zoom out" as a qualitative
product requirement to reverse-engineer/tune by feel, not a formula to port.

**Auto-reset behavior:** `fitBounds()` and `panToBounds()` both **reset tilt and
heading to zero** before fitting/panning — i.e. any bounds-fit operation is
documented to flatten the camera first, deliberately, rather than fitting bounds
under the current tilted/rotated view. To move the center while _preserving_
tilt/heading, the docs direct you to `setCenter()` / `panBy()` instead of a bounds
method. `map.getBounds()` under tilt returns "the smallest bounding box that
includes the visible region" and may be **larger than the visible viewport** (a
tilted view's fov footprint is not a simple lat/lon rectangle, so the returned
bounds over-cover it).

No published notes describe an "auto-recenter" behavior distinct from the tilt clamp
itself — i.e. there is no separately-documented feature where zooming out recenters
the camera; the only documented zoom-driven effect is the tilt-angle clamp above.

---

## Deltas vs. a naive implementation

A naive globe-pivot camera would: store `(lon, lat, heading, tilt, distance)` as
independent scalars, convert a screen drag delta to a lat/lon delta via a fixed
scale factor, and clamp tilt to a single constant range. All three real
implementations above diverge from that in the same handful of ways:

1. **Drag-pan solves a rotation, it does not scale a screen delta into lat/lon.**
   MapLibre explicitly builds the quaternion that rotates "grabbed point's current
   position" onto "cursor's current position" (`versorSetLocationAtPoint`, cross
   product for axis + dot product for angle), rather than converting `Δpixels` into
   `Δlon/Δlat` with some per-zoom scale constant. This is the single biggest
   structural difference from a naive implementation and the reason drag tracking
   stays exact at any bearing/tilt/latitude.
2. **Camera orientation state is quaternion-composed, not Euler-scalar-mutated.**
   The globe's orientation accumulates as `orientation = delta · orientation` each
   frame; heading/tilt are _derived_ views into that state for the public API, not
   the authoritative state.
3. **Poles are handled as a distinct "dial" mode, not a clamp.** Within ~12° of a
   pole, MapLibre switches interpretation of drag motion to "sweep an angle around
   the pole axis" via a smoothstep blend — not a hard latitude clamp and not a
   silent no-op near ±90°.
4. **Zoom must adjust when latitude changes, even with no explicit zoom gesture.**
   Because a sphere's apparent circumference at fixed camera distance scales with
   `cos(latitude)`, MapLibre nudges the stored zoom (`getZoomAdjustment`) after every
   pan so on-screen scale stays constant — a naive implementation that treats zoom
   and lat/lon as fully independent will visibly "zoom" the content as the user pans
   toward a pole.
5. **Zoom-to-cursor has no exact solution near the horizon/poles, so it fades to a
   heuristic rather than erroring.** MapLibre blends an exact point-under-cursor
   solve against a cheaper heuristic center as the target approaches the visible
   horizon, rather than asserting a solution always exists.
6. **KML's camera composition is order-dependent, local-frame Euler, not a single
   world-space rotation.** Heading (yaw about Z), then tilt (pitch about the
   already-yawed X), then roll (bank about Z again) — reimplementing "tilt" as a
   rotation about a fixed world axis rather than the post-heading local X axis will
   silently diverge from the spec at any non-zero heading.
7. **`LookAt` and `Camera` are the same camera in two different anchor bases, not
   two different cameras.** `range` (LookAt) and eye-`altitude`+no-target (Camera)
   are convertible given target distance; a design that treats them as unrelated
   modes duplicates state that should be one derived pair.
8. **Tilt-vs-zoom clamping is a real, product-load-bearing behavior with NO
   published formula anywhere (Google Maps).** Treat it as a UX target to tune, not
   a constant to copy from documentation — none exists publicly.
9. **Bounds-fit operations are documented to flatten tilt/heading first (Google
   Maps).** Any "fit this region" camera move should be an explicit design choice
   about whether to preserve the current tilt/heading (use pan/center-only) or reset
   it (use a bounds-fit) — Google's own API treats these as two distinct verbs
   rather than one bounds-fit that respects current orientation.
10. **The globe/mercator switch is a real implementation swap hidden by a shader
    blend, not a re-parameterization (MapLibre).** If skymap ever needs a
    flat-projection fallback at extreme zoom for precision reasons, budget for two
    genuinely different transform code paths behind one interface, with a
    continuous "blend factor" masking the seam — not a single formula that scales
    smoothly across all zooms.
