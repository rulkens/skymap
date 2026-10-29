/**
 * The logical data path of the satellite catalog: `build-satellites` writes it locally, the daily
 * Action uploads it to the R2 key `data/<path>` (spelled out in the workflow), and the Layer will
 * fetch it. Outside the manifest on purpose: it is rewritten daily at this fixed key, and the `v1/`
 * folder is the version gate a content hash would otherwise be (docs/DATA.md).
 */
export const SATELLITE_CATALOG_PATH = 'satellite-catalog/v1/satellites.satg';
