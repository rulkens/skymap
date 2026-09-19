/**
 * contactShadowUniformLayout — the `ContactShadowUniforms` struct's two mat4
 * slots and total size, read by the packer and by the renderer that sizes the
 * buffer. The field layout lives beside the struct, in
 * `shaders/bodies/contactShadow/io.wesl`'s header.
 */

const MAT4_FLOATS = 16;

export const CONTACT_SHADOW_BOX_TO_CLIP_FLOAT = 0;

export const CONTACT_SHADOW_CLIP_TO_BOX_FLOAT = MAT4_FLOATS;

export const CONTACT_SHADOW_UNIFORM_FLOATS = 2 * MAT4_FLOATS;

export const CONTACT_SHADOW_UNIFORM_BYTES = CONTACT_SHADOW_UNIFORM_FLOATS * 4;
