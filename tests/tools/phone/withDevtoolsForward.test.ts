import { beforeEach, describe, expect, it, vi } from 'vitest';

const execFileSync = vi.fn();
vi.mock('node:child_process', () => ({ execFileSync }));

const { withDevtoolsForward } = await import('../../../tools/phone/withDevtoolsForward');

const adbCalls = (): string[] => execFileSync.mock.calls.map((c) => (c[1] as string[]).join(' '));

describe('withDevtoolsForward', () => {
  beforeEach(() => execFileSync.mockReset());

  it('removes the forward even when the body throws', async () => {
    await expect(
      withDevtoolsForward(async () => {
        throw new Error('cdp hung');
      }),
    ).rejects.toThrow('cdp hung');
    expect(adbCalls()).toEqual([
      'forward tcp:9333 localabstract:chrome_devtools_remote',
      'forward --remove tcp:9333',
    ]);
  });

  it("keeps the body's error when the phone vanished and the remove fails too", async () => {
    execFileSync.mockImplementation((_cmd: string, args?: string[]) => {
      if (args?.includes('--remove')) throw new Error('device not found');
    });
    await expect(
      withDevtoolsForward(async () => {
        throw new Error('cdp hung');
      }),
    ).rejects.toThrow('cdp hung');
  });
});
