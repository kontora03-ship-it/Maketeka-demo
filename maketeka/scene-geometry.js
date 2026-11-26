export const cameraAngle = .61;
export const floorSlope = Math.sin(cameraAngle);
export const verticalScale = Math.cos(cameraAngle);
const radians = Math.PI / 180;

export function createScenePose(yaw, tilt, roll, resolution, span) {
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
 function view(x, y, z) {
  const [right, down, depth] = world(x, y, z);
  return [right, down*verticalScale + depth*floorSlope, depth*verticalScale - down*floorSlope];
 }
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

export function fitScene(items, geometry) {
 let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
 for (const item of items) {
  const b=sceneBounds(item,geometry(item));
  left=Math.min(left,b.left);right=Math.max(right,b.right+.33*b.top);
  top=Math.min(top,b.back*floorSlope-b.top*verticalScale);
  bottom=Math.max(bottom,(b.front+.2*b.top)*floorSlope);
 }
 return {x:(left+right)/2,y:(top+bottom)/2,width:Math.max(160,(right-left)*1.26,(bottom-top)*1.89)};
}
