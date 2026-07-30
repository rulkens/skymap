/**
 * Whether a local file is byte-identical to the object already in R2.
 *
 * R2 records a single-PUT object's ETag as the lowercase hex MD5 of its
 * content; HTTP wraps it in double quotes and a weak validator prepends `W/`.
 * Everything here goes up as a single PUT — wrangler `r2 object put` has no
 * multipart path and our largest artefact (~297 MB MCPM) stays under its
 * ~300 MiB cap — so a whole-file MD5 comparison is exact.
 *
 * A composite multipart ETag (`<hash>-<parts>`) can't be reproduced from the
 * whole-file MD5, so it counts as a non-match and re-uploads: correctness over
 * the bandwidth saving.
 */
export const etagMatches = (localMd5: string, remoteEtag: string | null): boolean => {
  if (!remoteEtag) return false;
  const normalized = remoteEtag.replace(/^W\//, '').replace(/^"|"$/g, '').toLowerCase();
  if (normalized.includes('-')) return false;
  return normalized === localMd5.toLowerCase();
};
