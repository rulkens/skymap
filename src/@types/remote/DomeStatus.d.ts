import type { ControlSchemeId } from '../engine/camera/ControlSchemeId';
import type { RemoteTakeover } from './RemoteTakeover';

/** A full snapshot of what the remote renders; `focus.name` is the name the focus card headlines. */
export type DomeStatus = {
  focus: { name: string } | null;
  takeover: RemoteTakeover | null;
  time: {
    simDays: number;
    rateIndex: number;
    direction: 1 | -1;
    paused: boolean;
    mode: 'live' | 'manual';
  };
  controls: { scheme: ControlSchemeId };
  toggles: readonly { id: string; label: string; enabled: boolean }[];
  /** One per Layer with a settings section, in composition order: its whole show switch. */
  layers: readonly { id: string; label: string; enabled: boolean }[];
};
