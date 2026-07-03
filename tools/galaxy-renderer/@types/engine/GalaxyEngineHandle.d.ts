/**
 * GalaxyEngineHandle — public API for the galaxy renderer engine. Owns the
 * worker thread, render loop, and all state mutations; consumed by plan 03's
 * React bridge/matcher.
 */

import type { GalaxyParams } from '../model/GalaxyParams';
import type { RenderSettings } from './RenderSettings';
import type { LodSettings } from './LodSettings';
import type { ViewPose } from './ViewPose';
import type { ExtraGalaxySpec } from './ExtraGalaxySpec';

export type GalaxyEngineHandle = {
  setParams(params: GalaxyParams): Promise<void>; // regenerate via worker
  setRender(patch: Partial<RenderSettings & LodSettings>): void; // live, no regen
  setView(pose: Partial<ViewPose>): void;
  setAutoRotate(on: boolean): void;
  setInsets(left: number, right: number): void; // CSS px of overlaid panels
  setExtras(specs: readonly ExtraGalaxySpec[]): Promise<void>; // token-guarded replace
  step(now?: number): void; // one frame (headless / fit loop)
  sample(): Promise<{ mean: number; max: number; litPct: number; stars: number }>;
  grab(size?: number): Promise<{ S: number; data: Uint8ClampedArray }>; // default 480 — :366
  getCamera(): ViewPose;
  dispose(): void;
};
