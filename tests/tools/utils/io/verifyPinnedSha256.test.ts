/** Mirror-mode trust: a file is accepted only when a committed pin names it and matches. */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyPinnedSha256 } from '../../../../tools/utils/io/verifyPinnedSha256';

const BYTES = Buffer.from('cloud');
const DIGEST = createHash('sha256').update(BYTES).digest('hex');

function fixture(sidecar: string): { file: string; sidecarPath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'pinned-sha256-'));
  const file = join(dir, 'month.jpg');
  writeFileSync(file, BYTES);
  writeFileSync(join(dir, 'textures.sha256'), sidecar);
  return { file, sidecarPath: join(dir, 'textures.sha256') };
}

describe('verifyPinnedSha256', () => {
  it('accepts a file matching its pin', async () => {
    const { file, sidecarPath } = fixture(`${'0'.repeat(64)}  other.jpg\n${DIGEST}  month.jpg\n`);
    await expect(verifyPinnedSha256(file, 'month.jpg', sidecarPath)).resolves.toBe(DIGEST);
  });

  it('refuses a file whose bytes differ from its pin', async () => {
    const { file, sidecarPath } = fixture(`${'0'.repeat(64)}  month.jpg\n`);
    await expect(verifyPinnedSha256(file, 'month.jpg', sidecarPath)).rejects.toThrow(/mismatch/);
  });

  it('refuses a file with no pin instead of pinning it', async () => {
    const { file, sidecarPath } = fixture(`${DIGEST}  other-month.jpg\n`);
    await expect(verifyPinnedSha256(file, 'month.jpg', sidecarPath)).rejects.toThrow(/no pin/);
  });
});
