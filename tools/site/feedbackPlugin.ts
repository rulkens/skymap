/**
 * feedbackPlugin — the dev server's half of the on-page feedback tool
 * (packages/website/src/dev/feedback). POST stores one note as a JSON file
 * under `.superpowers/` (gitignored); DELETE removes it. `index.md` is rebuilt
 * from the JSON files after every change, so it can never drift from them and
 * an agent reads one file to see every note, newest first. Registered for
 * `astro dev` only, so nothing of it exists in a build.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

import type { FeedbackNote } from './@types/FeedbackNote';
import { feedbackIndexLine } from './utils/feedbackIndexLine';
import { feedbackNoteStem } from './utils/feedbackNoteStem';
import { isFeedbackNote } from './utils/isFeedbackNote';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const FEEDBACK_DIR = join(REPO_ROOT, '.superpowers/sdd/2026-10-05-companion-website/feedback');
const MAX_BODY_BYTES = 1_000_000;

const INDEX_HEADER = [
  '# Site feedback notes',
  '',
  'Newest first, one line per note: time, page, selector, source file:line, note, JSON file.',
  'Each JSON beside this file has the full record (rectangle, viewport, scroll, flight time).',
  '',
].join('\n');

function rebuildIndex(): void {
  const notes = readdirSync(FEEDBACK_DIR)
    .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
    .map((name) => ({
      stem: name.slice(0, -'.json'.length),
      note: JSON.parse(readFileSync(join(FEEDBACK_DIR, name), 'utf8')) as FeedbackNote,
    }))
    .sort((a, b) => b.note.timestamp.localeCompare(a.note.timestamp));
  const lines = notes.map(({ stem, note }) => feedbackIndexLine(note, stem));
  writeFileSync(join(FEEDBACK_DIR, 'index.md'), `${INDEX_HEADER}${lines.join('\n')}\n`);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) reject(new Error('note too large'));
      else chunks.push(chunk);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Saves a posted note and returns its id, the file stem a later DELETE names. */
function saveNote(note: FeedbackNote): string {
  mkdirSync(FEEDBACK_DIR, { recursive: true });
  const source = note.element.source;
  // The dev build exposes absolute paths; the agent works from the repo root.
  if (source?.file.startsWith(`${REPO_ROOT}/`))
    source.file = source.file.slice(REPO_ROOT.length + 1);
  let n = 1;
  while (
    existsSync(join(FEEDBACK_DIR, `${feedbackNoteStem(note.timestamp, note.page.path, n)}.json`))
  )
    n++;
  const stem = feedbackNoteStem(note.timestamp, note.page.path, n);
  writeFileSync(join(FEEDBACK_DIR, `${stem}.json`), `${JSON.stringify(note, null, 2)}\n`);
  rebuildIndex();
  return stem;
}

async function answer(req: IncomingMessage): Promise<[number, object]> {
  // Another site open in the same browser must not write or delete notes here. A browser
  // names the requester's relation; a command-line client sends no such header.
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin') return [403, { error: 'same-origin only' }];
  if (req.method === 'POST') {
    const note: unknown = JSON.parse(await readBody(req));
    return isFeedbackNote(note)
      ? [200, { id: saveNote(note) }]
      : [400, { error: 'not a feedback note' }];
  }
  if (req.method === 'DELETE') {
    const id = new URL(req.url ?? '', 'http://localhost').searchParams.get('id') ?? '';
    // The id names a file: only the characters a stem is made of, never a path.
    if (!/^[A-Za-z0-9._-]+$/.test(id)) return [400, { error: 'bad id' }];
    rmSync(join(FEEDBACK_DIR, `${id}.json`), { force: true });
    if (existsSync(FEEDBACK_DIR)) rebuildIndex();
    return [200, { id }];
  }
  if (req.method === 'GET') {
    // The page asks which notes still exist, to drop the pins of applied ones.
    const names = existsSync(FEEDBACK_DIR) ? readdirSync(FEEDBACK_DIR) : [];
    const ids = names
      .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
      .map((name) => name.slice(0, -'.json'.length));
    return [200, { ids }];
  }
  return [405, { error: 'GET, POST or DELETE only' }];
}

function handleFeedback(req: IncomingMessage, res: ServerResponse): void {
  const reply = ([status, body]: [number, object]): void => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  };
  answer(req).then(reply, (error: unknown) => reply([500, { error: String(error) }]));
}

export function feedbackPlugin(route: string): Plugin {
  return {
    name: 'site-feedback',
    apply: 'serve',
    configureServer(server) {
      // Post-hook + unshift, as root-statics does: Astro's own base and trailing-slash
      // guards sit first in the stack and would answer this path with a 404 page.
      return () => {
        server.middlewares.stack.unshift({ route, handle: handleFeedback });
      };
    },
  };
}
