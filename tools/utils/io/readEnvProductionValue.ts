/**
 * Read a single `KEY=value` entry from `.env.production` at the repo root.
 *
 * `.env.production` is committed (it carries non-secret build-time
 * configuration like `VITE_DATA_BASE_URL` — see the file's own header
 * for the rationale).  Tooling that needs those values — primarily the
 * `tools/deploy/` scripts — should read them from here rather than
 * declaring local constants, so changes to the file propagate
 * everywhere without manual mirror-edits.
 *
 * Tiny regex parser rather than pulling in `dotenv`: the project is
 * otherwise dependency-light, and we only ever need one variable at a
 * time on the slow cold paths that invoke this.  The format we expect
 * is the canonical `KEY=value`, optionally with surrounding quotes;
 * comments (`#` lines) and blank lines are ignored implicitly by the
 * single-line anchor.
 *
 * Throws if the key is absent — these readers are called eagerly at
 * script start, so a missing value is a configuration error worth
 * surfacing loudly rather than silently defaulting.
 */

import { readFileSync } from 'node:fs';

export function readEnvProductionValue(key: string): string {
  const text = readFileSync('.env.production', 'utf8');
  const re = new RegExp(`^${key}\\s*=\\s*(.+?)\\s*$`, 'm');
  const m = text.match(re);
  if (!m) throw new Error(`${key} not found in .env.production`);
  return m[1]!.replace(/^["']|["']$/g, '');
}
