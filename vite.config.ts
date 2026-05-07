import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { staticBuildExtension } from 'wesl-plugin';
import viteWesl from 'wesl-plugin/vite';

// `wesl-plugin/vite` registers a Vite plugin that intercepts imports of
// `.wesl` (and `.wgsl`) files with recognised suffixes. We pass it just
// the `staticBuildExtension`, which handles the `?static` suffix — it
// runs the WESL linker at build time and returns a flat WGSL string,
// preserving the existing `import x from './foo.wesl?static'` shape and
// avoiding any runtime linker dependency. The alternative (`?link`)
// would defer linking to runtime, which we don't need yet and which
// would pull the `wesl` JS linker into the production bundle.
//
// `assetsInclude: ['**/*.wgsl']` is retained while a few `.wgsl` files
// remain unmigrated; once Task 2 finishes the bulk rename it can be
// dropped, but it's harmless until then.
export default defineConfig({
  plugins: [viteWesl({ extensions: [staticBuildExtension] }), react()],
  server: { port: 5173 },
  assetsInclude: ['**/*.wgsl'],
});
