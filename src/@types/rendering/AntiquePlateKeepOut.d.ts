/**
 * Where the antique plate leaves no room for a name, in canvas px (+Y down):
 * `inner` is the field inside the neatline's numbering, `keepOut` the sheet
 * ornaments that clear the plate beneath them (the title cartouche).
 */

import type { ScreenRectPx } from './ScreenRectPx';

export type AntiquePlateKeepOut = {
  readonly inner: ScreenRectPx;
  readonly keepOut: readonly ScreenRectPx[];
};
