/**
 * CubemapCaptureKey — names one `CUBEMAP_CAPTURES` row. A closed union so the
 * table and the engine's runtime map are both total: a missing row is a
 * typecheck error rather than an undefined lookup at frame time.
 */
export type CubemapCaptureKey = 'sgrAStar';
