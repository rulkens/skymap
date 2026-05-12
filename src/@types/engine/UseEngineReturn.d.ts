import type { Source } from '../../data/sources';
import type { EngineHandle } from './EngineHandle';
import type { EngineStatus } from './EngineStatus';
import type { PointInfo } from './PointInfo';
import type { ScaleInfo } from './ScaleInfo';
import type { LoadProgressState } from '../loading/LoadProgressState';
import type { Tier } from '../data/Tier';

export type UseEngineReturn = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  handleRef: React.RefObject<EngineHandle | null>;
  status: EngineStatus;
  hovered: PointInfo | null;
  selected: PointInfo | null;
  focused: PointInfo | null;
  scale: ScaleInfo;
  fps: number;
  sourceCounts: Partial<Record<Source, number>>;
  loadProgress: LoadProgressState | null;
  currentTier: Tier;
};
