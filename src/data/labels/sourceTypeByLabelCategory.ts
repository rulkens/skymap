/**
 * SOURCE_TYPE_BY_LABEL_CATEGORY — each label-bearing category's registry source
 * type, the key into `LABEL_HOME_BY_SOURCE_TYPE`.
 *
 * `SOURCE_REGISTRY` is keyed by numeric pick code, so "which type is category
 * `cluster`?" needs an id-keyed view. Building it once at module scope keeps
 * both consumers — the read projection and the container's toggle handler — a
 * pair of lookups rather than a linear registry scan per category per call.
 *
 * It is ONE shared const rather than a copy in each consumer on purpose: two
 * copies of the same category→type mapping are the mirrored-state shape this
 * whole seam exists to delete.
 */

import type { LabelCategory } from '../../@types/engine/data/LabelCategory';
import type { LabelBearingSourceType } from '../../@types/data/LabelBearingSourceType';
import { SOURCE_ENTRIES } from '../sourceEntries';

export const SOURCE_TYPE_BY_LABEL_CATEGORY = Object.fromEntries(
  SOURCE_ENTRIES.filter((e) => e.bearsLabel).map((e) => [e.id, e.type]),
) as Readonly<Record<LabelCategory, LabelBearingSourceType>>;
