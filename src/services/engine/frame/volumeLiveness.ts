/**
 * volumeLiveness — the one home for "is there live scalar-volume work this
 * frame?". Both volume layers gate on `deriveVolumeLiveness(...) !== null` — the
 * half-res raymarch producer and the upsample consumer that reads its offscreen
 * — so they cannot drift into drawing into a target nobody samples.
 *
 * Pure projection: reads live state, allocates fresh closures per call, caches
 * nothing, so the several calls per frame are safe by construction.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { VolumeFieldId } from '../../../@types/data/volume/VolumeFieldId';
import type { VolumeFieldSettings } from '../../../@types/settings/VolumeFieldSettings';
import { resolveLayerOpacity } from '../presentation/focusRecession';
import { clampVolumeFieldSettings } from '../../../utils/clampVolumeFieldSettings';
import { fadeBand } from '../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from '../presentation/scaleFadeBands';

// `null` = no live volume work: renderer missing, master off AND fully faded, or
// no field active.
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

  // Recession lands on the master MULTIPLIER only: `recessedMaster ∈
  // [VOLUME_RECESSION, 1]` can't zero the layer, so the gate reads the pure toggle.
  const recessedMaster = resolveLayerOpacity(state, ctx, { kind: 'volumesMaster' });
  // Mpc from the heliocentric render origin — the key every field's `bands` are
  // measured against.
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
      resolveLayerOpacity(state, ctx, { kind: 'volumeField', id }) * recessedMaster * bandFactor
    );
  };

  if (!renderer.hasActiveFields(settingsOf, fadeOpacityOf)) return null;
  return { settingsOf, fadeOpacityOf };
}
