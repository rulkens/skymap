/**
 * encodeForegroundPass — render opaque foreground geometry (Earth, Moon, Sun)
 * into the dedicated foreground offscreen.
 *
 * ### Why a separate offscreen
 *
 * The HDR target (PostProcess.view) has no depth attachment — every existing
 * galaxy/disk/volume renderer uses additive blending with depthWriteEnabled:
 * false (see postProcess.ts:48-62 for the history of why depth was removed).
 * Foreground geometry is OPAQUE and must depth-test against itself:
 * Earth occludes its far hemisphere, a Moon in front of Earth must win the
 * depth test, and so on. Adding a depth attachment to the HDR target would
 * require re-declaring depthStencil state in every additive pipeline — a
 * cross-cutting change that previously caused regressions.
 *
 * So opaque geometry renders into a dedicated 'rgba16float + depth32float'
 * offscreen (ForegroundOffscreen) here, cleared to transparent black each
 * frame. The colour result is tone-mapped and OVER-composited onto the screen
 * later, by `encodeForegroundOver`.
 *
 * ### Why the composite is deferred past the UI overlay
 *
 * The composite runs AFTER tone-map AND after the UI overlay, not here in
 * HDR. That ordering is what makes opaque foreground bodies occlude the
 * galaxy-level labels / marker-lines behind them (and lets a future
 * translucent atmosphere tint them). `encodeForegroundOver` tone-maps the
 * foreground with the same curve the scene used, so the Sun still shares the
 * background's response across the limb.
 *
 * ### Template
 *
 * The volume-offscreen → volume-upsample pattern in encodeVolumePrepass /
 * volumeUpsamplePass is the structural template: pre-pass writes to an
 * offscreen target, a later pass samples it back in.
 */

import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { PassDeps } from '../../../@types/engine/frame/PassDeps';
import { composeBodyMvp } from '../../../utils/camera/composeBodyMvp';
import { DEBUG_SPHERE_BODIES } from '../../../data/bodies/debugSphereBody';

/**
 * Render opaque foreground geometry into ForegroundOffscreen (full-res
 * 'rgba16float' + 'depth32float'), cleared to transparent black each frame so
 * the later composite only covers pixels the foreground actually drew.
 *
 * Self-gated: if any required handle is null the function returns without
 * opening any render pass, mirroring how other passes null-check their
 * optional handles (e.g. volumeUpsamplePass, flowFieldPass).
 */
export function encodeForegroundPass(
  encoder: GPUCommandEncoder,
  ctx: ReadyFrameContext,
  state: EngineState,
  _deps: PassDeps,
): void {
  const { foregroundOffscreen, debugSphereRenderer } = state.gpu;

  // Self-gate: both handles must be constructed before this pass can run.
  // During early bootstrap or on platforms where initGpu is in flight these
  // will be null — a silent no-op keeps the frame loop correct.
  if (!foregroundOffscreen || !debugSphereRenderer) return;

  // ── Render opaque geometry into the foreground offscreen ──────────────────
  //
  // Clear colour to transparent black (r:0,g:0,b:0,a:0) so pixels the
  // foreground does NOT draw retain full transparency — the later composite
  // leaves those pixels unchanged on screen.
  //
  // Clear depth to 1.0 (far plane) so the first foreground fragment always
  // wins the initial depth test regardless of draw order.
  const fgPass = encoder.beginRenderPass({
    label: 'foreground-depth-pass',
    colorAttachments: [
      {
        view: foregroundOffscreen.colorView,
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
    depthStencilAttachment: {
      view: foregroundOffscreen.depthView,
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  });

  // One MVP per debug body, each composed fully in f64 before narrowing to
  // f32 (see composeBodyMvp for the catastrophic-cancellation rationale). The
  // renderer draws each into the depth-tested foreground in array order.
  const mvps = DEBUG_SPHERE_BODIES.map((body) =>
    composeBodyMvp(ctx.foregroundVp, body.positionMpc, ctx.renderOrigin, body.radiusMpc),
  );
  debugSphereRenderer.draw(fgPass, mvps);

  fgPass.end();

  // The OVER-composite of this offscreen onto the screen happens later, in
  // `encodeForegroundOver` — AFTER tone-map and AFTER the UI overlay — so
  // opaque foreground bodies occlude the galaxy-level labels behind them.
  // This pass only fills the offscreen; it does not touch the HDR target.
}
