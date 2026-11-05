# Light-time spheres — plan

Spec: [`../specs/2026-10-08-light-time-spheres-design.md`](../specs/2026-10-08-light-time-spheres-design.md).

Strategy: a new self-contained Layer modelled on `src/layers/zoneOfAvoidance/` (no asset, a toggle, a fade row) and registered by hand the way `localBubble` was (`git show 4857e4334 --stat`, plus the snapshot follow-up `4b4d2f3d7`). Rewritten from scratch; the prototype on local branch `worktree-light-time-rings-fork-1` (`git show worktree-light-time-rings-fork-1:<path>`) is a reference for the maths and the look, not a base. Conventions that bind every task: one symbol per file in `utils/` and `@types/`; `type`, never `interface`; a pass file declares only its one export; comments explain why, module header ≤ 10 lines.

## Task 1 — Sphere table and pure maths

**Files:** `src/layers/lightTime/@types/LightTimeSphere.d.ts`, `src/data/lightTime/lightTimeSpheres.ts`, `src/data/lightTime/lightTimeFadeBands.ts`, `src/layers/lightTime/present/lightTimeSphereOpacity.ts` (inlined into `deriveLightTimeLiveness` at the deletion audit), `src/utils/math/sphereNdcBounds.ts`, `src/utils/math/sphereSilhouetteTop.ts`, and their tests under `tests/` mirroring those paths.

```ts
export type LightTimeSphere = { readonly id: string; readonly text: string; readonly radiusMpc: number };
export const LIGHT_TIME_SPHERES: readonly LightTimeSphere[];   // 15 rows, ascending radius
export const LIGHT_TIME_APPROACH_BAND: FadeBand;   // { fullAt: 2.0, goneAt: 1.2 }   in camera-distance / radius
export const LIGHT_TIME_RECEDE_BAND: FadeBand;     // { fullAt: 12, goneAt: 40 }
export function lightTimeSphereOpacity(camDistMpc: number, radiusMpc: number): number;
/** NDC [min, max] of a sphere along one screen axis. `centre`/`depth` are the sphere centre's
 *  camera-space coordinate on that axis and along the view axis. */
export function sphereNdcBounds(centre: number, depth: number, radius: number, tanHalf: number, pad: number): readonly [number, number];
/** Eye-relative point where the sphere's silhouette is highest on screen. `toCentre` = centre − eye. */
export function sphereSilhouetteTop(toCentre: Readonly<Vec3>, radius: number, screenUp: Readonly<Vec3>, out: Vec3): Vec3;
```

Rows: ids `light-time:second|minute|hour|day|month|year|10-years|100-years|1e3-years|…|1e9-years`; texts `1 light-second`, `1 light-minute`, `1 light-hour`, `1 light-day`, `1 light-month`, `1 light-year`, `10 light-years`, `100 light-years`, `1,000 light-years`, `10,000 light-years`, `100,000 light-years`, `1 million light-years`, `10 million light-years`, `100 million light-years`, `1 billion light-years`. Radii from `SCALE_UNITS.LY_TO_MPC`: second = 1/31,557,600 ly, minute ×60, hour ×3,600, day ×86,400, month = 1/12 ly, then 1, 10 … 1e9 ly.

`lightTimeSphereOpacity` = `fadeWindow([APPROACH, RECEDE], camDist / radius)` (`src/utils/math/fadeWindow.ts`).

`sphereNdcBounds`: `d² = centre² + depth²`; if `d² ≤ R²` → `[-1, 1]`. Else `θ = atan2(centre, depth)`, `α = asin(R/√d²)`; if `θ−α ≤ −π/2` or `θ+α ≥ π/2` → `[-1, 1]`; else `[clamp(tan(θ−α)/tanHalf − pad), clamp(tan(θ+α)/tanHalf + pad)]`, clamped to ±1.

`sphereSilhouetteTop`: with `d = |toCentre|`, `a = toCentre/d`, `u` = `screenUp` with its component along `a` removed, normalised, `k = min(R/d, 1)`: `out = toCentre − a·(R·k) + u·(R·√(1−k²))`.

- [x] Test `LIGHT_TIME_SPHERES radii strictly ascend and ids are unique`.
- [x] ~~Test `lightTimeSphereOpacity is 0 inside 1.2 radii, 1 between 2 and 12, 0 beyond 40`.~~ Dropped in review: it restated the band literals through the already-tested `fadeWindow`.
- [x] Test `sphereNdcBounds: centred sphere at 3 radii spans ±tan(asin(1/3))/tanHalf plus the pad`.
- [x] Test `sphereNdcBounds: off-axis sphere (centre 3, depth 4, R 1, tanHalf 2, pad 0) spans [0.2366, 0.5630]` (4 dp).
- [x] Test `sphereNdcBounds returns the full range when the eye is inside or the sphere reaches the eye plane`.
- [x] Test `sphereSilhouetteTop lies on the sphere and the eye ray to it is tangent` (`|p − toCentre| = R`, `(p − toCentre)·p = 0`).
- [x] Implement; commit.

