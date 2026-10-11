/** One `files` entry of Cloudflare's purge API: a bare URL, or a URL plus the
 * request headers that select one cached variant of it. */
export type CachePurgeFile =
  | string
  | { readonly url: string; readonly headers: { Origin: string } };
