import { describe, expect, it } from 'vitest';
import { serially } from '../../../../src/main/lifecycle/utils/serially';

describe('serially', () => {
  it('runs tasks one after another, each seeing the previous result', async () => {
    const run = serially();
    let code = 'a';
    const rotate = (next: string) => async () => {
      const seen = code;
      await new Promise((r) => setTimeout(r, 5));
      code = `${seen}>${next}`;
    };
    await Promise.all([run(rotate('b')), run(rotate('c'))]);
    expect(code).toBe('a>b>c');
  });

  it('keeps going after a failed task', async () => {
    const run = serially();
    const failed = run(async () => {
      throw new Error('disk full');
    });
    await expect(failed).rejects.toThrow('disk full');
    let ran = false;
    await run(async () => void (ran = true));
    expect(ran).toBe(true);
  });
});
