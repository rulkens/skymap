import type { CompanionRule } from './CompanionRule';

export type MoveConfig = {
  readonly companions: readonly CompanionRule[];
  readonly extraMockCallees: readonly string[];
};
