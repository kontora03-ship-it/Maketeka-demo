import {paintBackdrop,floorAnchorY,floorShadow} from './floor.js?v=studioDepthGrid';
import {texture,sample} from './texture.js';
// Dimensions in mm. Y points up and the handle lies on the positive X axis.
const TAU=2*Math.PI,R=40,H=80,BASE_Y=-47;
export const printWidth=TAU*R;
const mesh=[],norm=(x,y,z)=>{const l=Math.hypot(x,y,z)||1;return [x/l,y/l,z/l]};
function grid(rows,cols,vertex){
 for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
  const a=vertex(j,i),b=vertex(j,i+1),c=vertex(j+1,i+1),d=vertex(j+1,i);
  mesh.push(...a,...b,...c,...a,...c,...d);
 }
}
const profile=[[0,BASE_Y],[33,BASE_Y],[36,-46],[38.5,-44],[39.7,-41],[40,-40],[40,40],[40,46],[39.8,47.2],[39,48],[38,48.3],[37,48],[36.4,47],[36.1,45],[36.1,-39],[35,-41],[32,-42],[0,-42]];
grid(profile.length-1,96,(j,i)=>{
 const [r,y]=profile[j],a=i*TAU/96,prev=profile[Math.max(0,j-1)],next=profile[Math.min(profile.length-1,j+1)];
 const [nx,ny]=norm(next[1]-prev[1],prev[0]-next[0],0);
 return [r*Math.sin(a),y,r*Math.cos(a),nx*Math.sin(a),ny,nx*Math.cos(a),j>=5&&j<=6?1:0];
});
function handleVertex(j,i){
 const a=j*Math.PI/64,b=i*TAU/20, x=37+32*Math.sin(a), y=27*Math.cos(a);
 const [nx,ny]=norm(27*Math.sin(a),32*Math.cos(a),0);
 return [x+6*nx*Math.cos(b),y+6*ny*Math.cos(b),7*Math.sin(b),nx*Math.cos(b),ny*Math.cos(b),Math.sin(b),0];
 }
