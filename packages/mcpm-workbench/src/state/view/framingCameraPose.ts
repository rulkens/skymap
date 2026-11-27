import type { GridBox } from '../../../@types/grid/GridBox';
import type { ViewSlice } from '../../../@types/view/ViewSlice';
import { deriveGridBox } from '../../grid/deriveGridBox';
import { defaultGridSlice } from '../grid/gridSlice';
import { defaultViewSlice } from './viewSlice';

/**
 * framingCameraPose — the boot framing (the pose reset restores) moved onto
 * `box`: the default view direction, the target at its centre, and the default
 * distance scaled by its longest edge against the boot box's, so the boot box
 * frames exactly as at boot.
 */
export function framingCameraPose(
  box: Pick<GridBox, 'centerMpc' | 'sizeMpc'>,
): ViewSlice['camera'] {
  const { yaw, pitch, distance } = defaultViewSlice.camera;
  const bootEdgeMpc = Math.max(...deriveGridBox(defaultGridSlice).sizeMpc);
  const scale = Math.max(...box.sizeMpc) / bootEdgeMpc;
  return { yaw, pitch, distance: distance * scale, targetMpc: box.centerMpc };
}
