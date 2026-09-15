"""importMesh — turn a pristine NASA download into the editable `<key>.blend`.

Split rule: scene content is saved here; bake artefacts stay in meshPrebake.py.
Run:  npm run import-mesh -- <key>   (Blender 5.2 LTS; not run in CI)
"""

import os
import sys

import bpy

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))

SOURCE_UV = "source"


def source(filename, frame=None, drop_materials=(), scale=1.0, materials=None):
    return {
        "filename": filename,
        # Modellers author in whatever unit suits them — Hubble in inches — and
        # everything downstream reads metres.
        "scale": scale,
        # NASA's documentary models type every surface matte whatever it is
        # made of. Per-material `metallic` / `roughness` / `gain` (Base Color
        # multiplier) / `bump` (metres of relief per unit of the colour map's
        # luminance, for a source with no normal map) Principled overrides.
        "materials": materials or {},
        # None = the file's saved transforms; an int = that animation frame. The
        # deploy animations park the rover STOWED at their own frame 0, so a
        # source with actions must name a frame or risk saving a folded rover.
        "frame": frame,
        # Materials that exist only to mark a rig pivot or fake a ground shadow.
        # An object whose materials are ALL in this set goes; the raise guards
        # against the name drifting upstream and the marker silently shipping.
        "drop_materials": set(drop_materials),
    }


SOURCES = {
    "voyager": source("Voyager Probe (B).glb"),
    "perseverance": source("Mars 2020 Perseverance Rover.glb", frame=120),
    "curiosity": source("Curiosity Rover (MSL) (Clean).blend", frame=206,
                        drop_materials=("pivot", "shadow2")),
    "mer": source("Mars Exploration Rover - Spirit and Opportunity.blend", frame=1325),
    # Aluminised MLI on the shells (hbltel_1), the aperture door and aft
    # bulkhead (hbltel_2) and the handrails/mast (hbltel_4); the texture's mid
    # grey is a metal's REFLECTANCE once metallic, hence the gain. Foil is
    # locally a mirror — its crinkle is the bump's job, not roughness's. The
    # copper array blankets (hbltel_3) and the instrument box stay authored.
    "hubble": source("Hubble Space Telescope (A).glb", scale=0.0254, materials={
        "hbltel_1": dict(metallic=1.0, roughness=0.2, gain=2.0, bump=0.08),
        "hbltel_2": dict(metallic=1.0, roughness=0.2, bump=0.08),
        "hbltel_4": dict(metallic=1.0, roughness=0.3),
    }),
}


def log(msg):
    sys.stderr.write("import: %s\n" % msg)
    sys.stderr.flush()


def load(path):
    if path.endswith(".blend"):
        bpy.ops.wm.open_mainfile(filepath=path)
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=path, merge_vertices=True)
    return bpy.context.scene


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
                    raise RuntimeError("import: %s has no pixels and no replacement" % node.image.name)
                node.image = stand_in
                relinked += 1
            if node.image.colorspace_settings.name != "sRGB":
                node.image.colorspace_settings.name = "sRGB"
                fixed += 1
    return fixed, relinked


def unify_shader_outputs():
    """Both .blend rovers keep a SECOND Material Output, targeted at Cycles and
    fed by a bare Diffuse BSDF beside the Principled the file renders with. A
    Cycles-targeted output wins, so the bake reads that node and never sees the
    Principled every PBR row samples — albedo emits nothing (black), roughness
    is the Diffuse node's. Keeping the active output, retargeted at ALL, is what
    puts every row on one shader."""
    dropped = 0
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        tree = mat.node_tree
        outputs = [n for n in tree.nodes if n.type == "OUTPUT_MATERIAL"]
        if len(outputs) < 2:
            continue
        active = [n for n in outputs if n.is_active_output]
        keep = active[0] if active else outputs[0]
        log("%s: kept output '%s' of %d (%d flagged active)"
            % (mat.name, keep.name, len(outputs), len(active)))
        keep.target = "ALL"
        for node in [n for n in outputs if n is not keep]:
            tree.nodes.remove(node)
            dropped += 1
    return dropped


