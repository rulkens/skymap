import type { AppState } from '../../@types/AppState';
import { hasUrlGate } from '../../../../src/utils/url/hasUrlGate';
import { defaultCatalogSlice } from './slices/catalogSlice';
import { defaultGridSlice } from './slices/gridSlice';
import { defaultHistogramSlice } from './slices/histogramSlice';
import { defaultSimSlice } from './slices/simSlice';
import { defaultViewSlice } from './slices/viewSlice';

// `?probe` (probeGpuErrors.ts) needs the gate's own run to be fast and to
// respect ruling R11's quantum floor — 100_000 sits BELOW the panel's own
// Slider min of 1M (see ControlsPanel.tsx), which only clamps user drags,
// never this seed value, so the harness sees it untouched.
const PROBE_LONG_AXIS_TARGET = 64; // <=128 per task-T12-brief.md, still >8 (decay's /8 dispatch)
const PROBE_AGENT_COUNT = 100_000;

/** defaultAppState — the store's seed value, one slice default per field. */
export const defaultAppState: AppState = hasUrlGate('probe')
  ? {
      catalog: defaultCatalogSlice,
      // autoFit pinned ON: the boot default is manual mode, where longAxisTarget is
      // inert and manualResolution (128) would silently double the probe grid.
      grid: { ...defaultGridSlice, autoFit: true, longAxisTarget: PROBE_LONG_AXIS_TARGET },
      sim: { ...defaultSimSlice, agentCount: PROBE_AGENT_COUNT },
      view: defaultViewSlice,
      histogram: defaultHistogramSlice,
    }
  : {
      catalog: defaultCatalogSlice,
      grid: defaultGridSlice,
      sim: defaultSimSlice,
      view: defaultViewSlice,
      histogram: defaultHistogramSlice,
    };
