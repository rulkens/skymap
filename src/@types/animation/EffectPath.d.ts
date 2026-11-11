/**
 * Index path into `ClipData.timeline`: the timeline index, then a `children` index per `seq`/`all`
 * level, and 0 for a `fork`'s child. The one address a compiled span, a compile error and an editor
 * selection share, so it must survive `resolveClipFoci` unchanged (the resolver keeps tree shape).
 */
export type EffectPath = readonly number[];
