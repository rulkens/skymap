# Sky mode (Stellarium-style) — design spec

> **Status.** Drafted 2026-10-28 from a chat brainstorm the same day; every ruling in §2 is the
> user's and binding. Ground preparation (§3) came from three read-only surveys of the camera, the
> overlay renderers and the entry/UI path, spot-checked against the tree.
> **Scope.** One spec, two PRs: §3 prep ships first and alone, the feature (§4–§8) on top. A plan
> is written per PR. Survey imagery (HiPS) is the named follow-up (§10), not this effort.

## 1. What this is

Stand on the ground somewhere — Earth or Mars, at a real place and the current sim time — and look
up, the way Stellarium does:

- **The eye is planted** 1.7 m above the live terrain at a lat/lon. It never moves while you look.
- **Drag looks around** in azimuth/altitude. The horizon is always level (no roll); altitude clamps at ±90°.
  The sky point under the cursor stays under it.
- **The wheel/pinch changes the field of view** (0.5°–120°), never the eye.
- **Sky furniture**: cardinal points on the horizon, an alt-az grid, an equatorial grid with its
  celestial equator, the ecliptic and the local meridian. Visible by day, hidden behind terrain.
- **The ground is what skymap already draws**: measured terrain and the physical atmosphere, so
  day, twilight and night come for free from the time bar.

Entry is a **"Sky from here"** command (palette row + `s`) for the ground under the view centre, or
a typed/picked place. Exit is **Esc** (back to the view you entered from) or **zooming out past the
widest field** (Street View style: the camera lifts off and lands above the spot, looking down).

## 2. Rulings

| #   | Ruling |
| --- | ------ |
| R1  | v1 core is the **look-around camera**, perspective projection. No stereographic/fisheye projection in v1. |
| R2  | v1 overlays: **cardinal points, alt-az grid, equatorial grid + celestial equator, ecliptic + meridian** — all four. |
| R3  | Ground and horizon are the **real terrain + atmosphere**. No panorama landscapes, no ground disc. |
| R4  | Entry is **"Sky from here" + a place picker**, on any body with terrain (Earth and Mars today). |
| R5  | Sky mode is a **takeover** — a fourth `TakeoverSource` kind beside tour, exhibit and clip. |
| R6  | Zoom-out exit works **like Google Street View**: past the widest field, a deliberate extra push lifts the camera off and lands it above the spot, looking down. Zooming back in never re-enters; the command does. |
| R7  | **Eye height 1.7 m** everywhere. Whatever breaks the surface render at standing height is fixed as ground prep (§3, P3–P4). |
| R8  | Grids are **visible by day** (drawn after the atmosphere composite, dimmed in bright daylight) and hidden behind terrain. |
| R9  | The equatorial grid is the **host planet's own**: built from the host's pole, so on Mars it is the sky that turns overhead there. |
| R10 | Packaging: **prep PR first**, then the feature PR. |
| R11 | v2 adds **ultra-high-res survey overlays** (CMB to optical, many wavelengths). v1 must not block it (§10). |

### Decisions made in this spec (not user rulings — challenge freely)

- **D1. The lens belongs to the pose in sky mode.** The sky pose carries its own `fovYRad`, so it
  never leaks into the restored view, and links and clips carry it. Today the lens is the global
  `settings.camera.fovDeg`; P2 turns "which lens" into a rung column.
- **D2. Esc restores the camera only.** Sky mode authors nothing but a pose, so it does not run
  under `withSceneSnapshotSaga`. Esc commits the `camera.base` captured at entry; time, grid toggles
  and any setting the viewer changed while looking stay as they are. Tours and exhibits restore the
  scene because they author it, and sky mode authors none of it.
- **D3. New rung, entered by command only.** `{ sky }` is a fourth rung under `body`. Its `engage`
  always declines, so the frame tag stays the regime and no distance band ever drops you into sky
  mode by accident.

## 3. Ground preparation

### 3.1 Ideal shape