def override_materials(cfg):
    """A missing name raises: the override is the whole point of the row, and a
    renamed upstream material would otherwise bake matte without a word."""
    applied = 0
    for name, values in cfg["materials"].items():
        mat = bpy.data.materials.get(name)
        if mat is None or not mat.use_nodes:
            raise RuntimeError("import: no material '%s' to override" % name)
        tree = mat.node_tree
        for node in [n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"]:
            for socket_name in ("Metallic", "Roughness"):
                if socket_name.lower() in values:
                    socket = node.inputs[socket_name]
                    for link in list(socket.links):
                        tree.links.remove(link)
                    socket.default_value = values[socket_name.lower()]
            if "bump" in values:
                bump_from_base_colour(tree, node, values["bump"])
            if "gain" in values:
                multiply_base_colour(tree, node, values["gain"])
            applied += 1
    return applied


def bump_from_base_colour(tree, principled, relief_m):
    """A source with no normal map bakes a FLAT normal atlas; foil crinkle and
    panel seams are then only in the albedo. The colour map's luminance stands
    in for height, `relief_m` metres per unit of it. A low-contrast texture
    needs centimetres before a texel-to-texel step tilts the normal visibly."""
    base = principled.inputs["Base Color"]
    if not base.links:
        raise RuntimeError("import: bump needs a Base Color texture to read height from")
    bump = tree.nodes.new("ShaderNodeBump")
    bump.inputs["Distance"].default_value = relief_m
    tree.links.new(bump.inputs["Height"], base.links[0].from_socket)
    tree.links.new(principled.inputs["Normal"], bump.outputs["Normal"])


def multiply_base_colour(tree, principled, gain):
    # ShaderNodeMix carries one socket set per data type; the RGBA pair is
    # inputs 6/7 and output 2, unreachable by name because every type's is "A".
    base = principled.inputs["Base Color"]
    mix = tree.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 1.0
    mix.inputs[7].default_value = (gain, gain, gain, 1.0)
    if base.links:
        tree.links.new(mix.inputs[6], base.links[0].from_socket)
        tree.links.remove(base.links[0])
    else:
        mix.inputs[6].default_value = base.default_value
    tree.links.new(base, mix.outputs[2])


def scale_roots(scene, factor):
    """On the parentless objects only, so a hierarchy scales once; the prebake's
    join applies it into the vertices before anything measures them."""
    roots = [obj for obj in scene.objects if obj.parent is None]
    for obj in roots:
        obj.scale = obj.scale * factor
    return len(roots)


def materials_of(obj):
    return {s.material.name for s in obj.material_slots if s.material}


def surfaces(scene):
    return [o for o in scene.objects
            if o.type == "MESH" and len(o.data.polygons) > 0 and materials_of(o)]


def apply_modifiers(meshes):
    """Curiosity hangs geometry-nodes modifiers off a dozen parts and
    Perseverance armature-deforms one; the prebake's `join` reads the object's
    own mesh, so whatever is not applied here is lost."""
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


def markers(scene, drop_materials):
    marked = [o for o in scene.objects
              if o.type == "MESH" and materials_of(o) and materials_of(o) <= drop_materials]
    if drop_materials and not marked:
        raise RuntimeError("import: no %s objects to drop — the markers were renamed upstream"
                           % sorted(drop_materials))
    return marked


def freeze_pose(scene, doomed):
    """After `frame_set` the evaluated F-curve values sit in each object's own
    loc/rot/scale, so clearing animation alone keeps the pose. Only children of
    a doomed marker are unparented: writing `matrix_world` back into float32
    loc/rot/scale drifts ~1e-7, enough to move the decimation."""
    bpy.context.view_layer.update()
    world = {obj: obj.matrix_world.copy() for obj in scene.objects}
    for obj in world:
        obj.animation_data_clear()
    orphans = [obj for obj in world if obj.parent in doomed]
    for obj in orphans:
        obj.parent = None
        obj.matrix_world = world[obj]
    return len(world), len(orphans)


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
    repointed = repoint_uv_references()
    log("re-pointed %d uv references at '%s'" % (repointed, SOURCE_UV))


def repoint_uv_references():
    """Shader nodes that name a UV map by STRING — every glTF-imported Normal
    Map node does — go dangling when the rename above lands, and a Normal Map
    node whose name resolves to nothing bakes FLAT without a word of complaint.
    The sweep covers every material in the file, not just the kept meshes': on
    anything that bakes the renamed layer is the only one left, and a node on a
    dropped object never renders."""
    repointed = 0
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if getattr(node, "uv_map", "") not in ("", SOURCE_UV):
                node.uv_map = SOURCE_UV
                repointed += 1
    return repointed


def pack_images():
    """`pack_all` raises on a file it cannot find. A zero-pixel image feeding
    Base Color was relinked or raised above, so what is left samples nothing
    (Curiosity's duplicate still counts a stale material user)."""
    missing = [i for i in bpy.data.images if tuple(i.size) == (0, 0)]
    for image in missing:
        bpy.data.images.remove(image)
    bpy.ops.file.pack_all()
    return len(missing)


def main():
    key = sys.argv[-1]
    if key not in SOURCES:
        raise SystemExit("import: pass one of %s" % sorted(SOURCES))
    cfg = SOURCES[key]
    directory = os.path.join(REPO, "data/raw/meshes", key)
    out = os.path.join(directory, "%s.blend" % key)

    scene = load(os.path.join(directory, cfg["filename"]))
    for vl in scene.view_layers:
        exclusions(vl.layer_collection)
    if cfg["frame"] is not None:
        scene.frame_set(cfg["frame"])
    log("%s: loaded %s at frame %s" % (key, cfg["filename"], cfg["frame"]))
    log("colour management: %d images decoded as sRGB, %d relinked" % fix_colour_management())
    log("dropped %d rival material outputs" % unify_shader_outputs())
    log("overrode %d materials" % override_materials(cfg))

    meshes = surfaces(scene)
    apply_modifiers(meshes)
    log("applied modifiers on %d meshes" % len(meshes))
    doomed = markers(scene, cfg["drop_materials"])
    log("froze %d objects (%d unparented from markers)" % freeze_pose(scene, doomed))
    for obj in doomed:
        bpy.data.objects.remove(obj, do_unlink=True)
    log("deleted %d marker objects" % len(doomed))
    if cfg["scale"] != 1.0:
        log("scaled %d root objects by %g -> metres" % (scale_roots(scene, cfg["scale"]), cfg["scale"]))
    unify_source_uvs(surfaces(scene))

    log("packed images (%d missing images removed)" % pack_images())
    bpy.ops.wm.save_as_mainfile(filepath=out)
    log("wrote %s (%d objects)" % (out, len(scene.objects)))


main()
