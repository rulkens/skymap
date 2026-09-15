"""meshPrebake — bake an imported `<key>.blend` (importMesh.py) to what buildMeshes accepts.
`buildMeshes` refuses multi-material input, so the join+bake happens HERE and MESH_SOURCES
points at the OUTPUT. Decimate BEFORE the unwrap+bake: baking into UVs that decimation then
moves mis-registers the atlas against the triangles that survive.
Run:  npm run prebake-mesh -- <key>   (Blender 5.2 LTS; not run in CI)"""

import os
import sys
import time

import bpy

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))

ATLAS_PX = 2048

EMISSION_COLOUR = "Emission Color"
EMISSION_STRENGTH = "Emission Strength"


def socket_state(socket):
    source = socket.links[0].from_socket if socket.links else None
    value = socket.default_value
    return source, tuple(value) if hasattr(value, "__len__") else value


def swap_to_emission(socket_name):
    """Cycles has no metallic bake, and its DIFFUSE colour pass of a metal is
    zero — so both rows that need a raw Principled input borrow the emission
    output instead: the named socket (a scalar as the grey `(v, v, v)`, an image
    re-linked socket to socket) drives Emission Color at strength 1 for the
    duration of the bake. `use_pass_direct`/`use_pass_indirect` are off, so EMIT
    returns that value unlit. The returned undo runs before the next row bakes,
    so no swap outlives its own row whatever order BAKE_PASSES lists them in."""

    def prepare(materials):
        undo = []
        plain = 0
        for mat in materials:
            if mat is None or not mat.use_nodes:
                continue
            tree = mat.node_tree
            principled = [n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"]
            plain += len(principled) == 0
            for node in principled:
                colour = node.inputs[EMISSION_COLOUR]
                strength = node.inputs[EMISSION_STRENGTH]
                undo.append((tree, node, socket_state(colour), socket_state(strength)))
                for link in list(colour.links) + list(strength.links):
                    tree.links.remove(link)
                socket = node.inputs[socket_name]
                if socket.links:
                    tree.links.new(colour, socket.links[0].from_socket)
                elif hasattr(socket.default_value, "__len__"):
                    colour.default_value = tuple(socket.default_value)
                else:
                    v = socket.default_value
                    colour.default_value = (v, v, v, 1.0)
                strength.default_value = 1.0
        if plain:
            log("%s pass: %d materials have no Principled node — they bake their own "
                "emission as %s, black unless they emit" % (socket_name, plain, socket_name))
        return lambda: restore_emission(undo)

    return prepare


def restore_emission(undo):
    for tree, node, colour_state, strength_state in undo:
        for socket, (source, value) in ((node.inputs[EMISSION_COLOUR], colour_state),
                                        (node.inputs[EMISSION_STRENGTH], strength_state)):
            for link in list(socket.links):
                tree.links.remove(link)
            socket.default_value = value
            if source is not None:
                tree.links.new(socket, source)


# (name, `bpy.ops.object.bake` kwargs, atlas colourspace, optional material
# preparation returning its own undo) — one atlas per row, `bake_pass` runs a
# row start to finish. Every row but albedo is DATA: an atlas of slopes or
# material values saved through the sRGB view transform comes out gamma-bent,
# and the runtime decodes `_normal` and `_mr` linearly.
BAKE_PASSES = [
    ("albedo", dict(type="EMIT"), "sRGB", swap_to_emission("Base Color")),
    ("normal", dict(type="NORMAL", normal_space="TANGENT"), "Non-Color", None),
    ("roughness", dict(type="ROUGHNESS"), "Non-Color", None),
    ("metallic", dict(type="EMIT"), "Non-Color", swap_to_emission("Metallic")),
]


def source(key, triangles=None):
    d = os.path.join(REPO, "data/raw/meshes", key)
    return {
        "key": key,
        "dir": d,
        "src": os.path.join(d, "%s.blend" % key),
        "out": os.path.join(d, "%s.prebaked.glb" % key),
        "triangles": triangles,
    }


def atlas_path(cfg, name):
    return os.path.join(cfg["dir"], "%s.prebaked.%s.png" % (cfg["key"], name))


SOURCES = {s["key"]: s for s in [source("voyager"), source("perseverance", triangles=100_000),
                                 source("curiosity"), source("mer"), source("hubble"),
                                 source("lunar-module")]}


def log(msg):
    sys.stderr.write("prebake: %s\n" % msg)
    sys.stderr.flush()


def load(cfg):
    bpy.ops.wm.open_mainfile(filepath=cfg["src"])
    return bpy.context.scene


def keepers(scene):
    """Surface geometry only: no cameras, lights or face-less meshes."""
    keep = []
    dropped = 0
    for obj in scene.objects:
        if obj.type != "MESH":
            continue
        materials = {s.material.name for s in obj.material_slots if s.material}
        if len(obj.data.polygons) == 0 or not materials:
            dropped += 1
        else:
            keep.append(obj)
    return keep, dropped


def source_uv(meshes):
    """`join` merges UV layers BY NAME, so a part whose single layer is named
    differently lands with zeroed UVs and bakes one texel of flat colour. The
    import unified them; an edit in Blender can quietly undo that."""
    shared = None
    for obj in meshes:
        names = [l.name for l in obj.data.uv_layers]
        if len(names) != 1 or (shared is not None and names[0] != shared):
            raise RuntimeError("prebake: %s has uv layers %s; every mesh needs exactly one, "
                               "all named alike — re-run `npm run import-mesh -- <key>` or "
                               "remove the extra layer" % (obj.name, names))
        shared = names[0]
    return shared


def select(objects):
    for obj in objects:
        obj.hide_render = False
        obj.hide_viewport = False
        obj.hide_select = False
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def join_meshes(scene, meshes):
    select(meshes)
    if len(meshes) > 1:
        bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for obj in [o for o in scene.objects if o is not joined]:
        bpy.data.objects.remove(obj, do_unlink=True)
    return joined


def triangles(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def decimate(obj, target):
    have = triangles(obj)
    if target is None or have <= target:
        return have
    mod = obj.modifiers.new("decimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = target / have
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return triangles(obj)


def unwrap(obj, source_name):
    """A second UV set: the source UVs stay put so the bake can still read the
    original materials through them."""
    uv = obj.data.uv_layers.new(name="bake")
    # `active` is what smart_project writes into; the bake's `uv_layer=` names
    # its own target. `active_render` must stay on the SOURCE layer — it is what
    # the source materials sample their textures through, so flipping it here
    # paints the atlas through the wrong UVs. The name is read NOW: the layer
    # reference goes stale across the edit-mode round trip below.
    obj.data.uv_layers.active = uv
    uv_name = uv.name
    obj.data.uv_layers[source_name].active_render = True
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    # smart_project's poll rejects OBJECT mode in a background Blender (there is
    # no area to override with); EDIT mode passes it headless.
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    # correct_aspect defaults to TRUE and squashes the whole layout by the aspect
    # of whichever source image happens to be active — so the packing lurches
    # whenever the material set changes. The atlas is square; opt out.
    bpy.ops.uv.smart_project(angle_limit=1.15192, island_margin=0.001, correct_aspect=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    return uv_name


def arm_materials(obj):
    """Cycles bakes into whichever Image Texture node is ACTIVE in each material
    the object draws with — every one of them, or the bake refuses. The node is
    made once here; `bake_pass` re-points it at each row's own atlas."""
    for slot in obj.material_slots:
        mat = slot.material
        if mat is None:
            continue
        mat.use_nodes = True
        node = mat.node_tree.nodes.new("ShaderNodeTexImage")
        node.select = True
        mat.node_tree.nodes.active = node


def bake_pass(obj, uv_name, cfg, name, settings, colourspace, prepare):
    """One BAKE_PASSES row start to finish: its atlas image, the bake, the save."""
    is_data = colourspace != "sRGB"
    image = bpy.data.images.new("%s_%s" % (cfg["key"], name), ATLAS_PX, ATLAS_PX,
                                alpha=False, is_data=is_data)
    image.generated_color = (0, 0, 0, 1)
    image.colorspace_settings.name = colourspace
    for slot in obj.material_slots:
        if slot.material is not None:
            slot.material.node_tree.nodes.active.image = image

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    # Colour only — no light in the scene to sample, so one sample is exact.
    scene.cycles.samples = 1
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True
    scene.render.bake.margin = 2
    scene.render.bake.margin_type = "ADJACENT_FACES"
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    restore = prepare([s.material for s in obj.material_slots]) if prepare else None
    bpy.ops.object.bake(uv_layer=uv_name, use_clear=True, **settings)
    if restore is not None:
        restore()

    image.filepath_raw = atlas_path(cfg, name)
    image.file_format = "PNG"
    image.save()
    return image


def atlas_node(tree, image):
    node = tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    return node


def flatten_materials(obj, key, images):
    """One material sampling the baked atlases, replacing the whole stack.
    Roughness and Metallic are linked as separate images on purpose: the glTF
    exporter is what packs them into the single `metallicRoughnessTexture`
    (roughness G, metallic B) the runtime samples."""
    obj.data.materials.clear()
    mat = bpy.data.materials.new(key)
    mat.use_nodes = True
    tree = mat.node_tree
    bsdf = tree.nodes["Principled BSDF"]
    for name, socket in (("albedo", "Base Color"), ("roughness", "Roughness"),
                         ("metallic", "Metallic")):
        tree.links.new(bsdf.inputs[socket], atlas_node(tree, images[name]).outputs["Color"])
    # The Normal Map node is how the exporter learns the atlas is tangent space;
    # an image wired straight into Normal exports as nothing at all.
    normal_map = tree.nodes.new("ShaderNodeNormalMap")
    normal_map.space = "TANGENT"
    tree.links.new(normal_map.inputs["Color"], atlas_node(tree, images["normal"]).outputs["Color"])
    tree.links.new(bsdf.inputs["Normal"], normal_map.outputs["Normal"])
    obj.data.materials.append(mat)


def keep_only_bake_uv(obj, uv_name):
    """Whatever survives here becomes TEXCOORD_0; leaving the source UVs would
    push the atlas onto TEXCOORD_1, which the .mesh format has no slot for."""
    for layer in [l for l in obj.data.uv_layers if l.name != uv_name]:
        obj.data.uv_layers.remove(layer)
    if len(obj.data.uv_layers) != 1:
        raise RuntimeError("prebake: expected one UV layer, have %s"
                           % [l.name for l in obj.data.uv_layers])
    obj.data.uv_layers.active = obj.data.uv_layers[0]
    obj.data.uv_layers[0].active_render = True


def export(obj, out):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_normals=True,
        export_texcoords=True,
        export_tangents=False,
        export_skins=False,
        export_animations=False,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_image_format="AUTO",
    )


def bounds(obj):
    lo = [1e30] * 3
    hi = [-1e30] * 3
    for v in obj.data.vertices:
        w = obj.matrix_world @ v.co
        for i in range(3):
            lo[i] = min(lo[i], w[i])
            hi[i] = max(hi[i], w[i])
    return lo, hi


def main():
    key = sys.argv[-1]
    if key not in SOURCES:
        raise SystemExit("prebake: pass one of %s" % sorted(SOURCES))
    cfg = SOURCES[key]
    started = time.time()

    scene = load(cfg)
    log("%s: loaded %s at frame %s" % (key, os.path.basename(cfg["src"]), scene.frame_current))
    keep, dropped = keepers(scene)
    log("keeping %d meshes; left behind %d face-less/matless" % (len(keep), dropped))
    source_name = source_uv(keep)
    obj = join_meshes(scene, keep)
    log("joined -> %d tris, %d material slots, uv layers %s"
        % (triangles(obj), len(obj.material_slots), [l.name for l in obj.data.uv_layers]))
    lo, hi = bounds(obj)
    log("extent %s .. %s" % ([round(x, 3) for x in lo], [round(x, 3) for x in hi]))
    log("decimated -> %d tris" % decimate(obj, cfg["triangles"]))

    uv_name = unwrap(obj, source_name)
    log("smart-projected uv '%s' (%.0fs elapsed)" % (uv_name, time.time() - started))
    arm_materials(obj)
    images = {}
    for name, settings, colourspace, prepare in BAKE_PASSES:
        images[name] = bake_pass(obj, uv_name, cfg, name, settings, colourspace, prepare)
        log("baked %d^2 %s atlas -> %s (%.0fs elapsed)"
            % (ATLAS_PX, name, images[name].filepath_raw, time.time() - started))

    flatten_materials(obj, key, images)
    keep_only_bake_uv(obj, uv_name)
    export(obj, cfg["out"])
    log("wrote %s (%d tris, %d verts, %.0fs total)"
        % (cfg["out"], triangles(obj), len(obj.data.vertices), time.time() - started))


main()
