import type { SkyView } from '../../../../@types/engine/SkyView';
import { newsGate } from '../../../../utils/throttle/newsGate';
import { skyViewChanged } from '../../../../utils/sky/skyViewChanged';

/**
 * Passes only a rounded standing view that differs from the last one passed. Module scope on
 * purpose, as `publishBodyDistanceGate`: a per-frame gate would reset.
 */
export const skyViewNewsGate = newsGate<SkyView>(skyViewChanged, null);
