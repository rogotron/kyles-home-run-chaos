"""Original stadium toys, authored with bpy. Blender 5.2+, no external assets.

Run: blender --background --python blender/create_stadium_targets.py
Game coordinates: X across field, Y up, Z outfield; front is -Z.
Every export has an identity root. Static parts use target.group coordinates;
Moving parts use the existing target.moving coordinates. No collision meshes.
Editable source is saved before export-only conversion/material batching.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/targets'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0
bpy.context.preferences.filepaths.file_preview_type = 'NONE'
COLORS = {
    'green':'51C98A', 'mint':'77DC93', 'belly':'B8EA84', 'darkgreen':'247D65',
    'cream':'FFF3D1','white':'FFF9EF','navy':'173E51','teal':'325969',
    'steel':'547B89','lightsteel':'B1D6DF','gold':'FFBF57','yellow':'FFE16F',
    'bun':'EFB864','bunlight':'FFCF86','sausage':'ED795A','toast':'C88649',
    'purple':'8874DC','darkpurple':'544A91','glass':'B1F5EC','glow':'A4FFDE',
    'lavender':'8E9EFF','lilac':'A2B4FF','orange':'FF9151','red':'E85857',
    'pink':'F58192','water':'65D6F0','seam':'E95873', 'black':'24364C',
}
def xyz(p): return (p[0],-p[2],p[1])
def lin(c): return c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4
MATS={}
def mat(color, finish='vinyl'):
    key=(color,finish)
    if key in MATS: return MATS[key]
    m=bpy.data.materials.new(color+'_'+finish); m.use_nodes=True; m.use_backface_culling=True
    rgb=tuple(lin(int(COLORS.get(color,color)[i:i+2],16)/255) for i in (0,2,4))
    m.diffuse_color=(*rgb,1)
    s=m.node_tree.nodes.get('Principled BSDF'); s.inputs['Base Color'].default_value=(*rgb,1)
    s.inputs['Roughness'].default_value={'vinyl':.38,'ceramic':.25,'metal':.38,'lens':.24,'net':.65}[finish]
    s.inputs['Metallic'].default_value=.35 if finish=='metal' else 0
    if finish=='lens':
        s.inputs['Emission Color'].default_value=(*rgb,1); s.inputs['Emission Strength'].default_value=.65
    m['finish']=finish; MATS[key]=m; return m

CURRENT=''; ASSETS={}
def group(role,p=(0,0,0),parent=None):
    o=bpy.data.objects.new(CURRENT+'.'+role,None); bpy.context.collection.objects.link(o)
    o.parent=parent; o.location=xyz(p); o['targetRole']=role
    return o
def start(name):
    global CURRENT
    CURRENT=name
    root=group('Root'); static=group('Static',parent=root); moving=group('Moving',parent=root)
    ASSETS[name]=root
    return root,static,moving
def finish(o,name,color,p,parent,smooth=True,style='vinyl'):
    o.name=CURRENT+'.'+name; o.parent=parent; o.location=xyz(p); o.data.materials.append(mat(color,style))
    if o.type=='MESH':
        for f in o.data.polygons: f.use_smooth=smooth
    return o
def ball(name,color,p,size,parent,seg=20,rings=12,style='vinyl'):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,radius=1)
    o=finish(bpy.context.object,name,color,p,parent,style=style);o.scale=(size[0],size[2],size[1]); return o
def box(name,color,p,size,parent,bevel=.12,style='vinyl'):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o=finish(bpy.context.object,name,color,p,parent,False,style); o.scale=(size[0],size[2],size[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        m=o.modifiers.new('Rounded manufactured edge','BEVEL');m.width=bevel;m.segments=3
        o.modifiers.new('Weighted face normals','WEIGHTED_NORMAL')
    return o
def link(name,color,a,b,r,parent,r2=None,seg=12,style='vinyl'):
    a,b=Vector(xyz(a)),Vector(xyz(b))
    bpy.ops.mesh.primitive_cone_add(vertices=seg,radius1=r,radius2=r if r2 is None else r2,depth=(b-a).length)
    o=finish(bpy.context.object,name,color,(0,0,0),parent,style=style)
    o.location=(a+b)/2;o.rotation_mode='QUATERNION';o.rotation_quaternion=(b-a).to_track_quat('Z','Y');return o
def tube(name,color,points,r,parent,style='vinyl',smooth=False):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=3;c.bevel_depth=r;c.bevel_resolution=1;c.use_fill_caps=True
    s=c.splines.new('BEZIER' if smooth else 'POLY')
    if smooth:
        s.bezier_points.add(len(points)-1)
        for v,p in zip(s.bezier_points,points):v.co=xyz(p);v.handle_left_type='AUTO';v.handle_right_type='AUTO'
    else:
        s.points.add(len(points)-1)
        for v,p in zip(s.points,points):v.co=(*xyz(p),1)
    o=bpy.data.objects.new(CURRENT+'.'+name,c);bpy.context.collection.objects.link(o);o.parent=parent;c.materials.append(mat(color,style));return o
def ring(name,color,p,rx,rz,r,parent,style='vinyl'):
    return tube(name,color,[(p[0]+rx*math.cos(a),p[1],p[2]+rz*math.sin(a)) for a in [i*math.tau/48 for i in range(49)]],r,parent,style)
def lathe(name,color,profile,parent,p=(0,0,0),scale=(1,1,1),style='vinyl',steps=40):
    verts=[];faces=[]
    for radius,y in profile:
        for i in range(steps):
            a=i*math.tau/steps;verts.append(xyz((p[0]+radius*math.cos(a)*scale[0],p[1]+y*scale[1],p[2]+radius*math.sin(a)*scale[2])))
    for j in range(len(profile)-1):
        for i in range(steps):
            a=j*steps+i;b=j*steps+(i+1)%steps
            if profile[j][0]==0: faces.append((a,b+steps,a+steps))
            elif profile[j+1][0]==0: faces.append((a,b,a+steps))
            else: faces.append((a,b,b+steps,a+steps))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
    return finish(o,name,color,(0,0,0),parent,style=style)
def base(static,color):
    lathe('Weighted inflatable plinth',color,[(0,0),(5.9,0),(6.2,.15),(6.2,.32),(5.8,.5),(0,.5)],static)
def tether(root,top):
    anchor=group('Tether',parent=root)
    link('Continuous anchor cord','cream',(0,.5,0),(0,top,0),.085,anchor,seg=8)
def eye(parent,x,y,z,scale=1):
    ball('Eye white','white',(x,y,z),(1.02*scale,1.14*scale,.55*scale),parent,16,10)
    ball('Curious pupil','navy',(x-.10*scale,y+.02*scale,z-.49*scale),(.43*scale,.60*scale,.16*scale),parent,12,8)
    ball('Eye sparkle','white',(x-.23*scale,y+.28*scale,z-.63*scale),(.13*scale,.18*scale,.055*scale),parent,10,6)

def dinosaur():
    root,body,unused=start('dinosaur');bpy.data.objects.remove(unused,do_unlink=True)
    head=group('Head',(0,16,0),root);jaw=group('Jaw',(0,-2,-.3),head)
    ball('Pear shaped torso','green',(0,5.7,2.7),(4.8,5.6,3.8),body)
    ball('Sweeping neck','green',(0,11.4,1.45),(2.85,5.6,2.55),body)
    ball('Belly bib','belly',(0,5.8,-.65),(3,4.4,1.2),body)
    for y in [3.4,4.9,6.4,7.9]:tube('Soft belly crease','mint',[(-1.8,y,-1.43),(0,y-.14,-1.87),(1.8,y,-1.43)],.075,body,smooth=True)
    # A continuous tapered, curved tail, rather than intersecting cylinders.
    centers=[(1.5,3.8,4.5,2.5),(4,3,6.5,1.95),(6.8,2.7,7.8,1.35),(9,3.1,8.3,.8),(10.4,4.1,8.5,.2)]
    vs=[];fs=[]
    for x,y,z,r in centers:
        for i in range(12):
            a=i*math.tau/12;vs.append(xyz((x,y+math.cos(a)*r,z+math.sin(a)*r)))
    for j in range(len(centers)-1):
        for i in range(12):a=j*12+i;b=j*12+(i+1)%12;fs.append((a,b,b+12,a+12))
    fs.extend([tuple(reversed(range(12))),tuple(range(48,60))])
    me=bpy.data.meshes.new('Curved tail');me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new('Tail',me);bpy.context.collection.objects.link(o);finish(o,'Curved tail','green',(0,0,0),body)
    sub=o.modifiers.new('Inflatable tail smoothing','SUBSURF');sub.levels=1
    for x in [-3,3]:
        ball('Haunch','green',(x,2.8,2),(2.05,2.7,2.25),body)
        ball('Broad rounded foot','mint',(x,1.1,0),(1.9,1.1,2.65),body)
        for d in [-.62,0,.62]:ball('Toe cap','cream',(x+d,.7,-2.12),(.30,.31,.49),body,12,8)
        arm=ball('Short arm','green',(x*1.25,7,-.55),(.93,1.9,.90),body);arm.rotation_euler.y=.45 if x<0 else -.45
        ball('Mitten hand','mint',(x*1.40,5.85,-1.1),(.97,.70,.9),body,16,10)
        for d in [-.3,0,.3]:ball('Rounded fingers','belly',(x*1.4+d,5.72,-1.85),(.16,.22,.22),body,10,6)
    for i in range(7):ball('Soft dorsal scallop','gold',(0,5+i*1.65,5.9-i*.35),(.70,1.03,.50),body,12,8)
    ball('Friendly head','green',(0,2,0),(4.85,3.12,3.8),head)
    ball('Open mouth cavity','navy',(0,-.22,-2.8),(4.18,1.80,1.65),head)
    ball('Broad rounded muzzle','mint',(0,1.13,-2.5),(4.55,1.18,2.15),head)
    ball('Chomping lower jaw','mint',(0,0,0),(4.5,.84,3.65),jaw)
    ball('Tongue','pink',(0,.66,-2.6),(1.9,.18,.87),jaw)
    for x in [-2.5,2.5]:
        ball('Raised eye socket','green',(x,3.5,-1.4),(1.6,1.75,1.55),head)
        eye(head,x,3.65,-2.68,1.04)
        ball('Nostril inset','darkgreen',(x*.61,1.63,-4.47),(.30,.21,.09),head,12,8)
        ball('Cheek','pink',(x*1.43,.62,-3.47),(.5,.25,.11),head,12,8)
        tube('Soft brow','darkgreen',[(x-.9,4.79,-2.2),(x,5.02,-2.3),(x+.9,4.81,-2.2)],.16,head,smooth=True)
    for x in [-2.8,-1.7,1.7,2.8]:
        ball('Blunt upper tooth','cream',(x,.20,-3.9),(.30,.43,.29),head,12,8)
        ball('Blunt lower tooth','cream',(x,.79,-3.05),(.28,.30,.26),jaw,12,8)

def toilet():
    root,s,m=start('toilet')
    lathe('Pedestal foot','lightsteel',[(0,0),(2.8,0),(3,.15),(2.9,.5),(2.05,1.1),(1.8,3.6),(2.1,4.1),(0,4.1)],s,style='ceramic')
    # Watertight bowl shell: outside, rolled rim, concave inside and drain.
    lathe('Sculpted porcelain bowl','white',[(0,3.4),(1.5,3.5),(2.8,4),(4,5.1),(4.7,6.55),(4.75,6.8),(4.5,7),(4.18,6.83),(3.82,6.1),(2.7,4.8),(.65,3.8),(0,3.8)],s,(0,0,-1),(1,1,1.12),'ceramic')
    ring('Raised seat','cream',(0,6.98,-1),4.46,5.02,.24,s,'ceramic')
    box('Rounded cistern','white',(0,7,3),(7,9,3),s,.48,'ceramic')
    box('Tank lid lip','lightsteel',(0,11.58,3),(7.5,.48,3.5),s,.20,'ceramic')
    box('Tank lid','white',(0,11.78,3),(7.2,.23,3.25),s,.10,'ceramic')
    # Upright lid behind the bowl, with an inset border visible above the seat.
    ball('Upright seat lid','cream',(0,8.7,1.57),(3.65,2.75,.22),s,24,12,'ceramic')
    ball('Lid inner face','white',(0,8.7,1.34),(3.22,2.34,.08),s,24,12,'ceramic')
    box('Flush handle base','steel',(-2.5,9.5,1.28),(.55,.65,.24),s,.15,'metal')
    box('Oversized flush lever','gold',(-2.9,9.53,1.02),(1.35,.35,.35),s,.14,'metal')
    for x in [-2.1,2.1]:link('Seat hinge','lightsteel',(x-.3,7.08,2.5),(x+.3,7.08,2.5),.2,s,style='metal')
    # Moving origin already exists at (0,6.6,-1). Preserve its spin axis.
    lathe('Water opening','water',[(0,-.10),(3.94,-.10),(3.94,-.06),(0,-.06)],m,scale=(1,1,1.07),style='ceramic')
    tube('Flush swirl','glass',[(math.cos(a)*r,.015,math.sin(a)*r*1.06) for a,r in [(i*math.pi*6/80,.25+i*3.5/80) for i in range(81)]],.045,m)

def sock():
    root,s,m=start('sock');base(s,'pink');tether(root,8.5)
    shaft=ball('Inflated sock leg','white',(2,1,0),(2.7,5.3,2.5),m,28,18)
    foot=ball('Rounded sock foot','white',(-1.2,-3.4,0),(5.7,2.6,2.5),m,32,18)
    # Fuse the leg and foot into one smooth, sealed vinyl silhouette.
    bpy.ops.object.select_all(action='DESELECT')
    shaft.select_set(True);foot.select_set(True);bpy.context.view_layer.objects.active=shaft
    bpy.ops.object.join();bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    remesh=shaft.modifiers.new('Continuous inflated sock','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.25
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    smooth=shaft.modifiers.new('Soft vinyl','SMOOTH');smooth.factor=1.2;smooth.iterations=5
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    decimate=shaft.modifiers.new('Mobile geometry budget','DECIMATE');decimate.ratio=.32
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    for face in shaft.data.polygons:face.use_smooth=True
    ball('Pink reinforced toe','pink',(-5.2,-3.45,0),(2.1,2.25,2.52),m,24,14)
    ball('Mint heel patch','glass',(2.3,-3.2,.2),(2.3,2.2,2.5),m,24,14)
    ball('Puffy ribbed cuff','pink',(2,5.5,0),(2.85,1.3,2.65),m,28,14)
    for y in [4.9,5.8]:ring('White cuff stripe','white',(2,y,0),2.72,2.53,.16,m)
    tube('Toe stitching','cream',[(-5.1,-5.15,-1.65),(-5.3,-4.4,-2.3),(-5.35,-3.4,-2.53),(-5.3,-2.4,-2.25),(-5.1,-1.8,-1.7)],.055,m,smooth=True)

def goal():
    root,s,m=start('goal')
    tube('Continuous rounded goal frame','cream',[(-10,0,0),(-10,12.8,0),(-9.95,13.6,0),(-9.5,14,0),(9.5,14,0),(9.95,13.6,0),(10,12.8,0),(10,0,0)],.31,s)
    for x in [-10,10]:
        tube('Rear support','lightsteel',[(x,13.8,.1),(x,12.8,1.4),(x,0,5),(x,0,0)],.17,s,style='metal')
        box('Post foot','mint',(x,.18,0),(1,.36,1.1),s,.16)
        for y in [1,12.7]:link('Post coupling','white',(x,y-.15,0),(x,y+.15,0),.36,s)
    link('Rear ground rail','mint',(-10,.15,5),(10,.15,5),.16,s)
    # Sparse actual ropes: opaque, single-sided tubes; no transparency sorting.
    for x in range(-10,11,2):tube('Vertical net cord','cream',[(x,13.65,.35),(x,7,2.9),(x,.3,4.85)],.045,s,'net')
    for y in range(1,14,2):
        z=5*(1-y/14);tube('Horizontal net cord','cream',[(-10,y,z),(0,y-.10,z+.12),(10,y,z)],.045,s,'net')
    for side in [-1,1]:
        for y in [2,5,8,11]:tube('Side net cord','cream',[(side*10,y,0),(side*10,y,5*(1-y/14))],.04,s,'net')
        tube('Side net upright','cream',[(side*10,0,2.5),(side*10,7,2.5)],.04,s,'net')

def ufo():
    root,s,m=start('ufo')
    lathe('Lower tapered hull','darkpurple',[(0,-1.32),(2.1,-1.32),(4.5,-.65),(5.2,-.10),(0,.15)],m,scale=(1,1,.72))
    lathe('Swept upper saucer','purple',[(0,-.18),(6.75,-.18),(7,.05),(6.8,.38),(5.6,.76),(3.4,1.05),(0,1.1)],m,scale=(1,1,.72))
    ring('Raised rim piping','lilac',(0,.07,0),6.89,4.96,.16,m)
    ring('Cockpit gasket','darkpurple',(0,.9,0),3.05,2.64,.18,m)
    # Opaque tinted dome avoids mobile sorting/transmission expense.
    ball('Tinted cockpit dome','glass',(0,1.1,0),(3,2.1,2.7),m,28,14,'ceramic')
    tube('Dome specular accent','white',[(-1.9,2.4,-1),(-1.3,2.9,-1.08),(-.6,3.1,-1.1)],.12,m,smooth=True)
    for i in range(12):
        a=i*math.pi/6;p=(6*math.sin(a),.15,4.2*math.cos(a));g=group('Light'+str(i),p,m)
        # Fixed sockets batch with the hull; only the twelve bulbs pulse.
        ball('Rim lamp bezel','darkpurple',(p[0],p[1]+.39,p[2]),(.56,.27,.55),m,12,8)
        ball('Glowing rim lamp','yellow' if i%2 else 'glow',(0,.59,0),(.43,.30,.43),g,12,8,'lens')
    ring('Underside engine','glow',(0,-1.30,0),1.7,1.25,.15,m,'lens')

def scoreboard():
    root,s,m=start('scoreboard')
    for x in [-13,13]:
        box('Support footing','teal',(x,.45,0),(2.4,.9,2.5),s,.18,'metal')
        box('Support pole','steel',(x,9.5,0),(1.4,19,1.4),s,.14,'metal')
        for y in [3,10,17]:box('Pole collar','lightsteel',(x,y,0),(1.6,.30,1.6),s,.07,'metal')
    link('Cross brace','teal',(-13,7,.5),(13,18,.5),.18,s,style='metal')
    link('Cross brace','teal',(13,7,.5),(-13,18,.5),.18,s,style='metal')
    # Screen occupies unchanged x +/-13, y +/-6, z=-1.025, in Three.js.
    box('Recessed backing','navy',(0,0,.10),(27.7,13.7,1.75),m,.30,'metal')
    for x in [-13.6,13.6]:box('Reactive frame','teal',(x,0,-.68),(.8,14,1.1),m,.19,'metal')
    for y in [-6.6,6.6]:box('Reactive frame','teal',(0,y,-.68),(27,.8,1.1),m,.19,'metal')
    for x in [-13.35,13.35]:box('Gold border','gold',(x,0,-1.25),(.18,12.9,.18),m,.07,'metal')
    for y in [-6.34,6.34]:box('Gold border','gold',(0,y,-1.25),(26.8,.18,.18),m,.07,'metal')
    for x in [-12.8,12.8]:
        for y in [-6.65,6.65]:ball('Frame fastener','lightsteel',(x,y,-1.3),(.15,.15,.07),m,10,6,'metal')
    for x in [-10,-5,0,5,10]:
        link('Lamp bracket','steel',(x,6.9,.3),(x,7.65,-.4),.11,m,style='metal')
        box('Scoreboard lamp hood','navy',(x,7.62,-.47),(1.8,.8,.8),m,.16,'metal')
        box('Scoreboard lamp','cream',(x,7.54,-.9),(1.42,.40,.10),m,.06,'lens')

def lights():
    root,s,m=start('lights')
    # Coordinates below remain relative to the original moving pivot at Y=27.
    for x in [-.92,.92]:
        for z in [-.55,.55]:link('Tapered tower leg','steel',(x*1.4,-27,z*1.4),(x,-2.1,z),.16,m,style='metal')
    box('Tower base','teal',(0,-26.7,0),(3.4,.6,2.6),m,.16,'metal')
    for y in range(-26,-2,4):
        for z in [-.63,.63]:
            link('Lattice diagonal','lightsteel',(-1.2,y,z),(1.15,y+4,z),.09,m,seg=8,style='metal')
            link('Lattice diagonal','steel',(1.2,y,z),(-1.15,y+4,z),.09,m,seg=8,style='metal')
        link('Tower rung','steel',(-1.2,y,-.65),(1.2,y,-.65),.13,m,style='metal')
    box('Light bank backplate','teal',(0,0,.22),(12,6,.75),m,.22,'metal')
    for y in [-2.96,2.96]:box('Bank horizontal rail','lightsteel',(0,y,-.06),(12.1,.18,.95),m,.06,'metal')
    for i in range(10):
        x=-4.5+i%5*2.25;y=-1.2+(i//5)*2.4
        box('Dimensional lamp housing','navy',(x,y,-.40),(1.9,1.85,1.15),m,.22,'metal')
        box('Reflector surround','lightsteel',(x,y,-.95),(1.73,1.63,.30),m,.15,'metal')
        box('Lamp lens','cream',(x,y,-1.13),(1.52,1.30,.22),m,.15,'lens')
        box('Lamp brow','steel',(x,y+.81,-1.07),(1.88,.16,.54),m,.07,'metal')

def baseball():
    root,s,m=start('baseball');base(s,'pink');tether(root,18.1)
    ball('Inflatable leather shell','white',(0,0,0),(6,6,6),m,32,20)
    for side in [-1,1]:
        pts=[]
        for i in range(97):
            a=i*math.tau/96;x=side*(2.4+.7*math.cos(a*2));r=math.sqrt(6.025**2-x*x);pts.append((x,r*math.sin(a),r*math.cos(a)))
        tube('Raised baseball seam','seam',pts,.065,m)
        for i in range(32):
            a=i*math.tau/32;x=side*(2.4+.7*math.cos(a*2));r=math.sqrt(6.04**2-x*x)
            tube('Bold double stitch','seam',[(x-.22,r*math.sin(a-.025),r*math.cos(a-.025)),(x,r*math.sin(a+.018),r*math.cos(a+.018)),(x+.22,r*math.sin(a-.025),r*math.cos(a-.025))],.065,m)
    ball('Inflation valve','cream',(0,-5.94,0),(.35,.14,.35),m,12,8)

def mascot():
    root,s,m=start('mascot');base(s,'lilac');tether(root,6.2)
    ball('Pear shaped mascot','lavender',(0,-2,0),(4.5,6,3.6),m,24,16)
    ball('Tummy patch','lilac',(0,-2.2,-3.05),(3.05,4.25,.76),m)
    ball('Owl head','lilac',(0,5,-.3),(4.3,3.4,3.5),m,24,16)
    for side in [-1,1]:
        ball('Wing','lavender',(side*5,-.7,0),(2,3,2),m)
        for j in range(2):tube('Wing fold','lilac',[(side*5.0,-1+j*.8,-1.8),(side*5.7,-1.6+j*.8,-1.8)],.09,m)
        ball('Face disk','cream',(side*1.7,5.5,-3.30),(1.60,1.66,.63),m,20,12)
        eye(m,side*1.7,5.55,-3.61,.83)
        ball('Cheek spot','pink',(side*2.8,4.05,-3.14),(.49,.26,.12),m,12,8)
        ball('Little owl foot','gold',(side*1.9,-7.25,-.7),(1.2,.7,1.8),m,16,10)
    ball('Button beak','gold',(0,3.94,-3.82),(1.1,.69,.75),m,16,10)
    # Soft cap and broad bill provide an unmistakable ballpark mascot silhouette.
    ball('Mascot cap','purple',(0,7.4,-.1),(3.25,.92,2.7),m)
    box('Cap bill','darkpurple',(0,7.1,-2.45),(4.9,.25,2.1),m,.30)
    ball('Cap button','gold',(0,8.30,-.1),(.28,.20,.28),m,12,8)

def icecream():
    root,s,m=start('icecream')
    box('Rounded truck body','glass',(0,4,0),(12,6,6),s,.48)
    box('Roof lip','cream',(0,7.07,0),(12.5,.45,6.5),s,.18)
    box('Ice cream cab','pink',(-8,3,0),(4,4,5.8),s,.48)
    box('Cab roof','cream',(-8,5.4,0),(4.1,.45,5.9),s,.20)
    box('Cab glazing','glass',(-8,4.6,-2.84),(3.1,1.25,.12),s,.19,'ceramic')
    box('Windshield','glass',(-10.01,4.6,0),(.08,1.25,4.4),s,.16,'ceramic')
    box('Bumper','lightsteel',(-10.15,1.9,0),(.35,.55,5.9),s,.16,'metal')
    box('Serving window frame','cream',(0,4.4,-3.07),(7.55,3.1,.25),s,.20)
    box('Serving window inset','navy',(0,4.4,-3.23),(7,2.6,.12),s,.12)
    box('Service shelf','cream',(0,2.95,-3.65),(8,.30,1.3),s,.12)
    for i in range(6):
        box('Candy stripe awning','cream' if i%2 else 'pink',(-5+i*2,6.75,-3.65),(2,.40,1.65),s,.12)
        ball('Awning scallop','cream' if i%2 else 'pink',(-5+i*2,6.48,-4.45),(1,.30,.15),s,12,8)
    for x in [-7,4]:
        for z in [-3,3]:
            link('Rubber tire','black',(x,1.25,z-.30),(x,1.25,z+.30),1.25,s,seg=20)
            ball('Rounded sidewall','black',(x,1.25,z*1.10),(1.17,1.17,.18),s,20,12)
            ball('Chrome hub','lightsteel',(x,1.25,z*1.15),(.62,.62,.12),s,16,10,'metal')
            ball('Hub button','gold',(x,1.25,z*1.19),(.23,.23,.09),s,12,8,'metal')
    for z in [-1.9,1.9]:ball('Headlamp','cream',(-10.0,2.85,z),(.14,.36,.44),s,12,8,'lens')
    link('Giant waffle cone','bun',(0,7.15,0),(0,10.25,0),.25,s,r2=1.65,seg=24)
    for y in [7.8,8.4,9,9.6]:
        radius=.25+(y-7.15)/3.1*1.4
        ring('Waffle cone ridges','bunlight',(0,y,0),radius,radius,.055,s)
    ball('Vanilla scoop','white',(0,10.5,0),(2.15,1.65,2.05),s,28,16)
    ball('Strawberry scoop','pink',(0,12,0),(1.5,1.3,1.5),s,24,14)
    ball('Cherry on top','red',(0,13.25,0),(.35,.35,.35),s,16,10)
    for x,color in [(-2.3,'pink'),(0,'white'),(2.3,'glass')]:
        link('Window cone','bun',(x,3.4,-3.4),(x,4.2,-3.4),.06,s,r2=.4)
        ball('Window scoop',color,(x,4.45,-3.4),(.53,.53,.4),s,16,10)

for build in [dinosaur,toilet,sock,goal,ufo,scoreboard,lights,baseball,mascot,icecream]:build()

# Save editable source, arranged in a labelled grid without altering exported pivots.
for i,(name,root) in enumerate(ASSETS.items()):
    root.location=xyz(((i%5)*36,0,(i//5)*48))
    # Display the fully assembled props in the editable Blender gallery.
    # These attachment offsets belong to Three.js at runtime, so reset below.
    attachment={'toilet':(0,6.6,-1),'sock':(0,14,0),'scoreboard':(0,25,0),
                'lights':(0,27,0),'baseball':(0,24,0),'mascot':(0,14,0)}.get(name,(0,0,0))
    for child in root.children:
        if child.get('targetRole')=='Moving':child.location=xyz(attachment)
    root['notes']='Render only; export root resets to identity. Gameplay proxies remain in src/physics.ts.'
bpy.context.scene.world.color=(.22,.30,.34)
bpy.context.scene['asset_contract']='Ten original targets; each Static/Moving/Head/Light node documents its game attachment through targetRole.'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender/stadium-targets.blend'))

# Convert and batch the export copy by pivot + surface response, with linear
# vertex colors. This keeps crisp palette boundaries in just 1-3 draws/pivot.
report={}
for name,root in ASSETS.items():
    root.location=(0,0,0)
    for child in root.children:
        if child.get('targetRole')=='Moving':child.location=(0,0,0)
    objects=list(root.children_recursive)
    for o in objects:
        if o.type not in {'MESH','CURVE'}:continue
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
        # Recalculate custom surfaces outward after curve/modifier conversion.
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
        colors=o.data.color_attributes.new(name='Palette',type='FLOAT_COLOR',domain='CORNER')
        for poly in o.data.polygons:
            color=o.data.materials[poly.material_index].diffuse_color
            for li in poly.loop_indices:colors.data[li].color=color
        o['surfaceFinish']=o.data.materials[0].get('finish','vinyl')
    batches={}
    for o in list(root.children_recursive):
        if o.type=='MESH':batches.setdefault((o.parent,o['surfaceFinish']),[]).append(o)
    for (parent,style),meshes in batches.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in meshes:o.select_set(True)
        bpy.context.view_layer.objects.active=meshes[0]
        if len(meshes)>1:bpy.ops.object.join()
        o=meshes[0]
        o.name=f'{name}.{parent.get("targetRole")}.{style}'
        key='batch_'+style
        material=bpy.data.materials.get(key)
        if material is None:
            material=mat('white',style).copy();material.name=key
            shader=material.node_tree.nodes.get('Principled BSDF')
            vc=material.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='Palette'
            material.node_tree.links.new(vc.outputs['Color'],shader.inputs['Base Color'])
            if style=='lens':material.node_tree.links.new(vc.outputs['Color'],shader.inputs['Emission Color'])
        o.data.materials.clear();o.data.materials.append(material)
        for poly in o.data.polygons:poly.material_index=0
    bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
    for o in root.children_recursive:o.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'{name}.glb'),export_format='GLB',use_selection=True,export_yup=True,export_materials='EXPORT',export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
    blob=(OUT/f'{name}.glb').read_bytes();length=int.from_bytes(blob[12:16],'little');gltf=json.loads(blob[20:20+length])
    primitives=[p for mesh in gltf['meshes'] for p in mesh['primitives']]
    report[name]={'triangles':sum(gltf['accessors'][p['indices']]['count']//3 for p in primitives),'drawPrimitives':len(primitives),'bytes':len(blob),'materials':len(gltf['materials']),'textures':len(gltf.get('images',[])),'roles':[o.get('targetRole') for o in [root]+list(root.children_recursive) if o.get('targetRole')]}
    # Exclude already-exported models from subsequent selections and editing.
    root.location=xyz((list(ASSETS).index(name)*36,0,80))
(OUT/'manifest.json').write_text(json.dumps({'blender':bpy.app.version_string,'coordinates':'Y-up, identity root, game-unit scale','assets':report},indent=2))
print('STADIUM_TARGET_REPORT',json.dumps(report))
