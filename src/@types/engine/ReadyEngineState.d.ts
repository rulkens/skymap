/**
 * The `EngineState` shape after `isEngineReady` returns `true`.
 *
 * Every field listed here is one whose pre-bootstrap value is `null`
 * and whose post-bootstrap value is the genuinely-required handle.
 * Built via TypeScript intersection (`EngineState & { ... }`) so the
 * canonical `EngineState` declaration stays untouched — the narrowing
 * is purely an additive overlay on top of the existing shape.
 *
 * Excluded: `state.gpu.filamentRenderer`.  See
 * `services/engine/helpers/engineReady.ts`'s module header for the
 * deployment-path rationale.
 */

import type { EngineState } from './state/EngineState';
import type { OrbitCamera } from '../camera/OrbitCamera';
import type { GalaxyPointRenderer } from '../rendering/GalaxyPointRenderer';
import type { PickRenderer } from '../rendering/PickRenderer';
import type { Compositor } from '../rendering/Compositor';
import type { RenderTargets } from '../rendering/RenderTargets';
import type { TexturedDiskSubsystem } from './subsystems/TexturedDiskSubsystem';

export type ReadyEngineState = EngineState & {
  cam: OrbitCamera;
  gpu: EngineState['gpu'] & {
    galaxyPointRenderer: GalaxyPointRenderer;
    pickRenderer: PickRenderer;
    /**
     * Non-null after bootstrap: minted in `initGpu` alongside the render
     * targets. The FRAME program's `hdr→swap` composite calls
     * `compositor.draw`, so the ready gate proves it non-null.
     */
    compositor: Compositor;
    /**
     * Non-null after bootstrap: `initGpu` allocates every offscreen row
     * (`hdr`, `volume`) in one construction.  The narrowing here lets the
     * frame body read `state.gpu.renderTargets.viewOf(...)` without a `!`
     * assertion.
     */
    renderTargets: RenderTargets;
  };
  subsystems: EngineState['subsystems'] & {
    texturedDisks: TexturedDiskSubsystem;
  };
};
