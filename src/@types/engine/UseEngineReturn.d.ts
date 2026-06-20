import type { SourceType } from '../data/SourceType';
import type { EngineHandle } from './EngineHandle';
import type { EngineStatus } from './EngineStatus';
import type { ScaleInfo } from './ScaleInfo';
import type { LoadProgressState } from '../loading/LoadProgressState';
import type { StructureId } from '../data/structure/StructureId';

/**
 * The shape returned by `useEngine`. Selection state (hovered/selected/focused)
 * lives in the Redux store — App reads via `useAppSelector(selectXFocusable)`
 * rather than echoing it through this hook.
 */
export type UseEngineReturn = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  handleRef: React.RefObject<EngineHandle | null>;
  status: EngineStatus;
  scale: ScaleInfo;
  sourceCounts: Partial<Record<SourceType, number>>;
  /** Per-category structure counts (cluster / supercluster / void / group) for the Structures panel. */
  structureCounts: Partial<Record<StructureId, number>>;
  loadProgress: LoadProgressState | null;
};
