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
  // A bare 'focus=…' is a hash body, the form the app's share button yields.
  if (!text.startsWith('?')) return { search: '', hash: text.replace(/^#/, '') };
  const hashAt = text.indexOf('#');
  return hashAt === -1
    ? { search: text.slice(1), hash: '' }
    : { search: text.slice(1, hashAt), hash: text.slice(hashAt + 1) };
}
