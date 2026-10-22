import type { ClipId } from '../animation/ClipId';
import type { TourId } from '../animation/tour/TourId';
import type { ExhibitId } from '../exhibits/ExhibitId';
import type { RemoteMenuItem } from './RemoteMenuItem';

/** The remote's tour, exhibit and clip lists, built by the dome so the phone bundle holds no registry. */
export type RemoteMenu = {
  tours: readonly RemoteMenuItem<TourId>[];
  exhibits: readonly RemoteMenuItem<ExhibitId>[];
  clips: readonly RemoteMenuItem<ClipId>[];
};
