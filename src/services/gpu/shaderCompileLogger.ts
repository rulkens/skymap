/**
 * Helper for creating a `GPUShaderModule` that logs the linked WGSL
 * source alongside any compile-time error in dev mode.
 *
 * Why this exists: under wesl-plugin's `?static` import, what reaches
 * `device.createShaderModule` is a *linked* WGSL string with all WESL
 * imports resolved into top-level functions. Chrome's WGSL compiler
 * reports error line numbers against THAT linked string, not the
 * source `.wesl` modules — so when a compile error fires, the only
 * way to map "error at line 142" back to a source file is to read the
 * linked WGSL ourselves.
 *
 * The pattern: gate the dump on `import.meta.env.DEV` so production
 * bundles strip the branch and don't ship the shader source twice
 * (once as the module, once as a console log). `getCompilationInfo`
 * is a Promise; we don't await it so module creation stays
 * synchronous and the caller can keep building its pipeline.
 *
 * Until wesl-plugin gains sourcemap support, every renderer should
 * route shader-module creation through this helper. Removing it later
 * is a one-line edit (drop the wrapper, call createShaderModule
 * directly) — keeping it in a single file means there's exactly one
 * place to update if upstream changes.
 */
export function createShaderModuleWithDevLog(
  device: GPUDevice,
  code: string,
  label: string,
): GPUShaderModule {
  const module = device.createShaderModule({ code, label });
  if (import.meta.env.DEV) {
    void module.getCompilationInfo().then((info) => {
      if (info.messages.some((m) => m.type === 'error')) {
        // eslint-disable-next-line no-console
        console.groupCollapsed(`[${label}] linked WGSL (for error line lookup)`);
        // eslint-disable-next-line no-console
        console.log(code);
        // eslint-disable-next-line no-console
        console.groupEnd();
      }
    });
  }
  return module;
}
