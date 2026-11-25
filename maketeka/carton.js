export const cartonMaterials={
 kraft:{label:'Бурый гофрокартон',surface:'#bd9768',edge:'#856441'},
 bookboard:{label:'Переплётный картон',surface:'#eeebe4',edge:'#b2a595'},
 white:{label:'Белый гофрокартон',surface:'#f5f2ec',edge:'#b29672'}
};
export const defaultCarton={length:330,depth:140,height:100,thickness:1.5,opening:0,material:'kraft',coating:''};
const wrappedBoard={...defaultCarton,material:'bookboard',thickness:2};
const cartonDefaults={
 carton:defaultCarton,
 carton0201:{...defaultCarton,style:'0201',length:320,depth:220,height:180,thickness:3,material:'white'},
 rigidBox:{...wrappedBoard,style:'rigid',length:240,depth:170,height:65,lidHeight:28,coating:'#ffffff',lidColor:'',insideColor:''},
 magneticBox:{...wrappedBoard,style:'magnetic',length:240,depth:170,height:65,coating:'#f2eee7',lidColor:'#ffffff'}
};

export function isCartonMode(mode){return Object.hasOwn(cartonDefaults,mode)}
export function freshCarton(mode){return {...cartonDefaults[mode]}}
export function cartonAllowsGloss(box){return box.material!=='kraft'}

const fluteThicknesses=[['E',1.5],['B',3],['C',4],['EB',4.5],['BC',6.7]];
const bookboardThicknesses=[[null,1.5],[null,2],[null,2.5],[null,3]];
export function cartonThicknessPresets(box){
 return box.material==='bookboard'?bookboardThicknesses:fluteThicknesses;
}

export const cartonLimits={length:[40,1200],depth:[30,900],height:[20,600],thickness:[.5,8],opening:[0,110]};

