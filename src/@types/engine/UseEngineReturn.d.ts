import type { EngineHandle } from './EngineHandle';

/**
 * The shape returned by `useEngine`. All engine-driven state (status, scale,
 * sourceCounts, structureCounts, loadProgress) lives in the Redux `engine`
 * slice — read via `useAppSelector(selectX)` selectors, not through this hook.
 */
export type UseEngineReturn = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  handleRef: React.RefObject<EngineHandle | null>;
};
