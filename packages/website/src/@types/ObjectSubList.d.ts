import type { ObjectRow } from './ObjectRow';

/** One of the smaller lists a section of the object catalogue is cut into; `label` is absent where the section is one list. */
export type ObjectSubList = { label?: string; rows: ObjectRow[] };
