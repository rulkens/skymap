/**
 * cf4DensitySlot — factory for the CF-4 DM density volume's asset slot.
 *
 * On commit, hands the decoded `ScalarCube` to
 * `scalarVolumeRenderer.addField` under the handle `'cf4-density'`,
 * preserving any user-tuned intensity/palette (the construction seed
 * already created the entry).
 *
 * **Lazy fetch.**  This factory mints the slot unconditionally, but
 * CF-4 is registry-visible:false, so its construction seed lands
 * `enabled: false` and the slot stays idle at boot.  Toggling the field
 * on flips the bit and lazy-loads via `engine.setVolumeFieldEnabled`,
 * keeping a default-off CF-4 off the boot bandwidth budget.
 *
 * **Seed shape.**  The settings seed is shared with the other volume
 * slots + the construction seed via `buildVolumeFieldSettings`.
 */

import { createAssetSlot } from '../AssetSlot';
import { cf4DensityFetcher } from '../fetchers/cf4DensityFetcher';
import { Source, SOURCE_REGISTRY } from '../../../data/sources';
import { buildVolumeFieldSettings } from '../../../data/volumeFieldDefaults';
import { FADE_IN_DURATION_MS } from '../../animation/fadeController';
import type { ScalarCube } from '../../../@types/data/ScalarCube';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';
import { buildVolumeFieldsSnapshot } from '../../engine/helpers/buildVolumeFieldsSnapshot';

export const createCf4DensitySlot: SlotFactory<ScalarCube, void> = (state, cb) => {
  const slot = createAssetSlot({
    name: 'cf4Density',
    fetch: cf4DensityFetcher,
    commit: async (cube) => {
      const renderer = state.gpu.scalarVolumeRenderer;
      if (!renderer) return;
      // Seed defaults from SOURCE_REGISTRY rather than the cube; SCFD
      // v2 is a data-only format (dims + frame + voxels + dynamic
      // range) so palette + densityScale don't ride along in the
      // binary anymore. The renderer setters below read from
      // `persisted`, so once an entry exists the user-tuned values
      // (future persistence) override the seed.
      const defaults = SOURCE_REGISTRY[Source.Cf4Density];
      const handle = defaults.handle;
      renderer.addField(handle, cube);
      // Preserve any previously-tuned settings; otherwise seed from the
      // registry.  CF-4 is a shippable volume, so the engine's
      // construction seed already created this entry — the guard
      // normally takes the preserve branch.
      if (!state.data.volumes.params(handle)) {
        state.data.volumes.setParams(handle, buildVolumeFieldSettings(handle));
      }
      const persisted = state.data.volumes.params(handle)!;
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
      renderer.setExposure(handle, persisted.exposure);
      renderer.setTrim(handle, persisted.trim);
      // Drive the FadeRegistry from the persisted enable bit. See
      // mcpmSlot for the symmetric pattern.
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
        `[engine] cf4Density: ${s.value.dims.join('x')} cube, ` +
          `min=${s.value.valueMin.toFixed(3)}, max=${s.value.valueMax.toFixed(3)}`,
      );
    }
  });
  return slot;
};
