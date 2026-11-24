import type { Engine } from '../../@types/refactor/Engine';
import type { OverlayChanges } from '../../@types/refactor/OverlayChanges';
import type { TypeErrorSite } from '../../@types/refactor/TypeErrorSite';
import { checkCandidates } from './checkCandidates';
import { findTypeErrors } from './engine/findTypeErrors';
import { syncOverlay } from './engine/syncOverlay';

/**
 * The type check of a folded run, as a value the driver prints from: the engine learns
 * what the last fold changed, then the files the run touched or names are checked. A run
 * that does not check (`enabled` false, as under `--no-check`) returns undefined and
 * leaves the engine alone. It never writes, so `--dry` and a real run get the same answer.
 */
export function checkRun(input: {
  enabled: boolean;
  engine: Engine;
  unsynced: OverlayChanges | undefined; // folds the engine has not seen yet
  texts: () => ReadonlyMap<string, string>; // every project file, overlay applied
  names: readonly string[]; // the run's property or function names, and the new name
}): { files: readonly string[]; errors: readonly TypeErrorSite[] } | undefined {
  if (!input.enabled) return undefined;
  const { engine } = input;
  if (input.unsynced) syncOverlay(engine, input.unsynced);
  const files = checkCandidates({
    texts: input.texts(),
    changed: engine.overlay.keys(),
    names: input.names,
  });
  return { files, errors: findTypeErrors(engine, files) };
}
