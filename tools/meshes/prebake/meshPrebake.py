"""meshPrebake — flatten a NASA 3D Resources model to what buildMeshes accepts.

Every source here is a multi-material scene of dozens of parts, and several
carry a stow→deploy animation whose SAVED transforms are not the pose we want.
`buildMeshes` refuses multi-material input by design, so the flattening happens
HERE, once, and MESH_SOURCES points at the OUTPUT. Decimate BEFORE the
unwrap+bake: baking into UVs that decimation then moves mis-registers the atlas
against the triangles that survive.

Run:  npm run prebake-mesh -- <key>   (Blender 5.2 LTS; not run in CI)
"""

import os
import sys
import time

import bpy

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def source(key, filename, frame=None, triangles=None, atlas=2048, drop_materials=()):
    d = os.path.join(REPO, "data/raw/meshes", key)
    return {
        "key": key,
        "src": os.path.join(d, filename),
        "out": os.path.join(d, "%s.prebaked.glb" % key),
        "atlas_path": os.path.join(d, "%s.prebaked.albedo.png" % key),
        # None = the file's saved transforms; an int = that animation frame. The
        # deploy animations park the rover STOWED at their own frame 0, so a
        # source with actions must name a frame or risk baking a folded rover.
        "frame": frame,
        "triangles": triangles,
        "atlas": atlas,
        # Materials that exist only to mark a rig pivot or fake a ground shadow.
        # An object whose materials are ALL in this set goes; the raise guards
        # against the name drifting upstream and the marker silently shipping.
        "drop_materials": set(drop_materials),
    }


SOURCES = {
    s["key"]: s
    for s in [
        source("voyager", "Voyager Probe (B).glb"),
        source("perseverance", "Mars 2020 Perseverance Rover.glb", frame=120, triangles=100_000),
        source("curiosity", "Curiosity Rover (MSL) (Clean).blend", frame=206,
               drop_materials=("pivot", "shadow2")),
        source("mer", "Mars Exploration Rover - Spirit and Opportunity.blend", frame=1325),
    ]
}


def log(msg):
    sys.stderr.write("prebake: %s\n" % msg)
    sys.stderr.flush()


def load(cfg):
    if cfg["src"].endswith(".blend"):
        bpy.ops.wm.open_mainfile(filepath=cfg["src"])
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=cfg["src"], merge_vertices=True)
    scene = bpy.context.scene
    for vl in scene.view_layers:
        exclusions(vl.layer_collection)
    if cfg["frame"] is not None:
        scene.frame_set(cfg["frame"])
    return scene


def exclusions(layer_collection):
    layer_collection.exclude = False
    layer_collection.hide_viewport = False
    for child in layer_collection.children:
        exclusions(child)


def fix_colour_management():
    """Both .blend rovers reach 4.x with their colour maps flagged Non-Color, so
    the renderer skips the sRGB decode and the bake comes out washed to white.
    Anything feeding Base Color is an sRGB colour map by definition. The same
    pass re-points materials at a texture whose file went missing (Curiosity
    ships one duplicate that resolves to nothing and would bake black)."""
    resolved = {i.name.split(".png")[0]: i for i in bpy.data.images if tuple(i.size) != (0, 0)}
    fixed = 0
    relinked = 0
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type != "TEX_IMAGE" or node.image is None:
                continue
            if not any(l.to_socket.name == "Base Color" for o in node.outputs for l in o.links):
                continue
            if tuple(node.image.size) == (0, 0):
                stand_in = resolved.get(node.image.name.split(".png")[0])
                if stand_in is None:
                    raise RuntimeError("prebake: %s has no pixels and no replacement" % node.image.name)
                node.image = stand_in
                relinked += 1
            if node.image.colorspace_settings.name != "sRGB":
                node.image.colorspace_settings.name = "sRGB"
                fixed += 1
    return fixed, relinked


def keepers(cfg, scene):
    """Surface geometry only: no cameras, lights, face-less meshes or the marker
    cubes the rigs hang joints on. Nothing is DELETED here — every rover parents
    its parts to empties, an armature or a marker cube, and removing a parent
    drops its children's transform and scatters the model. The rejects go once
    the join has baked the survivors' world matrices in."""
    keep = []
    dropped = 0
    marked = 0
    for obj in scene.objects:
        if obj.type != "MESH":
            continue
        materials = {s.material.name for s in obj.material_slots if s.material}
        if len(obj.data.polygons) == 0 or not materials:
            dropped += 1
        elif materials <= cfg["drop_materials"]:
            marked += 1
        else:
            keep.append(obj)
    if cfg["drop_materials"] and marked == 0:
        raise RuntimeError("prebake: no %s objects to drop — the markers were renamed upstream"
                           % sorted(cfg["drop_materials"]))
    return keep, dropped, marked


