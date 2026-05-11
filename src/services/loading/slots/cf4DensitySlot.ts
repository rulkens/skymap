/**
 * cf4DensitySlot — factory for the CF-4 DM density volume's asset slot.
 *
 * Eager-at-boot fetch of `public/data/cf4_density.scfd`.  On commit,
 * hands the decoded `ScalarCube` to `scalarVolumeRenderer.addField` under
 * the handle `'cf4-density'`, then seeds per-field settings if not
 * already present (preserving any user-tuned intensity/palette across
 * sessions).
 *
 * **Gate ownership.**  Pre-H4 the URL/DEV gate (`volumesGateOpen`) lived
 * inline in `wireSlots.ts` and skipped the entire mint block.  H4 keeps
 * the gate in wireSlots (it's a per-call orchestration concern — the
 * same flag decides whether the synthetic-volume fixtures mint too) and
 * makes this factory unconditional.  Callers should only invoke it when
 * the gate is open.
 *
 * **Seed-and-forward shape.**  The commit duplicates the same seed
 * pattern the synthetic-volume factory uses (and that
 * `engineHandle.addVolumeField` performs against the public API).  H3 in
 * the same audit deferred dedup of that pattern to a follow-up PR; the
 * commit body here is copied verbatim from the inline block.
 */

import { createAssetSlot } from '../AssetSlot';
import { cf4DensityFetcher } from '../fetchers/cf4DensityFetcher';
import {
  DEFAULT_CF4_DENSITY_ENABLED,
  DEFAULT_VOLUME_FIELD_INTENSITY,
} from '../../../data/defaults';
import { getVolumeFieldDefaults } from '../../../data/volumeFieldDefaults';
import type { ScalarCube } from '../../../@types/ScalarCube';
import type { SlotFactory } from './types';

export const createCf4DensitySlot: SlotFactory<ScalarCube, void> = (state, cb) => {
  const slot = createAssetSlot({
    name: 'cf4Density',
    fetch: cf4DensityFetcher,
    commit: async (cube) => {
      const renderer = state.gpu.scalarVolumeRenderer;
      if (!renderer) return;
      const handle = 'cf4-density';
      // Seed defaults from the per-handle registry rather than the
      // cube; SCFD v2 is a data-only format (dims + frame + voxels
      // + dynamic range) so palette + densityScale don't ride along
      // in the binary anymore.  See `src/data/volumeFieldDefaults.ts`
      // for the why-not-binary discussion.  The renderer setters
      // below read from `persisted`, so once an entry exists the
      // user-tuned values (future persistence) override the seed.
      const defaults = getVolumeFieldDefaults(handle);
      renderer.addField(handle, cube);
      if (!state.settings.volumes.fields[handle]) {
        state.settings.volumes.fields[handle] = {
          enabled: DEFAULT_CF4_DENSITY_ENABLED,
          intensity: DEFAULT_VOLUME_FIELD_INTENSITY,
          contrast: defaults.contrast,
          densityScale: defaults.densityScale,
          paletteId: defaults.paletteId,
        };
      }
      const persisted = state.settings.volumes.fields[handle]!;
      renderer.setIntensity(handle, persisted.intensity);
      renderer.setEnabled(handle, persisted.enabled);
      renderer.setContrast(handle, persisted.contrast);
      renderer.setFieldPalette(handle, persisted.paletteId);
      renderer.setDensityScale(handle, persisted.densityScale);
      // Envelope is per-cube static (a presentation property of the
      // dataset, not a user-tunable slider) so we apply it straight
      // from the registry rather than mirroring it into
      // `persisted` — no JS-side state to keep in sync.
      renderer.setEnvelope(handle, defaults.envelope.inner, defaults.envelope.outer);
      renderer.setContrastCenter(handle, defaults.contrastCenter);
      renderer.setExposure(handle, defaults.exposure);
      cb.volumes?.onFieldsChanged?.();
      state.subsystems.scheduler.requestRender();
    },
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      console.log(
        `[engine] cf4Density: ${s.value.dims.join('x')} cube, ` +
          `min=${s.value.valueMin.toFixed(3)}, max=${s.value.valueMax.toFixed(3)}`,
      );
    }
  });
  state.assetSlots.cf4Density = slot;
  return slot;
};
