/**
 * DepthIntent — what a depth-tested pipeline *wants* from the depth test,
 * independent of *how* depth is encoded on the slab it draws into.
 *
 * `'nearer'` means "keep the fragment closer to the camera" (opaque bodies);
 * `'nearer-or-equal'` also keeps ties, which the coplanar atmosphere shell
 * needs to draw over the body surface it shares a radius with.  The intent is
 * convention-free: the per-slab `reversedZ` flag decides whether "nearer" is a
 * smaller or larger stored depth, and `resolveDepthCompare` resolves the pair
 * into the concrete `GPUCompareFunction`.
 */
export type DepthIntent = 'nearer' | 'nearer-or-equal';
