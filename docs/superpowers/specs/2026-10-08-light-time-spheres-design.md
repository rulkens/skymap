# Light-time spheres — design

**Status:** look agreed on a throwaway prototype 2026-10-05..07 (local branch `worktree-light-time-rings-fork-1`, reference only — the Layer is rewritten from scratch); shape approved at the refactor-ground checkpoint 2026-10-06.

## 1. Purpose

Show how far light travels from Earth in a second, a minute, an hour … a billion years, as faint glowing spheres centred on Earth. It gives every zoom level between the Moon and the cosmic web a ruler the viewer already has a feeling for.

## 2. Scope

In: a self-contained `lightTime` Layer — sphere table, one fullscreen-rect additive pass, one caption per sphere, an on/off toggle with fade, settings, tests.

Out: a light pulse animation; a Voyager caption; VR's asymmetric frusta (the pass builds rays from a symmetric vertical field of view, as `horizonShell` does; the dome rig's faces are symmetric and work); the prep refactor that lets Layers declare their own fade vocabulary (separate effort, see §3.3).

## 3. Ground preparation

### 3.1 Ideal shape

```
src/layers/lightTime/
  layer.ts     defineLayer({ name:'lightTime', settings, create, destroy, passes, fades, guides,
                             ui:[{ slot:'labelsAndGuides', content: lightTimeSettingsRow }] })
  create.ts / destroy.ts
  state/slices.ts · state/lightTime/{slice,initialState,selectors}.ts      lightTime: { enabled: false }
  present/  lightTimeFadeRows.ts · lightTimeSphereOpacity.ts · deriveLightTimeLiveness.ts
            · produceLightTimeCaptions.ts
  passes/   lightTimeSpheresPass.ts
  render/   lightTimeSpheresRenderer.ts
  ui/       lightTimeSettingsRow.ts
  @types/   LightTimeRuntime.d.ts · LightTimeSphere.d.ts · LightTimeLiveness.d.ts
src/data/lightTime/{lightTimeSpheres,lightTimeFadeBands}.ts
src/services/gpu/shaders/lightTime/{io,vertex,fragment}.wesl
src/utils/math/{sphereNdcBounds,sphereSilhouetteTop}.ts
```

### 3.2 Verdicts

- Growth: the Layer folder, its settings slice, fade row, panel row, pass, caption guide — all declared through `defineLayer`.
- Bolt-on (hand-kept, one entry per Layer): `FadeId` + `serializeFadeId`, `VISIBILITY_KEY_BY_KIND`, `RECESSION_BY_KIND`, `VisibilityLayerKey`, `VISIBILITY_LAYER_ROWS`, `VISIBILITY_ACTION_ROW`; `SettingsSnapshot` + `captureSettings` (not compiler-forced); `APP_COMPOSITION`, `APP_SETTINGS_SLICES`, `FRAME_ORDER`; five test rosters.

### 3.3 Prep

None in this PR, by the user's ruling 2026-10-08: the rows are added by hand as `localBubble` (#755) did. Removing the hand-kept tables is being investigated separately (data-declared toggles); this Layer migrates with the others when that lands.

## 4. Behaviour

- **Spheres.** Fifteen, concentric, centred on Earth's position this frame (`bodyStates.get('earth')`): 1 light-second, -minute, -hour, -day, -month (1/12 year), -year, then 10, 100, 1,000, 10,000, 100,000, 1 million, 10 million, 100 million, 1 billion light-years.
- **Look.** Additive, behind bodies (the `hdr` target has no depth), tint `(0.55, 0.75, 1.0)`, intensity `0.35`, brightest at the silhouette: `rim = (1 − cos)^3` where `cos` is the angle between the view ray and the surface normal at the hit.
- **Distance window.** With `q = |camera − Earth| / radius`: opacity ramps 0→1 over `q` 1.2→2.0 and 1→0 over 12→40. One rule for every sphere; typically one or two are visible.
- **Toggle.** "Light-time spheres" in "Labels & guides", off by default, fading in and out like the other guides. It does not recede on focus. A tour clip can address it as `lightTime`, and a takeover saves and restores it.
- **Final opacity** of sphere *i* = toggle fade (`resolveLayerOpacity`) × its distance window. The pass and the captions read one derivation.
- **Captions.** The sphere's name ("1 light-hour"), Cormorant, colour `(0.75, 0.86, 1.0)`, fixed 32 px, centred, sitting on the top of the sphere's silhouette as seen on screen, non-clickable, collision priority `CAPTION_PRIORITY.meshBody`.

## 5. Rendering

One draw of a screen-aligned rectangle; the fragment shader intersects the view ray with each visible sphere analytically.

- **Precision.** Radii span ~1e-14 to 3e2 Mpc, so the shader works in sphere-radius units. Per visible sphere the CPU computes in f64 `ro = (camera − Earth) / R` and `c = |ro|² − 1`. For a unit sphere `cos = sqrt(b² − c)` with `b = ro·rd`, so no hit point is needed.
- **Only visible spheres** are uploaded (at most 4 slots, with a count).
- **Rectangle.** The spheres are concentric, so the largest visible one bounds them all; its NDC bounds (padded) shrink the quad. When the bounds touch the eye plane or the eye is inside, the rectangle is the full screen.
- **Threshold.** A fragment whose peak channel is under `0.0005` is discarded.
- Measured on the prototype: ≈ 1 ms in `npm run perf --scenario solar-system`, at the harness's noise floor.

## 6. Success criteria

- With the toggle on, zooming out from Earth shows each sphere and caption in turn from 1 light-second to 1 billion light-years; with it off, nothing draws and the pass leaves the frame plan.
- The 1 light-second sphere sits just inside the Moon's orbit; the 1 light-hour sphere's edge falls between Jupiter's and Saturn's orbits.
- Captions stay on the silhouette's top at every distance in the window.
- A tour takeover restores the toggle.

## 7. Known and accepted

While a sphere fades out its caption shows faintly inside the next one; a caption hides when it collides with a higher-priority label; Cormorant's old-style "1" reads small.
