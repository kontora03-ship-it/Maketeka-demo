const radians = Math.PI / 180;
export const defaultCamera = {azimuth:0,elevation:35,zoom:100};

export function sceneCamera({azimuth,elevation}=defaultCamera){
 const c=Math.cos(azimuth*radians),s=Math.sin(azimuth*radians);
 const slope=Math.sin(elevation*radians),vertical=Math.cos(elevation*radians);
 function view(x,y,z){
  const depth=-s*x+c*z;
  return [c*x+s*z,y*vertical+depth*slope,depth*vertical-y*slope];
 }
 function surfaceDelta(right,down){
  const depth=down/slope;
  return [c*right-s*depth,s*right+c*depth];
 }
 return {view,surfaceDelta};
}

export function createScenePose(yaw, tilt, roll, resolution, span, camera=defaultCamera) {
 const {view:cameraView}=sceneCamera(camera);
 const [cy, sy, ct, st, cr, sr] = [Math.cos(yaw*radians), Math.sin(yaw*radians),
  Math.cos(tilt*radians), Math.sin(tilt*radians), Math.cos(roll*radians), Math.sin(roll*radians)];
 const scale = resolution / (span * 1.65);
 const origin = resolution / 2;
 const groups = [];
 function world(x, y, z) {
  const ty = ct*y - st*z, tz = st*y + ct*z;
  const rx = cr*x - sr*ty, ry = sr*x + cr*ty;
  return [cy*rx + sy*tz, ry, -sy*rx + cy*tz];
 }
 const view=(x,y,z)=>cameraView(...world(x,y,z));
 return {
  scale, origin, groups, view,
  project: ([x,y]) => [origin+x*scale,origin+y*scale],
  record: parts => groups.push(...parts.map(part => part.map(point => world(...point))))
 };
}

export function hull(points) {
 const sorted = [...points].sort((a,b) => a[0]-b[0] || a[1]-b[1]);
 function chain(list) {
  const result = [];
  for (const point of list) {
   while (result.length > 1) {
    const a = result.at(-2), b = result.at(-1);
    if ((b[0]-a[0])*(point[1]-a[1]) > (b[1]-a[1])*(point[0]-a[0])) break;
    result.pop();
   }
   result.push(point);
  }
  return result.slice(0,-1);
 }
 return chain(sorted).concat(chain(sorted.reverse()));
}

export function floorGeometry(groups) {
 const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
 for (const group of groups) for (const point of group) {
  for (let axis = 0; axis < 3; axis++) {
   min[axis] = Math.min(min[axis], point[axis]);
   max[axis] = Math.max(max[axis], point[axis]);
  }
 }
 const shadow = groups.map(group => hull(group.map(([x,y,z]) => {
  const height = max[1]-y;
  return [x+.33*height,z+.20*height];
 }))).filter(outline => outline.length>=3);
 const contact = hull(groups.flat().filter(p => p[1] >= max[1]-2).map(([x,,z]) => [x,z]));
 return {min,max,shadow,contact};
}

export function sceneBounds(item,geometry) {
 const {min,max}=geometry, k=item.scale;
 return {left:item.x+min[0]*k,right:item.x+max[0]*k,
  back:item.z+min[2]*k,front:item.z+max[2]*k,
  bottom:item.lift,top:item.lift+(max[1]-min[1])*k};
}

export function overlaps(a,b,gap=0) {
 return a.left < b.right+gap && b.left < a.right+gap &&
  a.back < b.front+gap && b.back < a.front+gap &&
  a.bottom < b.top && b.bottom < a.top;
}

export function arrangeScene(items, geometry) {
 const footprints = items.map(item => {
  const bounds = sceneBounds({...item,x:0,z:0,lift:0},geometry(item));
  return {item,bounds,width:bounds.right-bounds.left,depth:bounds.front-bounds.back};
 });
 footprints.sort((a,b) => Math.max(b.width,b.depth,b.bounds.top)-Math.max(a.width,a.depth,a.bounds.top));
 const gap = 16;
 const columns = Math.max(1, Math.min(footprints.length-1,Math.ceil(Math.sqrt(footprints.length))));
 let depth = 0;
 for (let i = 0; i < footprints.length; i += columns) {
  const row = footprints.slice(i,i+columns);
  const width = row.reduce((sum,entry) => sum+entry.width,0)+gap*(row.length-1);
  let x = -width/2;
  for (const entry of row) {
   const {item,bounds}=entry;
   Object.assign(item,{x:x-bounds.left,z:depth-bounds.back,lift:0});
   x+=entry.width+gap;
  }
  depth+=Math.max(...row.map(entry=>entry.depth))+gap;
 }
}

export function fitScene(items, geometry, camera=defaultCamera) {
 const {view,surfaceDelta}=sceneCamera(camera);
 let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity,near=-Infinity,far=Infinity;
 for (const item of items) {
  const b=sceneBounds(item,geometry(item));
  for(const x of [b.left,b.right])for(const z of [b.back,b.front]){
   const [,down,depth]=view(x,0,z);
   near=Math.max(near,depth);far=Math.min(far,depth);
   for(const [px,py] of [view(x,-b.top,z),view(x,-b.bottom,z),view(x+.33*b.top,0,z+.2*b.top),view(x,0,z)]){
    left=Math.min(left,px);right=Math.max(right,px);top=Math.min(top,py);bottom=Math.max(bottom,py);
   }
  }
 }
 const midX=(left+right)/2,midY=(top+bottom)/2;
 const targetFloorY=(near+far)/2*Math.tan(camera.elevation*radians);
 const [x,z]=surfaceDelta(midX,targetFloorY);
 const [,v]=view(0,1,0);
 return {target:[x,(midY-targetFloorY)/v,z],width:Math.max(160,(right-left)*1.26,(bottom-top)*1.89)};
}
