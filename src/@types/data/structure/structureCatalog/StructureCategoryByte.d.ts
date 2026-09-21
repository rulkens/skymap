/**
 * Cluster (0) vs. supercluster (1) marker; higher values reserved. See
 * `StructureCatalog`'s module header for the full category byte contract
 * (what each value means, and how `StructureCatalog.category` — a raw
 * `Uint8Array`, not this type — relates to it).
 */
export type StructureCategoryByte = 0 | 1;