/**
 * A manifest's `manifestUrl`/`artifactUrl` is normally a logical path under
 * the data root, which `dataUrl()` resolves — but `?probe` mints its scene
 * in-page as `blob:` URLs, and `dataUrl()` prefixes unconditionally. Absolute
 * URLs therefore have to bypass it rather than be un-mangled afterwards.
 */
import { dataUrl } from '../../../../src/services/loading/fetchWithProgress';

const ABSOLUTE_URL = /^(blob:|data:|https?:\/\/)/;

export function resolveAssetUrl(url: string): string {
  return ABSOLUTE_URL.test(url) ? url : dataUrl(url);
}
