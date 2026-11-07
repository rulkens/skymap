import { describe, expect, it } from 'vitest';
import type { BootFacts } from '../../../../src/main/lifecycle/@types/BootFacts';
import { bootPlan } from '../../../../src/main/lifecycle/utils/bootPlan';

const facts = (over: Partial<BootFacts>): BootFacts => ({
  firstRun: false,
  dev: false,
  hasData: true,
  dataUpdates: { kind: 'atLaunch' },
  ...over,
});

describe('bootPlan', () => {
  it('a manual or daily policy with a complete set loads without syncing', () => {
    expect(bootPlan(facts({ dataUpdates: { kind: 'manual' } })).start).toBe('load');
    expect(bootPlan(facts({ dataUpdates: { kind: 'daily', at: '03:00' } })).start).toBe('load');
    expect(bootPlan(facts({})).start).toBe('sync');
  });

  it('without a complete set it syncs whatever the policy, and asks a person in', () => {
    expect(bootPlan(facts({ hasData: false, dataUpdates: { kind: 'manual' } }))).toEqual({
      showControl: true,
      start: 'sync',
    });
  });

  it('dev never syncs', () => {
    expect(bootPlan(facts({ dev: true })).start).toBe('load');
  });

  it('a first run always shows the control window', () => {
    expect(bootPlan(facts({ firstRun: true })).showControl).toBe(true);
    expect(bootPlan(facts({})).showControl).toBe(false);
  });
});
