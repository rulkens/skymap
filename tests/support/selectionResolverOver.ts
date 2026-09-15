import { composeSelectionRows } from '../../src/services/engine/selection/composeSelectionRows';
import { coreSelectionRows } from '../../src/services/engine/selection/coreSelectionRows';
import type { ResolveDeps } from '../../src/@types/engine/ResolveDeps';
import type { SelectionResolver } from '../../src/@types/engine/selection/SelectionResolver';

/**
 * A composed `SelectionResolver` over one fixed `ResolveDeps` — the one-line
 * fixture every former `ResolveDeps`-driven test call site now builds instead
 * of calling `resolvePick`/`extractSelectionRow`/`resolveFocusId`/`focusIdOf`
 * directly (Task 8 deleted them).
 */
export function selectionResolverOver(deps: ResolveDeps): SelectionResolver {
  return composeSelectionRows(() => coreSelectionRows(() => deps));
}