## Task 2 — State, toggle and hand-kept registrations

**review: yes** (Redux state)

**Files:** `src/layers/lightTime/state/slices.ts`, `src/layers/lightTime/state/lightTime/{slice,initialState,selectors}.ts`, `src/layers/lightTime/present/lightTimeFadeRows.ts`, `src/layers/lightTime/ui/lightTimeSettingsRow.ts`, `src/@types/animation/FadeId.d.ts`, `src/services/animation/fadeRegistry.ts`, `src/services/engine/presentation/fadeIdToVisibilityKey.ts`, `src/services/engine/presentation/focusRecession.ts`, `src/@types/animation/VisibilityLayerKey.d.ts`, `src/data/animation/visibilityLayerRows.ts`, `src/services/animation/visibilityActionRow.ts`, `src/compositions/appSettingsSlices.ts`, `src/@types/engine/settings/SettingsSnapshot.d.ts`, `src/state/scene/captureSettings.ts`, `tests/state/scene/{captureSettings,captureScene,restoreSceneSaga}.test.ts`, `tests/state/settings/makeSettingsFixture.ts`.

Mirror `src/layers/zoneOfAvoidance/state/` and its rows in each core file exactly, with these values:

| Fact | Value |
|---|---|
| settings cluster | `lightTime: { enabled: false }` |
| action / selector | `setLightTimeEnabled(boolean)` / `selectLightTimeEnabled` |
| `FadeId` kind, `VisibilityLayerKey` | `{ kind: 'lightTime' }`, `'lightTime'` |
| `RECESSION_BY_KIND` | `undefined` — a guide, stays put under focus |
| `VISIBILITY_LAYER_ROWS` | `lightTime: {}`, placed after `zoneOfAvoidance` |
| fade row | `key: 'lightTime'`, `seed: enabled ? 1 : 0`, `intent: enabled`, no guard |
| panel row | `id: 'toggle-light-time-spheres'`, `label: 'Light-time spheres'` |
| snapshot | `lightTime` joins `SettingsSnapshot` and `captureSettings` |

