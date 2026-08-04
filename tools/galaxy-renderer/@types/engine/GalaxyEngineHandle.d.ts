/**
 * GalaxyEngineHandle — public API for the galaxy renderer engine. Owns the
 * WebGPU device, the generation compute pipelines, the render loop, and all
 * state mutations; consumed by the React bridge/matcher. `setParams` /
 * `setExtras` pack the generation UBO and dispatch the compute passes that
 * fill the GPU vertex buffers; their promises resolve once that work is
 * submitted to the shared queue — no CPU readback, since queue ordering
 * guarantees the buffers are filled before any later frame draws them.
 */

import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
import type { GalaxyFieldTuning } from '../../../../src/@types/galaxy/GalaxyFieldTuning';
import type { GalaxySfMap } from '../../../../src/@types/galaxy/GalaxySfMap';
import type { RenderSettings } from './RenderSettings';
import type { LodSettings } from './LodSettings';
import type { ViewPose } from './ViewPose';
import type { ExtraGalaxySpec } from '../../../../src/@types/galaxy/ExtraGalaxySpec';

export type GalaxyEngineHandle = {
  setParams(params: GalaxyParams): Promise<void>; // pack UBO, dispatch generation compute
  setRender(patch: Partial<RenderSettings & LodSettings>): void; // live, no regen
  setFieldTuning(patch: Partial<GalaxyFieldTuning>): void; // live, rebuilds fieldMixture from cached geometry
  setView(pose: Partial<ViewPose>): void;
  setAutoRotate(on: boolean): void;
  setInsets(left: number, right: number): void; // CSS px of overlaid panels
  setExtras(specs: readonly ExtraGalaxySpec[]): Promise<void>; // replace all background galaxies
  step(now?: number): void; // one frame (headless / fit loop)
  sample(): Promise<{ mean: number; max: number; litPct: number; stars: number }>;
  grab(size?: number): Promise<{ S: number; data: Uint8ClampedArray }>; // see createOffscreenProbe
  getCamera(): ViewPose;
  // The SSPSF star-formation automaton's packed output (gas / recent SF /
  // older SF, log-polar) — see createGalaxyModel.ts's rebuildSfMap.
  // Consumed by nothing but its own overlay yet; exposed for the sibling UI
  // and future consumers.
  getSfMapTexture(): GPUTexture;
  // The same output read back to the CPU, once per generation — null until
  // the first readback lands. Feeds `sfMapDustSeeding` in
  // `buildDustParticleCloud` (createGalaxyModel.ts's `scheduleSfMapReadback`).
  getSfMapData(): GalaxySfMap | null;
  dispose(): void;
};
