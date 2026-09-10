"""petuniasPrebake — flatten the petunia model to what buildMeshes accepts.

The Sketchfab source is a SketchUp export: 781 primitives, 11 materials, 79
LINES (edge geometry). `buildMeshes` refuses multi-material input by design —
the .mesh format and the shaders are single-material end to end — so the
flattening happens HERE, once, by hand, and MESH_SOURCES points at the OUTPUT.

Run:  npm run prebake-petunias   (Blender 5.2 LTS; not run in CI)

Deviation from the plan's step order, deliberate: geometry is decimated BEFORE
the unwrap+bake, not after. Baking into UVs that decimation then moves leaves
the atlas mis-registered and bleeding across island seams; unwrapping the final
triangle count instead keeps texel and triangle in agreement (and is minutes
faster).
"""

import os
import sys
import time

import bpy

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
SRC = os.path.join(REPO, "data/raw/meshes/petunias/petunias.glb")
OUT = os.path.join(REPO, "data/raw/meshes/petunias/petunias.prebaked.glb")
ATLAS = os.path.join(REPO, "data/raw/meshes/petunias/petunias.prebaked.albedo.png")

TRIANGLE_TARGET = 150_000  # buildMeshes' TRIANGLE_BUDGET
ATLAS_SIZE = 2048


def log(msg):
    sys.stderr.write("prebake: %s\n" % msg)
    sys.stderr.flush()


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_source():
    bpy.ops.import_scene.gltf(filepath=SRC, merge_vertices=True)
    return [o for o in bpy.context.scene.objects]


def drop_edge_geometry(objects):
    """The 79 LINES primitives arrive as face-less meshes; they carry no surface
    and would survive the join as degenerate junk the bake cannot see. Empties
    are left alone here — the importer parks glTF's Y-up correction on one, so
    they only go once the join has baked their transforms in."""
    dropped = 0
    for obj in objects:
        if obj.type == "MESH" and len(obj.data.polygons) == 0:
            bpy.data.objects.remove(obj, do_unlink=True)
            dropped += 1
    return dropped


def join_meshes():
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for obj in [o for o in bpy.context.scene.objects if o is not joined]:
        bpy.data.objects.remove(obj, do_unlink=True)
    return joined


def weld(obj):
    """SketchUp exports every face as its own island of loose vertices. Left
    welded-shut, smart_project hands the bake ~150k one-triangle islands (an
    atlas of unusable confetti) and COLLAPSE decimation has no edges to collapse
    along. Merging by distance first is what makes both of them work at all."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.0002)
    bpy.ops.object.mode_set(mode="OBJECT")
    return len(obj.data.vertices)


def triangles(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def decimate(obj):
    have = triangles(obj)
    if have <= TRIANGLE_TARGET:
        return have
    mod = obj.modifiers.new("decimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = TRIANGLE_TARGET / have
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return triangles(obj)


def unwrap(obj):
    """A second UV set: the source UVs stay put so the bake can still read the
    11 original materials through them."""
    uv = obj.data.uv_layers.new(name="bake")
    # Both flags, and the name read NOW: `active` is what smart_project writes
    # into, `active_render` is what the bake reads, and the layer reference goes
    # stale across the edit-mode round trip below.
    uv.active_render = True
    obj.data.uv_layers.active = uv
    uv_name = uv.name
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    # smart_project's poll rejects OBJECT mode in a background Blender (there is
    # no area to override with); EDIT mode passes it headless.
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.15192, island_margin=0.001)
    bpy.ops.object.mode_set(mode="OBJECT")
    return uv_name


def target_image():
    image = bpy.data.images.new("petunias_atlas", ATLAS_SIZE, ATLAS_SIZE, alpha=False)
    image.generated_color = (0, 0, 0, 1)
    return image


def arm_materials(obj, image):
    """Cycles bakes into whichever Image Texture node is ACTIVE in each material
    the object draws with — all 11 of them, or the bake refuses."""
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


def save_atlas(image):
    image.filepath_raw = ATLAS
    image.file_format = "PNG"
    image.save()


def flatten_materials(obj, image):
    """One material sampling the atlas, replacing the whole stack."""
    obj.data.materials.clear()
    mat = bpy.data.materials.new("petunias")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.9
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
        raise RuntimeError("prebake: expected one UV layer, have %s" % [l.name for l in obj.data.uv_layers])
    obj.data.uv_layers.active = obj.data.uv_layers[0]
    obj.data.uv_layers[0].active_render = True


def centre_on_origin(obj):
    """The authored pivot sits ~1.4 m away from a 0.87 m basket, and
    `boundingRadiusM` is measured from the ORIGIN — so shipping the pivot as-is
    hands the renderer a radius 3x the prop's real size (glint scale, fly-to
    framing and the mesh handoff all read it). Zeroing `location` after the
    origin move is what actually bakes the shift in: left set, the exporter
    writes it back out as a node translation and the tool re-applies it."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    obj.location = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()
    return max(v.co.length for v in obj.data.vertices)


def export(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=OUT,
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


def main():
    started = time.time()
    reset_scene()
    objects = import_source()
    log("imported %d objects from %s" % (len(objects), SRC))
    log("dropped %d edge/non-mesh objects" % drop_edge_geometry(objects))
    obj = join_meshes()
    log("joined -> %d tris, %d material slots, uv layers %s"
        % (triangles(obj), len(obj.material_slots), [l.name for l in obj.data.uv_layers]))
    log("welded -> %d verts" % weld(obj))
    log("decimated -> %d tris" % decimate(obj))
    uv_name = unwrap(obj)
    log("smart-projected uv '%s' (%.0fs elapsed)" % (uv_name, time.time() - started))
    image = target_image()
    arm_materials(obj, image)
    bake(obj, uv_name)
    save_atlas(image)
    log("baked %d^2 albedo atlas -> %s (%.0fs elapsed)" % (ATLAS_SIZE, ATLAS, time.time() - started))
    flatten_materials(obj, image)
    keep_only_bake_uv(obj, uv_name)
    log("centred on origin -> bounding radius %.3f m" % centre_on_origin(obj))
    export(obj)
    log("wrote %s (%d tris, %.0fs total)" % (OUT, triangles(obj), time.time() - started))


main()
