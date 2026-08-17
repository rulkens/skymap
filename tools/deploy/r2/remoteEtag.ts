/**
 * The remote object's ETag, or null if it's absent or unreadable.
 *
 * wrangler exposes no metadata-only read (its `r2 object get` downloads the
 * body), so we HEAD the public URL instead. A cached edge response still
 * carries the stored object's ETag, so the worst outcome is a needless
 * re-upload — never a wrong skip.
 */
export async function remoteEtag(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok ? res.headers.get('etag') : null;
  } catch {
    return null;
  }
}
