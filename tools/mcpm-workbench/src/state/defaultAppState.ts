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
// PROBE_GRID_DIVISOR=4 -> round(256/4)=64 long axis (<=128, still >8 for
// decay's /8 dispatch) — outside the UI's 7-notch pill list on purpose,
// same as PROBE_AGENT_COUNT sitting below the Slider's own min.
const PROBE_GRID_DIVISOR = 4;
const PROBE_AGENT_COUNT = 100_000;

/** defaultAppState — the store's seed value, one slice default per field. */
export const defaultAppState: AppState = hasUrlGate('probe')
  ? {
      catalog: defaultCatalogSlice,
      // autoFit pinned ON: the boot default is manual mode, where the
      // auto-fit divisor is inert and the manual grid's own (256) would
      // silently quadruple the probe grid.
      grid: { ...defaultGridSlice, autoFit: true, divisor: PROBE_GRID_DIVISOR },
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