```ts
type PoseFrame = 'absolute' | { body: SceneBodyId } | { site: SiteId } | { sky: SceneBodyId };
type RungKind = 'absolute' | 'body' | 'site' | 'sky';
type SkyPose = {
  lonRad: number; latRad: number;          // body-fixed site; height is NOT stored (live heightAt + SKY_EYE_HEIGHT_M)
  azimuthRad: number; altitudeRad: number; // view direction in the site's ENU frame, az from north through east
  fovYRad: number;                         // the lens, D1
};
type SkyMemory = { exitPushPx: number };   // wheel-out past the widest stop, accumulated; no stored flag

RungRow.lens(framed, settingsFovYRad): number   // NEW column, P2; absolute/body/site return the setting
ParentOf.sky = 'body'                           // ClimbRow; engage → null always (D3)

type TakeoverSource = … | { kind: 'sky'; body: SceneBodyId };
type SkyTarget = 'view' | { body: SceneBodyId; lonDeg: number; latDeg: number };
enterSky(SkyTarget)                             // saga action; starts the takeover
skyEntry(SkyTarget) → skyEntered | skyEntryMissed   // camera action, resolved in the engine (§4.2)

SKY_EYE_HEIGHT_M = 1.7; SKY_FOV_MIN_DEG = 0.5; SKY_FOV_MAX_DEG = 120   // src/data/
```

### 3.2 Verdicts

| Touchpoint | Verdict | Why |
| --- | --- | --- |
| `CAMERA_RUNGS` + `RungKind`/`PoseOf`/`FrameOf`/`MemOf`/`ParentOf` | **Growth** | A new rung is a new key plus a row, which is what the site-rung spec built the table for. `rungKindOf` gains one branch. It stays the one reader of the spelling (`oneTagReader.test.ts`). |
| `RungRow.channels` (clips), `encodeFramedPose` (URL) | **Growth** | Every rung fills these already. Sky encodes into the five channels the way site does: `target: [lon, lat, 0]`, `yaw: az`, `pitch: alt`, `distance: fovY`. The URL tag gets a new letter. |
| Lens read at `stepCameraRuntime.ts:116-121` | **Prep (P2)** | It reads the setting unconditionally. Branching on "is sky" there would be a second tag reader, so the lens becomes a rung column. |
| Site rung (`siteRung.ts`) | **Not touched** | It is a turntable about a pivot. Its drag signs are spec-ruled orbit semantics (site spec §4.6), and the research doc rules first-person "a new parameterization, not a knob". |
| `lookedSurfacePose` | **Reuse** | Its yaw-about-local-vertical math is the sky rung's drag. The sky rung adds the ±90° clamp in its own pose space, where altitude is explicit. |
| `MIN_NEAR_MPC` (~6.2 m) | **Prep (P3)** | `foregroundFrustum.ts:40-57` requires it to stay below the eye's minimum altitude, and 1.7 m breaks that: the ground at your feet clips. |
| Surface shading at 1.7 m | **Prep (P4), repro-first** | The camera survey reported an Earth ocean precision limit around 10 m. I could not confirm it in `bodies/earth/fragment.wesl`, and at ground level the terrain tiles draw rather than that shader. `analyticSphere.wesl:69-77` documents the f32 cancellation class at contact range. Reproduce, then fix what shows. |
| `expandSegmentQuad` (`lib/segmentQuad.wesl:46`) | **Prep (P1)** | A full-sky grid always has segments crossing the eye plane. Constellations, filaments and marker lines already fold there (backlog "Constellation segments need a near-plane clip", `ready`). `missionTrail/vertex.wesl:15-39` has the clip to port. |
| Takeover union + `watchTakeoverSaga` | **Growth** | `TakeoverSource` is closed on `kind` by design. Esc already routes through `exitTakeover`, and tours/exhibits/clips already preempt. |
| Palette `ScoredRow` / `PaletteAction` / `remoteCommands` | **Growth** | A closed union gains a member. Remote parsing gets the same member. |
| `markerLineRenderer` | **Rejected for grids** | It silently truncates at `maxLines` (`:318`), takes CPU objects every frame and clamps z. Grids are static geometry plus one rotation uniform. |
| Constellation renderer | **Rejected for grids** | It draws 3D star-to-star lines and shrinks every end by at least the star-gap radius (≥ `STAR_GLOW_MIN_PX`, `constellations/vertex.wesl:65-66`), which would dash a polyline. Its *shader library* (`expandSegmentQuad`, `edgeBandMask`) is reused. |
| "Ground under the view centre" | **Feature, not prep** | `terrainPickAt` already exists and is pure. The only new part is calling it from the camera input drain, which has `heightAt`. Landing that alone would be a seam with no caller. |

### 3.3 Prep refactors (PR 1)

Each is its own commit, in this order. Every one but P1 preserves behaviour.

