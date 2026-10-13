# Compressed body textures

**Readiness:** `needs-design`. **Surfaced:** 2026-10-13, [GPU memory audit](../research/engine/gpu-memory-audit-2026-10-13.md) finding 7.

Every body, Earth and mesh map is uncompressed rgba8 with a full mip chain: 44.7 MB per
4096×2048 map, 179 MB per 8192×4096. The device requests only `timestamp-query`.
Basis/KTX2 transcoded to BC7 (desktop) or ASTC/ETC2 (phones) cuts ~4×. Costs: a
transcoder in the bundle, a bake step in the texture pipeline, and offline mips (the
runtime `generateMipChain` cannot render into compressed formats).
