/** PaletteAction — what a palette row or card asks the container to do on selection, discriminated on `kind`. */

import type { ViewId } from '../views/ViewId';

export type PaletteAction = { kind: 'focus'; focusId: string } | { kind: 'view'; viewId: ViewId };