- **P1. Near-plane clip in `expandSegmentQuad`.** Port `missionTrail`'s `W_EPS` slide, then delete
  the trail's local copy so there is one clip. This is a **visible fix**: constellation, filament and
  marker-line segments near the eye stop folding. Gate it with shots (a constellation straddling the
  view edge from Earth, the dome rig). Consumes the backlog item: delete its index line and detail
  file in this commit.
- **P2. `RungRow.lens`.** A new total column. `absolute`/`body`/`site` return the settings lens.
  `stepCameraRuntime` takes the projection from `rowFor(frame).lens(framed, settingsFovYRad)`.
  Golden traces stay byte-identical.
- **P3. Near floor at standing height.** Lower `MIN_NEAR_MPC` so it sits below `SKY_EYE_HEIGHT_M`
  with margin (~0.5 m). NEAR0 is reversed-Z with an infinite far, so depth precision does not care
  (`foregroundFrustum.ts:51-55`). Re-check the readers that cite it (`labelLeaderLine.ts:37`,
  `rebaseViewProj.ts:50`, `near0SelectionRingPass.ts:155`, `pivotRadiusMpc.ts:25`). Shots at the
  Søndermarken and Everest presets must be unchanged.
- **P4. Surface render at 1.7 m, repro-first.** Debug-pose the body arm at 1.7 m (bypassing the
  ~15 m `SURFACE_STANDOFF_RADII` floor) over land, over sea and on Mars. Shoot the horizon and the
  ground at −30°, and fix what is wrong (a failing test or shot first, per house rule). **If nothing
  reproduces, P4 drops and the ledger records the shots.** The body arm's own 15 m floor stays: the
  sky rung has its own eye.

## 4. Camera: the sky rung

### 4.1 Pose and steps

- **Eye.** The site point at `lon/lat`, at `datum + heightAt(lon, lat) + SKY_EYE_HEIGHT_M`,
  re-derived every frame and never stored. Height refines as deeper tiles stream in, so the eye rises
  or falls by centimetres to metres with no input. That's correct: you are standing on what is
  loaded.
- **Basis.** The site ENU frame (`siteEyeFrame`) turned by az/alt. Roll is identically zero.
- **Drag.** 1:1 gain of `fovY / viewportHeightPx` rad per px on both axes, so the grabbed point stays
  under the cursor at every lens. Altitude clamps to [−π/2, +π/2]. At the zenith the azimuth stays
  free, so dragging across the pole just turns the view.
- **Wheel / pinch.** Scales `fovYRad` multiplicatively and clamps to [0.5°, 120°]. Wheel-out at the
  120° stop adds to `SkyMemory.exitPushPx`. Any wheel-in, drag or `SKY_EXIT_PUSH_DECAY_MS` of rest
  clears it. Past `SKY_EXIT_PUSH_PX` the rung releases (§4.3).
- **Wheel at rest.** Today the world arm's at-rest wheel goes to the `applyWheelZoom` lane, but the
  sky rung steps its own zoom, as body and site do (`applyWheelZoom.ts:22`). No driver change: the
  rung steps the register, the drivers echo it.
- **OpenSpace scheme.** The sky rung ignores `orbit` and `roll`, takes `look` as its drag, and takes
  `zoom` as the lens. Same rule as R7 of the OpenSpace spec for site.

### 4.2 Entry

1. `enterSky(target)` → the takeover saga starts `{ kind: 'sky', body }` and dispatches the camera
   action `skyEntry(target)`.
2. The engine drains it where terrain is reachable. `'view'` is `terrainPickAt` at the viewport
   centre on the engaged body, falling back to the datum sphere hit. A place target uses its lon/lat
   directly. No hit (a view centre in space) → `skyEntryMissed`. The saga ends the takeover, and the
   status line says "Point the view at the ground first."
3. **Arrival.** An existing body-arm tween descends to the floor above the site keeping the current
   heading, then the rung commits the sky pose at that heading, altitude 15°, fov 60°. The tween
   ends at the body arm's 15 m standoff and the commit drops the eye to 1.7 m with the same heading:
   a sub-second, nearly invisible cut. → `skyEntered`.
4. Entering from sky mode, for example "Sky from Paris" while standing in Amsterdam, re-commits the
   pose inside the same takeover. No exit/enter flash.

### 4.3 Exit

