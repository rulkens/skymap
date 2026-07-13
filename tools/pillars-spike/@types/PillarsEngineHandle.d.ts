import type { PillarsSettings } from './PillarsSettings';

/**
 * The engine's public surface, returned by createPillarsEngine. The UI
 * layer (main.ts) owns the DOM; this handle owns everything GPU.
 */
export type PillarsEngineHandle = {
  /** Merge a partial settings patch; renderScale changes rebuild targets. */
  setSettings(patch: Partial<PillarsSettings>): void;
  /** Re-run the density + light bakes with a new noise seed. */
  regenerate(seed: number): void;
  setAutoRotate(on: boolean): void;
  /**
   * Headless verification hook (same shape as the galaxy-renderer's):
   * re-runs the composite into an offscreen texture and reads it back.
   * Ground truth for automated smoke tests, where canvas screenshots of
   * WebGPU surfaces are unreliable.
   */
  grab(size?: number): Promise<{ size: number; data: Uint8ClampedArray }>;
  dispose(): void;
};
