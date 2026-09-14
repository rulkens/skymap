/** CubemapCapture — one `CUBEMAP_CAPTURES` row, of either kind. */

import type { ProbeCapture } from './ProbeCapture';
import type { SkyCapture } from './SkyCapture';

export type CubemapCapture = SkyCapture | ProbeCapture;
