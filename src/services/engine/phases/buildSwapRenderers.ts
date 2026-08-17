/**
 * buildSwapRenderers — (re)builds the eight renderers whose pipelines are
 * baked against the swap-chain colour-target format: the label, marker-line,
 * debug-line, and selection-ring overlays; the pick-debug overlay; the
 * disk-radius ring; and their NEAR0 foreground twins — see
 * docs/superpowers/plans/2026-07-30-hdr-display-toggle.md for why a
 * swap-format change needs a rebuild. `device`/`context`/`canvas`/the font
 * atlas live on `state.gpu.uiCtx`/`state.gpu.fontAtlases`, not as arguments,
 * so this stays callable with just `state` and `format`.
 */

import { createLabelRenderer } from '../../gpu/renderers/labels/labelRenderer';
import { createMarkerLineRenderer } from '../../gpu/renderers/labels/markerLineRenderer';
import { createDebugLineRenderer } from '../../gpu/renderers/devTools/debugLineRenderer';
import { createSelectionRingRenderer } from '../../gpu/renderers/selectionRing/selectionRingRenderer';
import { createPickDebugOverlay } from '../../gpu/passes/pickDebugOverlay';
import { createDiskRadiusRing } from '../../gpu/renderers/devTools/diskRadiusRing';
import { FOREGROUND_LABEL_CAPACITY } from '../presentation/sceneBodyLabels';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { GpuContext } from '../../../@types/rendering/GpuContext';

export function buildSwapRenderers(state: EngineState, format: GPUTextureFormat): void {
  const uiCtx: GpuContext = { ...state.gpu.uiCtx!, format };
  const device = uiCtx.device;
  const fontAtlases = state.gpu.fontAtlases!;

  // `{ occludeAgainstDepth: 'coverage' }`: COSMO/NEAR0 window-Z is
  // incomparable across slabs, so occlusion here must be coverage, not
  // compare (lib/sceneDepth.wesl).
  state.gpu.labelRenderer?.destroy();
  state.gpu.labelRenderer = createLabelRenderer(uiCtx, format, fontAtlases, undefined, undefined, {
    occludeAgainstDepth: 'coverage',
  });
  state.gpu.markerLineRenderer?.destroy();
  state.gpu.markerLineRenderer = createMarkerLineRenderer(uiCtx, format, undefined, {
    occludeAgainstDepth: 'coverage',
  });

  // Own pipeline (decoupled from the label director). Capacity: the seam
  // samples up to 4000 points (`engine.ts`) → 2·(4000−1) route+target
  // segments + 9 gizmo = 8007 lines — 8192 gives margin.
  state.gpu.debugLineRenderer?.destroy();
  state.gpu.debugLineRenderer = createDebugLineRenderer(uiCtx, format, 8192);

  // Same cross-slab COVERAGE occlusion as above; the NEAR0 sibling passes no depth view.
  state.gpu.selectionRingRenderer?.destroy();
  state.gpu.selectionRingRenderer = createSelectionRingRenderer(uiCtx, format, {
    occludeAgainstDepth: 'coverage',
  });

  // Both take only (device, format) — no dependency on state built above.
  state.gpu.pickDebugOverlay?.destroy();
  state.gpu.pickDebugOverlay = createPickDebugOverlay(device, format);
  state.gpu.diskRadiusRing?.destroy();
  state.gpu.diskRadiusRing = createDiskRadiusRing(device, format);

  // Separate instances: NEAR0 captions/leader-lines need their own
  // view-projection, not the galaxy-scale COSMO `vp`. `{ occludeAgainstDepth:
  // 'compare' }` here — unlike above, NEAR0 depth IS comparable. Sized to
  // `FOREGROUND_LABEL_CAPACITY`, which exceeds the 64-label default.
  state.gpu.foregroundLabelRenderer?.destroy();
  state.gpu.foregroundLabelRenderer = createLabelRenderer(
    uiCtx,
    format,
    fontAtlases,
    FOREGROUND_LABEL_CAPACITY,
    undefined,
    { occludeAgainstDepth: 'compare' },
  );
  state.gpu.foregroundMarkerLineRenderer?.destroy();
  state.gpu.foregroundMarkerLineRenderer = createMarkerLineRenderer(uiCtx, format, undefined, {
    occludeAgainstDepth: 'compare',
  });

  // The director holds direct renderer refs — skipping this would leave it
  // drawing into destroyed buffers, so labels/marker-lines would vanish.
  state.subsystems.labelDirector.attachRenderers(
    state.gpu.labelRenderer,
    state.gpu.markerLineRenderer,
  );
}
