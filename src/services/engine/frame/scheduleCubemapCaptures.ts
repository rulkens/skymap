/**
 * scheduleCubemapCaptures — per `CUBEMAP_CAPTURES` row, which faces this frame
 * re-bakes and the synthetic camera each one draws through. All six, or none.
 *
 * Two side effects: it is the SINGLE writer of each row's
 * `CubemapCaptureRuntime`, and on a band edge it reconciles the render targets
 * — the row's texture must exist on the band-entry frame, the frame that sweeps.
 */

import type { CaptureFaceContexts } from '../../../@types/engine/frame/CaptureFaceContexts';
import type { CubemapCaptureKey } from '../../../@types/rendering/CubemapCaptureKey';
import type { CubeFace } from '../../../@types/rendering/CubeFace';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import { ALL_CUBE_FACES, CUBEMAP_CAPTURES } from '../../../data/rendering/cubemapCaptures';
import { cubemapFaceContext } from './cubemapFaceContext';
import { fadeBand } from '../../../utils/math/fadeBand';
import { regionRelativeDistanceMpc } from '../../../utils/scene/regionRelativeDistanceMpc';
import { sceneBodyStates } from './sceneBodyStates';

export function scheduleCubemapCaptures(input: {
  readonly state: EngineState;
  readonly ctx: ReadyFrameContext;
}): CaptureFaceContexts {
  const { state, ctx } = input;
  const bodyStates = sceneBodyStates(state, ctx);
  // Two roster inputs move with no settings write: a source-visibility ramp
  // (the write fires at its START) and a thumbnail's async 400 ms load fade.
  const rosterSettling =
    state.subsystems.fades.isAnyAnimating(ctx.nowMs) ||
    (state.subsystems.texturedDisks?.hasInFlightWork() ?? false);

  const scheduled = new Map<CubemapCaptureKey, ReadonlyMap<CubeFace, ReadyFrameContext>>();
  for (const key of Object.keys(CUBEMAP_CAPTURES) as CubemapCaptureKey[]) {
    const row = CUBEMAP_CAPTURES[key];
    const runtime = state.cubemapCaptures[key];
    // Unconditional, band or no band: the target's release-margin check needs
    // the distance on the very frame the band closes, not one frame later.
    const anchorDistanceMpc = regionRelativeDistanceMpc(ctx.drawCamPos, row.anchor, bodyStates);
    runtime.lastAnchorDistanceMpc = anchorDistanceMpc;

    const bandActive = fadeBand(row.band, anchorDistanceMpc) > 0;
    // `runFrame`'s reconcile runs BEFORE this frame's pose exists and cannot
    // see the band open; the edge reconciles here so the row's texture exists
    // for the sweep. `bakedSettings` is null while shut, so entry always bakes.
    if (bandActive !== runtime.lastBandActive) {
      runtime.lastBandActive = bandActive;
      ctx.renderTargets.reconcile(state, ctx.canvasSize);
      if (!bandActive) runtime.bakedSettings = null;
    }
    if (!bandActive) continue;
    if (!rosterSettling && runtime.bakedSettings === state.settings) continue;

    // One bake covers the band: a 1024² face's texel is ~1.5 mrad, so content
    // at 8 kpc shifts by a texel only after ~12 pc of travel, against a 500 AU
    // band — and the lens samples the cubemap at infinity, so no eye to pin.
    // Absent from the settings-ref re-bake key on purpose: `tier` (a swap
    // re-commits every visible catalog, and each commit's fade-in keeps
    // `rosterSettling` true across it),
    // `faceSizePx` (its knob IS a settings write, reconciled above first),
    // `selection` (a stale halo in the lensed sky is accepted).
    const faces = new Map<CubeFace, ReadyFrameContext>();
    const faceSizePx = ctx.renderTargets.sizeOf(row.target).width;
    for (const face of ALL_CUBE_FACES) {
      const faceCtx = cubemapFaceContext({
        state,
        eyeMpc: ctx.drawCamPos,
        face,
        faceSizePx,
        nearMpc: row.nearMpc,
        viewSlotBase: row.viewSlotBase,
        nowMs: ctx.nowMs,
      });
      if (faceCtx !== null) faces.set(face, faceCtx);
    }
    // A face's context comes back null pre-bootstrap: schedule nothing and leave
    // `bakedSettings` untouched, so the next frame retries the whole sweep.
    if (faces.size !== ALL_CUBE_FACES.length) continue;
    scheduled.set(key, faces);
    // Only a settled bake is recorded: while the roster moves, null keeps the
    // next frame baking, and the first settled frame bakes once more.
    runtime.bakedSettings = rosterSettling ? null : state.settings;
  }
  return scheduled;
}
