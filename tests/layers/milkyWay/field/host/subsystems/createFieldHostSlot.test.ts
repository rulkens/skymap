import { describe, it, expect, vi } from 'vitest';
import { createFieldHostSlot } from '../../../../../../src/layers/milkyWay/field/host/subsystems/createFieldHostSlot';
import type { FieldHostTuning } from '../../../../../../src/layers/milkyWay/field/host/@types/FieldHostTuning';
import type { GalaxyFieldHost } from '../../../../../../src/layers/milkyWay/field/host/@types/GalaxyFieldHost';

const WITH_DUST = { label: 'dust' } as unknown as FieldHostTuning;
const WITHOUT_DUST = { label: 'no dust' } as unknown as FieldHostTuning;

function fakeHost() {
  return {
    setTuning: vi.fn(),
    ensureFresh: vi.fn(),
    destroy: vi.fn(),
  } as unknown as GalaxyFieldHost & {
    setTuning: ReturnType<typeof vi.fn>;
    ensureFresh: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
}

function setup() {
  const hosts: ReturnType<typeof fakeHost>[] = [];
  const create = vi.fn(() => {
    const host = fakeHost();
    hosts.push(host);
    return host;
  });
  const slot = createFieldHostSlot({
    create,
    tuningFor: (dust) => (dust ? WITH_DUST : WITHOUT_DUST),
  });
  return { slot, create, hosts };
}

describe('createFieldHostSlot', () => {
  it('creates on the first field frame and not again while on', () => {
    const { slot, create } = setup();
    expect(slot.sync(false, true)).toBeNull();
    expect(create).not.toHaveBeenCalled();
    slot.sync(true, true);
    slot.sync(true, true);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('destroys when the field part turns off, and recreates when it returns', () => {
    const { slot, create, hosts } = setup();
    slot.sync(true, true);
    slot.sync(false, true);
    expect(hosts[0]!.destroy).toHaveBeenCalledTimes(1);
    slot.sync(true, true);
    expect(create).toHaveBeenCalledTimes(2);
    expect(hosts[1]!.destroy).not.toHaveBeenCalled();
  });

  it('re-tunes on every sync with the tuning for the current dust, then steps the ISM chain', () => {
    const { slot, hosts } = setup();
    slot.sync(true, true);
    slot.sync(true, true);
    slot.sync(true, true);
    const host = hosts[0]!;
    expect(host.setTuning.mock.calls).toEqual([[WITH_DUST], [WITH_DUST], [WITH_DUST]]);
    slot.sync(true, false);
    expect(host.setTuning).toHaveBeenLastCalledWith(WITHOUT_DUST);
    expect(host.ensureFresh).toHaveBeenCalledTimes(4);
    expect(host.setTuning.mock.invocationCallOrder[0]!).toBeLessThan(
      host.ensureFresh.mock.invocationCallOrder[0]!,
    );
  });

  it('destroy releases a live host', () => {
    const { slot, hosts } = setup();
    slot.sync(true, true);
    slot.destroy();
    expect(hosts[0]!.destroy).toHaveBeenCalledTimes(1);
  });
});
