import type { FadeBand } from '../math/FadeBand';
import type { Vec3 } from '../../../packages/shared/src/@types/math/Vec3';
import type { Vec4 } from '../../../packages/shared/src/@types/math/Vec4';
import type { LabelStyleId } from './LabelStyleId';

/** One label as a `LabelSource` describes it: what it says and what it names, nothing about the view. */
export type LabelDescription = {
  readonly text: string;
  /** Absolute Mpc, or a body core tracks. No position this frame = no label. */
  readonly position: Vec3 | { readonly anchorId: string };
  readonly subjectRadiusMpc?: number;
  /** Straight RGBA; absent = the style's colour. */
  readonly color?: Vec4;
  /** Absent = the style's priority. */
  readonly priority?: number;
  /** The pick code the subject's own geometry stamps and its index; core packs the word. */
  readonly pick?: { readonly code: number; readonly index: number };
  /** Names one item of the toggle's per-item fade. */
  readonly fadeKey?: string;
  /** Over the camera's distance to the label, Mpc. */
  readonly revealBand?: FadeBand;
  /** Absent = the source's style. */
  readonly style?: LabelStyleId;
};
