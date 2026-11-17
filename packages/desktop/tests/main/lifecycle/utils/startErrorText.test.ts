import { describe, expect, it } from 'vitest';
import { startErrorText } from '../../../../src/main/lifecycle/utils/startErrorText';

const failure = (code: string) => Object.assign(new Error(`${code}: raw`), { code });

describe('startErrorText', () => {
  it('names the fix for a taken port and a full disk, never the raw code', () => {
    expect(startErrorText(failure('EADDRINUSE'))).toMatch(/Port 47823 is in use/);
    expect(startErrorText(failure('ENOSPC'))).toMatch(/disk is full/);
    expect(startErrorText(failure('ENOSPC'))).not.toMatch(/ENOSPC/);
  });
});
