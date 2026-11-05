/**
 * Where `npm run site:shots` writes the site's pictures, relative to the repo root. Astro copies the site's
 * `public/` into the build as it is, so the bundler never opens them: as imports, all of them were open at once,
 * past the open-file limit of Cloudflare's build.
 */
export const SITE_SHOTS_DIR = 'packages/website/public/shots';