- **Esc / `exitTakeover`.** Commits the `camera.base` captured at entry (D2), and the camera tweens
  back the way any takeover's restore does.
- **Zoom-out push (R6).** The rung releases to `body`, anchored at the site, at
  `SKY_EXIT_ALTITUDE_M` straight above it, looking down, with the sky heading as the map heading.
  That's Street View's hand-back to the map. The takeover ends **without** restoring.
- **Preemption.** A tour, exhibit, clip or focus change ends it the same way any takeover is
  preempted. The new taker's own pose wins.

## 5. Overlays: the `skyGrids` Layer

- **Home.** `src/layers/skyGrids/`, a new Layer laid out per `src/layers/README.md`.
- **Visibility.** One show entry with `items: ['cardinals', 'altAz', 'equatorial', 'ecliptic',
  'meridian']`. Passes draw only while the frame's rung is `sky` (read through `rungKindOf`).
- **Geometry.** Unit-direction polylines at ≤ 1° per segment, built once on the CPU:
  - The **alt-az grid** (every 10° in altitude, 15° in azimuth) and the **meridian** are built in
    the local ENU frame and turned each frame by one `mat3` uniform from the site basis.
  - The **equatorial grid** (every 15° RA, 10° Dec) and the **celestial equator** are built in the
    host's equatorial frame, whose pole is the third column of the host `orientation` (R9). On Earth
    that frame is the world J2000 frame, since precession is not modelled (`rotationElements.ts`
    header), so no Earth special case is needed. On a non-Earth host the RA origin is the host
    equator's ascending node on the ICRS equator, the IAU convention. Name that in a comment.
  - The **ecliptic** is world-fixed through `ECLIPTIC_FRAME` (`orbitPlaneFrames.ts:72-85`).
