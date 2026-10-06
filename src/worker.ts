/**
 * The Skymap Worker: a pass-through to the static assets in `dist/`, plus one
 * route, `POST /api/contact`, for the website's contact form.
 *
 * ### Why a Worker script exists at all
 *
 * Cloudflare Workers projects come in two flavours: "Worker + Assets" and
 * "Assets-only".  The Variables-and-Secrets panel in the dashboard is
 * disabled on assets-only projects ("Variables cannot be added to a Worker
 * that only has static assets"), which means a tracked `.env.production` is
 * the *only* way to feed `VITE_DATA_BASE_URL` to the build.  Adding any
 * Worker script promotes the project to Worker+Assets mode, which also gives
 * the dashboard runtime variables and secrets: the contact endpoint's
 * configuration lives there, never in git.
 *
 * ### Runtime behaviour
 *
 * Every request except `POST /api/contact` is handed to the `ASSETS` binding
 * unchanged (caching, content types and the SPA fallback to `index.html` are
 * the binding's). `wrangler.toml` names that one path in `run_worker_first`
 * so the Worker sees it even though the SPA fallback would otherwise answer.
 * The route answers 503 until it is configured; see `handleContact` and
 * docs/DEPLOY.md, "Opening the contact form".
 */
import type { WorkerEnv } from './@types/worker/WorkerEnv';
import { CONTACT_PATH } from './data/worker/contactConfig';
import { handleContact } from './services/worker/handleContact';

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    if (request.method === 'POST' && new URL(request.url).pathname === CONTACT_PATH) {
      return handleContact(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
