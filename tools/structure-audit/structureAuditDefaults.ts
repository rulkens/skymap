import { join, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..', '..');
export const SRC_DIR = join(ROOT, 'src');
export const OUT_FILE = join(ROOT, 'tools', 'structure-audit', 'out', 'structureAudit.html');
/** jscpd clone thresholds: `STRICT` is the headline count, `LOOSE` the wider net. */
export const STRICT_CLONES = { minLines: 8, minTokens: 60 };
export const LOOSE_CLONES = { minLines: 5, minTokens: 40 };
/** How many fan-in / fan-out hub files the Hubs tab lists. */
export const TOP_HUBS = 20;
/** How many largest cycles (by file count) the Cycles tab lists. */
export const TOP_CYCLES = 40;
/** Bundle entry points: nothing imports them by design, so the dead-export audit skips them. */
export const BUNDLE_ENTRIES = new Set(['main.tsx', 'worker.ts', 'unsupportedPage.ts']);
/** Proposed area tiers, low to high; see README — not ratified, no ratchet yet. */
export const TIERS = ['leaves', 'services', 'engine', 'state', 'layers', 'ui'] as const;
