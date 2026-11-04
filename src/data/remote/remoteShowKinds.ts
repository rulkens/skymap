/**
 * REMOTE_SHOW_KINDS: per takeover kind, the menu list it reads, its noun and the command that
 * starts one.
 */

import ClipIcon from '../../components/icons/ClipIcon/ClipIcon';
import ExhibitIcon from '../../components/icons/ExhibitIcon/ExhibitIcon';
import TourIcon from '../../components/icons/TourIcon/TourIcon';
import type { RemoteShowKind } from '../../@types/remote/RemoteShowKind';
import type { RemoteTakeover } from '../../@types/remote/RemoteTakeover';

export const REMOTE_SHOW_KINDS: {
  readonly [K in RemoteTakeover['kind']]: RemoteShowKind<K>;
} = {
  tour: {
    list: 'tours',
    noun: 'Tour',
    icon: TourIcon,
    start: (tourId) => ({ name: 'goTo', payload: { kind: 'tour', tourId } }),
  },
  exhibit: {
    list: 'exhibits',
    noun: 'Exhibit',
    icon: ExhibitIcon,
    start: (exhibitId) => ({ name: 'goTo', payload: { kind: 'exhibit', exhibitId } }),
  },
  clip: {
    list: 'clips',
    noun: 'Clip',
    icon: ClipIcon,
    start: (clipId) => ({ name: 'clipStart', payload: { clipId } }),
  },
};
