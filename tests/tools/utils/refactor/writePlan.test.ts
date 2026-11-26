import { mkdirSync, mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { writePlan } from '../../../../tools/utils/refactor/writePlan';

const root = mkdtempSync(join(tmpdir(), 'writePlan-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('writePlan', () => {
  it('writes edited texts, moves files, removes deleted files', () => {
    mkdirSync(join(root, 'src'));
    for (const [name, text] of Object.entries({ old: 'old', stay: 'stay', gone: 'gone' })) {
      writeFileSync(join(root, 'src', `${name}.ts`), text);
    }
    const path = (name: string) => join(root, 'src', `${name}.ts`);

    const result = writePlan(
      {
        texts: new Map([
          [path('new'), 'moved and edited'],
          [path('stay'), 'edited'],
        ]),
        moves: [{ from: path('old'), to: path('new') }],
        deletes: new Set([path('old'), path('gone')]),
      },
      root,
    );

    expect(result.failed).toBeNull();
    expect(readFileSync(path('new'), 'utf8')).toBe('moved and edited');
    expect(readFileSync(path('stay'), 'utf8')).toBe('edited');
    expect(existsSync(path('old'))).toBe(false);
    expect(existsSync(path('gone'))).toBe(false);
  });
});
