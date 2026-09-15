/**
 * The src/utils files under the "at most one exported function, named after the
 * file" pair of sweeps (oneSymbolPerFile + filenameMatchesExport), with the
 * genuinely multi-function ones dropped. Shared so the two sweeps cannot drift
 * apart — and so importing one test file from the other (which re-registers its
 * whole suite inside the importer) is no longer the way to share it.
 */
import { walkFiles } from './walkFiles';

// Files under src/utils/ that export MORE than one function, so "at most one"
// can't apply. Constants-only, class, and single-function files all pass on
// their own and need no entry here — only genuinely multi-function files do.
export const UTILS_MULTI_FUNCTION_FILES: ReadonlySet<string> = new Set([
  // Barrel re-export for src/utils/math (see the file's own header) — every
  // export is a re-export of a sibling file's function, so there is no single
  // function OF this file to name.
  'src/utils/math/index.ts',
  // Underscore-prefixed shared internal helper (its header: "not a public
  // API") — three small cooperating formatting helpers, not a single
  // public function.
  'src/utils/math/_sexagesimal.ts',
]);

export const utilsFunctionSweepFiles: readonly string[] = walkFiles('src/utils', ['.ts']).filter(
  (f) => !UTILS_MULTI_FUNCTION_FILES.has(f),
);
