import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDataRoot } from '../../src/utils/resolveDataRoot';

describe('resolveDataRoot', () => {
  it('an explicit directory is dev', () => {
    expect(resolveDataRoot('/data', true, '/app', '/ud')).toEqual({ dataRoot: '/data', dev: true });
  });

  it('an unpackaged run reads the repo public/data without syncing', () => {
    expect(resolveDataRoot(undefined, false, '/repo/packages/desktop', '/ud')).toEqual({
      dataRoot: join('/repo', 'public', 'data'),
      dev: true,
    });
  });

  it('a packaged run mirrors into userData and syncs', () => {
    expect(resolveDataRoot(undefined, true, '/app', '/ud')).toEqual({
      dataRoot: join('/ud', 'data'),
      dev: false,
    });
  });
});
