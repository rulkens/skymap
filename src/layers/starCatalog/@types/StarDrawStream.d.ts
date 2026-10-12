/**
 * Which of the cut's two lists a draw reads. `'leaf'` (childless nodes, real
 * stars) draws full-res into HDR with the per-glow knee; `'aggregate'` (interior
 * flux-mip glows) draws LINEAR into the half-res `star-aggregates` offscreen,
 * whose upsample applies the knee to the summed field.
 */
export type StarDrawStream = 'aggregate' | 'leaf';
