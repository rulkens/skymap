import type { FontId } from '../data/FontId';
import type { Label3DArcPlacement } from './Label3DArcPlacement';
import type { Vec4 } from '../math/Vec4';

/**
 * Label3D — one world-anchored text label drawn by the shared
 * `label3DRenderer` (spec §3.2). Unlike `Label2D`'s perspective-clamped
 * screen sizing, a Label3D's height is a fixed PHYSICAL size in Mpc —
 * lettering painted onto the sky, not UI chrome.
 */
export type Label3D = {
  readonly id: string;
  readonly text: string;
  readonly font: FontId;
  readonly placement: Label3DArcPlacement;
  /** Em height in Mpc — a fixed PHYSICAL size. No pixel clamps, by design. */
  readonly emMpc: number;
  /**
   * Copies evenly spaced around the arc; 1 = a single instance. `0` emits NO
   * glyphs — `label3DRenderer`'s instance loop runs `rep < repeatCount`
   * CPU-side, so the shader's `/ f32(repeatCount)` divide is never reached; a
   * refactor that hoists that divide out of the loop must keep this guard.
   */
  readonly repeatCount: number;
  /** Straight RGBA fill. Single-band MSDF — no outline. */
  readonly color: Vec4;
  /** Multiplier in [0,1]. Default 1. */
  readonly fadeAlpha?: number;
};
