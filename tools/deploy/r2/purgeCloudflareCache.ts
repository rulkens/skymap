/** Cloudflare's per-request cap on `files` in a purge call. */
const PURGE_BATCH = 30;

/**
 * Evict the CDN's cached copies of every key we touched.
 *
 * R2 PUTs are atomic, but the CDN in front of it serves the old bytes for the
 * full `max-age` window — so without this, users get stale data for up to a
 * day after a sync.
 *
 * Needs `CLOUDFLARE_API_TOKEN` (scope `Zone:Cache Purge`) and
 * `CLOUDFLARE_ZONE_ID`; `tools/deploy/syncR2Secure.sh` loads both from the OS
 * keychain. Missing either is a warning, not a failure: the upload already
 * succeeded, and purge is a cache hint rather than the source of truth.
 */
export async function purgeCloudflareCache(
  keys: ReadonlyArray<string>,
  publicUrl: string,
): Promise<void> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!token || !zoneId) {
    console.log(
      '\n⚠ CDN cache NOT purged: set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID to auto-purge.',
    );
    console.log(
      `  Manual purge: Cloudflare dashboard → Caching → Purge Cache → "Custom" → paste the ${keys.length} URL(s) under ${publicUrl}/.`,
    );
    return;
  }

  const urls = keys.map((k) => `${publicUrl}/${k}`);
  const endpoint = `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`;

  for (let i = 0; i < urls.length; i += PURGE_BATCH) {
    const batch = urls.slice(i, i + PURGE_BATCH);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: batch }),
    });
    const body = (await res.json()) as { success?: boolean; errors?: { message: string }[] };
    if (!res.ok || !body.success) {
      const msg = body.errors?.map((e) => e.message).join('; ') ?? `HTTP ${res.status}`;
      throw new Error(`Cloudflare purge failed: ${msg}`);
    }
    console.log(`  purged ${batch.length} URL(s)`);
  }
}
