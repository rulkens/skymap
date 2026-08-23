# Skymap seam map — where screen input becomes camera motion today

From the 2026-08-24 drag root-cause investigation (verified file:line, branch
earth-surface-navigation, worktree earth-rtc-foundation). This is the surface
the pivot replaces or re-routes.

| step                                            | file:line                                                                                            |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| hover hit → `state.picking.hoveredSurfacePoint` | src/services/engine/phases/wireInput.ts:291-326                                                      |
| ray build                                       | src/utils/camera/cursorRayFromCamera.ts:16 (`cursorRayWorld`)                                        |
| sphere hit                                      | src/utils/camera/cursorSurfaceHit.ts:21-45 → src/utils/math/raySphereRoots.ts:14                     |
| grab capture + latch reset (pointerdown)        | src/services/camera/orbitControls.ts:295-296; getter wired at wireInput.ts:418                       |
| per-move exact branch                           | orbitControls.ts:520-566; frame from wireInput.ts:425-451                                            |
| exact drag solve                                | src/utils/camera/surfaceDragRotation.ts:56-203 (tol :37, bound :141-149, accept :163-173)            |
| apply + latch-off                               | orbitControls.ts:552-557 / :564                                                                      |
| flat-rate fallback                              | orbitControls.ts:584-599 → src/utils/camera/orbitRadPerPixel.ts:34 → groundTrackingRadPerPixel.ts:25 |
| frame-side pin/fold (surface follow, FW-G)      | src/services/engine/frame/runFrame.ts:494-499, 601-606, 645-663                                      |
| zoom (wheel/pinch, NOT drag)                    | wireInput.ts:475 → applyWheelZoom.ts → src/utils/camera/cursorZoomStep.ts                            |

Key facts established this wave:

- Camera model: OrbitCamera yaw/pitch/distance about `target = bodyPosition +
followPanWorld(followPanStored)`; pose basis left-multiplied by FW-G
  co-rotation while surface follow engaged (engage <~120 km, disengage ~241 km,
  one-time fold below driver arbitration on leaving).
- Units: world Mpc, f64 JS numbers. Earth at ~1 AU = 4.9e-12 Mpc, radius
  2.06e-16 Mpc. Proven precision floor: grabbedWorld − eye cancels ~4 decades;
  drag-solve achievable residual ≈ eps·|centre|/altitude ≈ 1e-6 px (fixed
  interim by FW-I: tol 1e-3 px + best-iterate; deep cure = local frame).
- cos(lat) drag bug (fixed interim, FW-I): flat-rate fallback mapped screen-x
  to yaw about the POSE-FRAME pole (ecliptic, drifting with co-rotation) —
  exactly Cesium's legacy `constrainedAxis` design.
- Zoom: cursor-anchored on factor<1 only (FW-H); factor>=1 exact zero lateral,
  altitude taper. Spec: "reverts cleanly to centre-directed zoom on zoom-out".
- Earth ROTATES in world frame (unlike Cesium's ECEF world). Sim clock can run
  accelerated — OpenSpace pauses time during camera paths; skymap cannot.
- Input sources: mouse/touch + 3D SpaceMouse (src/services/input/) feeding
  camera deltas; probe in flight: shift+drag tilt (throwaway, expiry-marked).
- Rendering already has an RTC path for Earth surface tiles (Plan 1, #617) and
  a PAUSED earth-local slab design (docs/grill-sessions/earth-local-slab-
  2026-08-21.md): camera-rebased, Earth-fixed f64 anchor, km/m units,
  anchor-relative camera-pose provider seam. USER CONSTRAINT (binding): all
  body-related navigation grounded in a local body-fixed km/m frame; world-Mpc
  only at the handoff boundary + render composition.
- Known WESL landmine: Mpc-magnitude denormal flush in shaders (black nadir
  disc) — GPU side of the same unit problem.
