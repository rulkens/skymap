import { defineConfig } from 'vitest/config';
import { staticBuildExtension } from 'wesl-plugin';
import viteWesl from 'wesl-plugin/vite';

// Vitest doesn't auto-inherit plugins from vite.config.ts in our setup,
// so we re-register wesl-plugin here. Without this, Vitest's SSR transform
// pipeline tries to parse .wesl files as JavaScript and rolldown rejects
// them as syntax errors. The plugin claims those imports first and emits
// a string, which is what the existing tests expect.
export default defineConfig({
  plugins: [viteWesl({ extensions: [staticBuildExtension] })],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: [
      'tests/setup/webgpuGlobals.ts',
      'tests/setup/reactTestEnv.ts',
    ],
  },
});
