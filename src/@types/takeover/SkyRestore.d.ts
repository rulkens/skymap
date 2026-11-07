import type { FramedCameraPose } from '../camera/pose/FramedCameraPose';
import type { SelectionRefBase } from '../engine/selection/SelectionRefBase';

/** What Leave gives back (D11, R15): the camera from before the first entry and the focus it framed under. */
export type SkyRestore = {
  readonly base: FramedCameraPose;
  readonly focus: SelectionRefBase | null;
};
