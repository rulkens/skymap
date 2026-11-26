import type { Engine } from '../../../@types/refactor/Engine';
import { engineHandle } from './engineHandle';

export function closeEngine(engine: Engine): void {
  engineHandle(engine).api.close();
}
