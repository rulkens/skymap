/**
 * REMOTE_COMMANDS — every command a remote may send, as one registry: a key's
 * presence is the allow-list, `parse` rebuilds the payload from untrusted JSON
 * (bounds and registry ids checked here), and `toActions` maps it onto existing
 * actions. Lives in `compositions/` because `goTo` checks ids against
 * `APP_EXHIBITS`, a composition value.
 */

import type { UnknownAction } from '@reduxjs/toolkit';
import { APP_EXHIBITS } from './appExhibits';
import { clipRegistry } from '../data/animation/clips/clipRegistry';
import { tourRegistry } from '../data/animation/tours/tourRegistry';
import { RATE_LADDER } from '../data/time/rateLadder';
import { remotePairingToggled } from '../state/remote/remoteSlice';
import { goHome } from '../state/selection/goHome';
import { advanceTour, prevBeat, togglePause } from '../state/tour/tourActions';
import { startClip } from '../state/camera/clipActions';
import { exitTakeover } from '../state/takeover/takeoverActions';
import { pause, resume, setDirection, setRate, setSimDays } from '../state/time/timeSlice';
import { goLiveNowAction } from '../state/time/goLiveNowAction';
import { actionsForPaletteAction } from '../utils/palette/actionsForPaletteAction';
import { isFiniteIn } from '../utils/math/isFiniteIn';
import { isKeyOf } from '../utils/object/isKeyOf';
import { isRecord } from '../utils/object/isRecord';
import type { PaletteAction } from '../@types/palette/PaletteAction';
import type { RemoteCommandPayloads } from '../@types/remote/RemoteCommandPayloads';
import type { RemoteCommandSpec } from '../@types/remote/RemoteCommandSpec';

const MAX_FOCUS_ID_CHARS = 256;
const MAX_ALT_KM = 1e6;
const MAX_ABS_SIM_DAYS = 1e7;

/** A JSON payload may omit `payload` entirely, so `undefined` counts as none too. */
const noPayload = (raw: unknown): null | undefined =>
  raw === null || raw === undefined ? null : undefined;

function parsePaletteAction(raw: unknown): PaletteAction | undefined {
  if (!isRecord(raw)) return undefined;
  switch (raw.kind) {
    case 'focus': {
      const { focusId } = raw;
      if (typeof focusId !== 'string' || focusId.length < 1) return undefined;
      return focusId.length <= MAX_FOCUS_ID_CHARS ? { kind: 'focus', focusId } : undefined;
    }
    case 'exhibit': {
      const { exhibitId } = raw;
      if (typeof exhibitId !== 'string' || !isKeyOf(APP_EXHIBITS, exhibitId)) return undefined;
      return { kind: 'exhibit', exhibitId };
    }
    case 'tour': {
      const { tourId } = raw;
      if (typeof tourId !== 'string' || !isKeyOf(tourRegistry, tourId)) return undefined;
      return { kind: 'tour', tourId };
    }
    case 'flyTo': {
      const { lonDeg, latDeg, altKm } = raw;
      if (!isFiniteIn(lonDeg, -180, 180) || !isFiniteIn(latDeg, -90, 90)) return undefined;
      return isFiniteIn(altKm, 0, MAX_ALT_KM)
        ? { kind: 'flyTo', lonDeg, latDeg, altKm }
        : undefined;
    }
    default:
      return undefined;
  }
}

const noPayloadRow = (action: () => UnknownAction): RemoteCommandSpec<null> => ({
  parse: noPayload,
  toActions: () => [action()],
});

export const REMOTE_COMMANDS: {
  [K in keyof RemoteCommandPayloads]: RemoteCommandSpec<RemoteCommandPayloads[K]>;
} = {
  goTo: { parse: parsePaletteAction, toActions: actionsForPaletteAction },
  home: noPayloadRow(goHome),
  togglePairing: noPayloadRow(remotePairingToggled),
  tourAdvance: noPayloadRow(advanceTour),
  tourPrev: noPayloadRow(prevBeat),
  tourTogglePause: noPayloadRow(togglePause),
  clipStart: {
    parse: (raw) =>
      isRecord(raw) && typeof raw.clipId === 'string' && isKeyOf(clipRegistry, raw.clipId)
        ? { clipId: raw.clipId }
        : undefined,
    toActions: ({ clipId }) => [startClip(clipId)],
  },
  exitTakeover: noPayloadRow(exitTakeover),
  timePause: { parse: noPayload, toActions: (_, { nowMs }) => [pause({ nowMs })] },
  timeResume: { parse: noPayload, toActions: (_, { nowMs }) => [resume({ nowMs })] },
  timeSetRate: {
    parse: (raw) =>
      isRecord(raw) &&
      Number.isInteger(raw.rateIndex) &&
      isFiniteIn(raw.rateIndex, 0, RATE_LADDER.length - 1)
        ? { rateIndex: raw.rateIndex }
        : undefined,
    toActions: ({ rateIndex }, { nowMs }) => [setRate({ rateIndex, nowMs })],
  },
  timeSetDirection: {
    parse: (raw) =>
      isRecord(raw) && (raw.direction === 1 || raw.direction === -1)
        ? { direction: raw.direction }
        : undefined,
    toActions: ({ direction }, { nowMs }) => [setDirection({ direction, nowMs })],
  },
  timeSetDate: {
    parse: (raw) =>
      isRecord(raw) && isFiniteIn(raw.simDays, -MAX_ABS_SIM_DAYS, MAX_ABS_SIM_DAYS)
        ? { simDays: raw.simDays }
        : undefined,
    toActions: ({ simDays }, { nowMs }) => [setSimDays({ simDays, nowMs })],
  },
  // `goLiveNowAction` reads the dome's own clocks, as the time bar's Now button does.
  timeGoLive: noPayloadRow(goLiveNowAction),
  toggleSet: {
    parse: (raw) =>
      isRecord(raw) && typeof raw.id === 'string' && typeof raw.enabled === 'boolean'
        ? { id: raw.id, enabled: raw.enabled }
        : undefined,
    toActions: ({ id, enabled }, { toggleRows }) => {
      const row = toggleRows.find((r) => r.id === id);
      return row ? [row.set(enabled)] : [];
    },
  },
};
