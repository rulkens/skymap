import type { FoundRefs } from '../../@types/refactor/FoundRefs';
import type { SymbolAddress } from '../../@types/refactor/SymbolAddress';
import type { RunInput } from './RunInput';

export type SymbolRun = RunInput<SymbolAddress, FoundRefs>;
