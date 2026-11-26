import {paintBackdrop,floorAnchorY,floorShadow} from './floor.js?v=studioDepthGrid';

export const bagFormats={
 standard:{width:250,height:320,depth:100,loop:95},
 bottle:{width:120,height:360,depth:100,loop:77}
};

function tone(hex,light,shine=0){
 const c=parseInt(hex.slice(1),16);
 return 'rgb('+[16,8,0].map(shift=>Math.min(255,Math.round(((c>>shift)&255)*light+shine))).join(',')+')';
}

// The paper and the printed ink sample the same softbox in panel coordinates.
function softbox(ctx,normal,strength,amount,spread=.46){
 const [nx,ny,nz]=normal;
 const center=.54-(nx+.30)*1.47;
 const slope=.10+.12*ny;
 const band=ctx.createLinearGradient(center-spread,0,center+spread,slope);
 const gain=strength*amount*Math.max(0,nz);
 for(const [p,v] of [[0,0],[.15,.035],[.32,.28],[.45,.88],[.52,1],[.62,.77],[.79,.16],[1,0]]){
  band.addColorStop(p,'rgba(255,253,249,'+gain*v+')');
 }
 return band;
}

// A sphere is the circular cross section swept along the 3D cord path.
let cordBrush,brushKey;
function cordTip(color,strength){
 const key=color+'|'+strength;
 if(key===brushKey)return cordBrush;
 cordBrush??=document.createElement('canvas');
 cordBrush.width=cordBrush.height=64;
 const t=cordBrush.getContext('2d'),g=t.createRadialGradient(22,20,1,32,32,31);
 for(const [u,k,h] of [[0,1.02,19],[.36,.98,12],[.75,.83,4],[1,.65,1]]){
  g.addColorStop(u,tone(color,.85+(k-.85)*strength,h*strength));
 }
 t.fillStyle=g;t.beginPath();t.arc(32,32,31,0,Math.PI*2);t.fill();
 brushKey=key;return cordBrush;
}
let inkCanvas;
export function bagInk(mark,face,art,normal,state,resolution){
 const strength=(state.studioLight??100)/100;
 if(!mark||!strength)return mark;
 const width=Math.max(1,Math.min(mark.width,Math.ceil(resolution)));
 const height=Math.max(1,Math.round(width*mark.height/mark.width));
 inkCanvas??=document.createElement('canvas');
 if(inkCanvas.width!==width)inkCanvas.width=width;
 if(inkCanvas.height!==height)inkCanvas.height=height;
 const t=inkCanvas.getContext('2d');
 t.clearRect(0,0,width,height);t.drawImage(mark,0,0,width,height);
 const [a,b,,d]=art;
 const ax=b[0]-a[0],ay=b[1]-a[1],bx=d[0]-a[0],by=d[1]-a[1],det=ax*by-ay*bx;
 if(Math.abs(det)<1e-8)return mark;
 const local=([x,y])=>[width*((x-a[0])*by-(y-a[1])*bx)/det,height*(ax*(y-a[1])-ay*(x-a[0]))/det];
 const [o,u,,v]=face.map(local);
 t.save();t.transform(u[0]-o[0],u[1]-o[1],v[0]-o[0],v[1]-o[1],...o);
 t.globalCompositeOperation='source-atop';t.fillStyle=softbox(t,normal,strength,state.glossy?.53:.42,.35);
 t.fillRect(0,0,1,1);t.restore();
 return inkCanvas;
}

