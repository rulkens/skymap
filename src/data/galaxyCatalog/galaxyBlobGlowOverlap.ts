/**
 * A galaxy octree blob's glow radius over half its node's projected edge. √3 makes the
 * disc circumscribe the box (its half diagonal), so neighbouring far glows meet edge to
 * edge; it is also the star survey's default reach (0.5·tan 30°·glowOverlap 3 ≈ 0.87 edges).
 */
export const GALAXY_BLOB_GLOW_OVERLAP = Math.sqrt(3);
