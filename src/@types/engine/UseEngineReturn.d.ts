import type { SourceType } from '../data/SourceType';
import type { EngineHandle } from './EngineHandle';
import type { EngineStatus } from './EngineStatus';
import type { FocusableTarget } from './FocusableTarget';
import type { ScaleInfo } from './ScaleInfo';
import type { LoadProgressState } from '../loading/LoadProgressState';
import type { Tier } from '../data/Tier';
import type { StructureId } from '../data/structure/StructureId';

export type UseEngineReturn = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  handleRef: React.RefObject<EngineHandle | null>;
  status: EngineStatus;
  hovered: FocusableTarget | null;
  selected: FocusableTarget | null;
  focused: FocusableTarget | null;
  scale: ScaleInfo;
  fps: number;
  sourceCounts: Partial<Record<SourceType, number>>;
  /** Per-category structure counts (cluster / supercluster / void / group) for the Structures panel. */
  structureCounts: Partial<Record<StructureId, number>>;
  loadProgress: LoadProgressState | null;
  /**
   * Immutable startup tier seed (viewport-derived). The LIVE tier lives in
   * the engine settings store — read it via `selectTier`; this is only the
   * boot value (also usable as the selector's pre-handle fallback).
   */
  initialTier: Tier;
};
