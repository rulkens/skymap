/**
 * GEN_RECORD_BYTES — the record-size authority for a generated star/dust
 * record: 8 f32 lanes (`x,y,z,r,g,b,size,brightness` for stars;
 * `x,y,z,size,r,g,b,opacity` for dust — different field order, same
 * stride). Both the tool's star/dust render pipelines and plan 02's cloud
 * renderer read their instance `arrayStride` from here, so a stride change
 * is one edit in one place rather than a hunt through every buffer-layout
 * call site. It must still match `milkyWay/sprites/generate.wesl`'s stride-8 output
 * storage array, which lives across the CPU/GPU seam and so stays a
 * hand-mirror no compiler enforces.
 */
export const GEN_RECORD_BYTES = 32;
