/**
 * mcpmSlot — factory for the MCPM Cosmic Web volume's asset slot.
 *
 * Tier-aware (unlike cf4DensitySlot's void request). On commit, hands
 * the decoded ScalarCube to scalarVolumeRenderer.addField under the
 * handle 'mcpm', then seeds per-field settings if not already present
 * (preserving any user-tuned intensity/palette across tier reloads).
 *
 * Gate ownership matches cf4DensitySlot: the factory itself is
 * unconditional; `wireSlots` is responsible for the volumesGateOpen
 * check before invoking it.
 */
import { createAssetSlot } from '../AssetSlot';
import { mcpmFetcher } from '../fetchers/mcpmFetcher';
import type { MCPMReq } from '../fetchers/mcpmFetcher';
import { DEFAULT_MCPM_ENABLED, DEFAULT_VOLUME_FIELD_INTENSITY } from '../../../data/defaults';
import { getVolumeFieldDefaults } from '../../../data/volumeFieldDefaults';
import type { ScalarCube } from '../../../@types/ScalarCube';
import type { SlotFactory } from './types';

export const createMcpmSlot: SlotFactory<ScalarCube, MCPMReq> = (state, cb) => {
  const slot = createAssetSlot({
    name: 'mcpm',
    fetch: mcpmFetcher,
    commit: async (cube) => {
      const renderer = state.gpu.scalarVolumeRenderer;
      if (!renderer) return;
      const handle = 'mcpm';
      const defaults = getVolumeFieldDefaults(handle);
      renderer.addField(handle, cube);
      // Seed-and-forward shape lifted from cf4DensitySlot (verbatim
      // duplication is intentional — H3 in the 2026-05-11 audit deferred
      // dedup of this pattern to a follow-up PR).
      if (!state.settings.volumes.fields[handle]) {
        state.settings.volumes.fields[handle] = {
          // Default-on — MCPM is the headline cosmic-web overlay for the
          // volumes gate (CF-4 is now default-off; see defaults.ts).
          enabled: DEFAULT_MCPM_ENABLED,
          intensity: defaults.intensity ?? DEFAULT_VOLUME_FIELD_INTENSITY,
          contrast: defaults.contrast,
          densityScale: defaults.densityScale,
          paletteId: defaults.paletteId,
          trim: defaults.trim,
          exposure: defaults.exposure,
        };
      }
      const persisted = state.settings.volumes.fields[handle]!;
      renderer.setIntensity(handle, persisted.intensity);
      renderer.setEnabled(handle, persisted.enabled);
      renderer.setContrast(handle, persisted.contrast);
      renderer.setFieldPalette(handle, persisted.paletteId);
      renderer.setDensityScale(handle, persisted.densityScale);
      renderer.setEnvelope(handle, defaults.envelope.inner, defaults.envelope.outer);
      renderer.setContrastCenter(handle, defaults.contrastCenter);
      renderer.setExposure(handle, persisted.exposure);
      renderer.setTrim(handle, persisted.trim);
      cb.volumes?.onFieldsChanged?.();
      state.subsystems.scheduler.requestRender();
    },
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      console.log(
        `[engine] mcpm: ${s.value.dims.join('x')} cube, ` +
          `min=${s.value.valueMin.toFixed(3)}, max=${s.value.valueMax.toFixed(3)}`,
      );
    }
  });
  state.assetSlots.mcpm = slot;
  return slot;
};
