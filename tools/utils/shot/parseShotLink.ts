import type { ShotLink } from '../../shot/@types/ShotLink';

/**
 * parseShotLink — reduce whatever a person pastes to the query and hash the
 * tool appends to its own server. Origin and path are dropped on purpose: the
 * shot is always taken from the server the tool talks to, never the link's.
 */
export function parseShotLink(raw: string): ShotLink {
  const text = raw.trim();
  if (/^https?:\/\//i.test(text)) {
    const url = new URL(text);
    return { search: url.search.replace(/^\?/, ''), hash: url.hash.replace(/^#/, '') };
  }
  // Anything before the first '?' or '#' (a scheme-less host, a path) is discarded.
  const hashAt = text.indexOf('#');
  const queryAt = text.indexOf('?');
  if (hashAt === -1 && queryAt === -1) return { search: '', hash: text };
  const hash = hashAt === -1 ? '' : text.slice(hashAt + 1);
  const search =
    queryAt !== -1 && (hashAt === -1 || queryAt < hashAt)
      ? text.slice(queryAt + 1, hashAt === -1 ? undefined : hashAt)
      : '';
  return { search, hash };
}
