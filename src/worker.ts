/**
 * The Skymap Worker: every request goes to the static assets in `dist/`
 * unchanged, except `POST /api/contact`, which `wrangler.toml` names in
 * `run_worker_first` so the SPA fallback does not answer it. Why the project
 * has a Worker script at all is in docs/DEPLOY.md, "Why there is a Worker".
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
