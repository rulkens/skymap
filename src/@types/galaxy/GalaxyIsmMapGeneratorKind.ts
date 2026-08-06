/**
 * GalaxyIsmMapGeneratorKind — which pipeline writes `GalaxyFieldTuning.ismMap`'s
 * output artifact this rebuild: `'none'` (no simulation runs, no map exists —
 * every consumer's existing no-map fallback applies), the SSPSF cellular
 * automaton (`GalaxyIsmMapAutomatonParams`, `ismMapAutomatonStep.wesl`), or the
 * advected-density fluid alternative (`GalaxyIsmMapFluidParams`,
 * `ismMapFluidStep.wesl`). The two runners write the SAME packed texture
 * shape, so every downstream consumer (readback, present, dust blur, CPU
 * CDFs) reads this value never — the dispatcher is the ONLY place that
 * branches on it.
 */
export type GalaxyIsmMapGeneratorKind = 'none' | 'automaton' | 'fluid';
