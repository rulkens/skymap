/**
 * GalaxySfMapGeneratorKind — which pipeline writes `GalaxyFieldTuning.sfMap`'s
 * output artifact this rebuild: `'none'` (no simulation runs, no map exists —
 * every consumer's existing no-map fallback applies), the SSPSF cellular
 * automaton (`GalaxySfMapAutomatonParams`, `sfMapAutomatonStep.wesl`), or the
 * advected-density fluid alternative (`GalaxySfMapFluidParams`,
 * `sfMapFluidStep.wesl`). The two runners write the SAME packed texture
 * shape, so every downstream consumer (readback, present, dust blur, CPU
 * CDFs) reads this value never — the dispatcher is the ONLY place that
 * branches on it.
 */
export type GalaxySfMapGeneratorKind = 'none' | 'automaton' | 'fluid';