export function drawBag(ctx,w,h,state){
 const {width,height,depth,loop}=bagFormats[state.bagFormat]||bagFormats.standard;
 const X=width/2,Z=depth/2,top=-height/2+loop/2,bottom=top+height;
 const yaw=state.yaw,pitch=state.pitch,roll=state.roll??.08;
 const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll);
 const pose=state.scenePose;
 const scale=pose?.scale??(Math.min(w/(width+depth+90),h/(height+loop+95))*state.zoom);
 const floor=bottom+33,floorY=floorAnchorY(w,h,state.zoom);
 function transform(x,y,z){
  if(pose)return pose.view(x,y,z);
  const u=cy*x+sy*z,d=-sy*x+cy*z,v=cp*y-sp*d;
  return [cr*u-sr*v,sr*u+cr*v,sp*y+cp*d];
 }
 function project(p){
  const view=transform(...p);
  if(pose)return pose.project(view);
  const [x,y]=view;return [w/2+x*scale,floorY+(y-floor)*scale];
 }
 const topRing=[[-X,top,Z],[X,top,Z],[X-depth*.24,top+2,0],[X,top,-Z],[-X,top,-Z],[-X+depth*.24,top+2,0]];
 const foot=topRing.map(([x,,z])=>[Math.sign(x)*X,bottom,z]);
 const strength=(state.studioLight??100)/100;
 const panels=[];
 function panel(points,kind){
  const [a,b,c]=points,u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  const normal=transform(...n.map(x=>x/Math.hypot(...n)));
  const order=points.reduce((sum,p)=>sum+transform(...p)[2],0)/points.length;
  const f={points,normal,order,kind};panels.push(f);return f;
 }
 const broad=[0,3].map(i=>panel([topRing[i],topRing[i+1],foot[i+1],foot[i]],'broad'));
 // At the bottom of each gusset the vertical valley splits into two diagonal folds.
 for(const start of [1,4]){
  const end=(start+2)%6,m=start+1;
  const apex=[topRing[m][0],bottom-Z,0];
  panel([topRing[start],topRing[m],apex,foot[start]],'leftFold');
  panel([topRing[m],topRing[end],foot[end],apex],'rightFold');
  panel([foot[start],apex,foot[end]],'triangle');
 }
 function path(points){
  ctx.beginPath();points.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](...project(p)));ctx.closePath();
 }
 function face(f,inside){
  const [nx,ny,nz]=f.normal;
  const key=-.57*nx-.42*ny+.70*nz;
  const light=inside?.69-.13*strength*key:.85+strength*(.20*key-.08);
  const gloss=state.glossy&&!inside;
  const pixels=f.points.map(project);
  const a=pixels[0],b=pixels[1],d=pixels.at(-1);
  ctx.save();path(f.points);ctx.clip();
  // Use face-local coordinates so lighting tracks the paper through rotation.
  ctx.transform(b[0]-a[0],b[1]-a[1],d[0]-a[0],d[1]-a[1],...a);
  const fill=g=>{ctx.fillStyle=g;ctx.fillRect(-4,-4,9,9)};
  const g=ctx.createLinearGradient(0,0,0,1);
  const paper=(value)=>tone(state.cover,light*value,inside?1:2+strength*Math.max(0,key)*4);
  g.addColorStop(0,paper(inside?1.12:1.025));
  g.addColorStop(.46,paper(inside?.82:1));
  if(f.kind==='broad'){
   const fold=inside?22/height:1-Z/height;
   // A shallow bend changes the local normal over several millimetres.
   const bend=strength*(inside?.035:.069)*(-.42-ny*key);
   if(!inside){
    g.addColorStop(fold-.035,paper(.99));
    g.addColorStop(fold-.009,paper(.99+bend));
    g.addColorStop(fold+.013,paper(.99-bend));
    g.addColorStop(fold+.045,paper(.985));
   }else{
    g.addColorStop(fold-.015,paper(1.06));
    g.addColorStop(fold+.014,paper(1.06+bend));
   }
  }
  g.addColorStop(1,paper(inside?.61:.96));fill(g);
  if(!inside&&strength)fill(softbox(ctx,f.normal,strength,gloss?.50:.045));
  ctx.restore();
 }
 function base(inside){
  const key=transform(0,1,0);
  const light=inside?.55:.80+strength*.15*(-.57*key[0]-.42*key[1]+.70*key[2]);
  path(foot);ctx.fillStyle=tone(state.cover,light,2);ctx.fill();
  for(const sign of [-1,1]){
   const x=sign*X,tip=x-sign*Math.min(Z,width*.27);
   const a=project([x,bottom,0]),b=project([tip,bottom,0]);
   const g=ctx.createLinearGradient(...a,...b);
   g.addColorStop(0,tone(state.cover,light,2));
   g.addColorStop(1,tone(state.cover,light+strength*.042*sign*cy,2));
   path([[x,bottom,-Z],[tip,bottom,0],[x,bottom,Z]]);
   ctx.fillStyle=g;ctx.fill();
  }
 }
 const spread=X*.49,eyeY=top+20;
 const brush=cordTip(state.handleColor||'#343434',strength);
 function tube(curve,count,radius){
  const samples=[];
  for(let i=0;i<=count;i++){
   const point=curve(i/count);
   samples.push({p:project(point),z:transform(...point)[2]});
  }
  samples.sort((a,b)=>a.z-b.z);
  const r=radius*scale;
  for(const {p} of samples)ctx.drawImage(brush,p[0]-r,p[1]-r,2*r,2*r);
 }
 function eye(x,sign,inside){
  const z=sign*(Z+(inside?-.6:.6));
  const p=project([x,eyeY,z]),u=project([x+1,eyeY,z]),v=project([x,eyeY+1,z]);
  ctx.save();ctx.transform(u[0]-p[0],u[1]-p[1],v[0]-p[0],v[1]-p[1],...p);
  const rim=ctx.createLinearGradient(-4,-5,4,5);
  rim.addColorStop(0,tone(state.cover,1.06,25*strength));
  rim.addColorStop(.55,tone(state.cover,.89,3));
  rim.addColorStop(1,tone(state.cover,.63));
  for(const [r,paint] of [[5.6,rim],[3.4,tone(state.cover,.29,2)]]){
   ctx.beginPath();ctx.arc(0,0,r,0,2*Math.PI);ctx.fillStyle=paint;ctx.fill();
  }
  ctx.restore();
 }
 const cordRadius=2.65;
 function cordPoint(sign,t){
  const angle=Math.PI*t,lift=Math.sin(angle),rise=(loop+20)*lift;
  // The cord turns up within the eyelet and rests against the paper up to the rim.
  const offset=cordRadius*Math.min(1,Math.sqrt(rise/cordRadius));
  const bow=Math.max(0,(rise-20)/loop);
  return [-spread*Math.cos(angle),eyeY-rise,sign*(Z+offset+4*bow*bow)];
 }
 function handleShadow(sign){
  const panel=broad[sign===1?0:1];
  const key=n=>-.57*n[0]-.42*n[1]+.70*n[2];
  const incidence=key(panel.normal);
  if(!strength||incidence<=0)return;
  const lx=key(transform(1,0,0)),ly=key(transform(0,1,0));
  ctx.save();path(panel.points);ctx.clip();
  const [a,b,,d]=panel.points.map(project);
  ctx.transform((b[0]-a[0])/width,(b[1]-a[1])/width,(d[0]-a[0])/height,(d[1]-a[1])/height,...a);
  ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#272128';
  // Sample an extended softbox. Grazing rays contribute little to a lit wall.
  // Trace the contact side of the cord so its shadow starts underneath the eye.
  const exposure=strength*incidence;
  for(const [du,dv,weight] of [[0,0,.24],[-.42,-.22,.15],[.42,.22,.15],[-.24,.43,.14],[.24,-.43,.14],[-.64,.16,.09],[.64,-.16,.09]]){
   ctx.beginPath();
   for(let i=0;i<=120;i++){
    const [x,y,z]=cordPoint(sign,i/120);
    const clearance=Math.max(0,sign*z-Z-cordRadius);
    const distance=(clearance+.50*cordRadius*Math.min(1,Math.max(0,(eyeY-y)/8)))/(incidence+.40);
    ctx[i?'lineTo':'moveTo'](X+sign*(x-(lx+du)*distance),y-top-(ly+dv)*distance);
   }
   ctx.lineWidth=cordRadius*2.08;
   ctx.globalAlpha=exposure*.46*weight;ctx.stroke();
  }
  ctx.restore();
 }
 function handle(sign){
  const radius=cordRadius*scale,color=state.handleColor||'#343434',pieces=[];
  let prev;
  for(let i=0;i<=96;i++){
   const point=cordPoint(sign,i/96);
   const p=project(point),depth=transform(...point)[2];
   if(prev)pieces.push({a:prev.p,b:p,depth:(prev.depth+depth)/2});
   prev={p,depth};
  }
  ctx.save();ctx.lineWidth=radius*2;ctx.lineCap='round';
  pieces.sort((a,b)=>a.depth-b.depth);
  for(const {a,b} of pieces){
   const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
   if(len<.001)continue;
   const nx=-dy/len,ny=dx/len;
   const g=ctx.createLinearGradient(a[0]-radius*nx,a[1]-radius*ny,a[0]+radius*nx,a[1]+radius*ny);
   for(let j=0;j<=6;j++){
    const u=j/3-1,light=.7*Math.sqrt(Math.max(0,1-u*u))-u*(.55*nx+.42*ny);
    g.addColorStop(j/6,tone(color,.82+strength*.20*light,4+9*strength*Math.max(0,light)));
   }
   ctx.strokeStyle=g;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();
  }
  ctx.restore();
 }
 function knots(sign){
  for(const hand of [-1,1]){
   const x=hand*spread;
   eye(x,sign,true);
   // One continuous end runs through the eye, crosses itself, then hangs inside.
   tube(t=>{
    if(t<.18){const u=t/.18;return [x+hand*2.8*u,eyeY+1.5*u,sign*(Z-5*u)]}
    if(t<.84){
     const a=(t-.18)/.66*Math.PI*2;
     return [x+hand*(2.8*Math.cos(a)+1.3*Math.sin(2*a)),eyeY+1.5+2.8*Math.sin(a)+2.5*(t-.18)/.66,sign*(Z-5-2.2*Math.sin(2*a))];
    }
    const u=(t-.84)/.16;return [x+hand*(2.8+1.6*u),eyeY+4+6*u,sign*(Z-5-2*u)];
   },63,2.35);
  }
 }
 paintBackdrop(ctx,w,h,state);ctx.save();
 if(pose){
  const handles=[-1,1].flatMap(side=>Array.from({length:16},(_,i)=>{
   const a=cordPoint(side,i/16),b=cordPoint(side,(i+1)/16);
   return [a,b].flatMap(([x,y,z])=>[[x+cordRadius,y,z],[x-cordRadius,y,z],[x,y-cordRadius,z],[x,y+cordRadius,z],[x,y,z+cordRadius],[x,y,z-cordRadius]]);
  }));
  pose.record([[...topRing,...foot],...handles]);
 }else floorShadow(ctx,state.background,w/2,floorY,scale,[[...topRing,...foot]],transform,floor,scale*8);
 // Mask the interior at the mouth so the far wall cannot bleed onto an outer fold.
 const far=transform(0,0,1)[2]>=0?-1:1;handle(far);
 const topVisible=transform(0,-1,0)[2]>0;
 if(topVisible){
  ctx.save();path(topRing);ctx.clip();base(true);
  const innerDepth=f=>Math.max(...f.points.map(p=>transform(...p)[2]));
  panels.filter(f=>f.normal[2]<0).sort((a,b)=>innerDepth(a)-innerDepth(b)).forEach(f=>{
   face(f,true);
   if(f.kind==='broad'){ctx.save();path(f.points);ctx.clip();knots(f===broad[0]?1:-1);ctx.restore()}
  });
  ctx.restore();
 }

 const visible=panels.filter(f=>f.normal[2]>0).sort((a,b)=>a.order-b.order);
 // Fill adjoining polygons as a single path beneath the shading to prevent bright pixel seams.
 ctx.beginPath();
 for(const f of visible){
  f.points.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](...project(p)));ctx.closePath();
 }
 ctx.fillStyle=tone(state.cover,.84,2);ctx.fill();
 visible.filter(f=>f.kind!=='broad').forEach(f=>face(f,false));
 visible.filter(f=>f.kind==='broad').forEach(f=>face(f,false));
 if(transform(0,1,0)[2]>0)base(false);
 ctx.restore();
 function hardware(){
  const near=-far;
  handleShadow(near);
  for(const x of [-spread,spread])eye(x,near,false);
  handle(near);
 }
 return {hardware,front:broad[0].normal[2]>1e-6?broad[0].points.map(project):null,back:broad[1].normal[2]>1e-6?broad[1].points.map(project):null,normals:{front:broad[0].normal,back:broad[1].normal}};
}
