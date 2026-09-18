/**
 * skyViewCompute — core's `sky-view` row, delegating to `encodeAtmosphereSkyView`
 * unchanged. Its `state` parameter is narrowed to `PassState`: the bake reads
 * only `state.gpu.atmosphereShellRenderer` (via `atmosphereDrawList`), so the cut
 * costs nothing and is what lets a compute row take the same state shape a
 * `ContentPass` already does.
 */

import type { ContentCompute } from '../../../../@types/engine/frame/ContentCompute';
import { encodeAtmosphereSkyView } from '../encodeAtmosphereSkyView';

export const skyViewCompute: ContentCompute = {
  name: 'sky-view',
  encode: encodeAtmosphereSkyView,
};
