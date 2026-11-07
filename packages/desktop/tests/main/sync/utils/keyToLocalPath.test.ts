import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { keyToLocalPath } from '../../../../src/main/sync/utils/keyToLocalPath';

const root = resolve('/mirror');

describe('keyToLocalPath', () => {
  it('drops the bucket prefix', () => {
    expect(keyToLocalPath(root, 'data/galaxy/a.bin')).toBe(join(root, 'galaxy/a.bin'));
  });

  it('refuses an inventory key that would leave the mirror', () => {
    expect(() => keyToLocalPath(root, 'data/../../etc/passwd')).toThrow(/outside/);
    expect(() => keyToLocalPath(root, 'data//etc/passwd')).toThrow(/outside/);
  });
});
