/** One step of an asset's bake provenance — the external tool and the version that produced it. */
export type PipelineStep = { readonly step: string; readonly version: string };
