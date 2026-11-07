/**
 * The light a sunlit mesh body bounces onto its own other faces (panels onto barrel), as a
 * fraction of sunlight from every direction. A body is left out of its own probe, so nothing
 * else carries it; scaled by the visible Sun, so an eclipsed craft gets none.
 */
export const MESH_SELF_BOUNCE = 0.03;
