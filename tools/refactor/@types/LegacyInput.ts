import type { Project } from 'ts-morph';
import type { Flags } from './Flags';

export type LegacyInput = {
  readonly project: Project;
  readonly positionals: readonly string[];
  readonly flags: Flags;
};
