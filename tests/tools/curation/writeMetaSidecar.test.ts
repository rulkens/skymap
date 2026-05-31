import { describe, expect, it } from 'vitest';
import { readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

import { writeMetaSidecar, type MetaSidecarEntry } from '../../../tools/curation/writeMetaSidecar.js';

function tmpPath(): string {
  return join(tmpdir(), `writeMetaSidecar-${randomBytes(6).toString('hex')}.json`);
}

describe('writeMetaSidecar', () => {
  it('writes pretty-printed JSON array indexed by order', () => {
    const entries: MetaSidecarEntry[] = [
      { id: 'a1', names: ['A One', 'Alpha-1'], description: 'First entry.' },
      { id: 'b2', names: ['B Two'], description: 'Second entry.' },
    ];
    const path = tmpPath();
    try {
      writeMetaSidecar(entries, path);
      const raw = readFileSync(path, 'utf8');
      // Pretty-printed: starts with `[\n  {`
      expect(raw).toMatch(/^\[\n  \{/);
      // Parsed array must deep-equal the input
      const parsed = JSON.parse(raw) as unknown;
      expect(parsed).toEqual(entries);
    } finally {
      unlinkSync(path);
    }
  });

  it('preserves domain-specific extra fields', () => {
    const entries: MetaSidecarEntry[] = [
      {
        id: 'm31',
        names: ['M31', 'NGC 224'],
        description: 'Andromeda Galaxy.',
        type: 'SA(s)b',
        commonName: 'Andromeda Galaxy',
      },
      {
        id: 'ngc-6744',
        names: ['NGC 6744'],
        description: 'A Milky Way analogue.',
        type: 'SAB(r)bc',
      },
    ];
    const path = tmpPath();
    try {
      writeMetaSidecar(entries, path);
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown[];
      // Extra fields survive the round-trip
      expect(parsed[0]).toEqual(entries[0]);
      expect((parsed[0] as Record<string, unknown>)['type']).toBe('SA(s)b');
      expect((parsed[0] as Record<string, unknown>)['commonName']).toBe('Andromeda Galaxy');
      // Entry without optional extras also survives
      expect(parsed[1]).toEqual(entries[1]);
      expect('commonName' in (parsed[1] as Record<string, unknown>)).toBe(false);
    } finally {
      unlinkSync(path);
    }
  });
});
