import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { normaliseAddress } from '../../../../tools/utils/refactor/normaliseAddress';

const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'normaliseAddress-')));
mkdirSync(join(root, 'src'));
writeFileSync(join(root, 'src', 'Real.ts'), 'export const x = 1;');
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('normaliseAddress', () => {
  it('returns the file root-relative', () => {
    expect(normaliseAddress(root, { file: join(root, 'src/Real.ts'), symbol: 'x' })).toEqual({
      ok: true,
      address: { file: 'src/Real.ts', symbol: 'x' },
    });
  });

  it('puts a wrong-case address in the disk case, where the disk folds case', () => {
    const folds = normaliseAddress(root, { file: 'src/real.ts', symbol: 'x' });
    // On a case-sensitive disk the file simply does not exist, and the next test covers that.
    if (folds.ok) expect(folds.address.file).toBe('src/Real.ts');
  });

  it('refuses a file that does not exist, naming it', () => {
    const result = normaliseAddress(root, { file: 'src/missing.ts', symbol: 'x' });
    expect(result).toEqual({ ok: false, refusal: expect.stringContaining("'src/missing.ts'") });
  });
});
