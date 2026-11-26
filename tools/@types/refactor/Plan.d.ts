import type { MovePair } from '../../../packages/move-files/src/@types/MovePair';
import type { Finding } from './Finding';
import type { TextEdit } from './TextEdit';

export type Plan = {
  readonly edits: readonly TextEdit[];
  readonly moves: readonly MovePair[]; // absolute paths
  readonly deletes: readonly string[]; // absolute paths
  readonly findings: readonly Finding[];
};
