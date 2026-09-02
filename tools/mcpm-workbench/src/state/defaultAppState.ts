import type { RootState } from '../store/types';
import { hasUrlGate } from '../../../../src/utils/url/hasUrlGate';
import { defaultCatalogSlice } from './catalog/catalogSlice';
import { defaultGridSlice } from './grid/gridSlice';
import { defaultHistogramSlice } from './histogram/histogramSlice';
import { defaultSimSlice } from './sim/simSlice';
import { defaultViewSlice } from './view/viewSlice';

// `?probe` (probeGpuErrors.ts) needs the gate's own run to be fast and to
// respect ruling R11's quantum floor — 100_000 sits BELOW the panel's own
// Slider min of 1M (see ControlsPanel.tsx), which only clamps user drags,
// never this seed value, so the harness sees it untouched.
// PROBE_VOXEL_SIZE_MPC=3.125 -> ceil8(200/3.125)=64 long axis on the default
// 200 Mpc manual box (<=128, still >8 for decay's /8 dispatch) — the exact
// value the old PROBE_GRID_DIVISOR=4 (round(256/4)=64) produced, so the probe
// grid's size is unchanged by the currency swap; same as PROBE_AGENT_COUNT
// sitting below the Slider's own min.
const PROBE_VOXEL_SIZE_MPC = 3.125;
const PROBE_AGENT_COUNT = 100_000;

const baseAppState: RootState = {
  catalog: defaultCatalogSlice,
  grid: defaultGridSlice,
  sim: defaultSimSlice,
  view: defaultViewSlice,
  histogram: defaultHistogramSlice,
};

/** defaultAppState — the store's seed value, one slice default per field. */
export const defaultAppState: RootState = hasUrlGate('probe')
  ? {
      ...baseAppState,
      // Grid derivation is always the manual path ("auto fit" is a one-shot
      // action, not a mode — gridSlice.ts's fitBoxToCatalog) — PROBE_VOXEL_SIZE_MPC
      // alone is what keeps the probe grid small; the default manual box's own
      // 0.75 Mpc voxel size would otherwise ship unscaled (272³).
      grid: { ...defaultGridSlice, manualVoxelSizeMpc: PROBE_VOXEL_SIZE_MPC },
      sim: { ...defaultSimSlice, agentCount: PROBE_AGENT_COUNT },
    }
  : baseAppState;
