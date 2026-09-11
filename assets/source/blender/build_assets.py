"""Original Chaos Park assets. Run Blender 5.2.1 LTS --background --python this_file.

All dimensions below use game coordinates: X right, Y up, Z into the field.
Sources retain individual named parts. Exports batch meshes by material and
animation pivot. No images, third-party assets, rigs or collision meshes.
"""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'assets/source/blender'
OUTPUT = ROOT / 'public/assets/models'
OUTPUT.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0
bpy.context.preferences.filepaths.file_preview_type = 'NONE'
PALETTE = {
    'teal': '#087F8C', 'teal_dark': '#185365', 'navy': '#17384E',
    'mint': '#59C6AB', 'cream': '#FFF2D3', 'white': '#FFFCF1',
    'coral': '#F47868', 'gold': '#FFC654', 'blue': '#248DC8',
    'blue_dark': '#176596', 'skin': '#F2B180', 'skin_light': '#FFD0A3',
    'hair': '#693F35', 'clay': '#CD815A', 'clay_light': '#DE986C',
    'grass': '#469B6B', 'grass_light': '#4DA171', 'grass_dark': '#40875F',
    'grass_worn': '#85AD78', 'clay_soft': '#D69A72',
    'dino': '#33B896', 'dino_light': '#6DD8A8', 'belly': '#D1E68D',
    'mouth': '#263D50', 'tongue': '#F58192', 'wood': '#E8AC62',
    'wood_light': '#FFCF86', 'seam': '#DB4D63',
}
MATS = {}
REPORT = {}

def xyz(p): return (p[0], -p[2], p[1])
def linear(c): return c / 12.92 if c <= .04045 else ((c + .055)/1.055)**2.4
def reset():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for m in list(bpy.data.materials): bpy.data.materials.remove(m)
    MATS.clear()
    for name, color in PALETTE.items():
        m = bpy.data.materials.new(name)
        m.diffuse_color = tuple(linear(int(color[i:i+2], 16)/255) for i in (1,3,5)) + (1,)
        m.use_nodes = True
        shader = m.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = m.diffuse_color
        shader.inputs['Roughness'].default_value = .72 if 'grass' in name or 'clay' in name else .48
        MATS[name] = m

def finish(o, name, mat, p, parent=None, smooth=True):
    o.name = name
    o.parent = parent
    o.location = xyz(p)
    o.data.materials.append(MATS[mat])
    if smooth:
        for poly in o.data.polygons: poly.use_smooth = True
    return o

def group(name, p=(0,0,0), parent=None):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.parent = parent
    o.location = xyz(p)
    return o

def ball(name, mat, p, scale, parent=None, segments=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1)
    o = finish(bpy.context.object,name,mat,p,parent)
    o.scale = (scale[0],scale[2],scale[1])
    return o

