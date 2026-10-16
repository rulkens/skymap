import type { RenderScheduler } from '../engine/subsystems/RenderScheduler';

/** The option bag handed to `attachEngineInputs`: the scheduler its resize listener wakes. */
export type AttachEngineInputsOptions = {
  scheduler: RenderScheduler;
};
