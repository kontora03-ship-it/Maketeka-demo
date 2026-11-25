import {buildCarton,cartonSize,cartonShadow,isCartonMode} from './carton.js?v=magneticCenter1';
import {rasterMerch} from './merch-raster.js?v=cottonTee1';
import {buildTee} from './tee.js?v=cottonTee1';
import {floorAnchorY,floorShadow,paintBackdrop} from './floor.js?v=studioDepthGrid';
import {inside} from './geometry.js?v=logoEdit2';

export const merch={
 water:{name:'Бутылка для воды',details:'Ø 72 × 215 мм',width:36*Math.PI,height:142,accent:'Цвет крышки',span:235},
 pen:{name:'Шариковая ручка',details:'Ø 11 × 140 мм',width:82,height:5.5*Math.PI,accent:'Цвет клипа и кнопки',span:155},
 carton:{name:'Коробка FEFCO 0427',details:'330 × 140 × 100 мм'},
 carton0201:{name:'Коробка FEFCO 0201',details:'Четырёхклапанная · 320 × 220 × 180 мм'},
 rigidBox:{name:'Крышка–дно',details:'Переплётный картон с кашировкой · 240 × 170 × 65 мм'},
 magneticBox:{name:'Коробка-книжка на магнитах',details:'Переплётный картон с кашировкой · 240 × 170 × 65 мм'},
 tee:{name:'Футболка оверсайз',details:'Хлопковое джерси · Свободный крой',width:420,height:663,span:948},
 tote:{name:'Шопер',details:'380 × 420 мм',width:380,height:420,accent:'Цвет ручек',span:680}
};
const tau=2*Math.PI;
export function drawMerch(t,w,h,s,atlases={},{fixedOrbit=false}={}){
 const spec=merch[s.mode],pen=s.mode==='pen',tote=s.mode==='tote',tee=s.mode==='tee',parts=[],shadow=[],contact=[],tiles=[];
 const carton=isCartonMode(s.mode),cartonDimensions=carton?cartonSize(s.carton):null;
 const span=cartonDimensions?Math.max(Math.hypot(cartonDimensions.width,cartonDimensions.depth),cartonDimensions.height+cartonDimensions.depth)*1.14:spec.span;
 const roll=pen?-1.18:(s.roll??.06),cy=Math.cos(s.yaw),sy=Math.sin(s.yaw),cp=Math.cos(s.pitch),sp=Math.sin(s.pitch),cr=Math.cos(roll),sr=Math.sin(roll);
 let scale=Math.min(w/(span*(pen?.99:.83)),h/(span*1.13))*s.zoom;
 const floorY=tee?h*.47+scale*407:floorAnchorY(w,h,s.zoom),floor=tee?407:pen?Math.abs(cr)*72+16:tote?338:119;
 function rotate(x,y,z){const a=cy*x+sy*z,b=cy*z-sy*x,c=cp*y-sp*b;return [cr*a-sr*c,sr*a+cr*c,sp*y+cp*b]}
 let centerX=0,centerY=0;
 const cartonBounds=[Infinity,Infinity,-Infinity,-Infinity];
 let orbitTop=Infinity,orbitBottom=-Infinity,orbitRadius=0;
 function screen(v){
  if(tee)return [w/2+scale*v[0],h*.47+scale*v[1]];
  return carton
   ? [w/2+scale*(v[0]-centerX),h/2+scale*(v[1]-centerY)]
   : [w/2+scale*v[0],floorY+scale*(v[1]-floor)];
 }
 const paper=s.cover||'#ffffff',accent=s.handleColor||(tote?'#000000':'#343434'),strength=(s.studioLight??100)/100;
 const sums=new Map();
 function face(points,color,uv,side,cloth=false,smooth='',finish='',occlusion=null){
  const vs=points.map(p=>rotate(...p));
  if(fixedOrbit){
   for(const [x,y,z] of points){
    orbitTop=Math.min(orbitTop,y);
    orbitBottom=Math.max(orbitBottom,y);
    orbitRadius=Math.max(orbitRadius,Math.hypot(x,z));
   }
  }else if(carton)for(const [x,y] of vs){
   cartonBounds[0]=Math.min(cartonBounds[0],x);cartonBounds[1]=Math.min(cartonBounds[1],y);
   cartonBounds[2]=Math.max(cartonBounds[2],x);cartonBounds[3]=Math.max(cartonBounds[3],y);
  }
  const smoothGroup=tee&&(smooth==='front'||smooth==='back'||/^teeSleeve-?1$/.test(smooth))?'teeOuter':smooth;
  for(let j=1;j<vs.length-1;j++){
   const ids=[0,j,j+1],tri=ids.map(i=>vs[i]),[a,b,c]=tri;
   const u=b.map((x,i)=>x-a[i]),v=c.map((x,i)=>x-a[i]);
   const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n);
   if(len<1e-9)continue;
   const normal=n.map(x=>x/len);
   const normals=ids.map(i=>{
    if(!smooth)return normal;
    const key=smoothGroup+':'+points[i].map(v=>Math.round(v*10000)).join(',');
    if(!sums.has(key))sums.set(key,[0,0,0]);
    const sum=sums.get(key);normal.forEach((v,k)=>sum[k]+=v);return sum;
   });
   if(n[2]>1e-9)parts.push({q:carton?tri:tri.map(screen),finish,occlusion:occlusion&&ids.map(i=>occlusion[i]),z:tri.map(p=>p[2]),normals,color,uv:uv&&ids.map(i=>uv[i]),side,cloth,material:smooth,heights:tote&&ids.map(i=>points[i][1])});
  }
 }
 function box(x,y,z,W,H,D,color,cloth=false){
  const ring=[[-1,1],[1,1],[1,-1],[-1,-1]].map(([a,b])=>[x+a*W/2,y-H/2,z+b*D/2]);
  const base=ring.map(([x,,z])=>[x,y+H/2,z]);
  ring.forEach((p,i)=>{const j=(i+1)%4;face([p,ring[j],base[j],base[i]],color,null,null,cloth)});
  face([...ring].reverse(),color,null,null,cloth);face(base,color,null,null,cloth);
 }
 if(carton){
  buildCarton(s.carton,face,shadow);
  if(fixedOrbit){
   // Keep the vertical rotation axis at the center of the canvas.
   [centerX,centerY]=rotate(0,(orbitTop+orbitBottom)/2,0);
   const halfHeight=(orbitBottom-orbitTop)/2;
   const extentX=orbitRadius*Math.hypot(cr,sr*sp)+halfHeight*Math.abs(sr*cp);
   const extentY=orbitRadius*Math.hypot(sr,cr*sp)+halfHeight*Math.abs(cr*cp);
   scale=Math.min(scale,s.zoom*w*.435/extentX,s.zoom*h*.39/extentY);
  }else{
   const [left,top,right,bottom]=cartonBounds;
   centerX=(left+right)/2;centerY=(top+bottom)/2;
   scale=Math.min(scale,s.zoom*w*.87/(right-left),s.zoom*h*.78/(bottom-top));
  }
  for(const part of parts)part.q=part.q.map(screen);
 }else if(tee){
  buildTee(face,shadow,paper);
 }else if(!tote){
  const profile=pen?[[0,-70,accent],[2,-70,accent],[2.8,-69,accent],[2.8,-63,accent],[4.4,-63,'#a7abad'],[5.5,-61,paper],[5.5,-48,paper],[5.5,34,paper],[5.1,47,paper],[4.8,49,'#989da0'],[1.1,67,'#bfc2c3'],[.55,70,'#424242'],[0,70.3,'#424242']]:
  [[0,-107.5,accent],[20,-107.5,accent],[22,-105.5,accent],[22,-89,accent],[21,-87,accent],[17,-86,paper],[17,-80,paper],[20,-76,paper],[29,-70,paper],[34,-64,paper],[36,-55,paper],[36,87,paper],[35.8,100,paper],[34,105,paper],[31,107.5,paper],[0,107.5,paper]];
  const N=96;
  for(let j=1;j<profile.length;j++){
   const [r0,y0]=profile[j-1],[r1,y1,color]=profile[j];
   const printable=pen?y0===-48:y0===-55;
   const ring=[];
   for(let i=0;i<N;i++){
    const angle=i*tau/N-Math.PI/2,next=angle+tau/N;
    const point=(r,y,a)=>[r*Math.sin(a),y,r*Math.cos(a)];
    const q=[point(r0,y0,angle),point(r0,y0,next),point(r1,y1,next),point(r1,y1,angle)];
    ring.push(q[0],q[2]);
    const u=i%(N/2)/(N/2),v=u+2/N;
    const uv=pen?[[0,1-u],[0,1-v],[1,1-v],[1,1-u]]:[[u,0],[v,0],[v,1],[u,1]];
    face(r0===0?[q[0],q[2],q[3]]:q,color,printable?uv:null,i<N/2?'front':'back',false,(y0===y1?'cap'+j:'shell'+color));
   }
   shadow.push(ring);
  }
  if(pen){
   box(0,-60.8,-5.8,2.4,2.7,4.4,accent);
   const clip=(a,y,width,thickness)=>[width*Math.sin(a),y,-7.2+thickness*Math.cos(a)];
   const sections=[[-62.3,.1,.1],[-61.7,1.25,.7],[-60.4,1.45,.85],[-35,1.32,.75],[-33,1.05,.65],[-32,.1,.1]];
   for(let j=1;j<sections.length;j++)for(let i=0;i<24;i++){
    const a=i*tau/24,b=(i+1)*tau/24;
    face([clip(a,...sections[j-1]),clip(b,...sections[j-1]),clip(b,...sections[j]),clip(a,...sections[j])],accent,null,null,false,'clip');
   }
  }
 }else{
  const Y=-98,H=420;
  // Each fabric panel has its own shallow folds. Centers drift across the
  // panel as the folds spread away from the points where the fabric gathers.
  const frontFolds=[
   {u:.22,v:.23,width:.065,length:.22,slant:-.24,depth:6.8},
   {u:.17,v:.75,width:.085,length:.22,slant:.31,depth:-5.4},
   {u:.78,v:.56,width:.10,length:.28,slant:.17,depth:6.2},
   {u:.59,v:.87,width:.12,length:.13,slant:-.60,depth:-4.8}
  ];
  const backFolds=[
   {u:.30,v:.40,width:.095,length:.29,slant:.31,depth:-7.4},
   {u:.13,v:.68,width:.085,length:.20,slant:-.36,depth:5.8},
   {u:.83,v:.26,width:.10,length:.20,slant:-.32,depth:7.8},
   {u:.71,v:.77,width:.09,length:.19,slant:.62,depth:6.5},
   {u:.88,v:.86,width:.065,length:.12,slant:-.55,depth:-4.0}
  ];
  function clothPoint(u,v,side){
   const edge=Math.abs(2*u-1),across=Math.sin(Math.PI*u);
   const x=(u-.5)*(380-12*v);
   const sag=across*(side===1?6-3*u:3+5*u);
   const y=Y+H*v+sag*(1-v)-10*v*Math.pow(edge,9);
   let foldDepth=0;
   for(const fold of side===1?frontFolds:backFolds){
    const down=v-fold.v;
    const acrossFold=(u-fold.u-fold.slant*down)/fold.width;
    foldDepth+=fold.depth*Math.exp(-(acrossFold**2)-(down/fold.length)**2);
   }
   const fullness=8*across*Math.sin(Math.PI*v);
   return [side*x,y,side*(39+fullness+foldDepth*(.32+.68*across))];
  }
  const columns=48,rows=24,levels=[0,.025,...Array.from({length:rows},(_,i)=>(i+1)/rows)];
  const lining=tintHex(paper,.77),hem=tintHex(paper,.98);
  function innerPoint(u,v,side){
   const [x,y,z]=clothPoint(u,v,side);
   return [x*(1-10/(380-12*v)),y-4*v,z-side*5];
  }
  for(const side of [1,-1]){
   const panel=[];
   const name=side===1?'front':'back';
   for(let i=0;i<columns;i++){
    const l=i/columns,r=(i+1)/columns;
    for(let j=1;j<levels.length;j++){
     const top=levels[j-1],bottom=levels[j],uv=[[l,top],[r,top],[r,bottom],[l,bottom]];
     const q=uv.map(([u,v])=>clothPoint(u,v,side));
     if(j===1||j===levels.length-1)panel.push(...q);
     if(j===levels.length-1)contact.push(q[2],q[3]);
     face(q,paper,uv,name,true,name);
     face([...uv].reverse().map(([u,v])=>innerPoint(u,v,side)),j===1?hem:lining,null,null,true,'inside'+name);
    }
    face([clothPoint(r,0,side),clothPoint(l,0,side),innerPoint(l,0,side),innerPoint(r,0,side)],hem,null,null,true,'rim'+name);
   }
   shadow.push(panel);
   for(let j=1;j<levels.length;j++){
    const top=levels[j-1],bottom=levels[j];
    const corners=[[1,top,side],[0,top,-side],[0,bottom,-side],[1,bottom,side]];
    face(corners.map(p=>clothPoint(...p)),paper,null,null,true,'gusset'+side);
    face(corners.reverse().map(p=>innerPoint(...p)),j===1?hem:lining,null,null,true,'innerGusset'+side);
   }
   face([clothPoint(0,0,-side),clothPoint(1,0,side),innerPoint(1,0,side),innerPoint(0,0,-side)],hem);
   const mountZ=x=>clothPoint(.5+side*x/380,.04,side)[2]+side*2;
   function strapEdges(t){
    const sn=Math.sin(t),cs=Math.cos(t),x=-side*78*cs;
    const center=[x,Y+6-216*sn,mountZ(x)+side*12*sn*sn];
    // Rotate the width axis from the sewn tab into depth over the crown.
    const dx=side*78*sn,dy=-216*cs,len=Math.hypot(dx,dy);
    const width=[dy/len*cs,-dx/len*cs,side*sn];
    return [-1,1].map(k=>center.map((v,i)=>v+k*12*width[i]));
   }
   for(let i=0;i<64;i++){
    const [a,b]=strapEdges(i*Math.PI/64),[d,c]=strapEdges((i+1)*Math.PI/64);
    const q=[a,b,c,d];
    const inner=q.map(([x,y,z],k)=>[x,y+.85*Math.sin(Math.PI*(i+(k>=2?1:0))/64),z-side*1.3]);
    face([a,d,inner[3],inner[0]],accent,null,null,true,'strapEdgeL'+side);
    face([b,inner[1],inner[2],c],accent,null,null,true,'strapEdgeR'+side);
    face(q,accent,null,null,true,'strap'+side);
    face(inner.reverse(),tintHex(accent,.81),null,null,true,'strapInner'+side);
   }
   for(const k of [-1,1]){
    const x=k*78,mount=mountZ(x);
    box(x,Y+20,mount,24,30,2,accent,true);
    for(const slope of [-1,1]){
     const z=mount+side*1.15;
     const stitch=[[x-8,Y+20-slope*10,z],[x-7.2,Y+20-slope*10,z],[x+8,Y+20+slope*10,z],[x+7.2,Y+20+slope*10,z]];
     face(stitch,accent,null,null,true);face([...stitch].reverse(),accent,null,null,true);
    }
   }
  }
  for(let i=0;i<columns;i++){
   const l=i/columns,r=(i+1)/columns;
   const corners=[[l,1,1],[r,1,1],[1-r,1,-1],[1-l,1,-1]];
   face(corners.map(p=>clothPoint(...p)),paper);
   face(corners.reverse().map(p=>innerPoint(...p)),lining,null,null,true,'innerBase');
  }
 }
 paintBackdrop(t,w,h,s);
 if(carton){
  cartonShadow(t,shadow[0].map(p=>screen(rotate(...p))),scale,strength,s.background);
 }else if(tee){
  floorShadow(t,s.background,w/2,floorY,scale,shadow,rotate,floor,scale*27,{opacity:.77,bounce:false});
 }else if(tote){
  floorShadow(t,s.background,w/2,floorY,scale,shadow,rotate,floor,scale*15,{opacity:.52+.24*strength});
  floorShadow(t,s.background,w/2,floorY,scale,[contact],rotate,floor,scale*5,{opacity:.38+.17*strength,bounce:false});
 }else floorShadow(t,s.background,w/2,floorY,scale,shadow,rotate,floor,scale*span*.019);
 const lit=new Map();
 for(const f of parts){
  f.light=f.normals.map((n,i)=>{
   if(!lit.has(n)){
    const length=Math.hypot(...n)||1,[nx,ny,nz]=n.map(x=>x/length);
    if(carton){
     const key=Math.max(0,-.48*nx-.82*ny+.31*nz);
     const fill=Math.max(0,.71*nx-.26*ny+.65*nz);
     const bounce=Math.max(0,.34*nx+.76*ny+.42*nz);
     const softbox=Math.max(0,-.31*nx-.45*ny+.837*nz);
     lit.set(n,[.83+strength*(.28*key+.14*fill+.07*bounce-.18),strength*softbox**3]);
    }else if(tee||tote){
     const key=Math.max(0,-.77*nx-.42*ny+.48*nz);
     const fill=Math.max(0,.65*nx-.21*ny+.73*nz);
     const sheen=Math.exp(-5*(nx+.45)**2-3*(ny+.25)**2)*Math.max(0,nz);
     lit.set(n,tee?[.83+strength*(.175*key+.14*fill+.045*Math.max(0,ny)-.125),sheen*strength*.25]:[.77+strength*(.44*key+.12*fill-.18),sheen*strength]);
    }else lit.set(n,[.81+strength*(.21*(-.55*nx-.48*ny+.7*nz)-.04),
     Math.exp(-19*(nx+.32)**2-2*(ny+.16)**2)*Math.max(0,nz)*strength]);
   }
   const light=lit.get(n);
   if(carton){
    const shade=f.occlusion?.[i];
    const cavity=shade?shade[0]*(.91+strength*(.27*shade[1]-.23)):f.finish==='lining'?.91:f.finish==='edge'?.96:1;
    return [light[0]*cavity,f.finish==='exterior'?light[1]:0];
   }
   if(tee&&f.uv){
    const [u,v]=f.uv[i];
    const sleeveOcclusion=Math.exp(-((Math.min(u,1-u)/.108)**2)-(((v-.37)/.19)**2));
    const collarOcclusion=Math.exp(-(((u-.5)/.18)**4)-(((v-.034)/.039)**2));
    return [light[0]*(1-.24*sleeveOcclusion-.085*collarOcclusion),light[1]];
   }
   if(!tote)return light;
   let occlusion=1;
   if(f.material.startsWith('inside')||f.material.startsWith('inner')){
    const depth=Math.max(0,Math.min(1,(f.heights[i]+98)/145));
    occlusion=.96-.37*depth;
   }else if(f.uv){
    const [u,v]=f.uv[i],mountDistance=Math.min(Math.abs(u-.295),Math.abs(u-.705));
    const tabShadow=Math.exp(-((mountDistance/.057)**2)-(((v-.055)/.075)**2));
    const edgeShadow=Math.exp(-Math.min(u,1-u)/.023);
    occlusion=1-.18*tabShadow-.07*edgeShadow-.12*v**5;
   }
   return [light[0]*occlusion,light[1]*occlusion];
  });
  if(!f.uv)continue;
  const [a,b,d]=f.q,[o,u,v]=f.uv;
  const ux=u[0]-o[0],uy=u[1]-o[1],vx=v[0]-o[0],vy=v[1]-o[1],det=ux*vy-uy*vx;
  const A=((b[0]-a[0])*vy-(d[0]-a[0])*uy)/det,B=((b[1]-a[1])*vy-(d[1]-a[1])*uy)/det;
  const C=((d[0]-a[0])*ux-(b[0]-a[0])*vx)/det,D=((d[1]-a[1])*ux-(b[1]-a[1])*vx)/det;
  const E=a[0]-A*o[0]-C*o[1],F=a[1]-B*o[0]-D*o[1];
  tiles.push({q:f.q,uv:f.uv,side:f.side,mapping:{map:(x,y)=>[A*x+C*y+E,B*x+D*y+F],inverse:(x,y)=>[(D*(x-E)-C*(y-F))/(A*D-B*C),(A*(y-F)-B*(x-E))/(A*D-B*C)]}});
 }
 rasterMerch(t,w,h,parts,atlases,s);
 return tiles;
}
function tintHex(hex,k){return '#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*k).toString(16).padStart(2,'0')).join('')}
export function merchProjection(tiles,side){
 const group=tiles.filter(t=>t.side===side);
 if(!group.length)return null;
 function closest(distance){let best=group[0],min=Infinity;for(const tile of group){const d=distance(tile);if(d<min){min=d;best=tile}}return best}
 return {map(u,v){
  const tile=group.find(t=>t.uv.every(([x,y],i)=>{const b=t.uv[(i+1)%3];return (b[0]-x)*(v-y)-(b[1]-y)*(u-x)>=-1e-10}))||closest(t=>{const xs=t.uv.map(p=>p[0]),ys=t.uv.map(p=>p[1]);return Math.max(0,Math.min(...xs)-u,u-Math.max(...xs),Math.min(...ys)-v,v-Math.max(...ys))});
  return tile.mapping.map(u,v);
 },inverse(x,y){
  const tile=closest(t=>{if(inside([x,y],t.q))return 0;return Math.min(...t.q.map(p=>Math.hypot(x-p[0],y-p[1])))});
  return tile.mapping.inverse(x,y);
 },contains:p=>group.some(t=>inside(p,t.q))};
}