def box(name, mat, p, size, bevel=.06, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = finish(bpy.context.object,name,mat,p,parent,False)
    o.scale = (size[0],size[2],size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod=o.modifiers.new('Soft toy edges','BEVEL'); mod.width=bevel; mod.segments=2
        mod=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
    return o

def cone(name, mat, p, radius, top, height, parent=None, vertices=20):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=top, depth=height)
    return finish(bpy.context.object,name,mat,p,parent)

def link(name, mat, a, b, radius, top=None, parent=None, vertices=16):
    a,b=Vector(xyz(a)),Vector(xyz(b))
    o=cone(name,mat,(0,0,0),radius,radius if top is None else top,(b-a).length,parent,vertices)
    o.location=(a+b)/2
    o.rotation_quaternion=(b-a).to_track_quat('Z','Y'); o.rotation_mode='QUATERNION'
    return o

def line(name,mat,points,radius,parent=None):
    curve=bpy.data.curves.new(name,'CURVE'); curve.dimensions='3D'
    curve.resolution_u=1; curve.bevel_depth=radius; curve.bevel_resolution=1
    spline=curve.splines.new('POLY'); spline.points.add(len(points)-1)
    for v,p in zip(spline.points,points): v.co=(*xyz(p),1)
    o=bpy.data.objects.new(name,curve); bpy.context.collection.objects.link(o)
    o.parent=parent; curve.materials.append(MATS[mat])
    return o

def arc(name, mat, inner, outer, y, start=-1.05, end=1.05, steps=72):
    verts=[]; faces=[]
    for i in range(steps+1):
        a=start+(end-start)*i/steps
        verts.extend([xyz((r*math.sin(a),y,r*math.cos(a))) for r in (inner,outer)])
    for i in range(steps): faces.append((2*i,2*i+1,2*i+3,2*i+2))
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    o=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(o)
    mesh.materials.append(MATS[mat]); return o

def text_mesh(name, text, mat, p, size, parent=None):
    c=bpy.data.curves.new(name,'FONT'); c.body=text; c.align_x='CENTER'; c.align_y='CENTER'
    # Distant lettering needs a clean silhouette, not bevels on every glyph.
    c.size=size; c.extrude=0; c.bevel_depth=0; c.resolution_u=3
    o=bpy.data.objects.new(name,c); bpy.context.collection.objects.link(o)
    o.location=xyz(p); o.rotation_euler=(math.pi/2,0,math.pi); o.parent=parent
    # Text X maps to game -X, text Y to up; front faces home plate.
    c.materials.append(MATS[mat]); return o

def save(name):
    bpy.context.scene.world.color=(.25,.35,.4)
    bpy.context.scene['asset_notes']='Original Chaos Park render asset. Gameplay collision is owned by Rapier; no collision geometry exported.'
    bpy.context.scene['units']='metres; authored game-space X right Y up Z field, converted to Blender Z up'
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/f'{name}.blend'))
    # Apply modifiers and convert curves in the export copy only.
    for o in list(bpy.context.scene.objects):
        if o.type not in {'MESH','CURVE','FONT'}: continue
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o
        bpy.ops.object.convert(target='MESH')
    if name not in {'batter','dinosaur'}:
        bpy.context.view_layer.update()
        for o in list(bpy.context.scene.objects):
            if o.type=='MESH':
                matrix=o.matrix_world.copy(); o.parent=None; o.matrix_world=matrix
        for o in list(bpy.context.scene.objects):
            if o.type=='EMPTY': bpy.data.objects.remove(o,do_unlink=True)
    batches={}
    for o in list(bpy.context.scene.objects):
        if o.type=='MESH': batches.setdefault((o.parent, o.data.materials[0].name),[]).append(o)
    for (parent,mat), objects in batches.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects: o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.object.join()
        objects[0].name=f'{parent.name if parent else name}_{mat}'
    triangles=0
    for o in bpy.context.scene.objects:
        if o.type=='MESH':
            o.data.calc_loop_triangles(); triangles+=len(o.data.loop_triangles)
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT/f'{name}.glb'),export_format='GLB',export_yup=True,export_materials='EXPORT',export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
    REPORT[name]={'triangles':triangles,'drawPrimitives':len(batches),'bytes':(OUTPUT/f'{name}.glb').stat().st_size,'textures':0}

