/**
 * FieldTarget — one field render target as the renderer sees it: a view to
 * bind and the pixel size its header packs as `targetSizePx` (a view carries
 * no dimensions). The view stays one object until its target is reallocated,
 * so bind-group caches key on its identity.
 */
import type { Size } from '../../../../@types/rendering/Size';

export type FieldTarget = { readonly view: GPUTextureView; readonly sizePx: Size };
