/**
 * ExhibitId — the ids `openExhibit` resolves, derived from the keys of `APP_EXHIBIT_REGISTRY`.
 *
 * Adding an exhibit is one row (`Exhibit<'itsId'>`) in a Layer's or the composition's list; the id
 * follows. An id may sit in a shared link, so renaming one breaks those links.
 */

import type { APP_EXHIBIT_REGISTRY } from '../../compositions/appExhibits';

export type ExhibitId = keyof typeof APP_EXHIBIT_REGISTRY;
