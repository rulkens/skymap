/**
 * mcpmSlot — factory for the MCPM Cosmic Web volume's asset slot.
 *
 * Tier-aware (unlike cf4DensitySlot's void request). On commit, hands
 * the decoded ScalarCube to scalarVolumeRenderer.addField under the
 * handle 'mcpm', preserving any user-tuned intensity/palette across
 * tier reloads (the construction seed already created the entry).
 *
 * Default-on cosmic-web baseline (registry visible:true). Its on/off
 * bit is seeded at engine construction, so the demand predicate
 * `fields['mcpm'].enabled` reads true at boot — symmetric with how a
 * default-on survey reads visible from `drawMask`, with no field-state
 * dependency on the cube having loaded first.
 */
import { createAssetSlot } from '../AssetSlot';
import { mcpmFetcher } from '../fetchers/mcpmFetcher';
import type { MCPMReq } from '../../../@types/loading/MCPMReq';
import { Source, SOURCE_REGISTRY } from '../../../data/sources';
import { buildVolumeFieldSettings } from '../../../data/volumeFieldDefaults';
import { FADE_IN_DURATION_MS } from '../../animation/fadeController';
import type { ScalarCube } from '../../../@types/data/ScalarCube';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';
import { buildVolumeFieldsSnapshot } from '../../engine/helpers/buildVolumeFieldsSnapshot';

export const createMcpmSlot: SlotFactory<ScalarCube, MCPMReq> = (state, cb) => {
  const slot = createAssetSlot({
    name: 'mcpm',
    fetch: mcpmFetcher,
    commit: async (cube) => {
      const renderer = state.gpu.scalarVolumeRenderer;
      if (!renderer) return;
      const defaults = SOURCE_REGISTRY[Source.Mcpm];
      const handle = defaults.handle;
      renderer.addField(handle, cube);
      // Preserve any previously-tuned settings; otherwise seed from the
      // registry.  The engine's construction seed already created this
      // entry (MCPM is a shippable volume), so the guard normally takes
      // the preserve branch — it stays only to cover a handle with no
      // construction seed.
      if (!state.settings.volumes.fields[handle]) {
        state.settings.volumes.fields[handle] = buildVolumeFieldSettings(handle);
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
      // Drive the FadeRegistry from the persisted enable bit. The
      // onFieldAdded callback registered the handle at opacity 0;
      // here we fade up to 1 only if the user has the field toggled
      // on (matches the symmetric path in engine.ts addVolumeField).
      if (persisted.enabled) {
        void state.subsystems.fades.fadeTo(
          { kind: 'scalarField', field: handle },
          1,
          FADE_IN_DURATION_MS,
        );
      }
      cb.volumes?.onFieldsChanged?.(buildVolumeFieldsSnapshot(state));
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
  return slot;
};