- [x] Add the Layer state and the rows; update the three snapshot test rosters and the settings fixture (the "sixteen tour-owned clusters" title becomes seventeen — recount, don't trust this number).
- [x] No new test file: the unions are compiler-forced and the snapshot rosters are the existing guard. `tests/conventions/layerStateShape.test.ts` checks the folder shape.
- [x] `npm run typecheck:fast`; `npx vitest run tests/state/scene tests/conventions`; commit.

## Task 3 — Renderer, shaders, liveness, pass, Layer registration

**review: yes** (shaders, TS↔WGSL contract, camera maths)

**Files:** `src/layers/lightTime/{layer,create,destroy}.ts`, `src/layers/lightTime/@types/{LightTimeRuntime,LightTimeLiveness}.d.ts`, `src/layers/lightTime/@types/LightTimeSpheresRenderer.d.ts`, `src/layers/lightTime/render/lightTimeSpheresRenderer.ts`, `src/layers/lightTime/present/deriveLightTimeLiveness.ts`, `src/layers/lightTime/passes/lightTimeSpheresPass.ts`, `src/services/gpu/shaders/lightTime/{io,vertex,fragment}.wesl`, `src/compositions/app.ts`, `src/data/rendering/frameSections.ts`, `tests/services/engine/frame/expandFrameOrder.test.ts`, `tests/layers/lightTime/present/deriveLightTimeLiveness.test.ts`, `tests/layers/lightTime/render/lightTimeSpheresRenderer.test.ts`.

Read `docs/RENDERER.md` first. Camera basis exactly as `horizonShell` builds it (`orbitForwardOf`, `imagePlaneBasis`, `frameUp`), from the per-view `ctx.cam`.

```ts
export type LightTimeLiveness = {
  readonly centre: Readonly<Vec3>;          // Earth this frame, absolute Mpc (f64)
  readonly opacities: readonly number[];    // one per LIGHT_TIME_SPHERES row, toggle fade × distance window
};
/** `null` when no sphere would draw. Reads `ctx.drawCamPos` and `ctx.snapshot.bodyStates.get('earth')`. */
export function deriveLightTimeLiveness(state: PassState, ctx: FrameView): LightTimeLiveness | null;
// renderer
draw(pass: GPURenderPassEncoder, cam: OrbitCamera, camPos: Readonly<Vec3>, viewport: Vec2, liveness: LightTimeLiveness): void;
```

Layer opacity is `resolveLayerOpacity(state, ctx, { kind: 'lightTime' })` (as `deriveZoneOfAvoidanceLiveness.ts` does). Use the existing Earth id constant if one exists (`src/data/selection/earthRef.ts`) rather than a new literal. The pass's `enabled` is `liveness !== null`; `draw` passes the same derivation.

Uniform buffer, 192 bytes (f32 index):

| floats | content |
|---|---|
| 0–2, 3 | `camForward`, `tanHalfFovY` |
| 4–6, 7 | `camRight`, `aspect` (viewport w/h) |
| 8–10, 11 | `camUp`, `count` (visible spheres, 0–4) |
| 12–15 | `rect`: NDC `minX, minY, maxX, maxY` |
| 16 + 8·i … | slot *i* (< 4): `ro.xyz`, `opacity`, then `c, 0, 0, 0` |

- CPU, f64: for each row with opacity > 0, in table order, up to 4: `ro = (camPos − centre) / R`, `c = |ro|² − 1`. `rect` from `sphereNdcBounds` of the largest packed sphere on both axes (x uses `tanHalfFovY·aspect`), pad `0.01`.
- Vertex: 6-vertex quad, `p = mix(rect.xy, rect.zw, corner·0.5 + 0.5)`, forwards `p` as `ndc`.
- Fragment: `rd = normalize(fwd + ndc.x·tanHalfFovY·aspect·right + ndc.y·tanHalfFovY·up)`; per slot `b = ro·rd`, `disc = b² − c`; skip if `disc < 0` or `−b + √disc ≤ 0`; `rim = pow(max(1 − √disc, 0), 3)` (the `max` matters: `√disc` rounds above 1 and `pow` of a negative is NaN); sum `TINT·rim·INTENSITY·opacity` with `TINT (0.55, 0.75, 1.0)`, `INTENSITY 0.35`; `discard` when the peak channel `< 0.0005`; output `vec4(sum, peak)`. Pipeline blend `ADDITIVE_BLEND`, target `hdr`.
- Frame order: `'light-time-spheres'` on the `(hdr, NEAR0)` line of `frameSections.ts` directly after `'local-bubble'`; add the Layer to both lists in `compositions/app.ts` and the pass name to the roster in `expandFrameOrder.test.ts`.

- [x] Test `deriveLightTimeLiveness is null when the toggle fade is 0`.
- [x] Test `deriveLightTimeLiveness measures distance from Earth, not the origin` (camera at Earth + 3 light-hours → the hour row is 1 and the day row is 0).
- [x] Test `the renderer packs only visible spheres, in table order, with c = |ro|² − 1 and the count` (follow `tests/layers/zoneOfAvoidance/render/` for the device stub).
- [x] Test `the rect is the full screen when the camera is inside the largest visible sphere`.
- [x] `npm run typecheck:fast` and `npm run build` (`?static` shader imports only fail in build); commit.

## Task 4 — Captions

**Files:** `src/layers/lightTime/present/produceLightTimeCaptions.ts`, `src/layers/lightTime/layer.ts`, `tests/layers/lightTime/present/produceLightTimeCaptions.test.ts`.

A `Label2DProducer['produceLabels']` registered as a NEAR0 `screenLabels` guide. One `Label2D` per row whose liveness opacity is > 0 (none when liveness is `null`): `worldPos` = `sphereSilhouetteTop(centre − camPos, R, screenUp)` (eye-relative, which is what NEAR0 labels take), `font: 'cormorant'`, `color [0.75, 0.86, 1, 1]`, `outlineColor [0, 0, 0, 0.1]`, `outlineEmFrac 0.16`, `minPixelSize = maxPixelSize = 32` with `worldEmMpc` set to the radius (the clamp fixes the size), `alignX 'center'`, `alignY 'bottom'`, `fadeAlpha` = the row's opacity, `prominencePx = CAPTION_PRIORITY.meshBody * CAPTION_TIER_SCALE`, no `pickId`. See `produceZoneOfAvoidanceLettering.ts` for how a producer reaches the Layer opacity from its `state`.

- [x] Test `captions carry their sphere's opacity and none are emitted when the Layer is off`.
- [x] Implement; `npm run typecheck:fast`; commit.

## Definition of Done

- Deliverables: `src/layers/lightTime/` as in the spec's §3.1; the "Light-time spheres" row in "Labels & guides"; `lightTime` in the fade, visibility and snapshot tables.
- Smoke, toggle on, from `#focus=body-earth`: zooming out shows 1 light-second (inside the Moon's orbit), 1 light-minute, 1 light-hour (edge between Jupiter and Saturn), and on to 1 billion light-years, each with its caption on top of the sphere; toggling off fades everything out; orbiting the camera keeps the caption on the silhouette's top; no jitter of the sphere edge while moving at 1 light-second scale.
- Perf: `npm run perf -- --url <wt server> --scenario solar-system` with the toggle on shows the pass at or under the ≈1 ms seen on the prototype.
- Out of scope: light pulse, Voyager caption, VR asymmetric frusta, Layer-declared fade tables, the three cosmetic items in the spec's §7.
