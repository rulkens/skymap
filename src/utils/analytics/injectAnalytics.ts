/**
 * Inject the Counterscale analytics tracker — production builds only.
 *
 * Counterscale is a privacy-first, cookieless tracker served from our own
 * Cloudflare Worker.  We inject it from JS rather than hard-coding a tag in
 * index.html so it loads under exactly one condition: a production build whose
 * worker origin is configured.  Two guards enforce that:
 *
 *   - `import.meta.env.PROD` is false under `npm run dev`, so local
 *     development never requests the script and never sends page views.
 *   - `VITE_COUNTERSCALE_URL` is only set in `.env.production`, so a build
 *     without it (or a future fork that drops the file) injects nothing
 *     instead of a broken `undefined/tracker.js` request.
 *
 * Appended to <head> (not <body>) so it survives the `body.innerHTML` swap the
 * WebGPU-unsupported gate performs in main.tsx — visitors on browsers that
 * can't run the renderer are still counted.
 */
export function injectAnalytics(): void {
  if (!import.meta.env.PROD) return;
  const origin = import.meta.env.VITE_COUNTERSCALE_URL;
  if (!origin) return;

  const script = document.createElement('script');
  script.id = 'counterscale-script';
  script.dataset.siteId = 'skymap';
  script.src = `${String(origin).replace(/\/$/, '')}/tracker.js`;
  script.defer = true;
  document.head.appendChild(script);
}