def field():
    reset()
    box('Park lawn','grass_dark',(0,-.21,50),(700,.16,700),0)
    arc('Warning track','clay',0,75,.001)
    for i in range(10): arc('Mowed turf','grass' if i%2 else 'grass_light',i*7.1,(i+1)*7.1,.016)
    # The bases form a square centred on Z=12.7. Nested diamonds give every
    # baseline a continuous, even-width clay lane, including second base.
    for name,material,size,y in [('Continuous clay diamond','clay_light',21.2,.032),
                                  ('Worn grass margin','grass_worn',15.55,.043),
                                  ('Diamond turf','grass',15.3,.046)]:
        o=box(name,material,(0,y,12.7),(size,.006,size),0); o.rotation_euler.z=math.pi/4
    cone('Home clay circle','clay_light',(0,.026,0),4.4,4.4,.06,vertices=64)
    cone('Pitcher mound','clay_light',(0,.14,18),2.9,2.6,.28,vertices=48)
    box('Pitching rubber','cream',(0,.31,18),(.85,.03,.3),.02)
    for x,z in [(-12.7,12.7),(0,25.4),(12.7,12.7)]:
        wear=arc('Soft base wear','clay_soft',0,1.15,.039,-math.pi,math.pi,48)
        wear.location=xyz((x,0,z))
        wear.scale.y=.78
        o=box('Padded base','white',(x,.10,z),(.75,.13,.75),.045); o.rotation_euler.z=math.pi/4
    for s in [-1,1]:
        link('Chalk foul line','cream',(s*.4,.07,.4),(s*62,.07,62),.055,vertices=6)
        line('Batters box','cream',[(s*.6,.075,-1),(s*1.9,.075,-1),(s*1.9,.075,1),(s*.6,.075,1),(s*.6,.075,-1)],.023)
    # Broad, low-contrast grooming bands replace subpixel grooves and pebbles.
    for inner,outer in [(3.60,3.72),(4.02,4.14)]:
        arc('Groomed home clay','clay_soft',inner,outer,.059,-math.pi,math.pi,96)
    arc('Mound worn perimeter','clay_soft',2.88,3.12,.024,-math.pi,math.pi,64)
    save('field')

def stadium():
    reset()
    for i in range(52):
        a=-1.04+(i+.5)*2.08/52
        g=group('Padded fence bay',(72*math.sin(a),0,72*math.cos(a)))
        g.rotation_euler.z=a
        box('Fence padding','teal' if i%8<4 else 'teal_dark',(0,2,0),(2.96,4,.85),.14,g)
        box('Fence golden cap','gold',(0,4.09,0),(3.06,.22,1),.09,g)
        box('Fence seam','mint',(-1.38,2,-.445),(.04,3.6,.025),0,g)
        if i%7==0:
            box('Distance plaque','navy',(0,2.1,-.48),(2,.72,.05),.12,g)
            text_mesh('Distance','236 FT','cream',(0,2.1,-.525),.39,g)
    # Three genuine seating terraces underneath the existing animated crowd.
    for row,(r,y) in enumerate([(94,4.25),(104,5.65),(114,7.05)]):
        arc('Terrace deck','teal_dark',r-4.5,r+4.5,y+.018,-1.25,1.25)
        for i in range(40):
            a=-1.25+(i+.5)*2.5/40
            g=group('Grandstand bay',(r*math.sin(a),0,r*math.cos(a))); g.rotation_euler.z=a
            box('Terrace fascia','coral' if row==1 else 'teal',(0,y-1.4,0),(r*2.5/40+.08,2.8,8.8),.1,g)
            box('Terrace nosing','cream',(0,y+.04,-4.35),(r*2.5/40+.1,.14,.24),.03,g)
            if i%5==0:
                for step in range(5): box('Aisle steps','cream',(0,y-.9+step*.22,-4+step*1.75),(1.1,.20,1.8),.02,g)
    for i in range(13):
        a=-1.22+i*2.44/12
        g=group('Canopy pavilion',(125*math.sin(a),0,125*math.cos(a))); g.rotation_euler.z=a
        for x in [-6.5,6.5]:
            box('Canopy pier','cream',(x,9.5,0),(.65,19,.65),.13,g)
            box('Pier foot','teal_dark',(x,1,0),(1.2,2,1.2),.16,g)
        box('Pavilion header','teal_dark',(0,15.7,0),(15.5,2.4,1),.22,g)
        if i in [2,6,10]:
            text_mesh('Park lettering','CHAOS PARK','cream',(0,15.7,-.57),1.05,g)
        for j in range(8):
            roof=box('Candy stripe awning','cream' if j%2 else ('coral' if i%2 else 'gold'),(-7+j*2,18,-1),(2.03,.45,9),.1,g)
            roof.rotation_euler.x=.10
            ball('Scalloped valance','cream' if j%2 else ('coral' if i%2 else 'gold'),(-7+j*2,17.5,-5.3),(1,.6,.22),g,12,8)
        link('Pennant pole','cream',(0,18,0),(0,24,0),.08,parent=g)
        mesh=bpy.data.meshes.new('Pennant'); mesh.from_pydata([xyz(p) for p in [(0,24,0),(3.2,23.2,0),(0,22.4,0)]],[],[(0,1,2),(2,1,0)])
        o=bpy.data.objects.new('Triangular pennant',mesh); bpy.context.collection.objects.link(o); o.parent=g; mesh.materials.append(MATS['coral' if i%2 else 'gold'])
    for x in [-92,-54,54,92]:
        z=64 if abs(x)>60 else 116
        g=group('Floodlight',(x,0,z))
        cone('Floodlight tower','teal_dark',(0,19,0),.7,.4,38,g)
        box('Lamp housing','navy',(0,37,0),(10,3.8,1),.3,g)
        for i in range(5):
            for j in range(2): box('Lamp lens','cream',(-4+i*2,36.1+j*1.8,-.61),(1.4,1.15,.3),.15,g)
    for a in [-math.pi/4,math.pi/4]:
        x,z=72*math.sin(a),72*math.cos(a)
        cone('Foul pole','gold',(x,9,z),.18,.18,18)
        box('Foul pole flag','gold',(x+.8,16,z),(1.5,3,.08),.02)
    save('stadium')

