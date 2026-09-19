"""meshPrebake — bake an imported `<key>.blend` (importMesh.py) to what buildMeshes accepts.
`buildMeshes` refuses multi-material input, so the join+bake happens HERE and MESH_SOURCES
points at the OUTPUT. Decimate BEFORE the unwrap+bake: baking into UVs that decimation then
moves mis-registers the atlas against the triangles that survive.
Run:  npm run prebake-mesh -- <key>   (Blender 5.2 LTS; not run in CI)"""

import argparse
import os
import sys
import time

import bpy
import mathutils

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))

ATLAS_PX = 2048

EMISSION_COLOUR = "Emission Color"
EMISSION_STRENGTH = "Emission Strength"

AO_SAMPLES = 128
# Fraction of the mesh's largest extent Cycles' AO bake treats as "far enough
# to stop counting as occluded" — `scene.world.light_settings.distance`, the
# one world-level knob that pass reads regardless of the World AO toggle.
AO_DISTANCE_FRACTION = 0.25
GLTF_MATERIAL_OUTPUT = "glTF Material Output"


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
# preparation returning its own undo, Cycles sample count) — one atlas per
# row, `bake_pass` runs a row start to finish. Every row but albedo is DATA: an
# atlas of slopes or material values saved through the sRGB view transform
# comes out gamma-bent, and the runtime decodes `_normal` and `_mr` linearly.
BAKE_PASSES = [
    ("albedo", dict(type="EMIT"), "sRGB", swap_to_emission("Base Color"), 1),
    ("normal", dict(type="NORMAL", normal_space="TANGENT"), "Non-Color", None, 1),
    ("roughness", dict(type="ROUGHNESS"), "Non-Color", None, 1),
    ("metallic", dict(type="EMIT"), "Non-Color", swap_to_emission("Metallic"), 1),
    ("occlusion", dict(type="AO"), "Non-Color", None, AO_SAMPLES),
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
                                 source("curiosity"), source("mer"), source("hubble")]}


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
    # smart_project packs by bounding box and left Perseverance's atlas 6.6%
    # covered; a concave, rotating repack of the same islands covers 36%.
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, rotate_method="ANY", scale=True, margin_method="FRACTION",
                            margin=0.001, shape_method="CONCAVE")
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


def bake_pass(obj, uv_name, cfg, name, settings, colourspace, prepare, samples):
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
    # Material passes have no light to sample — 1 is exact; a row that adds
    # light of its own (AO) asks for more through its own row count.
    scene.cycles.samples = samples
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


def gltf_material_output_group():
    """The Principled BSDF has no Occlusion socket, so the Blender glTF
    exporter finds a packed occlusion image only through a node group of this
    exact name with a float `Occlusion` input — never evaluated as a shader,
    read by name. The exporter then packs it as R, roughness G, metallic B
    into one `metallicRoughnessTexture`."""
    group = bpy.data.node_groups.get(GLTF_MATERIAL_OUTPUT)
    if group is not None:
        return group
    group = bpy.data.node_groups.new(GLTF_MATERIAL_OUTPUT, "ShaderNodeTree")
    group.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    return group


def flatten_materials(obj, key, images):
    """One material sampling the baked atlases, replacing the whole stack.
    Roughness, Metallic and Occlusion are linked as separate images on
    purpose: the glTF exporter is what packs them into the single
    `metallicRoughnessTexture` (occlusion R, roughness G, metallic B) the
    runtime samples."""
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
    if "occlusion" in images:
        occlusion = tree.nodes.new("ShaderNodeGroup")
        occlusion.node_tree = gltf_material_output_group()
        tree.links.new(occlusion.inputs["Occlusion"],
                       atlas_node(tree, images["occlusion"]).outputs["Color"])
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


def export(obj, out, ground_up, contact_decal):
    """`ground_up` stamps `extras.aoGroundUp` on the exported node — the only
    way `buildMeshes` can tell which ground a GLB was baked against without
    re-deriving it; `export_extras` stays off for a floating mesh so no other
    custom property leaks into the glTF as a stray extra. `contact_decal` rides
    the same extras, seated meshes only."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if ground_up is not None:
        obj["aoGroundUp"] = list(ground_up)
    if contact_decal is not None:
        obj["contactDecal"] = contact_decal
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
        export_extras=ground_up is not None,
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


def set_ao_distance(scene, lo, hi):
    if scene.world is None:
        scene.world = bpy.data.worlds.new("World")
    extent = max(hi[i] - lo[i] for i in range(3))
    scene.world.light_settings.distance = AO_DISTANCE_FRACTION * extent


def ground_plane(obj, lo, hi, up):
    """A large flat occluder resting under `obj`'s lowest point along `up`, so
    the AO bake sees a floor: without one a rover's underside reads as open
    sky, no darker than its sunlit hull. Deselected and inactive on return —
    an occluder, not a bake target — and gone again before `flatten_materials`
    swaps in the real material, or it would export as part of the mesh. Span
    stops at AO_DISTANCE_FRACTION's own reach — nothing farther out can occlude
    anyway — which also buys the contact decal a denser atlas than the body's."""
    extent = max(hi[i] - lo[i] for i in range(3))
    span = (1 + 2 * AO_DISTANCE_FRACTION) * extent
    up_v = mathutils.Vector(up).normalized()
    centre = mathutils.Vector([(lo[i] + hi[i]) / 2 for i in range(3)])
    lowest = min((obj.matrix_world @ v.co).dot(up_v) for v in obj.data.vertices)
    location = centre + (lowest - centre.dot(up_v)) * up_v

    bpy.ops.mesh.primitive_plane_add(size=span, location=location)
    plane = bpy.context.view_layer.objects.active
    plane.rotation_mode = "QUATERNION"
    plane.rotation_quaternion = mathutils.Vector((0, 0, 1)).rotation_difference(up_v)
    plane.select_set(False)
    bpy.context.view_layer.objects.active = obj
    return plane, span


