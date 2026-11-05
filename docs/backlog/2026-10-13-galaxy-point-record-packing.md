# Pack the galaxy point record from 56 B to 32 B

**Readiness:** `needs-design`. **Surfaced:** 2026-10-13, [GPU memory audit](../research/engine/gpu-memory-audit-2026-10-13.md) finding 6.

All 14 slots are f32 (`galaxyPointVertexLayout.ts:25-45`). Position needs f32; paCos/
paSin pack to snorm16x2 (axisRatio's sign flag survives); magnitude, colour index, vMax,
absMag and sbAmp to f16; slots 10–11 (Schechter ratio, angular weight) are dead unless
a bias mode is on. 12 + 10 × 2 = 32 B: −43%, 60–84 MB at tier large. The CPU
`interleaved` mirror kept for bias splices (`catalogStore.ts:332-374`) costs the same
again in JS heap. `SLOTS_PER_GALAXY_POINT` and the shader layout must change together.
Measure with `npm run perf` first: vertex fetch at 2.5M points is the likely payoff,
not only VRAM.
