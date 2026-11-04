import { runLifecycle } from './runLifecycle.js';

void runLifecycle(process.argv.includes('--windowed'));