grid(64,20,handleVertex);
const bodyPoints=[];
for(const [radius,y] of profile.slice(0,11)){
 for(let i=0;i<40;i++){const a=i*TAU/40;bodyPoints.push([radius*Math.sin(a),y,radius*Math.cos(a)])}
}
const shadowParts=[bodyPoints];
for(let j=0;j<64;j+=4){
 const segment=[];
 for(const row of [j,j+4])for(let i=0;i<20;i+=2)segment.push(handleVertex(row,i).slice(0,3));
 shadowParts.push(segment);
}
function mugShadow(ctx,s,x,y,scale,softness,floorHeight){
 const c=Math.cos(s.yaw),a=Math.sin(s.yaw),v=Math.cos(s.pitch),b=Math.sin(s.pitch);
 const cr=Math.cos(s.roll||0),sr=Math.sin(s.roll||0);
 function transform(X,Y,Z){
   const right=c*X+a*Z,z=-a*X+c*Z,down=-(v*Y+b*z);
   return [cr*right-sr*down,sr*right+cr*down,-b*Y+v*z];
 }
 floorShadow(ctx,s.background,x,y,scale,shadowParts,transform,floorHeight,softness);
}
const vertex='attribute vec3 pos,normal;attribute float ink;uniform vec2 scale,shift;uniform mat3 orientation;varying vec3 n,p;varying float printable;void main(){vec3 v=orientation*pos;n=orientation*normal;p=pos;printable=ink;gl_Position=vec4(v.xy*scale+shift,-v.z/130.,1.);}';
const fragment=`precision highp float;
varying vec3 n,p;varying float printable;
uniform vec3 cover;uniform vec4 placement;uniform vec3 settings;uniform float repeatLogo;uniform float glossyFinish;uniform sampler2D art;
void main(){
 vec3 N=normalize(n), L=normalize(vec3(-.55,.85,.8));
 vec3 color=cover;float coverage=0.;
 float u=fract(atan(p.x,p.z)/6.2831853+.75),v=.5-p.y/80.;
 float dx=fract(u-placement.x+.5)-.5;
 if(repeatLogo>.5)dx=fract(2.*dx+.5)*.5-.25;
 float dy=(v-placement.y)/3.14159265,a=placement.w;
 vec2 uv=vec2((cos(a)*dx+sin(a)*dy)/placement.z,(-sin(a)*dx+cos(a)*dy)/(placement.z*settings.x))+.5;
 if(printable>.999 && u>.037 && u<.963 && min(uv.x,uv.y)>=0. && max(uv.x,uv.y)<=1.){
 vec4 mark=texture2D(art,uv);coverage=mark.a*settings.y;color=mix(color,mark.rgb,coverage);
 }
 float cavity=clamp((45.-p.y)/75.,0.,1.)*(1.-smoothstep(36.2,37.2,length(p.xz)))*smoothstep(-45.,-41.,p.y);
 float diffuse=.65-.23*cavity+.37*max(0.,dot(N,L))+.05*N.y;
 // Elongated softbox and a softer opposing rim, reflected by the glaze.
 vec2 strip=(N.xy-vec2(-.32,.12))*mix(vec2(2.6,1.1),vec2(7.4,1.7),glossyFinish);
 float spec=mix(.15,.76,glossyFinish)*exp(-dot(strip,strip))+mix(.025,.12,glossyFinish)*exp(-55.*(N.x-.80)*(N.x-.80));
 float gloss=spec*max(0.,N.z);
 vec2 inkStrip=(N.xy-vec2(-.32,.12))*vec2(6.5,1.6);
 gloss+=coverage*mix(.43,.19,glossyFinish)*exp(-dot(inkStrip,inkStrip))*max(0.,N.z)*(1.-gloss);
 vec3 neutral=color*(.88+.12*max(0.,N.z));
 gl_FragColor=vec4(mix(neutral,mix(color*diffuse,vec3(1.,.99,.97),gloss),settings.z),1.);
}`;
let scene;
function init(){
 const canvas=document.createElement('canvas'),g=canvas.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:true});
 if(!g)return {canvas,software:true};
 const program=g.createProgram();
 for(const [kind,src] of [[g.VERTEX_SHADER,vertex],[g.FRAGMENT_SHADER,fragment]]){
  const sh=g.createShader(kind);g.shaderSource(sh,src);g.compileShader(sh);
  if(!g.getShaderParameter(sh,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(sh));
  g.attachShader(program,sh);
 }
 g.linkProgram(program);if(!g.getProgramParameter(program,g.LINK_STATUS))throw Error(g.getProgramInfoLog(program));g.useProgram(program);
 g.bindBuffer(g.ARRAY_BUFFER,g.createBuffer());g.bufferData(g.ARRAY_BUFFER,new Float32Array(mesh),g.STATIC_DRAW);
 for(const [key,size,offset] of [['pos',3,0],['normal',3,12],['ink',1,24]]){
 const loc=g.getAttribLocation(program,key);g.enableVertexAttribArray(loc);g.vertexAttribPointer(loc,size,g.FLOAT,false,28,offset);}
 g.bindTexture(g.TEXTURE_2D,g.createTexture());for(const k of [g.TEXTURE_MIN_FILTER,g.TEXTURE_MAG_FILTER])g.texParameteri(g.TEXTURE_2D,k,g.LINEAR);
 for(const k of [g.TEXTURE_WRAP_S,g.TEXTURE_WRAP_T])g.texParameteri(g.TEXTURE_2D,k,g.CLAMP_TO_EDGE);
 g.texImage2D(g.TEXTURE_2D,0,g.RGBA,1,1,0,g.RGBA,g.UNSIGNED_BYTE,new Uint8Array(4));g.enable(g.DEPTH_TEST);
 return {canvas,g,loc:key=>g.getUniformLocation(program,key)};
}
export function mugView(w,h,s){
 // Keep editor framing relative to the previous field height at every aspect ratio.
 const frameHeight=s.mobileEditor?h/1.2:h;
 const scale=Math.min(w/159,frameHeight/143)*s.zoom*(s.mobileEditor?.85:1);
 const k=Math.cos(s.pitch),t=Math.sin(s.pitch);
 const cx=s.whiteBackdrop?w*.5:w*.5-8*scale*Math.cos(s.yaw);
 const shadowY=floorAnchorY(w,h,s.floorZoom??s.zoom);
 const floorHeight=s.grounded?-BASE_Y*k:63;
 const cy=shadowY-(floorHeight+(s.lift??0))*scale;
 if(s.scenePose)return {scale:s.scenePose.scale,cx:w/2,cy:h/2};
 // The floor anchor is set once in camera space, independently of the orbit.
 const shadowX=w*.5;
 const softness=Math.min(w/209,h/274)*(s.floorZoom??s.zoom)*5.4;
 return {scale,cx,cy,shadowX,shadowY,softness,floorHeight,map(u,v){
   const angle=(u-.75)*TAU+s.yaw;
   const seam=((u%1)+1)%1;
   if(Math.cos(angle)<=0 || seam<.037 || seam>.963 || v<0 || v>1)return null;
   return [cx+scale*R*Math.sin(angle),cy-scale*(k*(.5-v)*H+t*R*Math.cos(angle))];
 },inverse(X,Y){
 const a=Math.asin(Math.max(-1,Math.min(1,(X-cx)/(scale*R))));
 return [((a-s.yaw)/TAU+.75+10)%1,.5-((cy-Y)/scale-t*R*Math.cos(a))/(k*H)];
 }};
}
function mugSceneMatrix(pose){
 return [[1,0,0],[0,-1,0],[0,0,1]].flatMap(axis=>{
  const [x,y,z]=pose.view(...axis);
  return [x,-y,z];
 });
}
export function drawMug(ctx,w,h,s,bitmap,output=false){
 scene??=init();const {g,canvas,loc}=scene,{scale,cx,cy,shadowX,shadowY,softness,floorHeight}=mugView(w,h,s);
 if(s.scenePose)s.scenePose.record(shadowParts.map(part=>part.map(([x,y,z])=>[x,-y,z])));
 if(scene.software){paintSoftware(ctx,w,h,s,bitmap,output);return}
 const d=Math.min(ctx.getTransform().a||1,2),W=Math.round(w*d),height=Math.round(h*d);
 if(canvas.width!==W||canvas.height!==height){canvas.width=W;canvas.height=height}
 g.viewport(0,0,W,height);g.clearColor(0,0,0,0);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);
 if(bitmap&&scene.bitmap!==bitmap){g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,bitmap);scene.bitmap=bitmap}
 g.uniform2f(loc('scale'),2*scale/w,2*scale/h);g.uniform2f(loc('shift'),2*cx/w-1,1-2*cy/h);
 const c=Math.cos(s.yaw),a=Math.sin(s.yaw),v=Math.cos(s.pitch),b=Math.sin(s.pitch);
 const orientation=s.scenePose?mugSceneMatrix(s.scenePose):[c,-b*a,-v*a,0,v,-b,a,b*c,v*c];
 g.uniformMatrix3fv(loc('orientation'),false,orientation);const color=parseInt(s.cover.slice(1),16);
 g.uniform3f(loc('cover'),(color>>16)/255,((color>>8)&255)/255,(color&255)/255);
 g.uniform4f(loc('placement'),s.x,s.y,s.width,s.angle*Math.PI/180);
 g.uniform3f(loc('settings'),bitmap?bitmap.height/bitmap.width:1,bitmap?s.opacity/100*(1-.07*s.intensity/100):0,(s.studioLight??100)/100);
 g.uniform1f(loc('glossyFinish'),s.glossy===false?0:1);
 g.uniform1f(loc('repeatLogo'),s.bothSides?1:0);g.drawArrays(g.TRIANGLES,0,mesh.length/7);
 paintBackdrop(ctx,w,h,s);ctx.save();
 if(!s.scenePose)mugShadow(ctx,s,shadowX,shadowY,scale,softness,floorHeight);ctx.restore();compositeMesh(ctx,canvas,w,h,s);
}

