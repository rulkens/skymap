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
 * Known limitation: the split is on the FIRST `/src/` or `/tools/` occurrence.
 * A repo checked out under a directory that itself contains `/src/` or `/tools/`
 * (e.g. `/home/me/src/skymap/src/…`) would anchor on the wrong one. In practice
 * Project paths never nest a mirrored-root marker above the repo root, so first-
 * indexOf is safe here; a more defensive split would anchor on the last marker.
 */
export function anchorToMirroredRoot(
  absPath: string,
): { rel: string; prefix: string } | null {
  // The source roots whose files have `tests/` mirrors.
  const MIRRORED_ROOTS = ['src/', 'tools/'] as const;
  for (const root of MIRRORED_ROOTS) {
    const marker = `/${root}`;
    const idx = absPath.indexOf(marker);
    if (idx !== -1) {
      return { rel: absPath.slice(idx + 1), prefix: absPath.slice(0, idx + 1) };
    }
  }
  return null;
}
