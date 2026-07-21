/**
 * anchorToMirroredRoot — split an absolute ts-morph Project path at its `src/`
 * or `tools/` root so the rest of the refactor planners can speak the
 * repo-relative language `expandTestMirrors` keys off.
 *
 * The Project spans absolute paths (`/Users/…/skymap/src/utils/x.ts`) or, for an
 * in-memory fixture, synthetic ones (`/src/utils/x.ts`), but the mirror
 * convention is expressed repo-relative (`src/…` ↔ `tests/…`). Anchoring returns
 * `rel` (the repo-relative form) and `prefix` (everything before it) with the
 * invariant `prefix + rel === absPath`, so a caller can reconstruct absolute
 * paths for `applyMoves` after deriving mirrors relatively — the same
 * absolute-vs-relative split `moveFiles.ts` makes. `src/` and `tools/` are the
 * only roots with `tests/` mirrors, so a path under neither returns null (the
 * caller treats that as convention-not-covered and leaves the file alone).
 *
 * The split anchors on the LAST `/src/` or `/tools/` occurrence, since the repo's
 * own source root is the deepest such segment: a checkout path above the repo
 * root that itself contains `/src/` or `/tools/` (e.g. `/home/me/src/skymap/src/…`)
 * keeps its outer marker in `prefix`, and the mirrored root stays correct. In-memory
 * fixtures carry a single occurrence, so their anchoring is unchanged.
 *
 * Known limitation: a repo whose own tree nests one mirrored root under the other
 * (a literal `tools/` directory living inside `src/`, or the reverse) would anchor
 * on the inner one. Skymap's layout keeps `src/` and `tools/` as sibling roots, so
 * that case does not arise here.
 */
export function anchorToMirroredRoot(absPath: string): { rel: string; prefix: string } | null {
  // The source roots whose files have `tests/` mirrors.
  const MIRRORED_ROOTS = ['src/', 'tools/'] as const;
  for (const root of MIRRORED_ROOTS) {
    const marker = `/${root}`;
    const idx = absPath.lastIndexOf(marker);
    if (idx !== -1) {
      return { rel: absPath.slice(idx + 1), prefix: absPath.slice(0, idx + 1) };
    }
  }
  return null;
}
