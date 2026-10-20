/**
 * BiasMode — the literal union mirroring the runtime `BiasMode` const in
 * `src/data/galaxyCatalog/biasMode.ts` (see its header for the modes). Inlined
 * rather than derived so this `.d.ts` stays value-free; the shader compares
 * against the same literals.
 */
export type BiasMode = 0 | 1 | 2;
