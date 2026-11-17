import type { TourId } from '../animation/tour/TourId';
import type { ExhibitId } from '../exhibits/ExhibitId';
import type { ClipId } from '../animation/ClipId';

/** What runs on the dome, as the remote shows it; mirrors `TakeoverSource` without the exhibit's `entry`. The
 *  label is not here: the phone looks it up in `RemoteMenu` by kind and id. */
export type RemoteTakeover =
  | { kind: 'tour'; id: TourId; beatIndex: number; beatCount: number; paused: boolean }
  | { kind: 'exhibit'; id: ExhibitId }
  | { kind: 'clip'; id: ClipId };
