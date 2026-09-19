/**
 * PaletteAction — what a palette row or card asks the container to do on
 * selection, discriminated on `kind`. PR3 adds a `tour` variant; `view` cards
 * are placeholders until PR3 adds the view feature (registry, overlay,
 * `openView`) to wire them up.
 */

import type { ViewId } from '../views/ViewId';

export type PaletteAction = { kind: 'focus'; focusId: string } | { kind: 'view'; viewId: ViewId };