def batter():
    reset()
    body=group('Body'); head=group('Head',(0,1.93,0)); arm=group('Arm',(.42,1.5,0))
    for x in [-.22,.22]:
        box('Chunky cleat','navy',(x,.13,-.085),(.38,.23,.57),.065,body)
        box('Cleat sole','cream',(x,.055,-.085),(.39,.07,.58),.025,body)
        for z in [-.22,-.14,-.06]: box('Shoe lace','cream',(x,.254,z),(.20,.015,.024),.006,body)
        cone('Sock','blue',(x,.29,0),.145,.15,.22,body)
        cone('Sock stripe','gold',(x,.33,0),.155,.155,.045,body)
        ball('Baseball trousers','cream',(x,.57,0),(.19,.35,.19),body)
        box('Trouser piping','blue',(x+(.17 if x>0 else -.17),.58,0),(.024,.46,.05),.009,body)
    ball('Jersey','blue',(0,1.17,0),(.41,.49,.32),body)
    cone('Belt','navy',(0,.83,0),.32,.33,.105,body)
    box('Belt buckle','gold',(0,.83,-.32),(.13,.085,.035),.015,body)
    line('Jersey piping','cream',[(0,.94,-.30),(0,1.37,-.322),(-.13,1.56,-.19)],.018,body)
    for y in [1.04,1.19,1.34]: ball('Jersey button','gold',(.035,y,-.329),(.023,.023,.012),body,10,6)
    # Original geometric number seven, on front and back; no team branding.
    for z in [-.32,.32]:
        box('Number seven top','gold',(.18,1.38,z),(.19,.05,.025),.008,body)
        o=box('Number seven stem','gold',(.18,1.27,z),(.05,.23,.025),.008,body); o.rotation_euler.y=-.3
    ball('Left sleeve','blue',(-.40,1.38,0),(.19,.25,.21),body)
    link('Left forearm','skin',(-.48,1.27,0),(-.50,1.03,-.05),.125,parent=body)
    ball('Left glove','cream',(-.50,1.02,-.05),(.16,.17,.16),body)
    ball('Swing sleeve','blue',(.10,-.12,0),(.18,.22,.19),arm)
    link('Swing forearm','skin',(.12,-.22,0),(.12,-.39,0),.13,parent=arm)
    ball('Gripping glove','cream',(.12,-.42,0),(.16,.16,.16),arm)
    box('Glove strap','gold',(.12,-.34,-.12),(.19,.08,.05),.02,arm)
    ball('Face','skin',(0,0,0),(.40,.43,.36),head)
    for x in [-.40,.40]:
        ball('Ear','skin_light',(x,0,0),(.09,.13,.09),head)
    ball('Hair back','hair',(0,.16,.12),(.405,.31,.29),head)
    ball('Helmet shell','blue',(0,.25,0),(.45,.28,.40),head)
    box('Rounded helmet bill','blue',(0,.20,-.35),(.66,.065,.41),.065,head)
    for x in [-.35,.35]: ball('Helmet ear guard','blue_dark',(x,.055,.03),(.105,.22,.19),head)
    line('Helmet racing stripe','gold',[(0,.50,.10),(0,.53,-.04),(0,.48,-.21)],.032,head)
    for x in [-.145,.145]:
        ball('Eye white','white',(x,.015,-.326),(.085,.10,.037),head)
        ball('Eye pupil','navy',(x,-.004,-.36),(.038,.055,.023),head)
        ball('Eye sparkle','white',(x-.012,.020,-.38),(.012,.018,.008),head,10,6)
        line('Eyebrow','hair',[(x-.06,.142,-.324),(x,.16,-.334),(x+.05,.15,-.324)],.021,head)
        ball('Rosy cheek','coral',(x*1.55,-.10,-.29),(.06,.035,.018),head)
    ball('Button nose','skin_light',(0,-.065,-.364),(.07,.065,.068),head)
    line('Happy smile','hair',[(-.105,-.18,-.32),(-.05,-.207,-.337),(.035,-.21,-.343),(.11,-.18,-.32)],.015,head)
    save('batter')

