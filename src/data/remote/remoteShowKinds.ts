/** REMOTE_SHOW_KINDS: per takeover kind, the menu list it reads, its noun and the command that starts one. */

import type { RemoteShowKind } from '../../@types/remote/RemoteShowKind';
import type { RemoteTakeover } from '../../@types/remote/RemoteTakeover';

export const REMOTE_SHOW_KINDS: {
  readonly [K in RemoteTakeover['kind']]: RemoteShowKind<K>;
} = {
  tour: {
    list: 'tours',
    noun: 'Tour',
    glyph: 'tour',
    start: (tourId) => ({ name: 'goTo', payload: { kind: 'tour', tourId } }),
  },
  exhibit: {
    list: 'exhibits',
    noun: 'Exhibit',
    glyph: 'exhibit',
    start: (exhibitId) => ({ name: 'goTo', payload: { kind: 'exhibit', exhibitId } }),
  },
  clip: {
    list: 'clips',
    noun: 'Clip',
    glyph: 'clip',
    start: (clipId) => ({ name: 'clipStart', payload: { clipId } }),
  },
};
