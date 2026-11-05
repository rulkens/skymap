import type { LabelItemOf } from '../../../../@types/animation/LabelItemOf';
import type { ForegroundCaption } from '../../../../services/engine/presentation/foregroundCaption';

/** A body's caption and the item of the `label:body` entry whose value fades it. */
export type BodyCaption = ForegroundCaption & { readonly item: LabelItemOf<'body'> };
