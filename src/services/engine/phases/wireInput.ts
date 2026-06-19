/**
 * wireInput — bootstrap phase that wires the pick renderer, the orbit
 * camera, click + double-click handlers, and the input-bindings listener
 * bag.
 *
 * Runs without waiting on any galaxy catalog load: the camera framing uses pure
 * constants from `cameraFraming.ts`, so the orbit camera and the loop
 * can come up immediately and galaxy catalogs can fade in as they arrive. The
 * `ready` status emission lives in `wireSlots` as a per-arrival
 * subscriber.
 *
 * No settings seed runs here: every settings cluster lives in the
 * engine-owned store (seeded at construction from the same
 * `data/defaults.ts` values React reads through `useStore` selectors),
 * so there is no startup echo to fan out.
 *
 * ### State writes
 *
 *   - `state.cam`, `state.initialCamSnapshot`.
 *   - `state.gpu.pickRenderer`.
 *   - `state.subsystems.clickResolver`, `state.subsystems.inputBindings`.
 *
 * ### Side effects on `deps`
 *
 *   - Mutates `deps.detachControlsRef.current` — written with the
 *     orbit-controls detach function.
 */

import { createOrbitCamera } from '../../camera/orbitCamera';
import { attachOrbitControls } from '../../camera/orbitControls';
import { seedCameraFromBase } from '../../camera/seedCameraFromBase';
import { createPickRenderer } from '../../gpu/renderers/pickRenderer';
import { createClickResolver } from '../interaction/clickHandler';
import { attachEngineInputs } from '../interaction/inputBindings';
import { computeInitialCamera } from '../camera/cameraFraming';
import { poseOf } from '../camera/poseOf';
import { cssToTexPx } from '../helpers/cssToTexPx';
import { collectPickTargets } from '../helpers/collectPickTargets';
import { deriveSourceMasks } from '../frame/deriveSourceMasks';
import { milkyWayPickVisible } from '../helpers/milkyWayPickVisible';
import { milkyWayPickHalfExtentPx } from '../helpers/milkyWayPickHalfExtentPx';
import {
  commitCameraPose,
  beginDrag,
  endDrag,
  cancelCameraTween,
} from '../../../state/camera/cameraSlice';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';

/**
 * Bootstrap phase 3: pick renderer + camera + orbit controls + click
 * handlers + input bindings + status-ready + settings seed.
 */