- **Drawing.** Points at infinity, so the projection's translation drops out. Lines come out of
  `expandSegmentQuad` (with P1's clip) and `edgeBandMask`, one colour and width per grid. Lines
  below the horizon fade by `dot(dir, up)`.
- **Step.** `POST_FOREGROUND` hdr, beside `orbit-trails` (`src/data/rendering/frameSections.ts:297-305`), sampling
  `foreground:0` depth: hidden wherever depth is finite (terrain), drawn over the sky (R8). The
  daylight dim is a CPU scalar from the Sun's altitude at the site. Never read the foreground
  alpha; it carries three meanings (backlog 2026-08-18).
- **Cardinals.** N, NE, E, … through the foreground label director. They get a new `CaptionKind`
  `'cardinal'` ranked above constellation names, a fixed pixel size, an anchor at altitude +1° so
  relief does not swallow it, and they draw over terrain (weight 0). Degree labels on the grid are
  out of v1.
- **Dome.** Lines work per face after P1 and thin towards face edges. Labels stay off in the dome
  until the existing backlog item lands. Accepted.

## 6. UI

- **Palette.**
  - A **"Sky from here"** row whenever the current host has terrain.
  - A **"Sky from <place>"** row beside each `EARTH_PLACES` fly-to match.
  - A typed `lat, lon` query (e.g. `52.37, 4.89`) yields **"Sky from 52.37° N 4.89° E"** on the
    current host, or Earth.
  - These need a new `ScoredRow` kind and `PaletteAction` kind `sky`, and `remoteCommands` parses
    the same.
- **Keys.** `s` enters at the view centre; inside sky mode it does nothing, and Esc leaves.
  `g` toggles all five grid items as a group. Add both rows to the hand-written list in
  `NavigationPanel.tsx`.
- **Readout.** While in sky mode the ScaleBar's slot shows `place · lat/lon · az/alt of the view
  centre · field of view`. A scale bar means nothing at ground level. It is pushed per frame
  through `engineSlice`, as `ScaleInfo` is.
- **Settings.** A "Sky grids" SettingsPanel section from the Layer's `ui`, one switch per item. The
  toggles persist (`PERSISTED_VALUES`) and live outside `SettingsSnapshot`.
- **URL.** One appended `HASH_PARAM_SOURCES` row, `sky=<body>,<lat>,<lon>,<az>,<alt>,<fov>`,
  written on enter, settle and exit, never per frame. Reading it starts the takeover at that pose.
- **Copy and interaction.** Per `docs/superpowers/conventions/ui-ux.md`, including its interaction
  tests and before-you-commit self-check.

## 7. Tests (acceptance criteria)

Test names are the contract. The plan pins each assertion.

- `skyRung.test.ts`:
  - `drag keeps the grabbed sky direction under the cursor at 1°, 60° and 120°`
  - `altitude clamps at ±90° and azimuth stays free at the zenith`
  - `camera roll about the view axis is zero after any drag sequence`
  - `wheel scales fov multiplicatively inside [0.5°, 120°]`
  - `wheel-out at the widest stop releases only once SKY_EXIT_PUSH_PX accumulates`
  - `any wheel-in, drag or rest clears the exit push`
  - `the eye sits SKY_EYE_HEIGHT_M above the live heightAt and follows a refined tile`
  - `engage always declines`
  - `channels round-trip a sky pose`
- `encodeFramedPose.test.ts`: `sky frame round-trips through the URL tag`.
- `skyGridBasis.test.ts`:
  - `alt-az zenith is the site radial and north points to the host pole`
  - `Earth's equatorial pole is the world +z`
  - `Mars's equatorial pole is Mars's IAU pole`
- `skyTakeover.test.ts`:
  - `Esc restores the entry camera.base and keeps a time change`
  - `zoom-out exit ends the takeover without restoring`
  - `a tour started in sky mode ends it`
  - `a missed view-centre entry ends the takeover with a status`
- `rankPaletteMatches.test.ts`:
  - `a lat, lon query yields a sky row`
  - `a place match yields fly-to and sky rows`
- Interaction tests per `ui-ux.md` for `s`, `g`, Esc and the readout.
- **Perf**: `npm run perf` at a sky pose at 60° and at 0.5°, before and after. A narrow lens
  multiplies `pxPerRad` ~120× and pushes terrain LOD (`surfaceTileOverOf`), the disk planner
  (`diskPlannerWalk.ts:35`) and the star constants tuned at 60° (`starCatalog/vertex.wesl:160-166`).
  If 0.5° regresses, the floor rises and the cause gets a backlog line. The floor never ships slow.
- **Eye checks** (`npm run shot`): Amsterdam at night with all grids, the same at noon, Mars at
  Jezero, the zoom-out exit mid-tween.

## 8. Packaging and order

- **PR 1, prep:** P1–P4 as separate commits, P1 first. It gets its own plan, and no deletion audit.
- **PR 2, feature:** rung, takeover and entry/exit, then the `skyGrids` Layer, then the UI. It gets
  its own plan, and `/feature-done` runs the deletion audit.

## 9. Left to the builder

- The exit tuning: `SKY_EXIT_PUSH_PX`, `SKY_EXIT_PUSH_DECAY_MS` and `SKY_EXIT_ALTITUDE_M`, eye-checked
  against Street View's feel.
- Grid colours, widths and the daylight-dim curve, within the ui-ux tokens.
- The entry tween's duration.

## 10. Follow-up: survey imagery (v2), and what v1 holds open

v2 is ultra-high-res all-sky overlays, from the Planck CMB through Fermi, ROSAT, GALEX, DSS2, 2MASS
and WISE. The standard is IVOA **HiPS**, HEALPix-tiled and the format Aladin and Stellarium Web
stream. It gets its own brainstorm. v1 keeps three doors open:

- **The lens lives in the sky pose (D1).** Arcsecond zoom only lowers `SKY_FOV_MIN_DEG`, once perf
  allows it.
- **One sky-frame helper.** The host equatorial frame built for §5 is the frame every survey is
  drawn in, with a fixed rotation for galactic-frame surveys.
- **One overlay step.** Surveys would sit between the stars and the atmosphere composite, with a
  per-survey opacity. v1's grids already sit above that, in `POST_FOREGROUND`.

Open for v2: stream from CDS or mirror to R2 (cache, CORS, per-survey licences); surveys outside
sky mode as the normal camera's backdrop; wavelength picking and blending several surveys. Tracked
in the backlog as "Survey sky overlays (HiPS)".

## 11. Adjacent findings (backlog, not this effort)

- The ScaleBar's `distance·tan(fovY/2)` (`scaleBar.ts:98`) reads nothing useful at ground level in
  any arm, not only in sky mode. Sky mode hides it; the general case is the existing "Scale bar
  measures from the datum" item.
- `withSceneSnapshotSaga` forces the default lens on every takeover. Sky mode sidesteps it (D1, D2).
  The cluster-wipe bug it carries is already backlogged ("Takeover's camera-cluster merge wipes any
  field it doesn't set").