// Rasterize the same geometry with depth testing on devices without WebGL.
function paintSoftware(ctx,w,h,s,bitmap,output){
 const canvas=scene.canvas,k=output?1:Math.min(1,1800/Math.max(w,h));
 const W=Math.max(1,Math.round(w*k)),height=Math.max(1,Math.round(h*k));
 if(canvas.width!==W||canvas.height!==height){canvas.width=W;canvas.height=height}
 const t=canvas.getContext('2d'),frame=t.createImageData(W,height),out=frame.data;
 const depth=new Float32Array(W*height);depth.fill(-Infinity);
 const {scale,cx,cy,shadowX,shadowY,softness,floorHeight}=mugView(W,height,s),c=Math.cos(s.yaw),a=Math.sin(s.yaw),v=Math.cos(s.pitch),b=Math.sin(s.pitch);
 const col=parseInt(s.cover.slice(1),16),rgb=[col>>16,(col>>8)&255,col&255];
 const tex=bitmap?texture(bitmap,scale*printWidth*s.width):null;
 const strength=(s.studioLight??100)/100;
 const glaze=[255,252.45,247.35];
 const ink=new Uint8ClampedArray(4);
 const cs=Math.cos(s.angle*Math.PI/180),sn=Math.sin(s.angle*Math.PI/180),alpha=s.opacity/100*(1-.07*s.intensity/100);
 function vertex(i){
  const x=mesh[i],y=mesh[i+1],z=mesh[i+2],nz=-a*mesh[i+3]+c*mesh[i+5],rz=-a*x+c*z;
  let nx=c*mesh[i+3]+a*mesh[i+5],ny=v*mesh[i+4]+b*nz,nZ=-b*mesh[i+4]+v*nz;
  let position=[c*x+a*z,-(v*y+b*rz),-b*y+v*rz];
  if(s.scenePose){
   position=s.scenePose.view(x,-y,z);
   const normal=s.scenePose.view(mesh[i+3],-mesh[i+4],mesh[i+5]);
   [nx,ny,nZ]=[normal[0],-normal[1],normal[2]];
  }
  const dot=(-.55*nx+.85*ny+.8*nZ)/Math.hypot(.55,.85,.8);
  const glossy=s.glossy!==false;
  const stripX=(nx+.32)*(glossy?7.4:2.6),stripY=(ny-.12)*(glossy?1.7:1.1);
  const gloss=((glossy?.76:.15)*Math.exp(-stripX*stripX-stripY*stripY)+(glossy?.12:.025)*Math.exp(-55*(nx-.80)**2))*Math.max(0,nZ);
  const neutral=.88+.12*Math.max(0,nZ);
  const fade=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};
  const cavity=Math.max(0,Math.min(1,(45-y)/75))*(1-fade(Math.hypot(x,z)-36.2))*fade((y+45)/4);
  const lit=.65-.23*cavity+.37*Math.max(0,dot)+.05*ny;
  return [cx+scale*position[0],cy+scale*position[1],position[2],
    neutral*(1-strength)+lit*(1-gloss)*strength,gloss*strength,x,y,z,mesh[i+6],(glossy?.19:.43)*(1-gloss)*Math.exp(-(((nx+.32)*6.5)**2)-((ny-.12)*1.6)**2)*Math.max(0,nZ)*strength];
 }
 for(let i=0;i<mesh.length;i+=21){
  const A=vertex(i),B=vertex(i+7),C=vertex(i+14);
  const dx=B[0]-A[0],dy=B[1]-A[1],ex=C[0]-A[0],ey=C[1]-A[1],det=dx*ey-dy*ex;
  if(Math.abs(det)<1e-7)continue;
  const left=Math.max(0,Math.floor(Math.min(A[0],B[0],C[0]))),right=Math.min(W,Math.ceil(Math.max(A[0],B[0],C[0])));
  const top=Math.max(0,Math.floor(Math.min(A[1],B[1],C[1]))),bottom=Math.min(height,Math.ceil(Math.max(A[1],B[1],C[1])));
  const printable=bitmap&&A[8]&&B[8]&&C[8];
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
   const X=x+.5-A[0],Y=y+.5-A[1],f=(X*ey-Y*ex)/det,g=(dx*Y-dy*X)/det,l=1-f-g;
   if(Math.min(f,g,l)<-1e-7)continue;
   const id=y*W+x,z=l*A[2]+f*B[2]+g*C[2];if(z<=depth[id])continue;depth[id]=z;
   const shade=l*A[3]+f*B[3]+g*C[3],gloss=l*A[4]+f*B[4]+g*C[4];
   let mix=0;
   if(printable){
    const u=(Math.atan2(l*A[5]+f*B[5]+g*C[5],l*A[7]+f*B[7]+g*C[7])/TAU+1.75)%1;
    let du=(u-s.x+1.5)%1-.5; if(s.bothSides)du=(du+1.25)%.5-.25;
    const dv=(.5-(l*A[6]+f*B[6]+g*C[6])/H-s.y)/Math.PI;
    const U=.5+(cs*du+sn*dv)/s.width,V=.5+(-sn*du+cs*dv)*bitmap.width/(s.width*bitmap.height);
    if(u>.037&&u<.963&&U>=0&&U<1&&V>=0&&V<1){sample(tex,U,V,ink,0);mix=alpha*ink[3]/255}
   }
   const inkGloss=mix*(l*A[9]+f*B[9]+g*C[9]);
   for(let channel=0;channel<3;channel++){let base=rgb[channel];if(mix)base+=(ink[channel]-base)*mix;out[id*4+channel]=base*(shade-inkGloss)+glaze[channel]*(gloss+inkGloss)}
   out[id*4+3]=255;
  }
 }
 t.putImageData(frame,0,0);paintBackdrop(ctx,w,h,s);ctx.save();
 if(!s.scenePose)mugShadow(ctx,s,shadowX/k,shadowY/k,scale/k,softness/k,floorHeight);ctx.restore();compositeMesh(ctx,canvas,w,h,s);
}

function compositeMesh(ctx,canvas,w,h,state){
 ctx.save();
 if(state.roll){
   const {cx,cy}=mugView(w,h,state);
   ctx.translate(cx,cy);
   ctx.rotate(state.roll);
   ctx.translate(-cx,-cy);
 }
 ctx.drawImage(canvas,0,0,w,h);
 ctx.restore();
}
