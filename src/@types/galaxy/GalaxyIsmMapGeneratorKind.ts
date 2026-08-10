/**
 * GalaxyIsmMapGeneratorKind — which pipeline writes `GalaxyFieldTuning.ismMap`'s
 * output artifact this rebuild: `'none'` (no simulation runs, no map exists —
 * every consumer's existing no-map fallback applies), the SSPSF cellular
 * automaton (`GalaxyIsmMapAutomatonParams`, `ismMapAutomatonStep.wesl`), or the
 * advected-density fluid alternative (`GalaxyIsmMapFluidParams`,
 * `ismMapFluidStep.wesl`). The two runners write the SAME packed texture
 * shape, so the GPU-side readers (present, dust blur) never branch on this
 * value. CPU consumers do: `hiiRegions.ts` and `dustParticleCloud.ts` read
 * `tuning.ismMap.generator` directly, since only the fluid generator has an
 * event log to source region candidates and placement from.
 */
export type GalaxyIsmMapGeneratorKind = 'none' | 'automaton' | 'fluid';
