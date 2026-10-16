/**
 * reviewPlugin — the dev server's half of the docs review mode
 * (packages/website/src/dev/review). One JSON file per page under `.superpowers/`
 * (gitignored): a cutter or the first PUT writes it, GET hands it to the page (404 until
 * then, and the page starts empty), and PUT stores the
 * owner's rulings back whole. Registered for `astro dev` only, like feedbackPlugin.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

import { docsReviewStem } from './utils/docsReviewStem';
import { isDocsReview } from './utils/isDocsReview';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const REVIEW_DIR = join(REPO_ROOT, '.superpowers/sdd/2026-10-05-companion-website/review');
const MAX_BODY_BYTES = 1_000_000;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) reject(new Error('review too large'));
      else chunks.push(chunk);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function answer(req: IncomingMessage): Promise<[number, object]> {
  // Another site open in the same browser must not read or overwrite reviews here.
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin') return [403, { error: 'same-origin only' }];
  const page = new URL(req.url ?? '', 'http://localhost').searchParams.get('page') ?? '';
  const stem = docsReviewStem(page);
  if (!stem) return [400, { error: 'bad page' }];
  const file = join(REVIEW_DIR, `${stem}.json`);
  if (req.method === 'GET') {
    if (!existsSync(file)) return [404, { error: 'no review for this page' }];
    return [200, JSON.parse(readFileSync(file, 'utf8')) as object];
  }
  if (req.method === 'PUT') {
    const review: unknown = JSON.parse(await readBody(req));
    // The body names the page too: it must be the page whose file this is.
    if (!isDocsReview(review) || review.page !== page)
      return [400, { error: 'not a review of this page' }];
    mkdirSync(REVIEW_DIR, { recursive: true });
    writeFileSync(file, `${JSON.stringify(review, null, 2)}\n`);
    return [200, { stem }];
  }
  return [405, { error: 'GET or PUT only' }];
}

function handleReview(req: IncomingMessage, res: ServerResponse): void {
  const reply = ([status, body]: [number, object]): void => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  };
  answer(req).then(reply, (error: unknown) => reply([500, { error: String(error) }]));
}

export function reviewPlugin(route: string): Plugin {
  return {
    name: 'site-review',
    apply: 'serve',
    configureServer(server) {
      // Post-hook + unshift, as feedbackPlugin does, to get ahead of Astro's base guard.
      return () => {
        server.middlewares.stack.unshift({ route, handle: handleReview });
      };
    },
  };
}