def bat():
    reset()
    cone('Maple barrel','wood',(0,.65,0),.065,.14,1.6,vertices=24)
    ball('Rounded barrel end','wood_light',(0,1.43,0),(.14,.065,.14))
    cone('Grip','navy',(0,-.03,0),.075,.075,.30)
    for i in range(7):
        line('Grip wrap','blue',[(.077*math.sin(a),-.16+i*.044+a/math.tau*.025,.077*math.cos(a)) for a in [j*math.tau/20 for j in range(21)]],.007)
    cone('Safety knob','gold',(0,-.19,0),.10,.10,.07)
    for i in range(3):
        a=i*1.7
        line('Maple grain','wood_light',[(math.sin(a)*(.07+t*.05),.25+t,math.cos(a)*(.07+t*.05)) for t in [j/12 for j in range(13)]],.007)
    cone('Barrel badge','coral',(0,1.10,0),.125,.128,.095)
    save('bat')

def baseball():
    reset()
    ball('Leather','white',(0,0,0),(.30,.30,.30),segments=24,rings=16)
    for sign in [-1,1]:
        points=[]
        for i in range(65):
            a=i*math.tau/64; x=sign*(.12+.04*math.cos(2*a)); r=math.sqrt(.301**2-x*x)
            points.append((x,r*math.sin(a),r*math.cos(a)))
        line('Curved seam','seam',points,.005)
        for i in range(22):
            a=i*math.tau/22; x=sign*(.12+.04*math.cos(2*a)); r=math.sqrt(.303**2-x*x)
            link('Raised stitch','seam',(x-.016,r*math.sin(a-.02),r*math.cos(a-.02)),(x+.016,r*math.sin(a+.02),r*math.cos(a+.02)),.004,vertices=5)
    save('baseball')

def plate():
    reset()
    points=[(-.42,.1,.42),(.42,.1,.42),(.42,.1,0),(0,.1,-.48),(-.42,.1,0)]
    verts=[xyz((x,y+dy,z)) for dy in [-.04,.04] for x,y,z in points]
    faces=[(0,4,3,2,1),(5,6,7,8,9)]+[(i,(i+1)%5,(i+1)%5+5,i+5) for i in range(5)]
    mesh=bpy.data.meshes.new('Five-sided rubber'); mesh.from_pydata(verts,[],faces); mesh.update()
    o=bpy.data.objects.new('Home plate',mesh); bpy.context.collection.objects.link(o); mesh.materials.append(MATS['cream'])
    mod=o.modifiers.new('Soft rubber edge','BEVEL'); mod.width=.025; mod.segments=2
    o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    save('home-plate')

