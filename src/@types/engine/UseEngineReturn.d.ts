import type { SourceType } from '../data/Source';
import type { EngineHandle } from './EngineHandle';
import type { EngineStatus } from './EngineStatus';
import type { GalaxyInfo } from './GalaxyInfo';
import type { ScaleInfo } from './ScaleInfo';
import type { LoadProgressState } from '../loading/LoadProgressState';
import type { Tier } from '../data/Tier';

export type UseEngineReturn = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  handleRef: React.RefObject<EngineHandle | null>;
  status: EngineStatus;
  hovered: GalaxyInfo | null;
  selected: GalaxyInfo | null;
  focused: GalaxyInfo | null;
  scale: ScaleInfo;
  fps: number;
  sourceCounts: Partial<Record<SourceType, number>>;
  loadProgress: LoadProgressState | null;
  currentTier: Tier;
};
