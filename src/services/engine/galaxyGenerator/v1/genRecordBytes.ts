/**
 * GEN_RECORD_BYTES — the record-size authority for a generated star/dust
 * record: 8 f32 lanes (`x,y,z,r,g,b,size,brightness` for stars;
 * `x,y,z,size,r,g,b,opacity` for dust — different field order, same
 * stride). The tool's `createCloudPipelines.ts` and the app's
 * `milkyWayCloudRenderer.ts` both read their instance `arrayStride` from
 * here. Must still match `milkyWay/sprites/generate.wesl`'s stride-8 output
 * storage array — a CPU/GPU hand-mirror no compiler enforces.
 */
export const GEN_RECORD_BYTES = 32;
