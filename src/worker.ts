/**
 * Pass-through Worker for the Skymap static-asset deploy.
 *
 * ### Why this file exists
 *
 * Cloudflare Workers projects come in two flavours: "Worker + Assets" and
 * "Assets-only".  The Variables-and-Secrets panel in the dashboard is
 * disabled on assets-only projects ("Variables cannot be added to a Worker
 * that only has static assets"), which means a tracked `.env.production`
 * is the *only* way to feed `VITE_DATA_BASE_URL` to the build.  That puts
 * infrastructure config in git, which the project would prefer to avoid.
 *
 * Adding any Worker script — even one that does nothing — promotes the
 * project to Worker+Assets mode.  Once promoted, the dashboard exposes
 * both build-time environment variables (consumed by `npm run build`) and
 * runtime variables / secrets (available via the `env` parameter below if
 * the Worker ever grows real logic).  The committed `.env.production` can
 * then be removed and the gitignore tightened back up.
 *
 * ### Runtime behaviour
 *
 * Identical to the static-only deploy: every incoming request is handed
 * to the `ASSETS` binding, which Cloudflare populates from the contents
 * of `dist/` (per `wrangler.toml`'s `[assets]` block).  The binding
 * handles caching, content-type sniffing, and the SPA fallback to
 * `index.html` for unknown routes — there's nothing for this Worker to
 * add on the response path.
 *
 * ### Future use
 *
 * If we ever want server-side logic at the edge (cache-key rewrites,
 * conditional redirects, A/B header routing, edge auth, simple rate
 * limiting, …) this is the entry point.  Add the new logic before the
 * `env.ASSETS.fetch(request)` call so the static fall-through stays as
 * the default.
 */

type Env = {
  /**
   * The static-assets binding.  Cloudflare wires `ASSETS` to the contents
   * of `dist/` declared in `wrangler.toml`'s `[assets]` block.  Calling
   * `.fetch(request)` returns the matching file (or the SPA fallback
   * `index.html` for unmatched routes).
   */
  ASSETS: { fetch(request: Request): Promise<Response> };
};

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
