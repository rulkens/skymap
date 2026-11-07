import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LanInterface } from '../../../src/@types/LanInterface';
import { watchLan } from '../../../src/main/lan/watchLan';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// Audit B I1: the pairing address and networks were read once, so a kiosk up before DHCP kept none.
it('reports a network that appears after launch, once', () => {
  let interfaces: LanInterface[] = [];
  const onChange = vi.fn();
  watchLan(() => interfaces, onChange);
  vi.advanceTimersByTime(60_000);
  expect(onChange).not.toHaveBeenCalled();

  interfaces = [{ name: 'en0', address: '10.0.0.2' }];
  vi.advanceTimersByTime(60_000);
  expect(onChange).toHaveBeenCalledOnce();
  expect(onChange).toHaveBeenCalledWith([{ name: 'en0', address: '10.0.0.2' }]);
});