export function normalizeCarton(value,mode='carton'){
 const box=freshCarton(mode);
 for(const [key,[min,max]] of Object.entries(cartonLimits)){
  const n=value?.[key];
  if(Number.isFinite(n))box[key]=Math.max(min,Math.min(max,n));
 }
 if(box.material!=='bookboard'&&['kraft','white'].includes(value?.material))box.material=value.material;
 if(box.style==='rigid'){
  box.opening=Math.min(100,box.opening);
  if(Number.isFinite(value?.lidHeight))box.lidHeight=value.lidHeight;
  box.lidHeight=Math.min(box.height,Math.max(8,box.lidHeight));
 }
 for(const key of ['lidColor','insideColor']){
  if(Object.hasOwn(box,key)&&typeof value?.[key]==='string'&&/^#[0-9a-f]{6}$/i.test(value[key]))box[key]=value[key].toLowerCase();
 }
 if(typeof value?.coating==='string'&&(value.coating===''||/^#[0-9a-f]{6}$/i.test(value.coating)))box.coating=value.coating.toLowerCase();
 return box;
}

export function cartonSize(box){
 const t=box.thickness;
 if(box.style==='rigid'){
  const trim=4*t+2*rigidClearance(box);
  return {width:box.length+trim,depth:box.depth+trim,height:box.height+2*t};
 }
 if(box.style==='magnetic'){
  return {width:box.length+3*t,depth:box.depth+4*t+2*magneticGap(box),height:box.height+3*t+magneticGap(box)};
 }
 const wall=box.style==='0201'?2*t:4*t;
 return {width:box.length+wall,depth:box.depth+2*t,height:box.height+2*t};
}

function heightOfMagneticCover(box){return box.height+1.8*box.thickness+magneticGap(box)}
function magneticGap(box){return Math.max(.3,box.thickness*.22)}
function rigidClearance(box){return Math.max(.6,box.thickness*.35)}

// The cover keeps its original "front" key for compatibility with saved projects.
export function cartonPrintFaces(box){
 const {width,depth}=cartonSize(box);
 if(box.style==='magnetic')return {
  front:{width,height:depth-box.thickness*1.40},
  wallFront:{width,height:heightOfMagneticCover(box)},
  wallBack:{width,height:heightOfMagneticCover(box)},
  left:{width:box.depth,height:box.height+box.thickness},
  right:{width:box.depth,height:box.height+box.thickness},
  bottom:{width,height:depth}
 };
 if(box.style==='rigid'||box.style==='0201'){
  const t=box.thickness,rigid=box.style==='rigid';
  const baseWidth=rigid?box.length+2*t:width,baseDepth=rigid?box.depth+2*t:depth;
  return {
   front:{width,height:depth},
   wallFront:{width:baseWidth,height:box.height},
   wallBack:{width:baseWidth,height:box.height},
   left:{width:box.depth,height:box.height},
   right:{width:box.depth,height:box.height},
   bottom:{width:baseWidth,height:baseDepth}
  };
 }
 return {
  front:{width,height:depth},
  wallFront:{width,height:box.height},
  wallBack:{width,height:box.height},
  left:{width:box.depth,height:box.height},
  right:{width:box.depth,height:box.height-.18*box.thickness},
  bottom:{width,height:depth}
 };
}

export function buildCarton(box,face,shadow){
 const t=box.thickness,{width,depth,height}=cartonSize(box);
 const x=width/2,z=depth/2,top=-height/2,base=height/2;
 const {surface,edge}=cartonMaterials[box.material];
 const lidAngle=box.opening*Math.PI/180,co=Math.cos(lidAngle),si=Math.sin(lidAngle);
 const lid=([a,b,c])=>[a,top+b*co-c*si,-z+b*si+c*co];
 const innerX=box.length/2,innerZ=box.depth/2;
 const fade=Math.max(3,Math.min(18,.10*Math.min(box.length,box.depth,box.height)));
 const directions=[[-.49,.29],[-.22,.13],[-.68,.12],[-.38,.56],[-.21,.45]];
 const covers=[];
 const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
 const vector=(a,b)=>a.map((v,i)=>v-b[i]);
 function addCover(a,b,c){
  const u=vector(b,a),v=vector(c,a),uu=dot(u,u),vv=dot(v,v);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  const rays=directions.map(([dx,dz])=>dot([dx,-1,dz],n));
  covers.push({a,u,v,n,uu,vv,rays});
 }
 function softStep(distance){
  const f=Math.max(0,Math.min(1,(distance+fade)/(2*fade)));
  return f*f*(3-2*f);
 }
 function interiorLight([px,py,pz],isBase){
  const rise=Math.max(0,py-top-t);
  const toWall=Math.min(innerX-Math.abs(px),innerZ-Math.abs(pz));
  const contact=Math.exp(-Math.max(0,isBase?toWall:Math.min(base-t-py,Math.max(innerX-Math.abs(px),innerZ-Math.abs(pz))))/(fade*.48));
  let exposed=0;
  for(let i=0;i<directions.length;i++){
   const [dx,dz]=directions[i];
   const opening=Math.min(innerX-Math.abs(px+dx*rise),innerZ-Math.abs(pz+dz*rise));
   let passage=softStep(opening);
   if(passage>0)for(const {a,u,v,n,uu,vv,rays} of covers){
    if(Math.abs(rays[i])<1e-8)continue;
    const hit=-((px-a[0])*n[0]+(py-a[1])*n[1]+(pz-a[2])*n[2])/rays[i];
    if(hit<=0)continue;
    const point=[px+dx*hit-a[0],py-hit-a[1],pz+dz*hit-a[2]];
    const alongU=dot(point,u)/Math.sqrt(uu),alongV=dot(point,v)/Math.sqrt(vv);
    passage*=1-softStep(Math.min(alongU,Math.sqrt(uu)-alongU,alongV,Math.sqrt(vv)-alongV));
   }
   exposed+=passage;
  }
  return [.95-.10*Math.min(1,rise/box.height)-.20*contact,exposed/directions.length];
 }
 function interiorPanel(panel,color,isBase,steps=12,mapPoint=p=>p){
  const [a,b,c,d]=panel;
  const points=Array.from({length:steps+1},(_,v)=>Array.from({length:steps+1},(_,u)=>{
   const U=u/steps,V=v/steps;
   const point=mapPoint(a.map((value,i)=>(1-V)*(value+(b[i]-value)*U)+V*(d[i]+(c[i]-d[i])*U)));
   return {point,shade:interiorLight(point,isBase)};
  }));
  for(let v=0;v<steps;v++)for(let u=0;u<steps;u++){
   const patch=[points[v][u],points[v][u+1],points[v+1][u+1],points[v+1][u]];
   face(patch.map(p=>p.point),color,null,null,false,'','interior',patch.map(p=>p.shade));
  }
 }
 function board(left,right,upper,lower,back,front,axis,outerFace,printSide=null,transform=p=>p,interiorFace=null,range=[0,1],wrapColor=null){
  const a=[left,upper,back],b=[right,upper,back],c=[right,upper,front],d=[left,upper,front];
  const e=[left,lower,back],f=[right,lower,back],g=[right,lower,front],h=[left,lower,front];
  const sides=[[a,b,c,d],[e,h,g,f],[d,c,g,h],[b,a,e,f],[a,d,h,e],[c,b,f,g]];
  const broadFaces=axis==='y'?[0,1]:axis==='z'?[2,3]:[4,5];
  sides.forEach((panel,i)=>{
   if(i===interiorFace){interiorPanel(panel,surface,axis==='y');return}
   const outer=i===outerFace||outerFace==='both'&&broadFaces.includes(i);
   const side=outer?printSide:null;
   const [v0,v1]=range;
   const uv=side==='bottom'?[[0,v1],[0,v0],[1,v0],[1,v1]]:[[0,v0],[1,v0],[1,v1],[0,v1]];
   const color=wrapColor||(outer?(box.coating||surface):broadFaces.includes(i)?surface:edge);
   face(panel.map(transform),color,side?uv:null,side,false,'',outer?'exterior':broadFaces.includes(i)?'lining':'edge');
  });
 }
 if(box.material==='bookboard'){
  const magnetic=box.style==='magnetic';
  const trayX=innerX+t,trayZ=innerZ+t;
  const bodyColor=box.coating||surface,coverColor=box.lidColor||bodyColor,lining=magnetic?bodyColor:box.insideColor||surface;
  function shell(halfX,halfZ,upper,lower,opensUp,color,transform){
   const bevel=t*.32,radius=t*.85;
   const divisions=4;
   const ring=(y,inset=0)=>{
    const r=Math.max(t*.12,radius-inset);
    return [[-1,-1],[1,-1],[1,1],[-1,1]].flatMap(([sx,sz],corner)=>
     Array.from({length:divisions+1},(_,i)=>{
      const angle=Math.PI*(corner/2-1+i/(2*divisions));
      return [sx*(halfX-inset-r)+r*Math.cos(angle),y,sz*(halfZ-inset-r)+r*Math.sin(angle)];
     })
    );
   };
   const smooth=opensUp?'roundedTray':'roundedLid';
   function draw(points,finish,side=null,uv=null,fill=color,smoothing=smooth){
    face(points.map(transform),fill,uv,side,false,finish==='exterior'?smoothing:'',finish);
   }
   function bridge(a,b,drawPanel,reverse=false){
    a.forEach((point,i)=>{
     const j=(i+1)%a.length;
     const panel=[a[j],point,b[i],b[j]];
     drawPanel(reverse?panel.reverse():panel,i);
    });
   }
   const topRim=ring(upper,bevel),bottomRim=ring(lower,bevel);
   let previous=topRim;
   for(let i=1;i<=divisions;i++){
    const angle=Math.PI*i/(2*divisions);
    const next=ring(upper+bevel*(1-Math.cos(angle)),bevel*(1-Math.sin(angle)));
    bridge(previous,next,panel=>draw(panel,'exterior'));previous=next;
   }
   const bottomWall=ring(lower-bevel);
   const walls=['wallBack','right','wallFront','left'];
   bridge(previous,bottomWall,(panel,i)=>{
    const wall=walls[(i-divisions)/(divisions+1)];
    const side=opensUp&&wall&&(!magnetic||wall==='left'||wall==='right')?wall:null;
    const direction=walls.indexOf(side);
    const across=direction%2===0?halfX:halfZ-t;
    const horizontal=point=>(across+(direction<2?-1:1)*point[direction%2===0?0:2])/(2*across);
    const uv=side?panel.map(p=>[Math.max(0,Math.min(1,horizontal(p))),(p[1]-upper)/(lower-upper)]):null;
    draw(panel,'exterior',side,uv);
   });
   previous=bottomWall;
   for(let i=1;i<=divisions;i++){
    const angle=Math.PI*i/(2*divisions);
    const next=i===divisions?bottomRim:ring(lower-bevel*(1-Math.sin(angle)),bevel*(1-Math.cos(angle)));
    bridge(previous,next,panel=>draw(panel,'exterior'));previous=next;
   }
   const closed=opensUp?[...bottomRim].reverse():topRim;
   const center=[0,closed[0][1],0];
   closed.forEach((point,i)=>{
    const triangle=[center,point,closed[(i+1)%closed.length]];
    const uv=triangle.map(([px,,pz])=>[(px+halfX)/(2*halfX),(halfZ+(opensUp?-pz:pz))/(2*halfZ)]);
    // The planar cap keeps a uniform normal. Only the narrow bevel is smoothed.
    draw(triangle,'exterior',opensUp?(magnetic?null:'bottom'):'front',uv,color,'');
   });
   const mouth=ring(opensUp?upper:lower,t),floor=ring(opensUp?lower-t:upper+t,t);
   bridge(opensUp?topRim:bottomRim,mouth,panel=>draw(panel,'exterior'),opensUp);
   bridge(opensUp?mouth:floor,opensUp?floor:mouth,(panel,i)=>{
    if(opensUp)interiorPanel(panel,lining,false,i%(divisions+1)===divisions?8:1);
    else draw(panel,'lining',null,null,lining);
   },true);
   if(opensUp){
    const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx,sz])=>[sx*(halfX-t),lower-t,sz*(halfZ-t)]);
    const innerRadius=t*.12;
    const clampCorner=([px,py,pz])=>{
     const cx=Math.max(0,Math.abs(px)-(halfX-t-innerRadius));
     const cz=Math.max(0,Math.abs(pz)-(halfZ-t-innerRadius));
     const d=Math.hypot(cx,cz);
     if(d<=innerRadius)return [px,py,pz];
     const overflow=1-innerRadius/d;
     return [px-Math.sign(px)*cx*overflow,py,pz-Math.sign(pz)*cz*overflow];
    };
    interiorPanel(corners,lining,true,12,clampCorner);
   }else draw([...floor].reverse(),'lining',null,null,lining);
  }
  if(magnetic){
   const gap=magneticGap(box);
   const hingeY=top+t*.50,hingeZ=-z+t*.30,flapZ=z-t;
   const angle=box.opening*Math.PI/180;
   const flapAngle=Math.min(1,box.opening/28)*Math.PI/3;
   const rotateAt=(py,pz,a)=>{
    const c=Math.cos(a),s=Math.sin(a);
    return ([px,y,z])=>{
     const dy=y-py,dz=z-pz;
     return [px,py+dy*c-dz*s,pz+dz*c+dy*s];
    };
   };
   const turnLid=rotateAt(hingeY,hingeZ,angle);
   const hingeFlap=rotateAt(hingeY,flapZ,flapAngle);
   const turnFlap=point=>turnLid(hingeFlap(point));
   const flapTop=top+t*1.10;
   const flapBottom=flapTop+heightOfMagneticCover(box);
   const lidBack=hingeZ,lidFront=z-t*1.10;
   addCover(...[[-x,top,lidBack],[x,top,lidBack],[-x,top,lidFront]].map(turnLid));
   addCover(...[[-x,flapTop,z],[x,flapTop,z],[-x,flapBottom,z]].map(turnFlap));
   shell(trayX,trayZ,top+t+gap,base-t,true,bodyColor,p=>p);
   const wrapped=(left,right,upper,lower,back,front,axis,outer,print,transform)=>
    board(left,right,upper,lower,back,front,axis,outer,print,transform,null,[0,1],coverColor);
   wrapped(-x,x,base-t,base,-z,z,'y',1,'bottom');
   wrapped(-x,x,flapTop,flapBottom,-z,-z+t,'z',3,'wallBack');
   wrapped(-x,x,top,top+t,lidBack,lidFront,'y',0,'front',turnLid);
   wrapped(-x,x,flapTop,flapBottom,z-t,z,'z',2,'wallFront',turnFlap);
   // The flexible wrap spans the narrow gaps between the stiff panels.
   const fold=(a,b)=>{
    const panel=[a(-x),a(x),b(x),b(-x)];
    face(panel,coverColor,null,null,false,'','exterior');
    face([...panel].reverse(),coverColor,null,null,false,'','lining');
   };
   fold(px=>[px,flapTop,-z],px=>turnLid([px,top,lidBack]));
   fold(px=>turnLid([px,top,lidFront]),px=>turnFlap([px,flapTop,z]));
   shadow.push([[-x,base,-z],[x,base,-z],[x,base,z],[-x,base,z]]);
   return;
  }
  const opening=box.opening/100;
  const drift=Math.max(0,(opening-.43)/.57);
  const angle=drift*Math.PI/20,yaw=drift*Math.PI/24;
  const lift=(box.lidHeight+t)*Math.min(1,opening/.43)+drift*(box.height*.40+z*.16);
  const shift=Math.min(x*.30,28)*drift;
  const slide=([px,py,pz])=>{
   const dy=py-top;
   const tiltedY=dy*Math.cos(angle)-pz*Math.sin(angle);
   const tiltedZ=pz*Math.cos(angle)+dy*Math.sin(angle);
   return [
    px*Math.cos(yaw)+tiltedZ*Math.sin(yaw)+shift,
    top+tiltedY-lift,
    tiltedZ*Math.cos(yaw)-px*Math.sin(yaw)-shift*.64
   ];
  };
  addCover(...[[-x,top,-z],[x,top,-z],[-x,top,z]].map(slide));
  shell(trayX,trayZ,top+t,base,true,bodyColor,p=>p);
  shell(x,z,top,top+t+box.lidHeight,false,coverColor,slide);
  shadow.push([[-trayX,base,-trayZ],[trayX,base,-trayZ],[trayX,base,trayZ],[-trayX,base,trayZ]]);
  return;
 }
 if(box.style==='0201'){
  // Open the two outer flaps completely before moving the inner pair.
  const outerAngle=Math.min(110,box.opening*2)*Math.PI/180;
  const innerAngle=Math.max(0,(box.opening-55)*100/55)*Math.PI/180;
  const outerCos=Math.cos(outerAngle),outerSin=Math.sin(outerAngle);
  const innerCos=Math.cos(innerAngle),innerSin=Math.sin(innerAngle);
  const gap=Math.min(.65,t*.25),flapDepth=z-gap,innerFlap=Math.min(flapDepth,x-gap);
  const lowerFlaps=[];
  for(const sign of [-1,1]){
   const hingeZ=sign*z;
   const turn=([px,py,pz])=>{
    const localZ=pz-hingeZ;
    return [px,top+(py-top)*outerCos+sign*localZ*outerSin,hingeZ+localZ*outerCos-sign*(py-top)*outerSin];
   };
   const back=sign<0?-z:gap,front=sign<0?-gap:z;
   const range=sign<0?[0,.5-gap/depth]:[.5+gap/depth,1];
   board(-x,x,top,top+t,back,front,'y',0,'front',turn,null,range);
   addCover(...[[-x,top,back],[x,top,back],[-x,top,front]].map(turn));
   lowerFlaps.push(()=>board(-x,x,base-t,base,back,front,'y',1,'bottom',undefined,0,[1-range[1],1-range[0]]));
   const hingeX=sign*x;
   const turnInner=([px,py,pz])=>{
    const localX=px-hingeX,localY=py-top-t;
    return [hingeX+localX*innerCos-sign*localY*innerSin,top+t+localY*innerCos+sign*localX*innerSin,pz];
   };
   const left=sign<0?-x:x-innerFlap,right=sign<0?-x+innerFlap:x;
   board(left,right,top+t,top+2*t,-z+t,z-t,'y',0,null,turnInner);
   addCover(...[[left,top+t,-z+t],[right,top+t,-z+t],[left,top+t,z-t]].map(turnInner));
   lowerFlaps.push(()=>board(left,right,base-2*t,base-t,-z+t,z-t,'y',null,null,undefined,0));
  }
  for(const draw of lowerFlaps)draw();
  board(-x,x,top+t,base-t,-z,-z+t,'z',3,'wallBack',undefined,2);
  board(-x,x,top+t,base-t,z-t,z,'z',2,'wallFront',undefined,3);
  board(-x,-x+t,top+t,base-t,-z+t,z-t,'x',4,'left',undefined,5);
  board(x-t,x,top+t,base-t,-z+t,z-t,'x',5,'right',undefined,4);
  shadow.push([[-x,base,-z],[x,base,-z],[x,base,z],[-x,base,z]]);
  return;
 }
 addCover(...[[-x,0,0],[x,0,0],[-x,0,depth]].map(lid));
 board(-x,x,base-t,base,-z,z,'y',1,'bottom',undefined,0);
 board(-x,x,top+t,base-t,-z,-z+t,'z',3,'wallBack',undefined,2);
 board(-x,x,top+t,base-t,z-t,z,'z',2,'wallFront',undefined,3);
 for(const [left,right] of [[-x,-x+2*t],[x-2*t,x]]){
  const seam=t*.07;
  board(left,left+t-seam,top+t,base-t,-z+t,z-t,'x',left<0?4:null,'left',undefined,left>0?4:null);
  board(left+t+seam,right,top+1.18*t,base-t,-z+t,z-t,'x',right>0?5:null,'right',undefined,right<0?5:null);
 }
 board(-x,x,0,t,0,depth,'y',0,'front',lid);
 const clearance=.15*t,lip=Math.min(box.height*.43,44,depth*.34);
 const flangeZ=depth-2*t-clearance;
 // The front tongue clears the tray lip before following the lid hinge.
 const tuck=Math.sin(Math.min(lidAngle,Math.PI/2))*(1-Math.min(1,box.opening/35));
 const tab=([a,b,c])=>lid([a,b,c-(b-t)*tuck]);
 const inset=2*t+clearance;
 board(-x+inset,x-inset,t,t+lip,flangeZ,flangeZ+t,'z','both',null,tab);
 const dustHeight=Math.min(lip*.74,box.height*.26);
 for(const [left,right] of [[-x+inset,-x+inset+t],[x-inset-t,x-inset]]){
  board(left,right,t,t+dustHeight,depth*.19,flangeZ,'x','both',null,lid);
 }
 shadow.push([[-x,base,-z],[x,base,-z],[x,base,z],[-x,base,z]]);
}