def apply_modifiers(meshes):
    """Curiosity hangs geometry-nodes modifiers off a dozen parts and
    Perseverance armature-deforms one; `join` reads the object's own mesh, so
    whatever is not applied here is lost."""
    select(meshes)
    bpy.ops.object.convert(target="MESH")


def select(objects):
    for obj in objects:
        obj.hide_render = False
        obj.hide_viewport = False
        obj.hide_select = False
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


SOURCE_UV = "source"


def unify_source_uvs(meshes):
    """`join` merges UV layers BY NAME, and these scenes mix 'UVTex', 'UVMap'
    and 'UVMap.001' across their parts — so a part whose layer name loses the
    vote lands in the merged mesh with zeroed UVs and bakes one texel of flat
    colour over its whole surface. Collapsing every part to its render layer
    under one name first is what makes the bake read the authored textures."""
    for obj in meshes:
        layers = obj.data.uv_layers
        if not layers:
            layers.new(name=SOURCE_UV)
            continue
        render = next((l for l in layers if l.active_render), layers[0])
        for other in [l for l in layers if l != render]:
            layers.remove(other)
        layers[0].name = SOURCE_UV
        layers[0].active_render = True


def join_meshes(scene, meshes):
    select(meshes)
    if len(meshes) > 1:
        bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    # The join hands its own animation data to the survivor. `transform_apply`
    # bakes the pose into the vertices and zeroes the channels, but the F-curves
    # then re-apply it on the next evaluation and the export ships the rotation
    # TWICE. Dropping the action is what makes the applied transform stick.
    joined.animation_data_clear()
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


def unwrap(obj):
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
    obj.data.uv_layers[SOURCE_UV].active_render = True
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


def arm_materials(obj, image):
    """Cycles bakes into whichever Image Texture node is ACTIVE in each material
    the object draws with — every one of them, or the bake refuses."""
    for slot in obj.material_slots:
        mat = slot.material
        if mat is None:
            continue
        mat.use_nodes = True
        node = mat.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        node.select = True
        mat.node_tree.nodes.active = node


def bake(obj, uv_name):
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
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, uv_layer=uv_name, use_clear=True)


def flatten_materials(obj, key, image):
    """One material sampling the atlas, replacing the whole stack."""
    obj.data.materials.clear()
    mat = bpy.data.materials.new(key)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.7
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    mat.node_tree.links.new(bsdf.inputs["Base Color"], tex.outputs["Color"])
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
    log("%s: loaded %s at frame %s" % (key, os.path.basename(cfg["src"]), cfg["frame"]))
    log("colour management: %d images decoded as sRGB, %d relinked" % fix_colour_management())
    keep, dropped, marked = keepers(cfg, scene)
    log("keeping %d meshes; left behind %d face-less/matless and %d marker objects"
        % (len(keep), dropped, marked))
    apply_modifiers(keep)
    unify_source_uvs(keep)
    obj = join_meshes(scene, keep)
    log("joined -> %d tris, %d material slots, uv layers %s"
        % (triangles(obj), len(obj.material_slots), [l.name for l in obj.data.uv_layers]))
    lo, hi = bounds(obj)
    log("extent %s .. %s" % ([round(x, 3) for x in lo], [round(x, 3) for x in hi]))
    log("decimated -> %d tris" % decimate(obj, cfg["triangles"]))

    uv_name = unwrap(obj)
    log("smart-projected uv '%s' (%.0fs elapsed)" % (uv_name, time.time() - started))
    image = bpy.data.images.new("%s_atlas" % key, cfg["atlas"], cfg["atlas"], alpha=False)
    image.generated_color = (0, 0, 0, 1)
    arm_materials(obj, image)
    bake(obj, uv_name)
    image.filepath_raw = cfg["atlas_path"]
    image.file_format = "PNG"
    image.save()
    log("baked %d^2 albedo atlas -> %s (%.0fs elapsed)"
        % (cfg["atlas"], cfg["atlas_path"], time.time() - started))

    flatten_materials(obj, key, image)
    keep_only_bake_uv(obj, uv_name)
    export(obj, cfg["out"])
    log("wrote %s (%d tris, %d verts, %.0fs total)"
        % (cfg["out"], triangles(obj), len(obj.data.vertices), time.time() - started))


main()
