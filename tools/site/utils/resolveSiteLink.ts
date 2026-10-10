import type { SiteLinkContext } from '../@types/SiteLinkContext';
import type { SiteLinkVerdict } from '../@types/SiteLinkVerdict';

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * Judge one `href`/`src` found on the page at URL path `pagePath`.
 *
 * Three kinds of target: external (skipped), under the site's base (must be a
 * built file, a directory with an `index.html`, or an allow-listed page that
 * is not built yet), and root-absolute outside the base, which belongs to the
 * main shell: `/` is the app itself, where a `#` must be a view the app has,
 * and anything else must be a file in the repo's `public/`.
 */
export function resolveSiteLink(
  pagePath: string,
  href: string,
  ctx: SiteLinkContext,
): SiteLinkVerdict {
  const raw = href.trim();
  if (raw === '' || EXTERNAL.test(raw)) return { kind: 'skip' };

  const hashAt = raw.indexOf('#');
  const hash = hashAt === -1 ? '' : raw.slice(hashAt + 1);
  const beforeHash = hashAt === -1 ? raw : raw.slice(0, hashAt);
  const pathPart = beforeHash.split('?')[0]!;
  const path = pathPart === '' ? pagePath : new URL(pathPart, `http://site${pagePath}`).pathname;

  if (!path.startsWith(ctx.base)) {
    if (path === '/') {
      // A built page writes `&` as an entity; the app is handed the character.
      const problem = hash === '' ? null : ctx.appProblem(hash.replaceAll('&amp;', '&'));
      return problem === null ? { kind: 'ok' } : { kind: 'broken', reason: problem };
    }
    return ctx.hasPublic(path.slice(1))
      ? { kind: 'ok' }
      : { kind: 'broken', reason: `${path} is not a file in public/` };
  }

  const rel = path.slice(ctx.base.length);
  const target = [
    rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel,
    `${rel}/index.html`,
  ].find(ctx.hasBuilt);
  const sitePath = `/${rel}`.replace(/\/?$/, '/');
  const listed = ctx.notYetBuilt.includes(sitePath);

  if (!target) {
    return listed
      ? { kind: 'pending', path: sitePath }
      : { kind: 'broken', reason: `${path} is not built` };
  }
  if (listed) return { kind: 'stale-pending', path: sitePath };
  if (hash !== '' && hash !== 'top' && target.endsWith('.html') && !ctx.idsOf(target).has(hash)) {
    return { kind: 'broken', reason: `no element with id "${hash}" in ${path}` };
  }
  return { kind: 'ok' };
}
