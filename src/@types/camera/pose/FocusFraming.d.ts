import type { CameraPose } from './CameraPose';

export type FocusFraming = Pick<CameraPose, 'target' | 'distance'> & {
  /** Pass-by extent (Mpc) a fly-past offset scales by; 0 = flown into, not past. */
  readonly radius: number;
};