def dinosaur():
    reset()
    body=group('Body'); head=group('Head',(0,16,0)); jaw=group('Jaw',(0,-2,-.3),head)
    ball('Pear shaped body','dino',(0,5.7,2.6),(4.8,5.8,3.9),body)
    ball('Soft neck','dino',(0,11.6,1.2),(2.95,5.3,2.6),body)
    ball('Belly bib','belly',(0,5.6,-.65),(3.0,4.6,1.3),body)
    for y in [3.6,5.0,6.4,7.8]:
        line('Belly fold','dino_light',[(-2,y,-1.25),(0,y-.15,-1.97),(2,y,-1.25)],.09,body)
    for x in [-3,3]:
        ball('Haunch','dino',(x,2.8,2),(2.1,2.8,2.3),body)
        ball('Big friendly foot','dino_light',(x,1.0,.1),(1.9,1.05,2.5),body)
        for i in [-1,0,1]: ball('Rounded toenail','cream',(x+i*.65,.7,-2.0),(.32,.30,.48),body,12,8)
        arm=ball('Little arm','dino',(x*1.26,7,-.5),(1,2,.95),body); arm.rotation_euler.y= .5 if x<0 else -.5
        ball('Little hand','dino_light',(x*1.43,5.8,-1),(1.05,.68,.93),body)
        for i in [-1,0,1]: ball('Finger','belly',(x*1.43+i*.31,5.7,-1.76),(.18,.23,.23),body,12,8)
    link('Tail base','dino',(2,3.4,5),(6,2.6,8),2.1,1.4,body)
    link('Tail curl','dino',(6,2.6,8),(10,4,9),1.4,.55,body)
    ball('Tail tip','dino_light',(10,4,9),(.7,.8,.7),body)
    for i in range(7):
        ball('Rounded dorsal plate','gold' if i%2 else 'coral',(0,5+i*1.6,5.7-i*.32),(.75,1.05,.48),body,12,8)
    ball('Broad head','dino',(0,2,0),(4.9,3.15,3.85),head)
    ball('Dark open mouth','mouth',(0,-.22,-2.8),(4.25,1.80,1.68),head)
    ball('Muzzle','dino_light',(0,1.1,-2.4),(4.55,1.15,2.15),head)
    ball('Chomping jaw','dino_light',(0,0,0),(4.55,.86,3.7),jaw)
    ball('Tongue','tongue',(0,.67,-2.6),(2.1,.19,.88),jaw)
    for x in [-2.5,2.5]:
        ball('Eye mound','dino',(x,3.6,-1.3),(1.65,1.8,1.6),head)
        ball('Big curious eye','white',(x,3.6,-2.25),(1.15,1.28,.75),head)
        ball('Pupil','navy',(x-.16,3.65,-2.91),(.48,.67,.22),head)
        ball('Eye glint','white',(x-.31,3.94,-3.08),(.17,.22,.08),head,12,8)
        ball('Nostril','teal_dark',(x*.61,1.60,-4.39),(.33,.22,.10),head)
        ball('Cheek blush','coral',(x*1.45,.57,-3.35),(.6,.32,.16),head)
        for i in range(3): ball('Freckle','teal',(x*1.34+i*.21,.99+(i%2)*.22,-3.72),(.10,.10,.07),head,10,6)
        brow=ball('Expressive brow','teal',(x,4.8,-1.95),(1.23,.29,.56),head); brow.rotation_euler.y=.14 if x<0 else -.14
    for x in [-2.8,-1.8,1.8,2.8]:
        ball('Rounded upper tooth','cream',(x,.20,-3.8),(.32,.46,.30),head,12,8)
        ball('Rounded lower tooth','cream',(x,.81,-3.0),(.30,.35,.27),jaw,12,8)
    for x,y,z in [(-3.5,8,1),(3.7,9,1),(-2.9,11,2),(3,4,0)]:
        ball('Dino spot','dino_light',(x,y,z),(.2,.6,.5),body,12,8)
    save('dinosaur')

selected=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
if selected and (OUTPUT/'manifest.json').exists(): REPORT.update(json.loads((OUTPUT/'manifest.json').read_text())['assets'])
for build in [field,stadium,batter,bat,baseball,plate,dinosaur]:
    if not selected or build.__name__ in selected: build()
(OUTPUT/'manifest.json').write_text(json.dumps({'blender':bpy.app.version_string,'assets':REPORT},indent=2))
print('CHAOS_ASSET_REPORT',json.dumps(REPORT))
