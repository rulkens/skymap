import type { UnitPoint } from './UnitPoint';

/** `at: null` on a hover request means "nothing hovered": the driver clears hover without a GPU pick. */
export type PickRequest = {
  readonly at: UnitPoint | null;
  readonly seq: number;
};
