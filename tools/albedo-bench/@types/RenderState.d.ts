import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';
import type { FieldArrow } from './FieldArrow';

/** `originalBox`/`adjustedBox` are the boxes the displayed images were
 *  rendered for; they lag the view, each at its own pace (`selectRenderLag`). */
export type RenderState = {
  readonly originalUrl: string | undefined;
  readonly adjustedUrl: string | undefined;
  readonly originalBox: LonLatBounds | undefined;
  readonly adjustedBox: LonLatBounds | undefined;
  readonly arrows: readonly FieldArrow[];
  readonly fitCoarsened: boolean;
  readonly renderError: string | undefined;
};
