"""Draw the actual saved sketch/extrusion using standard-library SVG only."""
from pathlib import Path
import hashlib,html,json,math
ROOT=Path(__file__).resolve().parent
native=json.loads((ROOT/'rectangle-extrusion.cd').read_text())
nodes=native['models']['nodes'];sketch=next(n for n in nodes if n['__cla$$__']=='SketchNode');body=next(n for n in nodes if n['__cla$$__']=='ParametricBodyNode');data=json.loads(sketch['dataJson']);features=json.loads(body['featuresJson']);f=features[0]
assert len(features)==1 and f['type']=='extrude' and f['sketchId']==sketch['id']
assert len(data['entities'])==4 and all(e['type']=='line' for e in data['entities'])
points=[e['params'][i:i+2] for e in data['entities'] for i in (0,2)]
xs=[p[0] for p in points];ys=[p[1] for p in points];width=max(xs)-min(xs);height=max(ys)-min(ys);depth=f['depth']
assert abs(width-90)<1e-10 and abs(height-40)<1e-10 and depth==12
assert next(c['datum'] for c in data['constraints'] if c['kind']==18)==90
# A parallel isometric camera: orthonormal rows, with one shared screen scale.
rows=((1/math.sqrt(2),-1/math.sqrt(2),0),(1/math.sqrt(6),1/math.sqrt(6),-math.sqrt(2/3)))
assert abs(sum(a*b for a,b in zip(*rows)))<1e-14
assert all(abs(sum(v*v for v in r)-1)<1e-14 for r in rows)
case={'source_revision':'7986c79725cf7429d7ec816d647805947ce434bf','units':'mm','sketch':{'name':sketch['name'],'entities':data['entities'],'constraints':data['constraints'],'driving_width':90,'current_height':height},'feature':f,'isometric_projection_rows':rows,'projection_note':'Orthonormal camera rows, common uniform screen scale. Source numbers smaller than1e-12 are drawn at0; raw native file is unchanged. Solid faces illustrate the saved rectangular profile extruded by its actual depth; this is a source-derived diagram, not a browser capture.','native_bounds':{'min':[min(xs),min(ys),0],'max':[max(xs),max(ys),depth]},'roundtrip':'See replay.json: actual public application opens the native feature model, and a separate new document imports STEP with the same bounds. STEP does not retain the sketch feature history.'}
(ROOT/'case.json').write_text(json.dumps(case,indent=2)+'\n')
INK='#edf5fa';MUTED='#bdcdd6';BLUE='#9bd1ff';LINE='#465963'
def render(mobile):
 W,H=(440,1120) if mobile else (1200,800);parts=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Arial" role="img" aria-labelledby="title desc"><title id="title">SolidFrame: sketch, feature and native solid</title><desc id="desc">An actual saved four-line sketch has a 90 millimetre driving width and 40 millimetre current height. Its stored extrusion depth is 12 millimetres. The native document retains the sketch and feature; a separate STEP import retains matching geometry bounds.</desc><rect width="100%" height="100%" fill="#171e23"/>']
 def text(x,y,s,size=19,color=INK,weight=400):parts.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}">{html.escape(str(s))}</text>')
 def line(x1,y1,x2,y2,color=LINE,dash=''):parts.append(f'<line x1="{x1:.6f}" y1="{y1:.6f}" x2="{x2:.6f}" y2="{y2:.6f}" stroke="{color}" stroke-width="1.5" stroke-dasharray="{dash}"/>')
 text(30 if mobile else 48,38,'SOLIDFRAME / NATIVE MODEL',14,MUTED,700)
 text(30 if mobile else 48,84,'Sketch. Feature. Solid.',31 if mobile else 43,INK,700)
 text(30 if mobile else 48,118,'One actual model, opened in the browser.',17 if mobile else 23,MUTED)
 sx,sy,scale=(60,233,3) if mobile else (85,260,3.4)
 text(30 if mobile else 48,180,'01  SKETCH1',18,BLUE,700)
 for e in data['entities']:
  x1,y1,x2,y2=e['params'];line(sx+x1*scale,sy+y1*scale,sx+x2*scale,sy+y2*scale,BLUE)
 # Endpoints are a redundant encoding of the exact four native line entities.
 for x,y in [(0,0),(width,0),(width,height),(0,height)]:parts.append(f'<circle cx="{sx+x*scale:.6f}" cy="{sy+y*scale:.6f}" r="4" fill="{INK}"/>')
 line(sx,sy-23,sx+width*scale,sy-23,BLUE);line(sx,sy-30,sx,sy-14,BLUE);line(sx+width*scale,sy-30,sx+width*scale,sy-14,BLUE)
 text(sx+width*scale/2-26,sy-34,'90 mm',19,BLUE,700)
 text(sx+width*scale+12,sy+height*scale/2+6,'40',18,MUTED);text(sx+width*scale+12,sy+height*scale/2+28,'mm',16,MUTED)
 base=sy+height*scale
 text(30 if mobile else 48,base+49,'4 lines · 10 recorded constraints',17 if mobile else 20)
 text(30 if mobile else 48,base+78,'Width is driven; height is the saved geometry.',16 if mobile else 18,MUTED)
 cx,cy,s=(143,605,2.6) if mobile else (765,290,3.8)
 title_y=490 if mobile else 180;text(30 if mobile else 620,title_y,'02  EXTRUDE / 12 mm',18,BLUE,700)
 def project(p):return(cx+sum(a*b for a,b in zip(rows[0],p))*s,cy+sum(a*b for a,b in zip(rows[1],p))*s)
 corners=[(0,0,0),(width,0,0),(width,height,0),(0,height,0),(0,0,depth),(width,0,depth),(width,height,depth),(0,height,depth)]
 for ids,fill in [([2,3,7,6],'#37566b'),([1,2,6,5],'#284354'),([4,5,6,7],'#6c8d9e')]:
  coords=' '.join(f'{x:.6f},{y:.6f}' for x,y in [project(corners[i]) for i in ids]);parts.append(f'<polygon points="{coords}" fill="{fill}" stroke="{BLUE}" stroke-width="1.8"/>')
 by=790 if mobile else 520
 text(30 if mobile else 620,by,'90 × 40 × 12 mm',27,INK,700)
 text(30 if mobile else 620,by+32,'Native profile and extrusion depth.',16 if mobile else 18,MUTED)
 text(30 if mobile else 620,by+58,'Parallel isometric view; no perspective scaling.',15 if mobile else 17,MUTED)
 if not mobile:line(530,160,530,580)
 footer=915 if mobile else 615;line(30 if mobile else 48,footer-25,W-(30 if mobile else 48),footer-25)
 text(30 if mobile else 48,footer,'03  SAVE AND REOPEN',18,BLUE,700)
 text(30 if mobile else 48,footer+37,'.cd  →  Sketch1 + stored Extrude feature',17 if mobile else 21)
 text(30 if mobile else 48,footer+69,'STEP  →  same imported geometry bounds',17 if mobile else 21)
 text(30 if mobile else 48,footer+103,'STEP carries geometry; native .cd keeps this history.',15 if mobile else 18,MUTED)
 text(30 if mobile else 48,H-26,'Actual synthetic CAD example · no fabrication approval',14 if mobile else 17,MUTED)
 parts.append('</svg>');name='feature-chain-mobile.svg' if mobile else 'feature-chain.svg';(ROOT/name).write_text('\n'.join(parts)+'\n')
for mobile in (False,True):render(mobile)
outputs=['feature-chain.svg','feature-chain-mobile.svg','case.json'];inputs=['rectangle-extrusion.cd','rectangle-extrusion.step','render.py','replay.json']
manifest={'source_revision':case['source_revision'],'medium':'GitHub README:838px wide and324px narrow article','meaning':'Actual stored synthetic CAD geometry and feature structure, not physical measurements. No uncertainty estimate or completeCADcertification.','transforms':case['projection_note'],'files':{name:{'bytes':(ROOT/name).stat().st_size,'sha256':hashlib.sha256((ROOT/name).read_bytes()).hexdigest()} for name in inputs+outputs}}
(ROOT/'figure-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
