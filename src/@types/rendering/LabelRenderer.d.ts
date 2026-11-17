/**
 * Public handle returned by `createLabelRenderer`.  Mirrors the shape of
 * other engine handles (`ThumbnailSubsystem`, `ProceduralDiskSubsystem`):
 * explicit method type, no internals leaked.
 */

import type { Label2D } from './Label2D';
import type { Label2DProjection } from './Label2DProjection';
import type { OverlaySceneOcclusion } from './OverlaySceneOcclusion';
import type { LabelRecords } from './LabelRecords';
import type { LabelRecordView } from './LabelRecordView';

export type LabelRenderer = {
  /**
   * Human-readable identifier (`'labelRenderer'`).  Part of the
   * shared `Renderer` contract — see `Renderer.d.ts`.
   */
  readonly label: string;
  /**
   * Replace the current label set.  Calling `setLabels([])` clears all
   * labels.  Re-packs the CPU-side scratch buffers and uploads to the GPU.
   */
  setLabels(labels: readonly Label2D[]): void;
  /**
   * Issue the label draw call into an in-flight render pass.  Must be
   * called inside a `beginRenderPass` / `pass.end()` block by a `Pass`
   * implementation.  The pass's render target format must match the
   * `targetFormat` passed to `createLabelRenderer`.
   *
   * `scene` is consumed only by an instance created with
   * `occludeAgainstScene: true`, where it fills the group(1) coverage joint so
   * fragments are attenuated by how much of the background the foreground
   * bodies already cover (that target's alpha) and by whether the sampled
   * scene depth stands in front of the subject — see lib/sceneDepth.wesl.
   * A plain instance ignores it.
   *
   * `projection` places the anchors (`output`, `viewFromSlab`, `nearClipMpc`);
   * its `vp` is not read.
   */
  draw(
    pass: GPURenderPassEncoder,
    projection: Label2DProjection,
    scene?: OverlaySceneOcclusion,
  ): void;
  /** Upload a director's records: the dirty word range (all of it for records not seen
   *  before), and the glyphs after a re-encode. The caller then clears the dirty range. */
  setRecords(records: LabelRecords): void;
  /** Draw the last `setRecords` upload (leaders, then glyphs) after the object path's draw. */
  drawRecords(
    pass: GPURenderPassEncoder,
    view: LabelRecordView,
    scene?: OverlaySceneOcclusion,
  ): void;
  /** Release all GPU resources. */
  destroy(): void;
};
