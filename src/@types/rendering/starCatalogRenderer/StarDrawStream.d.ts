/**
 * Which of the two star draw streams a `draw` call records. The survey stars
 * split at the octree cut: `'leaf'` nodes (childless, real point-source stars)
 * draw full-resolution into the HDR target with the per-fragment hue-preserving
 * knee; `'aggregate'` nodes (interior flux-mip glows) draw LINEAR into the
 * half-res `star-aggregates` offscreen, whose upsample composite applies the
 * knee to the summed field. The renderer keeps a DEDICATED per-source buffer
 * pair per stream (never one shared pair) so the two draws — encoded into
 * different passes in the same frame — cannot clobber each other's data before
 * submit (the writeBuffer/submit ordering landmine).
 */
export type StarDrawStream = 'aggregate' | 'leaf';
