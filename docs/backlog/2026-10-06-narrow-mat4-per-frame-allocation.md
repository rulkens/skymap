# narrowMat4 allocates per call

`src/utils/math/narrowMat4.ts` returns `new Float32Array(m)` and is called from about 30 sites, many per frame (for example `constellationsPass`). Each call allocates 64 bytes of garbage. Fix shape: `narrowMat4Into(out, m)` writing into a preallocated array owned by each pass, then migrate hot call sites. Measure first with `npm run perf`; the GC cost may be negligible next to per-galaxy CPU work.
