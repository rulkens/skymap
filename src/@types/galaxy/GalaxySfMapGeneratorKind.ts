/**
 * GalaxySfMapGeneratorKind — which of the two independent pipelines writes
 * `GalaxyFieldTuning.sfMap`'s output artifact this rebuild: the SSPSF
 * cellular automaton (`GalaxySfMapAutomatonParams`, `sfMapAutomatonStep.wesl`)
 * or the advected-density fluid alternative (`GalaxySfMapFluidParams`,
 * `sfMapFluidStep.wesl`). Both write the SAME packed texture shape, so every
 * downstream consumer (readback, present, dust blur, CPU CDFs) reads this
 * value never — the dispatcher is the ONLY place that branches on it.
 */
export type GalaxySfMapGeneratorKind = 'automaton' | 'fluid';
