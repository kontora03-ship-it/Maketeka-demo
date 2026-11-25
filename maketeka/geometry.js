import {texture,sample} from './texture.js';
// Project a unit square onto a convex quadrilateral, with an inverse for pointer input.
export function plane(q) {
  const [[x,y],[bx,by],[cx,cy],[dx,dy]]=q;
  const a=bx-cx,b=dx-cx,c=by-cy,d=dy-cy,den=a*d-b*c;
  if(Math.abs(den)<1e-8)return null;
  const rx=x-bx+cx-dx,ry=y-by+cy-dy,g=(rx*d-b*ry)/den,h=(a*ry-rx*c)/den;
  const A=bx-x+g*bx,B=dx-x+h*dx,C=by-y+g*by,D=dy-y+h*dy;
  return {map(u,v){const w=1+g*u+h*v;return [(A*u+B*v+x)/w,(C*u+D*v+y)/w]},
    inverse(X,Y){const l=A-X*g,m=B-X*h,n=C-Y*g,p=D-Y*h,k=l*p-m*n;return [(p*(X-x)-m*(Y-y))/k,(l*(Y-y)-n*(X-x))/k]}};
}
export function convex(q){return q.every(([x,y],i)=>{const b=q[(i+1)%4],c=q[(i+2)%4];return (b[0]-x)*(c[1]-b[1])-(b[1]-y)*(c[0]-b[0])>0.00001})}
export function inside(p,q){return q&&q.length>=3&&q.every((a,i)=>{const b=q[(i+1)%q.length];return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])>=-0.01})}
// Clip each thin projective cell and draw its affine approximation.
export function stamp(ctx,img,q) {
 const pr=plane(q);if(!pr)return;
 const w=img.width,h=img.height;
 ctx.imageSmoothingQuality="high";
 if(Math.hypot(q[0][0]+q[2][0]-q[1][0]-q[3][0],q[0][1]+q[2][1]-q[1][1]-q[3][1])<.01){
  const [a,b,,d]=q;ctx.save();ctx.transform((b[0]-a[0])/w,(b[1]-a[1])/w,(d[0]-a[0])/h,(d[1]-a[1])/h,a[0],a[1]);ctx.drawImage(img,0,0);ctx.restore();return;
 }
 // Inverse mapping draws the artwork once, avoiding seams between clipped triangles.
 const xs=q.map(p=>p[0]),ys=q.map(p=>p[1]);
 const d=ctx.getTransform().a||1;
 const left=Math.max(0,Math.floor(Math.min(...xs)*d)),top=Math.max(0,Math.floor(Math.min(...ys)*d));
 const width=Math.min(ctx.canvas.width,Math.ceil(Math.max(...xs)*d))-left;
 const height=Math.min(ctx.canvas.height,Math.ceil(Math.max(...ys)*d))-top;
 if(width<=0||height<=0)return;
 const layer=document.createElement('canvas');layer.width=width;layer.height=height;
 const t=layer.getContext('2d'),frame=t.createImageData(width,height);
 const tex=texture(img,d*Math.hypot(q[1][0]-q[0][0],q[1][1]-q[0][1]));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const [u,v]=pr.inverse((left+x+.5)/d,(top+y+.5)/d);
   if(u>=0&&u<=1&&v>=0&&v<=1)sample(tex,u,v,frame.data,4*(y*width+x));
 }
 t.putImageData(frame,0,0);
 ctx.drawImage(layer,left/d,top/d,width/d,height/d);
}
