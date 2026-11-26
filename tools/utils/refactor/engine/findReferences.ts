import type { Engine } from '../../../@types/refactor/Engine';
import type { NodeLocation } from '../../../@types/refactor/NodeLocation';
import { findReferencedSymbols } from './findReferencedSymbols';

/** Every reference to the symbol named at `at`, the declaration included, each file once. */
export function findReferences(engine: Engine, at: NodeLocation): readonly NodeLocation[] {
  return findReferencedSymbols(engine, at).references;
}
