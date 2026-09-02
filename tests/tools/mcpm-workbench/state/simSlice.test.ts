/**
 * simSlice — `setAgentCount` is the one behaviour a compiler can't catch:
 * the 100k snap. Below the unit, `seedAgents`'s dispatch-truncation guard
 * can floor `gridZ` to 0 and silently run nothing, so an un-snapped count
 * must never reach the harness.
 */
import { describe, expect, it } from 'vitest';
import {
  AGENT_COUNT_MAX,
  AGENT_COUNT_MIN,
  defaultSimSlice,
  simSlice,
} from '../../../../tools/mcpm-workbench/src/state/sim/simSlice';

describe('simSlice setAgentCount', () => {
  it('snaps to the nearest 100k unit', () => {
    const next = simSlice.reducer(defaultSimSlice, simSlice.actions.setAgentCount(1_050_000));
    expect(next.agentCount).toBe(1_000_000);
  });

  it('clamps a snapped value below the 1M floor up to AGENT_COUNT_MIN', () => {
    const next = simSlice.reducer(defaultSimSlice, simSlice.actions.setAgentCount(50_000));
    expect(next.agentCount).toBe(AGENT_COUNT_MIN);
  });

  it('clamps a snapped value above the 10M ceiling down to AGENT_COUNT_MAX', () => {
    const next = simSlice.reducer(defaultSimSlice, simSlice.actions.setAgentCount(12_345_678));
    expect(next.agentCount).toBe(AGENT_COUNT_MAX);
  });
});