export async function wireInput(state: EngineState, deps: BootstrapDeps): Promise<void> {
  const { canvas } = deps;

  // Build the pick renderer. It shares the same vertex/uniform buffers as
  // the visual renderer — no extra GPU memory for point data.
  const renderer = state.gpu.renderer;
  if (!renderer) return;
  // Thread the cluster marker renderer through so the pick pass can
  // append structure ring draws after the galaxy per-source loop — see the
  // structure ring block inside `pick()` for the depth-ordering rationale.  Normalise
  // `null` → `undefined` so the renderer's param type stays `| undefined`
  // and the optional-vs-null distinction stays internal to the handle bag.
  const pickRenderer = createPickRenderer(
    deps.phaseLocals!.device,
    renderer,
    state.gpu.fadeBgl!,
    state.gpu.sourceBgl!,
    state.gpu.focusBgl!,
    // The live shared focus buffer — so the pick pass excludes non-members
    // of a focused structure from hit-testing (vertex shader culls them).
    state.gpu.focusUniform!.bindGroup,
    state.gpu.structureMarkerRenderer ?? undefined,
    state.gpu.proceduralDiskRenderer ?? undefined,
    // The Milky-Way pick provider + its disk-visibility-gate-and-size
    // closure.  Returns the hit billboard's half-extent in pixels (the
    // SAME apparent-px the visible selection ring uses, so the click area
    // tracks the ring) while the disk is on screen, or `null` to skip the
    // draw — the same gate `milkyWayPass.enabled` uses.  A closure over
    // `state` + `canvas` so the renderer stays free of EngineState; it
    // draws what it's told.
    state.gpu.milkyWayPickRenderer ?? undefined,
    () => milkyWayPickHalfExtentPx(state, canvas.height),
  );
  state.gpu.pickRenderer = pickRenderer;
  // The resolver runs the whole pixel → resolved `FocusableTarget`
  // boundary via `resolvePick`: it decodes the pick, looks up the
  // matching cloud, and builds the `GalaxyInfo` / `StructureInfo` the
  // InfoCard + camera consume. The cloud lookup is also the tier-swap
  // race guard — an in-flight pick decoded against a now-shrunk cloud
  // resolves to null rather than a ghost.
  state.subsystems.clickResolver = createClickResolver({
    pickRenderer,
    // The store accessors the resolver hands to `resolvePick`, shared
    // with the hover path so click and hover resolve identically.
    getCloud: (source) => state.data.galaxies.get(source),
    getFamousMeta: () => state.data.galaxies.famousMeta,
    structures: state.data.structures,
  });

  // ── Camera auto-framing ──────────────────────────────────────────────
  //
  // Pure constants — see `cameraFraming.ts`. No dependency on loaded
  // catalogs, so the camera is built before any galaxy catalog has arrived.
  const fovYRad = (Math.PI / 180) * 60;
  const initialCam = computeInitialCamera({ fovYRad });

  const cam = createOrbitCamera({
    target: initialCam.target,
    distance: initialCam.distance,
    yaw: initialCam.yaw,
    pitch: initialCam.pitch,
    fovYRad: initialCam.fovYRad,
    aspect: canvas.width / canvas.height,
    near: initialCam.near,
    far: initialCam.far,
  });
  state.cam = cam;

  // ── Bootstrap seed ───────────────────────────────────────────────────────
  //
  // Fill the cameraRuntime Resources with real values now that the initial
  // OrbitCamera exists. Without this seed the first resting frame would return
  // the placeholder `base` (yaw 0, distance 0.43) rather than the computed
  // framing pose, causing a visible camera jump on the first frame.
  //
  // Three writes, in dependency order:
  //   1. `projection` — the full projection config from the initial camera +
  //      the current canvas aspect ratio. Subsequent resizes patch only `aspect`.
  //   2. `lastPose.current` — the initial pose so the first commit-on-edge has
  //      a valid previous pose to refer to.
  //   3. `commitCameraPose` dispatch — makes `camera.base` in the Redux store
  //      authoritative before the first produced frame, so the `resting` driver
  //      returns the correct pose and the first frame does not jump.
  const store = deps.cb.store;
  state.cameraRuntime.projection = {
    fovYRad,
    aspect: canvas.width / canvas.height,
    near: initialCam.near,
    far: initialCam.far,
  };
  state.cameraRuntime.lastPose.current = poseOf(cam);
  store.dispatch(commitCameraPose(poseOf(cam)));

  // ── Initial camera snapshot for resetCamera() ────────────────────────
  //
  // Capture the framing values so `resetCamera()` can restore them later.
  // We mirror the helper's output rather than re-reading from `cam` so
  // later camera reconfigures (e.g. user FOV changes) don't drift the
  // reset target.  `aspect` is intentionally not captured — reset uses the
  // *current* canvas aspect so the projection survives a window resize.
  //
  // `target` is cloned into a fresh tuple because `createOrbitCamera`'s
  // shallow spread makes `cam.target` and `initialCam.target` alias the
  // SAME array; every later focusOn / tween / pan mutates `cam.target` in
  // place, which would otherwise corrupt the snapshot into "reset to the
  // last-focused galaxy" instead of the catalog origin.  Cloning here is a
  // one-line fix; fixing it at the spread site ripples through the
  // OrbitCamera contract.
  state.initialCamSnapshot = {
    ...initialCam,
    target: [initialCam.target[0], initialCam.target[1], initialCam.target[2]],
  };

  // ── Pointer / keyboard / resize listeners ────────────────────────────
  //
  // Centralised in `inputBindings.ts` so every DOM listener the
  // engine cares about lives in one module.  Each callback below
  // is the *semantic* engine action — the inputBindings module
  // already converts `e.clientX/Y` to a CSS-pixel record and owns
  // the requestRender wake for channel-uncovered events (see its
  // module header for the contract).
  state.subsystems.inputBindings = attachEngineInputs({
    canvas,
    // Scheduler by reference — created eagerly in the state literal (the
    // forward-declared `frame` binding handles the construction-vs-body
    // chicken-and-egg).
    scheduler: state.subsystems.scheduler,
    // Track latest mouse position for the per-frame throttled
    // hover pick.  The pick itself is async (1-2 frames later)
    // but its .then also calls requestRender so the selection
    // halo updates as soon as the readback lands.
    onPointerMove: (cssPx) => {
      state.picking.latestMouseCss = cssPx;
    },
    // Pointer left the canvas → clear hover state.  If a point
    // is selected the card stays visible (showing the pinned
    // point) — selection state is unaffected.
    onPointerLeave: () => {
      state.picking.latestMouseCss = null;
      state.subsystems.selection.setHovered(null);
    },
    // Manual orbit controls always win — cancel any running focus
    // tween the moment the user grabs the mouse.  Otherwise the
    // tween's updatePosition would fight the orbit-controls'
    // updatePosition for the same camera each frame, producing a
    // juddery jump.  Also clear hover so the card immediately
    // reflects "nothing hovered" instead of lagging until the
    // drag ends.
    onPointerDown: () => {
      state.subsystems.tweens.cancel();
      state.picking.pointerDown = true;
      state.subsystems.selection.setHovered(null);
    },
    onPointerUp: () => {
      state.picking.pointerDown = false;
    },
    // Esc is an explicit dismiss: clear BOTH the selection (close the
    // card) and the focus slot (collapse the cluster-focus fade).
    // Self-contained at the engine level so it doesn't depend on the
    // React Esc path — App.tsx also forwards Esc through the handle's
    // `clearSelection()` (→ clearAll), which does the same two clears;
    // both setters dedupe, so the double-fire is a no-op.
    onEscape: () => {
      state.subsystems.selection.setSelected(null);
      state.subsystems.selection.setFocused(null);
    },
    // resize: the next frame's resizeCanvasToDisplay() picks up
    // the new dimensions and recreates the HDR target.  All we
    // need to do is wake the loop, which inputBindings already
    // does via `scheduler.requestRender()` — so this callback is
    // a no-op.
    onResize: () => {},
  });

  // ── Click handling ───────────────────────────────────────────────────
  //
  // Click detection is delegated to `attachOrbitControls` via the `onClick`
  // option. A "click" fires only when pointerup is within 4 CSS pixels of
  // pointerdown — pure drags (orbit gestures) are suppressed.

  // Shared pick body for single-click.  Inline rather than module-level
  // because it closes over `state` and `canvas`.
  const runPickAtCss = (
    xCss: number,
    yCss: number,
  ): ReturnType<NonNullable<typeof state.subsystems.clickResolver>['resolveClick']> | null => {
    const r = state.gpu.renderer;
    const cr = state.subsystems.clickResolver;
    if (!r || state.data.galaxies.catalogs.size === 0 || !cr) return null;

    // Snapshot what's pickable — visible galaxy catalogs (filtered by the
    // pick mask; a fading-out layer clears its bit immediately so it
    // can't claim a click while still visually fading) plus whether any
    // cluster ring is on screen.  Shared with the hover + pick-debug
    // gates via collectPickTargets so all three agree.  The pick mask is
    // DERIVED FRESH here at click time — strictly fresher than the
    // per-frame value `runFrame` computes, so a same-tick toggle is
    // already reflected.
    const { visibleSources, hasAny } = collectPickTargets(
      r,
      deriveSourceMasks(state).pick,
      state.gpu.structureMarkerRenderer,
      milkyWayPickVisible(state),
    );
    if (!hasAny) return null;

    return cr.resolveClick({
      pickXPx: cssToTexPx(xCss),
      pickYPx: cssToTexPx(yCss),
      viewportPx: [canvas.width, canvas.height],
      visibleSources,
      // Threaded through so the pick pass can boost its floor size
      // for easier click targets — see PICK_PADDING_PX in pickRenderer.ts.
      pointSizePx: state.settings.galaxyCatalogs.sizePx,
      // Per-pass GPU timing.  Resolves to `undefined` when the
      // timing service isn't active on this adapter (no
      // `timestamp-query` feature) — in that case the pick render
      // pass falls back to its pre-timing descriptor shape.  When
      // present, the descriptor binds the shared query set's 'pick'
      // slot pair; the resolve+copy rides on the NEXT main-frame
      // `endFrame`, so cross-frame latency is at most one main frame.
      timingDescriptor: state.gpu.timingService.descriptorFor('pick'),
    });
  };

  deps.detachControlsRef.current = attachOrbitControls(canvas, cam, {
    // Wake the render loop after any camera mutation so the frame body
    // re-derives the pose, updates the scale bar, and runs the pick gate.
    onChange: () => {
      state.subsystems.scheduler.requestRender();
    },

    // Gesture start: seed the drag register from the live produced pose (NOT
    // from store.camera.base, which is stale mid-tween), begin the Redux drag,
    // and cancel any in-flight tween. Seeding from `lastPose.current` makes
    // both at-rest grabs (lastPose == base) and mid-tween grabs jump-free —
    // the drag register continues from exactly where the animation left the
    // camera. cancelCameraTween here + tweens.cancel() in onPointerDown are a
    // harmless dual-write bridge; Phase 5 removes tweenManager entirely.
    onGestureStart: () => {
      if (state.cam) seedCameraFromBase(state.cam, state.cameraRuntime.lastPose.current);
      store.dispatch(beginDrag());
      store.dispatch(cancelCameraTween());
    },

    // Gesture end: commit the final drag pose into Redux base BEFORE ending
    // the drag, so the committed base is in place the moment the orbitDrag
    // driver deactivates on the next frame. Without this ordering, the next
    // frame's resting driver would return the pre-gesture base, causing a
    // one-frame snap-back to the old position.
    onGestureEnd: () => {
      if (state.cam) store.dispatch(commitCameraPose(poseOf(state.cam)));
      store.dispatch(endDrag());
    },

    onClick: (xCss, yCss) => {
      // Run a one-shot pick at the click position.  We don't use
      // the throttle guard here — clicks are infrequent and we
      // want an immediate, synchronous-feeling response.
      const pick = runPickAtCss(xCss, yCss);
      if (!pick) return;
      pick.then((target) => {
        // Single-click is pure selection (null clears) for both galaxy and
        // structure hits. The resolver already built the FocusableTarget;
        // setSelected just holds it, fires onSelectChange so the React
        // InfoCard swaps bodies, and owns the render wake.
        state.subsystems.selection.setSelected(target);
      });
    },
    onDoubleClick: () => {
      // Upgrade the current selection to a focus. The preceding single-clicks
      // already pinned it, so we read the authoritative selection slot rather
      // than running a second pick (racing readbacks resolve out of order) or
      // caching a resolved copy. A null target means empty-space: release the
      // focus slot so the cluster-focus fade lifts. `handle` is resolved
      // lazily through `deps.handleRef`, non-null by the time a user can
      // dblclick.
      const handle = deps.handleRef.current;
      const target = state.subsystems.selection.selected();
      if (target) {
        handle?.camera.focusOn(target);
        return;
      }
      // setFocused owns the wake when the slot actually changes.
      state.subsystems.selection.setFocused(null);
    },
  });
}
