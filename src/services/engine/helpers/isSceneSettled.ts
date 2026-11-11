/**
 * isSceneSettled — has everything the current view asked for arrived? The tour's
 * cold-load gate polls it through `SagaContext.sceneSettled`.
 */
import { sceneUnsettledReasons } from './sceneUnsettledReasons';

export function isSceneSettled(state: Parameters<typeof sceneUnsettledReasons>[0]): boolean {
  return sceneUnsettledReasons(state).length === 0;
}