def bake_contact_decal(plane, cfg):
    """The plane's own AO with the body as sole occluder (it is never
    selected) — the raw contact shadow effort B will composite at runtime."""
    mat = bpy.data.materials.new("%s_contact" % cfg["key"])
    mat.use_nodes = True
    plane.data.materials.append(mat)
    arm_materials(plane)
    uv_name = plane.data.uv_layers[0].name
    return bake_pass(plane, uv_name, cfg, "contact", dict(type="AO"), "Non-Color", None, AO_SAMPLES)


def contact_decal_stamp(plane, span):
    """u/v half-vectors read off the plane's own (already rotated) world
    matrix, so they can never disagree with the rotation `ground_plane` used."""
    rot = plane.matrix_world.to_3x3()
    half = span / 2
    return {
        "centre": gltf_from_blender(plane.matrix_world.translation),
        "u": gltf_from_blender(rot.col[0] * half),
        "v": gltf_from_blender(rot.col[1] * half),
    }


def remove_ground_plane(plane):
    mesh = plane.data
    bpy.data.objects.remove(plane, do_unlink=True)
    bpy.data.meshes.remove(mesh)


# The glTF frame (+Y up) is the one `--ground-up` and the stamps speak; the
# scene is Blender's +Z-up, the frame the glTF importer and exporter
# (`export_yup`) convert to and from.
def blender_from_gltf(v):
    return (v[0], -v[2], v[1])


def gltf_from_blender(v):
    return [v[0], v[2], -v[1]]


def ground_up_arg(value):
    parts = value.split(",")
    if len(parts) != 3:
        raise argparse.ArgumentTypeError("--ground-up wants x,y,z, got %r" % value)
    return tuple(float(p) for p in parts)


def parse_args(argv):
    """`argv` is the tail after Blender's own `--`; the driver (`prebakeMesh.ts`)
    is the only caller, so a bad key or vector is its bug, not a user's."""
    parser = argparse.ArgumentParser()
    parser.add_argument("key", choices=sorted(SOURCES))
    parser.add_argument("--ground-up", dest="ground_up", type=ground_up_arg, default=None)
    return parser.parse_args(argv)


def main():
    args = parse_args(sys.argv[sys.argv.index("--") + 1:])
    key = args.key
    ground_up = args.ground_up  # tuple or None: seated meshes bake against a ground plane.
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
    set_ao_distance(scene, lo, hi)
    plane, plane_span = (ground_plane(obj, lo, hi, blender_from_gltf(ground_up))
                         if ground_up is not None else (None, None))
    log("decimated -> %d tris" % decimate(obj, cfg["triangles"]))

    uv_name = unwrap(obj, source_name)
    log("smart-projected uv '%s' (%.0fs elapsed)" % (uv_name, time.time() - started))
    arm_materials(obj)
    images = {}
    for name, settings, colourspace, prepare, samples in BAKE_PASSES:
        images[name] = bake_pass(obj, uv_name, cfg, name, settings, colourspace, prepare, samples)
        log("baked %d^2 %s atlas -> %s (%.0fs elapsed)"
            % (ATLAS_PX, name, images[name].filepath_raw, time.time() - started))

    contact_decal = None
    if plane is not None:
        contact = bake_contact_decal(plane, cfg)
        log("baked contact decal -> %s (%.0fs elapsed)"
            % (contact.filepath_raw, time.time() - started))
        contact_decal = contact_decal_stamp(plane, plane_span)
        remove_ground_plane(plane)
    flatten_materials(obj, key, images)
    keep_only_bake_uv(obj, uv_name)
    export(obj, cfg["out"], ground_up, contact_decal)
    log("wrote %s (%d tris, %d verts, %.0fs total)"
        % (cfg["out"], triangles(obj), len(obj.data.vertices), time.time() - started))


main()
