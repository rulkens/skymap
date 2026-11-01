import type { ClipId } from '../animation/ClipId';
import type { ControlSchemeId } from '../engine/camera/ControlSchemeId';
import type { PaletteAction } from '../palette/PaletteAction';

/** Every command a remote may send, by name, with its payload; the registry has one row per key. */
export type RemoteCommandPayloads = {
  goTo: PaletteAction;
  home: null;
  togglePairing: null;
  tourAdvance: null;
  tourPrev: null;
  tourTogglePause: null;
  clipStart: { clipId: ClipId };
  exitTakeover: null;
  timePause: null;
  timeResume: null;
  timeSetRate: { rateIndex: number };
  timeSetDirection: { direction: 1 | -1 };
  timeSetDate: { simDays: number };
  timeGoLive: null;
  controlSchemeSet: { scheme: ControlSchemeId };
  toggleSet: { id: string; enabled: boolean };
};
