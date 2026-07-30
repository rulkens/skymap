/**
 * HdrSettings — the extended-range headroom knobs, gated live on
 * `hdrActiveOf(renderTargets)` rather than on any field here (see
 * `EngineSettingsState.hdr`).
 */
export type HdrSettings = {
  knee: number;
  headroom: number;
};
