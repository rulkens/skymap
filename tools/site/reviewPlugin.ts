/**
 * reviewPlugin — the dev server's half of the docs review mode
 * (packages/website/src/dev/review). `__review`: one JSON file per page under `.superpowers/`
 * (gitignored): a cutter or the first PUT writes it, GET hands it to the page (404 until
 * then, and the page starts empty), and PUT stores the owner's rulings back whole. `__job`:
 * PUT writes the page's job into the front matter of its text under src/content, the one
 * place a job lives. Registered for `astro dev` only, like feedbackPlugin.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

import { docsReviewStem } from './utils/docsReviewStem';
import { isDocsReview } from './utils/isDocsReview';
import { pageSourceFile } from './utils/pageSourceFile';
import { setFrontMatterJob } from './utils/setFrontMatterJob';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const REVIEW_DIR = join(REPO_ROOT, '.superpowers/sdd/2026-10-05-companion-website/review');
const CONTENT_DIR = join(REPO_ROOT, 'packages/website/src/content');
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

// Another site open in the same browser must not read or overwrite reviews or texts here.
const foreign = (req: IncomingMessage): boolean => {
  const site = req.headers['sec-fetch-site'];
  return site !== undefined && site !== 'same-origin';
};

async function answer(req: IncomingMessage): Promise<[number, object]> {
  if (foreign(req)) return [403, { error: 'same-origin only' }];
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

async function answerJob(req: IncomingMessage): Promise<[number, object]> {
  if (foreign(req)) return [403, { error: 'same-origin only' }];
  if (req.method !== 'PUT') return [405, { error: 'PUT only' }];
  const page = new URL(req.url ?? '', 'http://localhost').searchParams.get('page') ?? '';
  if (docsReviewStem(page) === null) return [400, { error: 'bad page' }];
  const body = JSON.parse(await readBody(req)) as { job?: unknown } | null;
  if (typeof body?.job !== 'string') return [400, { error: 'no job' }];
  const rel = pageSourceFile(page);
  const file = rel && join(CONTENT_DIR, rel);
  if (!file || !existsSync(file)) return [404, { error: 'no front matter for this page' }];
  try {
    writeFileSync(file, setFrontMatterJob(readFileSync(file, 'utf8'), body.job));
  } catch (error) {
    return [409, { error: String(error) }];
  }
  return [200, { file: rel }];
}

const handler =
  (answerWith: (req: IncomingMessage) => Promise<[number, object]>) =>
  (req: IncomingMessage, res: ServerResponse): void => {
    const reply = ([status, body]: [number, object]): void => {
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
    };
    answerWith(req).then(reply, (error: unknown) => reply([500, { error: String(error) }]));
  };

export function reviewPlugin(base: string): Plugin {
  return {
    name: 'site-review',
    apply: 'serve',
    configureServer(server) {
      // Post-hook + unshift, as feedbackPlugin does, to get ahead of Astro's base guard.
      return () => {
        server.middlewares.stack.unshift({ route: `${base}__review`, handle: handler(answer) });
        server.middlewares.stack.unshift({ route: `${base}__job`, handle: handler(answerJob) });
      };
    },
  };
}
