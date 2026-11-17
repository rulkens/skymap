/**
 * Public handle returned by `createLabelRenderer`: one label director's records, drawn as
 * MSDF glyphs and their leaders.
 */

import type { OverlaySceneOcclusion } from './OverlaySceneOcclusion';
import type { LabelRecords } from './LabelRecords';
import type { LabelRecordView } from './LabelRecordView';

export type LabelRenderer = {
  /** `'labelRenderer'` — the shared `Renderer` contract. */
  readonly label: string;
  /** Upload a director's records: the dirty word range (all of it for records not seen
   *  before), and the glyphs after a re-encode. The caller then clears the dirty range. */
  set(records: LabelRecords): void;
  /**
   * Draw the last `set` upload (leaders, then glyphs) inside a render pass whose target
   * format matches `targetFormat`. `scene` is read only by an instance created with
   * `occludeAgainstScene: true`, where it fills the group(1) coverage joint so fragments
   * fade behind the foreground bodies (lib/sceneDepth.wesl); without it that instance
   * draws plain.
   */
  draw(pass: GPURenderPassEncoder, view: LabelRecordView, scene?: OverlaySceneOcclusion): void;
  /** Release all GPU resources. */
  destroy(): void;
};
