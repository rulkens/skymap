/**
 * PointDrawSettings — per-call draw parameters for `PointRenderer.draw`.
 *
 * A single record rather than positional args: callers fill named fields,
 * new knobs are one type-level edit, and TypeScript's structural matching
 * catches a missing field at compile time instead of a silent shifted-
 * argument bug at draw time. Mirrors `RenderFrameSettings`'s naming so the
 * engine-side pass code can pass `{ …settings, … }` without renames.
 */

import type { Vec3 } from '../math/Vec3';
import type { SourceType } from '../data/SourceType';

export type PointDrawSettings = {
  /** Far-field billboard floor radius in pixels.  Galaxies smaller than this stay rendered at this size; nearby galaxies grow past it to their real disc size. */
  pointSizePx: number;
  /** Global brightness multiplier in [0, 1]. */
  brightness: number;
  /** Selected galaxy as `(source << 27) | localIdx`, or `0xFFFFFFFF` for "no selection". */
  selectedPacked: number;
  /** Bitmask of `Source` values to draw (see `data/sources.ts`). */
  visibleSourceMask: number;
  /** Camera position in world Mpc (`orbitCamera.position`), used by the vertex shader for apparent-size sizing. */
  camPosWorld: Readonly<Vec3>;
  /** Pixels-per-radian for the current viewport + FOV: `viewportPx[1] / (2 * tan(fovYRad / 2))`. */
  pxPerRad: number;
  /** When true, fallback-orientation fragments are tinted magenta in the visual shader.  Selection / pick paths unaffected. */
  highlightFallback: boolean;
  /** When true, fallback-orientation fragments are `discard`ed entirely. */
  realOnlyMode: boolean;
  /** Malmquist-bias correction selector (`data/biasMode.ts`).  0 = no correction; `absMagLimit` ignored.  The Schechter / 1-over-Vmax modes read per-vertex weights (`schechterRatio`, angular-density) the bias-correction subsystem splices into the vertex buffer — not uniforms. */
  biasMode: number;
  /** Volume-limit threshold for `biasMode == 1`.  Galaxies fainter than this are discarded in the vertex stage. */
  absMagLimit: number;
  /** Whether the points pass applies depth-based alpha fade. */
  depthFadeEnabled: boolean;
  /** Procedural-disk crossfade band — pixel threshold below which points render full-alpha. */
  pxFadeStart: number;
  /** Procedural-disk crossfade band — pixel threshold above which points render zero-alpha (hand-off to disk pass). */
  pxFadeEnd: number;
  /**
   * Shared cluster-focus bind group for the @group(3) FocusUniforms
   * binding. The engine owns the single focus buffer (written once per
   * frame in renderFrame) and hands its bind group here; the vertex stage
   * dims non-members of the focused POI. At rest (`blend: 0`) the shader
   * multiplier collapses to 1.0, so this is always supplied.
   */
  focusBindGroup: GPUBindGroup;
  /**
   * Look up the registry-managed opacity for a given source. Called
   * once per visible source per frame from the points draw loop;
   * the renderer writes the returned value into the per-source
   * fadeBuffer. The renderer passes the numeric source code;
   * the pointSpritesPass closure resolves it to the catalog's string
   * id and reads `state.subsystems.fades.opacityOf({ kind: 'galaxyCatalog', id }, now)`.
   */
  readonly fadeOpacityOf: (source: SourceType) => number;
};
