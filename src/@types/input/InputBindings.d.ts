/** Handle returned by `attachEngineInputs`; `destroy()` detaches its resize listener. */
export type InputBindings = {
  destroy(): void;
};
