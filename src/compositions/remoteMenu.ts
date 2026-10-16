/**
 * REMOTE_MENU — the remote's tour, exhibit and clip lists, read off the dome's own registries.
 * `dev` tours and clips stay off it; the registries are the only place a label is written.
 */

import { APP_EXHIBITS } from './appExhibits';
import { clipRegistry } from '../data/animation/clips/clipRegistry';
import { tourRegistry } from '../data/animation/tours/tourRegistry';
import type { RemoteMenuItem } from '../@types/remote/RemoteMenuItem';
import type { RemoteMenu } from '../@types/remote/RemoteMenu';

const listed = <Id extends string>(
  rows: readonly { id: Id; label: string; dev?: boolean }[],
): RemoteMenuItem<Id>[] => rows.filter((row) => !row.dev).map(({ id, label }) => ({ id, label }));

export const REMOTE_MENU: RemoteMenu = {
  tours: listed(Object.values(tourRegistry)),
  exhibits: listed(Object.values(APP_EXHIBITS)),
  clips: listed(Object.values(clipRegistry)),
};
