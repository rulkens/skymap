import { defineConfig } from 'vitest/config';
import { staticBuildExtension } from 'wesl-plugin';
import viteWesl from 'wesl-plugin/vite';
import react from '@vitejs/plugin-react';

// Vitest doesn't auto-inherit plugins from vite.config.ts in our setup,
// so we re-register wesl-plugin here. Without this, Vitest's SSR transform
// pipeline tries to parse .wesl files as JavaScript and rolldown rejects
// them as syntax errors. The plugin claims those imports first and emits
// a string, which is what the existing tests expect.
//
// The React plugin is included here (not just in vite.config.ts) so that
// Vitest can transform .tsx component files — without it, JSX syntax in
// test files triggers a parse error in the SSR pipeline.
export default defineConfig({
  plugins: [react(), viteWesl({ extensions: [staticBuildExtension] })],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: [
      'tests/setup/webgpuGlobals.ts',
      'tests/setup/reactTestEnv.ts',
    ],
  },
});
