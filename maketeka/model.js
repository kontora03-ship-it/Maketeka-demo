import {paintBackdrop,floorAnchorY,floorShadow} from './floor.js?v=studioDepthGrid';
/* Orthographic studio renderer. Model coordinates are millimetres.
   The cover is 145 × 210 mm; +Z points out of its front face. */
const W = 145, H = 210, DEPTH = 16, R = 5.5;
const surfaceCache = new Map();
let grain;

function rgb(hex) {
  const full = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : 'ffffff';
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
}
function tint(c, coefficient, light = 0) {
  return 'rgb(' + c.map(v => Math.round(Math.max(0, Math.min(255, v * coefficient + light)))).join(',') + ')';
}
function smooth(t) { return t*t*(3-2*t); }
function hash(x,y) {
  let v = Math.imul(x+173, 0x6c8e9cf5) ^ Math.imul(y+61, 0x5bd1e995);
  v = Math.imul(v ^ (v >>> 13), 0x85ebca6b);
  return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
}
function noise(x,y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const sx = smooth(x - ix), sy = smooth(y - iy);
  const a = hash(ix,iy)*(1-sx) + hash(ix+1,iy)*sx;
  const b = hash(ix,iy+1)*(1-sx) + hash(ix+1,iy+1)*sx;
  return a*(1-sy)+b*sy;
}
function leatherGrain() {
  if (grain) return grain;
  const size = 256;
  const heights = new Float32Array(size*size);
  for (let y=0; y<size; y++) {
    for (let x=0; x<size; x++) {
      // Irregular stretched cells produce a shallow relief rather than white noise.
      const u = x*.117 + .8*noise(x*.045, y*.045);
      const v = y*.19 + .45*noise(x*.09+26, y*.065);
      const ix = Math.floor(u), iy = Math.floor(v);
      let near = Infinity, next = Infinity;
      for (let j=-1;j<=1;j++) for (let i=-1;i<=1;i++) {
        const dx = ix+i+.16+.68*hash(ix+i,iy+j)-u;
        const dy = iy+j+.16+.68*hash(ix+i+91,iy+j-38)-v;
        const d = dx*dx + dy*dy;
        if (d < near) { next=near; near=d; } else if (d < next) next=d;
      }
      heights[y*size+x] = Math.min(.24, next-near)*.9 + noise(x*.32, y*.32)*.08;
    }
  }
  const tile = document.createElement('canvas');
  tile.width = tile.height = size;
  const ctx = tile.getContext('2d'), pixels = ctx.createImageData(size,size);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const i=y*size+x, dx=heights[i]-heights[y*size+(x+1)%size];
    const dy=heights[i]-heights[((y+1)%size)*size+x];
    const luminance=Math.round(Math.max(0,Math.min(255,128+310*dx+180*dy+18*(hash(x,y)-.5))));
    pixels.data.set([luminance,luminance,luminance,255],4*i);
  }
  ctx.putImageData(pixels,0,0); grain=tile; return tile;
}
function coverSurface(hex,glossy) {
  const key=hex+(glossy?'-gloss':'-matte');
  if(surfaceCache.has(key)) return surfaceCache.get(key);
  const tex=document.createElement('canvas');
  tex.width=650; tex.height=Math.round(tex.width*H/W);
  const ctx=tex.getContext('2d'), c=rgb(hex), luma=(c[0]+c[1]+c[2])/765;
  ctx.fillStyle=tint(c,.98,2);ctx.fillRect(0,0,tex.width,tex.height);
  ctx.globalAlpha=glossy?.07:.13+luma*.06;ctx.globalCompositeOperation='hard-light';
  ctx.fillStyle=ctx.createPattern(leatherGrain(),'repeat');ctx.fillRect(0,0,tex.width,tex.height);
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  // A hinge crease follows the bound edge; the hairline and the stitches
  // deliberately remain subtle at normal viewing size.
  const crease=ctx.createLinearGradient(23,0,40,0);
  crease.addColorStop(0,'rgba(0,0,0,0)');crease.addColorStop(.37,'rgba(0,0,0,.075)');
  crease.addColorStop(.54,'rgba(255,255,255,.12)');crease.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=crease;ctx.fillRect(23,2,17,tex.height-4);
  ctx.lineWidth=1.35;ctx.strokeStyle='rgba(0,0,0,.12)';ctx.setLineDash([4,3.6]);
  ctx.beginPath();ctx.roundRect(9.5,9.5,tex.width-19,tex.height-19,19);ctx.stroke();
  if(surfaceCache.size>3) surfaceCache.delete(surfaceCache.keys().next().value);
  surfaceCache.set(key,tex); return tex;
}
function loop(w,h,r,offset=0) {
  const pts=[], a=w/2,b=h/2;
  for(const [x,y,start] of [[a-r,-b+r,-90],[a-r,b-r,0],[-a+r,b-r,90],[-a+r,-b+r,180]]) {
    for(let i=0;i<=7;i++) {
      const theta=(start+90*i/7)*Math.PI/180;
      pts.push([x+Math.cos(theta)*r+offset,y+Math.sin(theta)*r]);
    }
  }
  return pts;
}
const caseOutline=loop(W,H,R), paperOutline=loop(W-3.4,H-3.6,R-1.3,.6);
const shadowParts=[caseOutline.flatMap(([x,y])=>[[x,y,-DEPTH/2],[x,y,DEPTH/2]])];
function path(ctx,points) {
  ctx.beginPath(); ctx.moveTo(points[0][0],points[0][1]);
  for(let i=1;i<points.length;i++) ctx.lineTo(points[i][0],points[i][1]);
  ctx.closePath();
}
function polygon(ctx,points,shade) {path(ctx,points);ctx.fillStyle=shade;ctx.fill();}
function setup(width,height,options) {
  const {yaw=-.26,pitch=-.20,zoom=1}=options;
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cx=Math.cos(pitch),sx=Math.sin(pitch);
  const roll=options.roll??.125,cr=Math.cos(roll),sr=Math.sin(roll);
  const scale=Math.min(width/209,height/274)*zoom;
  const centerX=width*.5,centerY=height*.469;
  function transform(x,y,z) {
    const u=cy*x+sy*z,w=-sy*x+cy*z,v=cx*y-sx*w;
    return [cr*u-sr*v,sr*u+cr*v,sx*y+cx*w];
  }
  function project(x,y,z) {
    const p=transform(x,y,z);return [centerX+p[0]*scale,centerY+p[1]*scale];
  }
  return {transform, project, scale, zoom, visible:cy*cx>0, facing:cy*cx};
}
function sideFaces(ctx,scene,outline,z0,z1,base,pages=false) {
  const {project,transform}=scene;
  for(let i=0;i<outline.length;i++) {
    const a=outline[i],b=outline[(i+1)%outline.length],dx=b[0]-a[0],dy=b[1]-a[1];
    const len=Math.hypot(dx,dy);
    if(!len) continue;
    const n=transform(dy/len,-dx/len,0);
    if(n[2]<-.001) continue;
    const light=.66+.29*keyLight(n);
    const corners=[project(...a,z0),project(...b,z0),project(...b,z1),project(...a,z1)];
    polygon(ctx,corners,tint(base,light,9));
    if(pages) {
      ctx.save();path(ctx,corners);ctx.clip();
      ctx.lineWidth=Math.max(.36,scene.scale*.09);
      for(let z=z0+.45;z<z1;z+=.65) {
        const x=project(...a,z),y=project(...b,z);
        ctx.beginPath();ctx.moveTo(...x);ctx.lineTo(...y);
        ctx.strokeStyle='rgba(112,99,74,'+(.10+hash(Math.round(z*50),0)*.16)+')';ctx.stroke();
      }
      ctx.restore();
    }
  }
}
function cornerQuad(project,z) {
  return [[-W/2,-H/2],[W/2,-H/2],[W/2,H/2],[-W/2,H/2]].map(([x,y])=>project(x,y,z));
}
function transformFace(ctx,quad,w,h) {
  const [a,b,,d]=quad;
  ctx.transform((b[0]-a[0])/w,(b[1]-a[1])/w,(d[0]-a[0])/h,(d[1]-a[1])/h,a[0],a[1]);
}
function strap(ctx,scene,side,color) {
  const q=cornerQuad(scene.project,side*(DEPTH/2+.18));
  ctx.save();transformFace(ctx,q,W,H);ctx.beginPath();ctx.rect(0,0,W,H);ctx.clip();
  const c=rgb(color),x=W*.855,w=6.1;
  ctx.fillStyle='rgba(0,0,0,.12)';ctx.fillRect(x+.4,0,w+.4,H);
  const g=ctx.createLinearGradient(x,0,x+w,0);
  g.addColorStop(0,tint(c,.57,8));g.addColorStop(.11,tint(c,.86,12));
  g.addColorStop(.45,tint(c,.80,9));g.addColorStop(.9,tint(c,.76,8));g.addColorStop(1,tint(c,.55,8));
  ctx.fillStyle=g;ctx.fillRect(x,0,w,H);
  ctx.lineWidth=.11;ctx.strokeStyle='rgba(255,255,255,.27)';ctx.beginPath();
  for(let off=.28;off<w;off+=.4){ctx.moveTo(x+off,0);ctx.lineTo(x+off,H);}
  ctx.stroke();ctx.restore();
}
// Studio coordinates: x right, y down, z towards the viewer.
function keyLight(n) {
  return Math.max(0,-.56*n[0]-.42*n[1]+.71*n[2]);
}
function finishFace(ctx,scene,side,color,studioLight,glossy) {
  if(studioLight===0){strap(ctx,scene,side,color);return}
  const normal=scene.transform(0,0,side);
  const exposure=keyLight(normal);
  const z=side*DEPTH/2;
  const center=scene.project(0,0,z), unit=scene.scale;
  ctx.save();
  path(ctx,caseOutline.map(([x,y])=>scene.project(x,y,z)));
  ctx.clip();
  ctx.globalAlpha*=(studioLight??100)/100;
  ctx.translate(...center);
  ctx.scale(unit,unit);
  const falloff=ctx.createLinearGradient(-68,-68,68,68);
  const ambient=.07+.18*(1-exposure);
  falloff.addColorStop(0,'rgba(19,23,31,'+ambient+')');
  falloff.addColorStop(.56,'rgba(19,23,31,'+(ambient+.07)+')');
  falloff.addColorStop(1,'rgba(19,23,31,'+(ambient+.24)+')');
  ctx.fillStyle=falloff;
  ctx.fillRect(-180,-180,360,360);
  if(glossy){
    // Sample a broad studio panel in the reflected view direction.
    const nz=Math.max(0,normal[2]);
    const rx=2*nz*normal[0],ry=2*nz*normal[1],rz=2*nz*nz-1;
    const alignment=Math.max(0,-.54*rx-.36*ry+.76*rz);
    const edgeReflectance=Math.pow(1-nz,3);
    const strength=.17+.29*alignment*alignment+.10*edgeReflectance;
    ctx.translate(-18-44*rx,-20-28*ry);
    ctx.rotate(-.14);
    ctx.scale(64,170);
    const panel=ctx.createRadialGradient(0,0,0,0,0,1);
    for(const [stop,weight] of [[0,1],[.32,.96],[.56,.71],[.80,.20],[1,0]]){
      panel.addColorStop(stop,'rgba(240,244,247,'+strength*weight+')');
    }
    ctx.fillStyle=panel;ctx.fillRect(-1,-1,2,2);
  }else{
    ctx.translate(-12-65*normal[0],-16-35*normal[1]);
    ctx.rotate(.43);ctx.scale(76,175);
    const reflection=ctx.createRadialGradient(0,0,0,0,0,1);
    const strength=.012+.033*exposure;
    for(const [position,weight] of [[0,1],[.28,.91],[.55,.52],[.8,.13],[1,0]]){
      reflection.addColorStop(position,'rgba(255,251,245,'+strength*weight+')');
    }
    ctx.fillStyle=reflection;ctx.fillRect(-1,-1,2,2);
  }
  ctx.restore();
  strap(ctx,scene,side,color);
}
export function drawNotebookForeground(ctx,width,height,options={}) {
  const scene=setup(width,height,options);
  if(scene.facing>.012) finishFace(ctx,scene,1,options.cover||'#ffffff',options.studioLight,options.glossy);
}
function notebookShadow(ctx,width,height,scene,background){
  const y=floorAnchorY(width,height,scene.zoom);
  floorShadow(ctx,background,width*.5,y,scene.scale,shadowParts,scene.transform,123,scene.scale*5.4);
}
/** Returns the projected corners of the *front* printable plane, in canvas units. */
export function drawNotebook(ctx,width,height,options={}) {
  const color=options.cover||'#ffffff', c=rgb(color),s=setup(width,height,options);
  const {project,scale,visible,facing}=s;
  ctx.save();
  paintBackdrop(ctx,width,height,options);
  notebookShadow(ctx,width,height,s,options.background);
  const texture=coverSurface(color,options.glossy);
  function casing(side) {
    const z=side*DEPTH/2, zin=side*(DEPTH/2-1.55);
    sideFaces(ctx,s,caseOutline,Math.min(z,zin),Math.max(z,zin),c);
    const front=side*facing>0;
    const plane=front?z:zin;
    const outline=caseOutline.map(([x,y])=>project(x,y,plane));
    polygon(ctx,outline,tint(c,.82,4));
    if(!front || Math.abs(facing)<.007) return;
    ctx.save();path(ctx,outline);ctx.clip();
    const q=cornerQuad(project,z);transformFace(ctx,q,texture.width,texture.height);
    ctx.drawImage(texture,0,0);
    ctx.restore();
    ctx.save();path(ctx,outline);ctx.lineWidth=Math.max(.7,scale*.32);ctx.strokeStyle='rgba(255,255,255,.36)';ctx.stroke();ctx.restore();
    if(side<0 || facing<=.012) finishFace(ctx,s,side,color,options.studioLight,options.glossy);
  }
  const far=visible?-1:1;
  casing(far);
  // Ribbon extends from the foot of the paper block.
  polygon(ctx,[[-40,H/2-4,0],[-34,H/2-4,0],[-36,H/2+11,-.4],[-39,H/2+9,-.4],[-42,H/2+12,-.4]].map(p=>project(...p)),tint(c,.70,6));
  sideFaces(ctx,s,paperOutline,-6.45,6.45,[255,247,224],true);
  const frontPage=paperOutline.map(([x,y])=>project(x,y,visible?6.45:-6.45));polygon(ctx,frontPage,'#f4ead6');
  // Continuous rounded case binding closes the left side of the book.
  const spine=loop(3.1,H-1,1.5,-W/2+1.4);
  sideFaces(ctx,s,spine,-7.7,7.7,c);
  casing(-far);
  // Woven loop crosses the page block at the top and foot.
  for(const sign of [-1,1]) {
    if(s.transform(0,sign,0)[2]<=0) continue;
    const y=sign*H/2,x=W*.855-W/2;
    polygon(ctx,[[x,y,-8.1],[x+6.1,y,-8.1],[x+6.1,y,8.1],[x,y,8.1]].map(p=>project(...p)),tint(c,.72,9));
  }
  ctx.restore();
  return facing>.012?cornerQuad(project,DEPTH/2):null;
}
