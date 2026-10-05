/**
 * On-the-wire uniform buffer size, matching `io.wesl`'s `Uniforms` struct
 * byte-for-byte: CameraUniforms 80 B (viewProj + viewportPx + 2 pad) + model
 * mat4 64 B + camRight/camUp vec4 32 B + params0/params1 vec4 32 B = 208 B.
 * Shared by the renderer and the offline `tools/galaxy-renderer` packer, which
 * writes against this same layout — hence `src/data`, not the renderer file.
 */
export const MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE = 208;