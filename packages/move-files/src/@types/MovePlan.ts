import type { FileEdit } from './FileEdit';
import type { GuardFinding } from './GuardFinding';
import type { MovePair } from './MovePair';

/** `moves` are root-relative, for the report; `edits` and `findings` carry absolute paths. */
export type MovePlan = {
  readonly moves: readonly MovePair[];
  readonly edits: readonly FileEdit[];
  readonly findings: readonly GuardFinding[];
};
