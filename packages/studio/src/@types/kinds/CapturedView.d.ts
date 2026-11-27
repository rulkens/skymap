/** The drawn camera, already re-expressed in the clip's pinned frame: what Use current view writes. */
import type { CameraPose } from '../../../../../src/@types/camera/pose/CameraPose';

export type CapturedView = { readonly pose: CameraPose; readonly fovYRad: number };
