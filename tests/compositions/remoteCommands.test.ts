import { describe, expect, it } from 'vitest';

import { parseRemoteCommand } from '../../src/compositions/parseRemoteCommand';
import { runRemoteCommand } from '../../src/compositions/runRemoteCommand';
import { RATE_LADDER } from '../../src/data/time/rateLadder';
import { goHome } from '../../src/state/selection/goHome';
import { advanceTour, prevBeat, togglePause } from '../../src/state/tour/tourActions';
import { startClip } from '../../src/state/camera/clipActions';
import { exitTakeover } from '../../src/state/takeover/takeoverActions';
import {
  goLive,
  pause,
  resume,
  setDirection,
  setRate,
  setSimDays,
} from '../../src/state/time/timeSlice';
import { actionsForPaletteAction } from '../../src/utils/palette/actionsForPaletteAction';
import type { PaletteAction } from '../../src/@types/palette/PaletteAction';
import type { RemoteCommandEnv } from '../../src/@types/remote/RemoteCommandEnv';

const ENV: RemoteCommandEnv = {
  nowMs: 1234.5,
  toggleRows: [
    {
      id: 'toggle-orbit-trails',
      label: 'Orbit trails',
      enabled: false,
      set: (enabled) => ({ type: 'test/setTrails', payload: enabled }),
    },
  ],
};

/** Parse as the receiver does, then build; null when the parse drops the command. */
function run(name: string, payload?: unknown) {
  const command = parseRemoteCommand({ name, payload });
  return command && runRemoteCommand(command, ENV);
}

describe('goTo', () => {
  const arms: PaletteAction[] = [
    { kind: 'focus', focusId: 'body-mars' },
    { kind: 'exhibit', exhibitId: 'cosmicWeb' },
    { kind: 'tour', tourId: 'grandTour' },
    { kind: 'flyTo', lonDeg: -180, latDeg: 90, altKm: 1e6 },
  ];

  it('builds its actions', () => {
    for (const action of arms) expect(run('goTo', action)).toEqual(actionsForPaletteAction(action));
  });

  it('rejects a malformed payload', () => {
    expect(run('goTo', { kind: 'focus', focusId: '' })).toBeNull();
    expect(run('goTo', { kind: 'focus', focusId: 'x'.repeat(257) })).toBeNull();
    expect(run('goTo', { kind: 'flyTo', lonDeg: 181, latDeg: 0, altKm: 10 })).toBeNull();
    expect(run('goTo', { kind: 'flyTo', lonDeg: 0, latDeg: -91, altKm: 10 })).toBeNull();
    expect(run('goTo', { kind: 'flyTo', lonDeg: 0, latDeg: 0, altKm: -1 })).toBeNull();
    expect(run('goTo', { kind: 'warp' })).toBeNull();
  });

  it('rejects an unknown id', () => {
    expect(run('goTo', { kind: 'exhibit', exhibitId: 'toString' })).toBeNull();
    expect(run('goTo', { kind: 'tour', tourId: 'nope' })).toBeNull();
  });
});

describe.each([
  ['home', goHome()],
  ['tourAdvance', advanceTour()],
  ['tourPrev', prevBeat()],
  ['tourTogglePause', togglePause()],
  ['exitTakeover', exitTakeover()],
])('%s', (name, action) => {
  it('builds its actions', () => {
    expect(run(name)).toEqual([action]);
    expect(run(name, null)).toEqual([action]);
  });

  it('rejects a malformed payload', () => {
    expect(run(name, {})).toBeNull();
  });
});

describe('clipStart', () => {
  it('builds its actions', () => {
    expect(run('clipStart', { clipId: 'flyout' })).toEqual([startClip('flyout')]);
  });

  it('rejects a malformed payload', () => {
    expect(run('clipStart', 'flyout')).toBeNull();
  });

  it('rejects an unknown id', () => {
    expect(run('clipStart', { clipId: 'nope' })).toBeNull();
  });
});

describe('timePause and timeResume', () => {
  it('builds its actions', () => {
    expect(run('timePause')).toEqual([pause({ nowMs: ENV.nowMs })]);
    expect(run('timeResume')).toEqual([resume({ nowMs: ENV.nowMs })]);
  });

  it('rejects a malformed payload', () => {
    expect(run('timePause', 1)).toBeNull();
  });
});

describe('timeSetRate', () => {
  it('builds its actions', () => {
    const rateIndex = RATE_LADDER.length - 1;
    expect(run('timeSetRate', { rateIndex })).toEqual([setRate({ rateIndex, nowMs: ENV.nowMs })]);
  });

  it('rejects a malformed payload', () => {
    expect(run('timeSetRate', { rateIndex: RATE_LADDER.length })).toBeNull();
    expect(run('timeSetRate', { rateIndex: 1.5 })).toBeNull();
    expect(run('timeSetRate', { rateIndex: -1 })).toBeNull();
  });
});

describe('timeSetDirection', () => {
  it('builds its actions', () => {
    expect(run('timeSetDirection', { direction: -1 })).toEqual([
      setDirection({ direction: -1, nowMs: ENV.nowMs }),
    ]);
  });

  it('rejects a malformed payload', () => {
    expect(run('timeSetDirection', { direction: 0 })).toBeNull();
  });
});

describe('timeSetDate', () => {
  it('builds its actions', () => {
    expect(run('timeSetDate', { simDays: 2451545 })).toEqual([
      setSimDays({ simDays: 2451545, nowMs: ENV.nowMs }),
    ]);
  });

  it('rejects a malformed payload', () => {
    expect(run('timeSetDate', { simDays: 1e7 + 1 })).toBeNull();
    expect(run('timeSetDate', { simDays: '2451545' })).toBeNull();
  });
});

describe('timeGoLive', () => {
  it('builds a goLive action', () => {
    const actions = run('timeGoLive');
    expect(actions).toHaveLength(1);
    expect(goLive.match(actions![0]!)).toBe(true);
  });

  it('rejects a malformed payload', () => {
    expect(run('timeGoLive', { simDays: 0 })).toBeNull();
  });
});

describe('toggleSet', () => {
  it('builds its actions', () => {
    expect(run('toggleSet', { id: 'toggle-orbit-trails', enabled: true })).toEqual([
      { type: 'test/setTrails', payload: true },
    ]);
  });

  it('rejects a malformed payload', () => {
    expect(run('toggleSet', { id: 'toggle-orbit-trails', enabled: 'yes' })).toBeNull();
  });

  it('rejects an unknown id', () => {
    expect(run('toggleSet', { id: 'toggle-nope', enabled: true })).toEqual([]);
  });
});

describe('parseRemoteCommand', () => {
  it('an unknown command name parses to null', () => {
    expect(parseRemoteCommand({ name: 'reboot', payload: null })).toBeNull();
    expect(parseRemoteCommand({ name: 'hasOwnProperty', payload: null })).toBeNull();
  });

  it('a non-object command parses to null', () => {
    expect(parseRemoteCommand('home')).toBeNull();
    expect(parseRemoteCommand(null)).toBeNull();
  });

  it('time rows stamp env.nowMs, and a nowMs field in the payload is ignored', () => {
    expect(run('timeSetRate', { rateIndex: 2, nowMs: 99 })).toEqual([
      setRate({ rateIndex: 2, nowMs: ENV.nowMs }),
    ]);
    expect(run('timeSetDate', { simDays: 10, nowMs: 99 })).toEqual([
      setSimDays({ simDays: 10, nowMs: ENV.nowMs }),
    ]);
  });
});
