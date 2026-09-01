/**
 * StarPointRenderer — handle for the neighbourhood's distant stars drawn as
 * additive point sprites into the depthless HDR accumulation.
 *
 * This is the far half of the star LOD: a star too small to resolve as a
 * sphere renders as a screen-aligned soft dot, sized from its absolute
 * magnitude and tinted by its spectral colour — the same visual species as
 * the survey point cloud, but through a thin dedicated pipeline (see the
 * `starPointRenderer.ts` module header for why it does NOT wrap
 * `createGalaxyPointRenderer`). It draws into the depthless `hdr` target with
 * one/one additive blending, NOT the opaque foreground pass, so overlapping
 * stars brighten long-exposure style like every other additive layer.
 *
 * Star data is late-bound like the Earth's texture: the factory builds the
 * pipeline immediately, and the layer calls `setStars` once the seeded
 * bodies are known. Positions upload as f32, but the layer hands them in
 * already camera-relative (and pairs them with a rebased view-projection) so
 * the narrowing carries no catastrophic cancellation — see the renderer
 * module header's precision note.
 */

import type { Renderer } from './Renderer';
import type { Vec2 } from '../math/Vec2';
import type { PositionedStar } from '../scene/PositionedStar';

export type StarPointRenderer = Renderer & {
  /**
   * Upload `viewSlot`'s instance buffer from the seeded star bodies —
   * position (`positionMpc` narrowed to f32, camera-relative per the
   * layer's rebase), linear-RGB `color`, and `absMag` per star, 28 bytes
   * each. Replaces any previous upload ON THAT SLOT; an empty array clears
   * the slot back to drawing nothing. `viewSlot` (Task 13b) gives each
   * sky-cubemap capture face — and the real view — its OWN buffer, because
   * their camera-relative positions differ and all calls land before one
   * `submit()` (see `createViewSlotUniformRing`'s doc for the race this
   * avoids).
   */
  setStars(stars: readonly PositionedStar[], viewSlot: number): void;
  /**
   * Draw every uploaded star as an instanced billboard into the current
   * (depthless, additive) pass. `viewProj` is the length-16 view-projection
   * rebased into the same camera-relative frame as the uploaded positions;
   * `viewportPx` feeds the pixel-size-to-clip-offset conversion. `opts` carries
   * the shared star appearance the survey stage also reads — `sizePx` (base
   * dot radius, the `starCatalogs.sizePx` slider) and `brightness` (the exposure
   * trim, already folded with the camera-distance ramp by the layer) — so a
   * famous leaf and a survey leaf render pixel-identically. `viewSlot` is
   * `ReadyFrameContext.viewSlot` (Task 13b) — which view-slot buffer this
   * call's camera uniform lands in, so a sky-cubemap capture sweep's several
   * `draw()` calls (different cameras, one submit) don't overwrite each
   * other's bytes (see `createViewSlotUniformRing`'s doc). No-op until
   * `setStars` has delivered a non-empty upload.
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportPx: Vec2,
    opts: { sizePx: number; brightness: number; viewSlot: number },
  ): void;
};
