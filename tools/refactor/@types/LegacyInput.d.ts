import type { Project } from 'ts-morph';
import type { RefReport } from '../../@types/refactor/RefReport';
import type { SymbolRefKind } from '../../@types/refactor/SymbolRefKind';
import type { Flags } from './Flags';

export type LegacyInput = {
  readonly project: Project;
  readonly positionals: readonly string[];
  readonly flags: Flags;
  readonly report: RefReport<SymbolRefKind>; // the preview the driver already printed
};
