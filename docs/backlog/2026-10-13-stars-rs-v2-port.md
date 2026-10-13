# Port the Rust star builder to the v2 octree

**Readiness:** `ready` (ruled: port, not drop). **Surfaced:** 2026-10-11, ruling on #885.

`tools/stars-rs` writes only the v1 SKST tiers; the published v2 octree comes from the TypeScript
`npm run build-stars` (a 16 GB heap, ~111 s). The Rust build needs the TypeScript builder's chunking
(`tools/octree/`), the frozen-LUT bin snapping and the nesting of the index, and the parity contract in
`tools/stars-rs/README.md` must be restated for the octree. Its own plan; worth it when the Gaia superset
outgrows the Node heap.
