import type { Source } from '../../data/sources';
import type { PointInfo } from './PointInfo';

/**
 * Result of resolving a click.  See the module-level docstring of
 * `services/engine/interaction/clickHandler.ts` for the full
 * state-machine commentary.
 *
 * The `selection` field carries the (source, localIdx) pair the picker
 * decoded from the r32uint texture's packed value.  Engine forwards it
 * straight to `setSelected` for the halo + InfoCard updates; no
 * intermediate global ID is needed.
 */
export type ClickResolution =
  | { kind: 'clear' }
  | {
      kind: 'select';
      selection: { source: Source; localIdx: number };
      info: PointInfo | null;
    };
