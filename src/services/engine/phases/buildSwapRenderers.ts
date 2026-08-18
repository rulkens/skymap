/**
 * buildSwapRenderers — (re)builds the eight renderers whose pipelines are
 * baked against the swap-chain colour-target format, deriving the set from
 * `GPU_HANDLE_ROWS`'s `rebuildOnSwapFormat` flag rather than a hand-written
 * list — see docs/superpowers/plans/2026-07-30-hdr-display-toggle.md for why
 * a swap-format change needs a rebuild. Destroy-then-construct runs PER ROW
 * (not destroy-all-then-construct-all): this stays a second, inline
 * teardown site alongside `destroyGpuHandles` by design.
 */

import { GPU_HANDLE_ROWS } from '../gpuHandles/gpuHandleRegistry';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { GpuHandleKey } from '../../../@types/engine/handles/GpuHandleKey';
import type { GpuHandleRow } from '../../../@types/engine/handles/GpuHandleRow';
import type { GpuHandleConstructDeps } from '../../../@types/engine/handles/GpuHandleConstructDeps';
import type { Disposable } from '../../../@types/engine/handles/Disposable';

export function buildSwapRenderers(state: EngineState, format: GPUTextureFormat): void {
  const uiCtx = state.gpu.uiCtx!;
  const fontAtlases = state.gpu.fontAtlases!;

  // fadeBgl/sourceBgl/focusBgl: none of the 8 rows below read them, and the
  // code this replaces never touched `state.gpu.fadeBgl` et al. here either —
  // getters keep that true instead of widening this call's state requirement.
  const deps: GpuHandleConstructDeps = {
    ctx: { ...uiCtx, format },
    get fadeBgl() {
      return state.gpu.fadeBgl!;
    },
    get sourceBgl() {
      return state.gpu.sourceBgl!;
    },
    get focusBgl() {
      return state.gpu.focusBgl!;
    },
    fontAtlases,
  };

  // `=== true`, not `.rebuildOnSwapFormat` truthiness — the flag is absent
  // (not `false`) on unflagged rows, so the value test doubles as the
  // presence check without an `exactOptionalPropertyTypes` hazard.
  for (const row of GPU_HANDLE_ROWS.filter(
    (row: GpuHandleRow) => row.rebuildOnSwapFormat === true,
  )) {
    (state.gpu as Record<GpuHandleKey, Disposable | null>)[row.key]?.destroy();
    (state.gpu as Record<GpuHandleKey, unknown>)[row.key] = row.construct(state, deps);
  }

  // The director holds direct renderer refs — skipping this would leave it
  // drawing into destroyed buffers, so labels/marker-lines would vanish.
  state.subsystems.labelDirector.attachRenderers(
    state.gpu.labelRenderer!,
    state.gpu.markerLineRenderer!,
  );
}