export function cartonShadow(ctx,outline,scale,strength,background){
 const [a,b,c]=outline;
 const projectedArea=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));
 const edgeOn=projectedArea<scale*scale*40;
 const centerX=outline.reduce((sum,[x])=>sum+x,0)/outline.length;
 const bottom=Math.max(...outline.map(([,y])=>y));
 // Let the broad shadow extend past the silhouette while anchoring the base.
 const layers=[
  {x:scale*(10+21*strength),y:Math.max(6,scale*17),blur:Math.max(7,scale*15),opacity:.22+.18*strength},
  {x:scale*2,y:Math.max(2,scale*3),blur:Math.max(2,scale*4),opacity:.38+.09*strength}
 ];
 const rgb=Number.parseInt((background||'#ffffff').slice(1),16);
 const light=(.2126*(rgb>>16)+.7152*(rgb>>8&255)+.0722*(rgb&255))/255;
 if(light<.24){
  ctx.save();ctx.translate(centerX,bottom+scale*6);ctx.scale(Math.max(24,scale*90),Math.max(8,scale*22));
  const bounce=ctx.createRadialGradient(0,0,0,0,0,1);
  bounce.addColorStop(0,'rgba(255,255,255,.10)');bounce.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=bounce;ctx.fillRect(-1,-1,2,2);ctx.restore();
 }
 const pixelRatio=Math.hypot(ctx.getTransform().a,ctx.getTransform().b);
 for(const layer of layers){
  ctx.save();ctx.translate(layer.x,layer.y);
  ctx.beginPath();ctx.moveTo(...outline[0]);
  for(const point of outline.slice(1))ctx.lineTo(...point);
  ctx.closePath();ctx.filter='blur('+layer.blur*pixelRatio+'px)';
  ctx.globalAlpha*=layer.opacity;
  if(edgeOn){
   // A projected bottom becomes a line at eye level.
   ctx.lineWidth=Math.max(5,scale*12);ctx.lineJoin='round';
   ctx.strokeStyle='#17120c';ctx.stroke();
  }else{
   ctx.fillStyle='#17120c';ctx.fill();
  }
  ctx.restore();
 }
}
