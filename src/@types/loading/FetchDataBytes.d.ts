/** A logical data path's bytes, null on a miss (`fetchDataBytes`, or a test's bake on disk). */
export type FetchDataBytes = (path: string) => Promise<ArrayBuffer | null>;
