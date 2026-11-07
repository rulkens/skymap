import { newsGate } from '../../../../utils/throttle/newsGate';
import { skyEntryChanged } from '../../../../utils/sky/skyEntryChanged';
import { NO_SKY_ENTRY } from '../../../../data/sky/noSkyEntry';

/**
 * Passes only sky-entry facts that are news against the last ones passed (sub-metre drift is
 * not). Module scope on purpose, as `publishBodyDistanceGate`: a per-frame gate would reset.
 */
export const skyEntryNewsGate = newsGate(skyEntryChanged, NO_SKY_ENTRY);
