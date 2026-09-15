import bpy, sys, os
from mathutils import Vector

src, outdir = sys.argv[-2], sys.argv[-1]
if src.endswith('.blend'):
    bpy.ops.wm.open_mainfile(filepath=src)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src, merge_vertices=True)
sc = bpy.context.scene
meshes = [o for o in sc.objects if o.type == 'MESH']
pts = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
lo = [min(p[i] for p in pts) for i in range(3)]
hi = [max(p[i] for p in pts) for i in range(3)]
c = Vector([(lo[i] + hi[i]) / 2 for i in range(3)])
r = max(hi[i] - lo[i] for i in range(3))
print("bounds", [round(x, 3) for x in lo], [round(x, 3) for x in hi])
cam_data = bpy.data.cameras.new('c')
cam_data.type = 'ORTHO'
cam_data.ortho_scale = r * 1.1
cam_data.clip_end = r * 10
cam = bpy.data.objects.new('c', cam_data)
sc.collection.objects.link(cam)
sc.camera = cam
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'
sc.display.shading.color_type = 'TEXTURE'
sc.render.resolution_x = sc.render.resolution_y = 512
os.makedirs(outdir, exist_ok=True)
# Camera sits on +axis looking toward -axis; image up = world +Z for side views, +Y for top/bottom.
views = {'pX': (1, 0, 0), 'mX': (-1, 0, 0), 'pY': (0, 1, 0), 'mY': (0, -1, 0), 'pZ': (0, 0, 1), 'mZ': (0, 0, -1)}
for name, d in views.items():
    d = Vector(d)
    cam.location = c + d * r * 3
    up = 'Y'
    cam.rotation_euler = (-d).to_track_quat('-Z', up).to_euler()
    sc.render.filepath = os.path.join(outdir, 'view_%s.png' % name)
    bpy.ops.render.render(write_still=True)
print("done")
