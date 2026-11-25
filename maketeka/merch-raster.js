import {cartonAllowsGloss} from './carton.js?v=magneticBox1';

// Orthographic triangles share depth and interpolate light and print coordinates.
const textures=new WeakMap();
let buffer,frame,depth;
function texture(canvas){
 if(!canvas)return null;
 if(!textures.has(canvas))textures.set(canvas,canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height));
 return textures.get(canvas);
}
export function rasterMerch(ctx,w,h,faces,atlases,state){
 if(!faces.length)return;
 const tee=state.mode==='tee',clothBody=tee||state.mode==='tote',carton=!!state.carton;
 const glossy=state.glossy&&(!carton||cartonAllowsGloss(state.carton));
 const reflectiveInk=!carton||glossy||state.carton.material==='bookboard';
 const ratio=Math.max(ctx.getTransform().a,Math.max(w,h)<1400?1.5:1);
 let left=w,top=h,right=0,bottom=0;
 for(const f of faces)for(const [x,y] of f.q){
  left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
 }
 left=Math.max(0,Math.floor(left)-1);top=Math.max(0,Math.floor(top)-1);
 const W=Math.ceil((Math.min(w,Math.ceil(right)+1)-left)*ratio),H=Math.ceil((Math.min(h,Math.ceil(bottom)+1)-top)*ratio);
 if(W<=0||H<=0)return;
 buffer??=document.createElement('canvas');
 const t=buffer.getContext('2d');
 if(!frame||W!==buffer.width||H!==buffer.height){
  buffer.width=W;buffer.height=H;frame=t.createImageData(W,H);depth=new Float32Array(W*H);
 }else frame.data.fill(0);
 depth.fill(-Infinity);
 for(const f of faces){
  const [a,b,c]=f.q,abx=(b[0]-a[0])*ratio,aby=(b[1]-a[1])*ratio,acx=(c[0]-a[0])*ratio,acy=(c[1]-a[1])*ratio;
  const ax=(a[0]-left)*ratio,ay=(a[1]-top)*ratio,den=abx*acy-aby*acx;
  if(den<1e-8)continue;
  const xmin=Math.max(0,Math.floor(ax+Math.min(0,abx,acx))),xmax=Math.min(W-1,Math.ceil(ax+Math.max(0,abx,acx)));
  const ymin=Math.max(0,Math.floor(ay+Math.min(0,aby,acy))),ymax=Math.min(H-1,Math.ceil(ay+Math.max(0,aby,acy)));
  const rgb=parseInt(f.color.slice(1),16),r=rgb>>16,g=rgb>>8&255,blue=rgb&255;
  const tex=f.uv&&texture(atlases[f.side]),uv=f.uv;
  const inkMask=reflectiveInk&&tex&&texture(atlases[f.side+'Ink']);
  const [A,B,C]=f.light;
  for(let y=ymin;y<=ymax;y++){
   let i=y*W+xmin;
   let v=((xmin+.5-ax)*acy-(y+.5-ay)*acx)/den,u=((y+.5-ay)*abx-(xmin+.5-ax)*aby)/den;
   for(let x=xmin;x<=xmax;x++,i++,v+=acy/den,u-=aby/den){
    const k=1-u-v;if(Math.min(k,u,v)<-1e-7)continue;
    const z=k*f.z[0]+v*f.z[1]+u*f.z[2];if(z<depth[i])continue;
    depth[i]=z;
    const shade=k*A[0]+v*B[0]+u*C[0],shine=k*A[1]+v*B[1]+u*C[1];
    let R=r*shade,G=g*shade,Bb=blue*shade,ink=0,inkShine=0;
    if(uv){
     const U=k*uv[0][0]+v*uv[1][0]+u*uv[2][0],V=k*uv[0][1]+v*uv[1][1]+u*uv[2][1];
     if(tex){
      const tx=Math.max(0,Math.min(tex.width-1,Math.round(U*(tex.width-1)))),ty=Math.max(0,Math.min(tex.height-1,Math.round(V*(tex.height-1))));
      const p=(ty*tex.width+tx)*4;ink=tex.data[p+3]/255;
      inkShine=reflectiveInk?(inkMask?inkMask.data[p+3]/255:ink):0;
      const inkLight=clothBody||carton? .36+.64*shade : 1;
      R+=(tex.data[p]*inkLight-R)*ink;
      G+=(tex.data[p+1]*inkLight-G)*ink;
      Bb+=(tex.data[p+2]*inkLight-Bb)*ink;
     }
     if(f.cloth){
      const seam=!tee&&Math.abs(V-.037)<.0015&&U*80%1<.65;
      const fiber=tee?(Math.imul(Math.floor(U*1091)+1,73856093)^Math.imul(Math.floor(V*1601)+1,19349663)):0;
      const weave=seam?.69:tee?1-.022*((fiber^(fiber>>>13))&255)/255:.988+.012*Math.cos(V*1256);
      R*=weave;G*=weave;Bb*=weave;
     }
    }
    let gloss;
    if(carton){
     const band=(left+x/ratio)/w+.45*(top+y/ratio)/h-.66;
     const softbox=shine>0&&(glossy||inkShine)?Math.exp(-((band/.14)**2)):0;
     const fill=glossy?.30*softbox+.025:0;
     gloss=shine*(fill*(1-.28*ink)+inkShine*(.04+.34*softbox));
    }else if(clothBody){
     const clothGloss=tee?(glossy?.075:.027):uv?(glossy?.10:.035):.047;
     gloss=shine*(clothGloss*(1-.55*ink)+.32*inkShine);
    }else{
     const bodyGloss=glossy?.48:.035;
     gloss=shine*(bodyGloss*(1-.36*ink)+(glossy?.25:.39)*inkShine);
    }
    const j=i*4;frame.data[j]=R+(255-R)*gloss;frame.data[j+1]=G+(252-G)*gloss;frame.data[j+2]=Bb+(246-Bb)*gloss;frame.data[j+3]=255;
   }
  }
 }
 t.putImageData(frame,0,0);ctx.drawImage(buffer,left,top,W/ratio,H/ratio);
}
