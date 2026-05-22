import type { SourceType } from '../data/SourceType';
import type { EngineHandle } from './EngineHandle';
import type { EngineStatus } from './EngineStatus';
import type { FocusableTarget } from './FocusableTarget';
import type { ScaleInfo } from './ScaleInfo';
import type { Tier } from '../data/Tier';

export type UseEngineReturn = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  handleRef: React.RefObject<EngineHandle | null>;
  status: EngineStatus;
  hovered: FocusableTarget | null;
  selected: FocusableTarget | null;
  focused: FocusableTarget | null;
  scale: ScaleInfo;
  sourceCounts: Partial<Record<SourceType, number>>;
  currentTier: Tier;
};
