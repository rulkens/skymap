/**
 * volumeLiveness — the shared per-frame projection that answers "is there live
 * scalar-volume work this frame, and with which per-field read closures?".
 *
 * ### The double-gate knot this dissolves
 *
 * The scalar-volume subsystem draws in two steps: a half-res raymarch into the
 * volume offscreen (the `scalar-volume` layer), then a bilinear upsample of
 * that offscreen into HDR (the `volume-upsample` layer). Pre-unification each
 * step decided independently whether to run — the raymarch via its own
 * pre-HDR gate, the upsample via `volumeUpsampleLayer.enabled`'s
 * hand-mirror. Those two gates could drift on three axes (whether they clamped
 * the field settings, whether they folded in focus recession, and how they
 * counted a fade-out tail as "active"), producing the audit's stale-offscreen
 * finding: the producer draws into a target the consumer skips, or vice versa.
 *
 * Deriving the fact ONCE, here, gives the producer and consumer a single home:
 * both layers' `enabled` is `deriveVolumeLiveness(...) !== null`, so they cannot
 * disagree by construction. The non-null result also carries the exact
 * `settingsOf` / `fadeOpacityOf` closures the raymarch draw needs, so the layer
 * reads per-field knobs through the same projection its gate was computed from.
 *
 * ### Pure projection — no caching
 *
 * `deriveVolumeLiveness` reads live `state` + `ctx` and allocates fresh closures
 * each call; it stores nothing across frames. Calling it twice in one frame
 * (once per layer `enabled`, plus once inside the raymarch `draw`) is safe and
 * cheap — the closures are thin, and the whole point is that there is no mutable
 * mirror to fall out of sync.
 *
 * ### Gating rationale (lifted verbatim from the prepass gate)
 *
 * Master gate: `volumes.enabled` OR a non-zero master fade tail — recession is
 * applied to the master MULTIPLIER only (`recessedMaster ∈ [VOLUME_RECESSION, 1]`
 * can never zero the layer), so the gate reads the pure toggle, matching the
 * filament layer. The `fadeOpacityOf` closure multiplies the recessed master
 * into every per-field lookup so a master fade-out drags every field down
 * together. `settingsOf` clamps GPU-bound field knobs at the read edge so
 * out-of-range store Intent never reaches the raymarch uniforms (mirrors the
 * setFlow / clampFlowParams pattern). Passing `fadeOpacityOf` to
 * `hasActiveFields` widens "active" to include fields whose toggle is off but
 * whose fade-out tail is still in flight.
 *
 * ### Per-field scale-fade bands ride the same closure
 *
 * Each field carries its OWN `bands` (`VolumeFieldSettings.bands`, seeded by
 * `buildVolumeFieldSettings` from the registry's `fadeBands`, defaulting to
 * `[SCALE_FADE_BANDS.surveyDeepZoom]`) rather than one band applied to every
 * field — a field whose subject is local (e.g. a dust cube measured from
 * nearby stars) wants to be full where a cosmic-scale field like MCPM has
 * long since faded. `fadeOpacityOf` multiplies the product of a field's own
 * bands into its opacity, alongside the recessed master. Because
 * `hasActiveFields` reads through this same closure, a camera sitting inside
 * every resident field's combined goneAt edges sees every field at 0 and
 * liveness returns null — BOTH the raymarch and upsample layers then disable
 * by construction, which is this module's whole design: no per-layer band
 * checks to drift.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { VolumeFieldId } from '../../../@types/data/volume/VolumeFieldId';
import type { VolumeFieldSettings } from '../../../@types/settings/VolumeFieldSettings';
import { resolveLayerOpacity } from '../presentation/focusRecession';
import { clampVolumeFieldSettings } from '../../../utils/clampVolumeFieldSettings';
import { fadeBand } from '../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from '../presentation/scaleFadeBands';

/**
 * Derive this frame's volume liveness.
 *
 * Returns `null` when no live volume work should run — the renderer is missing
 * (pre-bootstrap), the master is off AND fully faded, or no field is active.
 * Non-null carries the per-field read closures both volume layers consume.
 */
export function deriveVolumeLiveness(
  state: EngineState,
  ctx: ReadyFrameContext,
): {
  settingsOf: (id: VolumeFieldId) => VolumeFieldSettings | undefined;
  fadeOpacityOf: (id: VolumeFieldId) => number;
} | null {
  const renderer = state.gpu.volumeFieldRenderer;
  if (renderer === null) return null;

  const nowMs = ctx.nowMs;
  const masterOpacity = state.subsystems.fades.opacityOf({ kind: 'volumesMaster' }, nowMs);
  if (!state.settings.volumes.enabled && masterOpacity <= 0) return null;

  // Focus recession dims the whole volume subsystem in lockstep with the
  // filament overlay; applied to the master multiplier only (see the module
  // header). The clip channel is behaviour-neutral when no clip is playing.
  const recessedMaster = resolveLayerOpacity(state, ctx, { kind: 'volumesMaster' });
  // Camera distance from the heliocentric render origin (`ctx.drawCamPos`,
  // the same quantity the point sprites key on) — the shared key every
  // field's `bands` are measured against (see the module header).
  const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
  const settingsOf = (id: VolumeFieldId) => {
    const raw = state.settings.volumes.items[id];
    return raw === undefined ? undefined : clampVolumeFieldSettings(raw);
  };
  const fadeOpacityOf = (id: VolumeFieldId) => {
    // No store row at all (id never seeded) gets the same default a stale
    // row would via clampVolumeFieldSettings — see that function's header.
    const bands = settingsOf(id)?.bands ?? [SCALE_FADE_BANDS.surveyDeepZoom];
    const bandFactor = bands.reduce((factor, band) => factor * fadeBand(band, camDistMpc), 1);
    return (
      state.subsystems.fades.opacityOf({ kind: 'volumeField', id }, nowMs) *
      recessedMaster *
      bandFactor
    );
  };

  if (!renderer.hasActiveFields(settingsOf, fadeOpacityOf)) return null;
  return { settingsOf, fadeOpacityOf };
}
