import { runLifecycle } from './lifecycle/runLifecycle';

void runLifecycle(process.argv.includes('--windowed'));
