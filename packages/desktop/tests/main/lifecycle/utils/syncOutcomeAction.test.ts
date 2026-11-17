import { describe, expect, it } from 'vitest';
import type { SyncOutcomeFacts } from '../../../../src/main/lifecycle/@types/SyncOutcomeFacts';
import { syncOutcomeAction } from '../../../../src/main/lifecycle/utils/syncOutcomeAction';

const facts = (over: Partial<SyncOutcomeFacts>): SyncOutcomeFacts => ({
  outcome: { kind: 'synced' },
  hasData: true,
  skyRunning: false,
  skyStale: false,
  restart: true,
  ...over,
});
const diskFull = { kind: 'diskFull', neededBytes: 9e9, freeBytes: 1e9 } as const;

describe('syncOutcomeAction (spec §5)', () => {
  it('offline with no data raises the control window and loads nothing', () => {
    const action = syncOutcomeAction(facts({ outcome: { kind: 'offline' }, hasData: false }));
    expect(action).toEqual({ status: { kind: 'offline' }, then: 'showControl' });
  });

  it('Update now with a running sky says ready and does not reload', () => {
    const action = syncOutcomeAction(facts({ skyRunning: true, restart: false }));
    expect(action).toEqual({ status: { kind: 'ready' }, then: 'none' });
  });

  it('a full disk with data and no sky loads the sky; without data it shows the control window', () => {
    expect(syncOutcomeAction(facts({ outcome: diskFull })).then).toBe('loadSky');
    expect(syncOutcomeAction(facts({ outcome: diskFull, hasData: false })).then).toBe(
      'showControl',
    );
  });

  it('a launch or daily sync that downloaded reloads the running sky', () => {
    expect(syncOutcomeAction(facts({ skyRunning: true })).then).toBe('loadSky');
  });

  it('a sync that found nothing new leaves a current sky alone', () => {
    const action = syncOutcomeAction(facts({ outcome: { kind: 'unchanged' }, skyRunning: true }));
    expect(action).toEqual({ status: { kind: 'complete' }, then: 'none' });
  });

  it('a sky still waiting for Restart sky reloads on the next daily sync, even an unchanged one', () => {
    const stale = facts({ outcome: { kind: 'unchanged' }, skyRunning: true, skyStale: true });
    expect(syncOutcomeAction(stale).then).toBe('loadSky');
    expect(syncOutcomeAction({ ...stale, restart: false }).status).toEqual({ kind: 'ready' });
  });
});
