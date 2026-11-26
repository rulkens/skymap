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
   * format matches `targetFormat`. `scene` fills group(1) so fragments fade behind the
   * foreground bodies, through the pipeline pair of its kind (lib/sceneDepth.wesl or
   * lib/occlusionMask.wesl); without it the draw is plain.
   */
  draw(pass: GPURenderPassEncoder, view: LabelRecordView, scene?: OverlaySceneOcclusion): void;
  /** Release all GPU resources. */
  destroy(): void;
};
