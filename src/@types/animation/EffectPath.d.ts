/**
 * Index path into `ClipData.timeline`: the timeline index, then a `children` index per `seq`/`all`
 * level, and 0 for a `fork`'s child. How a `ClipCompileError` names the effects at fault.
 */
export type EffectPath = readonly number[];
