import {arrangeScene,createScenePose,defaultCamera,fitScene,floorGeometry,overlaps,sceneBounds,sceneCamera} from './scene-geometry.js?v=sceneCamera1';
import {list,put} from './collection.js';
import {chooseCrop,cropPixels,dragCrop,exportCrop,validCrop} from './crop.js?v=sceneCrop1';
import {cartonAllowsGloss,cartonMaterials,cartonPrintFaces,cartonSize,cartonThicknessPresets,freshCarton,isCartonMode,normalizeCarton} from './carton.js?v=magneticCenter1';
import {merch,drawMerch,merchProjection} from './merch.js?v=sceneGround1';
import {drawBag,bagInk,bagFormats} from './bag.js?v=sceneGround1';
import {photoAngle,paintLight} from './light.js?v=layers1';
import {printPng} from './print.js';
import {drawMug,mugView,printWidth} from './mug.js?v=sceneGround1';
import {defaultBody,validBody,cylinder,wrapImage,drawGuides} from './cylinder.js';
import * as model from './model.js?v=sceneGround1';
import {plane,convex,inside,stamp} from './geometry.js?v=logoEdit2';
const $=id=>document.getElementById(id), canvas=$('canvas'), ctx=canvas.getContext('2d'), clamp=(n,l,h)=>Math.min(h,Math.max(l,n));
const teeAppearance={cover:'#ffffff',x:.68,y:.305,width:.175};
const fresh=mode=>({version:1,mode,crop:null,bagFormat:"standard",...(isCartonMode(mode)?{carton:freshCarton(mode)}:{}),handlePaletteVersion:2,handleColor:mode==="tote"?"#000000":merch[mode]?"#424649":"#343434",bagSide:"front",glossy:mode!=='photo'&&mode!=='tee'&&!isCartonMode(mode),studioLight:100,background:"",bothSides:false,surfaceType:'plane',body:{...defaultBody},photo:'',art:'',name:'',cover:'#ffffff',ink:'',method:'print',opacity:100,intensity:100,x:.5,y:.5,width:.32,angle:0,yaw:-.26,pitch:-.20,zoom:1,mm:0,corners:[[0,0],[1,0],[1,1],[0,1]]});
let s=fresh('model'),photo,art,bitmap,surface,objectQuad,frameBox,ratio=1,ready=false,editPlane=false,original=false,drag=null,undo=[],redo=[],epoch=0,drawId=0,persistTimer,timer;
let selected=false, mugCopy=0;
const projectKey='maketeka-light-project-v1';
const resumeModelKey='maketeka-resume-model';
let savedModel=null, modelDirty=false, modelWrite=Promise.resolve();
function flushModel(){
 if(!ready||!savedModel||!modelDirty)return modelWrite;
 modelDirty=false;
 const entry={...savedModel,state:structuredClone(snapshot()),preview:modelPreview(savedModel.preview),updated:Date.now()};
 modelWrite=modelWrite.catch(()=>{}).then(()=>put('models',entry)).then(()=>{
  if(savedModel?.id===entry.id)savedModel=entry;
 }).catch(error=>{
  if(savedModel?.id===entry.id)modelDirty=true;
  throw error;
 });
 return modelWrite;
}
function persistSession(){
 try{
  if(savedModel){
   localStorage.setItem(resumeModelKey,savedModel.id);
   $('resume').hidden=false;
   return;
  }
  localStorage.removeItem(resumeModelKey);
  localStorage.setItem(projectKey,JSON.stringify(snapshot()));
  $('resume').hidden=false;
 }catch{
  if(!savedModel)message('Для этого проекта используйте «Экспорт → Сохранить проект»');
 }
}
function message(t){$('message').textContent=t;$('message').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('message').hidden=true,4500)}
const img=src=>new Promise((resolve,reject)=>{if(!src)return resolve(null);const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('Не удалось прочитать изображение'));i.src=src});
function readFile(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)})}
const brandUrl = '/Maketeka-demo/maketeka/assets/maketeka.png?v=20261122';
async function brandArtwork() {
 const response = await fetch(brandUrl);
 if (!response.ok) throw Error('Не удалось загрузить фирменный логотип');
 return readFile(new Blob([await response.arrayBuffer()], {type:'image/png'}));
}
async function newProject(mode, photoData = '',bagFormat='standard') {
 const state = {...fresh(mode),bagFormat};
 if(merch[mode])state.width=mode==="pen"?.16:.36;
 if(isCartonMode(mode))Object.assign(state,{pitch:-.55,yaw:.42});
 if (mode !== 'photo') state.method = demoFinish;
 if(mode==='tee')Object.assign(state,{...teeAppearance,pitch:-.20,yaw:.20});
 if(mode==='mug')Object.assign(state,{x:.75,width:.16});
 state.photo = photoData;
 state.art = await brandArtwork();
 state.name = 'maketeka.png';
 await loadState(state, true);
}
async function prepare(file,graphic){if(!file)return;if(file.size>30e6)throw Error('Выберите файл меньше 30 МБ');const source=await readFile(file),input=await img(source);if(Math.max(input.width,input.height)<=4096 && /^data:image\/(png|jpeg|webp);base64,/.test(source))return source;const c=document.createElement('canvas'),k=(graphic && file.type==="image/svg+xml" ? 4096/Math.max(input.naturalWidth,input.naturalHeight) : Math.min(1,4096/Math.max(input.naturalWidth,input.naturalHeight)));c.width=Math.max(1,Math.round(input.naturalWidth*k));c.height=Math.max(1,Math.round(input.naturalHeight*k));c.getContext('2d').drawImage(input,0,0,c.width,c.height);return c.toDataURL(graphic?'image/png':'image/webp',.94)}
async function task(fn){try{await fn()}catch(e){message(e.message||'Не удалось открыть файл')}}
const layerKeys=['bagSide','art','name','ink','method','opacity','intensity','x','y','width','angle','bothSides','mm','corners','body','surfaceType','lighting','perspectiveSet'];
let layers=[],active=0,images=new Map(),hitAreas=[];
function layerData(state){return Object.fromEntries(layerKeys.map(k=>[k,state[k]]))}
function currentLayers(){
 return layers.map((layer,i)=>i===active?layerData(s):layer);
}
function snapshot(){
 const shared={...s};
 for(const key of layerKeys)delete shared[key];
 return {...shared,version:2,layers:currentLayers(),active};
}
function activate(index){
 layers=currentLayers();active=index;
 Object.assign(s,layerData(layers[index]||fresh(s.mode)));
 art=images.get(s.art)||null;selected=!!art;editPlane=original=false;mugCopy=0;
 recolor();sync();render();persist();
}
function layerList(){
 const list=$('layers');list.replaceChildren();
 currentLayers().forEach((layer,i)=>{
  const button=document.createElement('button'),image=document.createElement('img');
  image.src=layer.art;image.alt='';button.title=layer.name;button.setAttribute('aria-label','Слой '+(i+1)+' · '+layer.name);
  button.setAttribute('aria-pressed',String(i===active));button.append(image);
  button.onclick=()=>activate(i);list.append(button);
 });
}
function remember(){undo.push(structuredClone(snapshot()));if(undo.length>32)undo.shift();redo=[]}
function persist(updateModel=true){
 clearTimeout(persistTimer);
 if(!ready)return;
 if(savedModel&&updateModel)modelDirty=true;
 persistTimer=setTimeout(()=>{
  persistSession();
  task(flushModel);
 },350);
}
async function loadState(next,resetHistory=false,entry=null){
 let incoming,index=0;
 if(next?.version===2){
  if(!Array.isArray(next.layers))throw Error('Некорректные слои проекта');
  incoming=next.layers;
  index=clamp(Math.trunc(next.active)||0,0,Math.max(0,incoming.length-1));
  for(const layer of incoming){
   if(!layer||typeof layer.art!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(layer.art)||!Array.isArray(layer.corners)||layer.corners.length!==4||!layer.corners.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))||!convex(layer.corners)||!validBody(layer.body))throw Error('Некорректный слой');
   for(const k of ['x','y','width','angle','opacity','intensity','mm'])if(!Number.isFinite(layer[k]))throw Error('Некорректные параметры слоя');
  }
  const {layers:unused,active:unusedIndex,...shared}=next;
  next={...fresh(shared.mode),...shared,handlePaletteVersion:shared.handlePaletteVersion,...layerData(incoming[index]||fresh(shared.mode)),version:1};
 }
 if(next?.version!==1||!['model','mug','bag','photo',...Object.keys(merch)].includes(next.mode))throw Error('Выберите файл проекта maketeka');
 for(const k of ['photo','art'])if(typeof next[k]!=='string'||next[k]&&!/^data:image\/(png|jpeg|webp);base64,/.test(next[k]))throw Error('Некорректное изображение проекта');
 if(next.mode==='photo'&&!next.photo)throw Error('В проекте отсутствует фотография');
 if(!Array.isArray(next.corners)||next.corners.length!==4||!next.corners.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&n>=0&&n<=1))||!convex(next.corners))throw Error('Некорректная область нанесения');
 if(next.body!==undefined&&!validBody(next.body))throw Error('Некорректные границы цилиндра');
 if(next.mode==='bag'||merch[next.mode]){
  next.bagFormat=next.bagFormat==='bottle'?'bottle':'standard';
  if(next.mode==='tote' && next.handlePaletteVersion!==2 && ['#424649','#141414'].includes(next.handleColor?.toLowerCase?.()))next.handleColor='#000000';
  next.handlePaletteVersion=2;
  if(!/^#[0-9a-f]{6}$/i.test(next.handleColor))next.handleColor=fresh(next.mode).handleColor;
 }
 if(isCartonMode(next.mode)){
  next.carton=normalizeCarton(next.carton,next.mode);
  if(!cartonAllowsGloss(next.carton))next.glossy=false;
  const faces=cartonPrintFaces(next.carton);
  for(const layer of [next,...(incoming||[])]){
   if(!Object.hasOwn(faces,layer.bagSide))layer.bagSide='front';
   layer.bothSides=false;
  }
 }
 const oldLight=next.studioLight;
 next={...next,background:/^#[0-9a-f]{6}$/i.test(next.background)?next.background:"",studioLight:Number.isFinite(oldLight)?clamp(Math.round(oldLight),0,100):oldLight===false?0:100};
 const def=fresh(next.mode);for(const key of Object.keys(def))if(typeof def[key]==='number'&&!Number.isFinite(next[key]))throw Error('Некорректные параметры проекта');
 const seq=++epoch;
 // Migrate the exact artwork embedded by the previous release.
 if(next.art.length===48862 && next.name==='maketeka.png'){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(next.art));
  const hex=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
  if(hex==='02f47aef26abc49b0bb3979434a4d28832ebff01d13a02274f6aaba55f6fc9f3')next={...next,art:await brandArtwork()};
 }
 incoming=incoming|| (next.art?[layerData({...def,...next})]:[]);
 const decoded=new Map(await Promise.all([...new Set(incoming.map(l=>l.art))].map(async src=>[src,await img(src)])));
 const newPhoto=await img(next.photo);
 if(seq!==epoch)return;
 if(resetHistory){
  await flushModel();
  if(seq!==epoch)return;
  savedModel=entry;modelDirty=false;
 }
 layers=incoming;active=index;images=decoded;hitAreas=[];cropDraft=cropDrag=null;next.crop=validCrop(next.crop);
 const newArt=decoded.get(next.art)||null;
 compareFlat=false;selected=false;mugCopy=0;s={...def,...next};photo=newPhoto;art=newArt;ready=true;editPlane=original=false;if(resetHistory){undo=[];redo=[]}
 $('carton-thickness-preset').selectedIndex=-1;
 if(resetHistory)$('base').open=isCartonMode(s.mode);
 $('welcome').hidden=true;$('studio').hidden=false;for(const id of ['exports','undo','redo'])$(id).hidden=false;
 $('docname').textContent=s.mode==='model'?'Ежедневник':s.mode==='mug'?'Кружка':'Своё фото';recolor();sync();persist(!resetHistory);render();window.scrollTo(0,0);
}
function recolor(){bitmap=art ? layerBitmap(s,art,false) : null}
function graphicBitmap(art,s,maxSize=1200){const c=document.createElement('canvas'),k=Math.min(1,maxSize/Math.max(art.width,art.height));c.width=Math.max(1,Math.round(art.width*k));c.height=Math.max(1,Math.round(art.height*k));const t=c.getContext('2d');t.imageSmoothingQuality='high';t.drawImage(art,0,0,c.width,c.height);if(s.ink||s.method!=='print'){t.globalCompositeOperation='source-in';let fill=s.ink||'#575148';if(['gold','silver'].includes(s.method)){const grad=t.createLinearGradient(0,0,c.width,c.height),colors=s.method==='gold'?['#94723a','#ffedac','#b99146']:['#898b8e','#ffffff','#919398'];colors.forEach((v,i)=>grad.addColorStop(i/2,v));fill=grad}t.fillStyle=fill;t.fillRect(0,0,c.width,c.height)}return c}
const colorPattern=/^#[0-9a-f]{6}$/i;
const paletteKey='maketeka-palette';
let recentColors=[], pinnedColors=[];
try{
 const colors=JSON.parse(localStorage.getItem(paletteKey)||'{}');
 recentColors=(colors.recent||[]).filter(v=>colorPattern.test(v));
 pinnedColors=(colors.pinned||[]).filter(v=>colorPattern.test(v));
}catch{}
function storeColors(){
 try{localStorage.setItem(paletteKey,JSON.stringify({recent:recentColors,pinned:pinnedColors}))}
 catch{message('Не удалось сохранить палитру в браузере')}
}
function rememberColor(value){
 if(typeof value!=='string'||!colorPattern.test(value))return;
 const color=value.toLowerCase();
 recentColors=[color,...recentColors.filter(v=>v!==color)].slice(0,8);
 storeColors();
}
function colorSwatch(color,current,apply){
 const button=document.createElement('button');
 button.type='button';button.className='sw';button.style.background=color;
 button.title=color;button.setAttribute('aria-label',color);
 button.setAttribute('aria-pressed',String(color===current));
 if(color===current){
  button.textContent='✓';
  button.style.color=parseInt(color.slice(1,3),16)>170?'#202020':'white';
 }
 button.onclick=()=>apply(color);
 return button;
}
function colorRows(el,current,apply){
 const selectedColor=current?.toLowerCase();
 for(const [title,colors] of [['Недавние',recentColors.filter(color=>!pinnedColors.includes(color))],['Мои цвета',pinnedColors]]){
  if(!colors.length)continue;
  const row=document.createElement('div');
  row.className='palettePins';row.append(title);
  for(const color of colors)row.append(colorSwatch(color,selectedColor,apply));
  el.append(row);
 }
 if(!colorPattern.test(selectedColor))return;
 const button=document.createElement('button');
 button.type='button';
 const pinned=pinnedColors.includes(selectedColor);
 button.textContent=pinned?'Открепить цвет':'В мои цвета';
 button.onclick=()=>{
  pinnedColors=pinned?pinnedColors.filter(v=>v!==selectedColor):[selectedColor,...pinnedColors];
  storeColors();sync();
 };
 el.append(button);
}
function palette(id,key,values){
 const el=$(id),current=s[key]?.toLowerCase();
 const apply=color=>{rememberColor(color);if(s[key]===color)sync();else set(key,color)};
 el.replaceChildren();
 for(const color of values)el.append(colorSwatch(color,current,apply));
 const label=document.createElement('label'),picker=document.createElement('input');
 label.className='custom';label.textContent='+';
 picker.type='color';picker.value=current||'#202020';
 picker.setAttribute('aria-label',{background:'Свой цвет фона',handleColor:'Свой цвет ручек',cover:'Свой цвет основы',ink:'Свой цвет графики'}[key]);
 picker.onchange=()=>apply(picker.value);
 label.append(picker);el.append(label);
 colorRows(el,current,apply);
}
function units(){return (isCartonMode(s.mode)?cartonPrintFaces(s.carton)[s.bagSide||'front'].width:merch[s.mode]?.width)??(s.mode==='mug'?printWidth:s.mode==='model'?145:s.mode==='bag'?bagFormats[s.bagFormat].width:s.mm||100)}
function curved(){return s.mode==='photo' && s.surfaceType==='cylinder'}
const defaults={angle:null,shadow:85,shine:85,position:50,glowSize:30};
let compareFlat=false;
function lighting(){return {...defaults,...s.lighting}}
function syncLight(){
 const photoMode=s.mode==='photo',v=lighting();
 $('flat').hidden=$('lightBlock').hidden=!photoMode||!art;
 $('flat').textContent=compareFlat?'Показать свет':'Без света';
 $('flat').setAttribute('aria-pressed',String(compareFlat));
 for(const key of ['position','shadow','shine','glowSize'])$(key).value=v[key];
 if(v.angle!==null){$('direction').value=v.angle;$('directionVal').textContent=v.angle+'°'}
}
for(const key of ['direction','position','shadow','shine','glowSize']){
 const el=$(key);let started=false;
 el.oninput=()=>{if(!started){remember();started=true}compareFlat=false;s.lighting={...lighting(),[key==='direction'?'angle':key]:+el.value};syncLight();render()};
 el.onchange=()=>{started=false;sync();persist()};
}
$('autoLight').onclick=()=>{compareFlat=false;set('lighting',{...lighting(),angle:null})};
$('flat').onclick=()=>{compareFlat=!compareFlat;syncLight();render()};
function sync(){
 $('saveModel').textContent=savedModel?'Сохранить как копию':'Сохранить модель';
 const bag=s.mode==='bag',product=merch[s.mode],carton=isCartonMode(s.mode);
 $('formatLabel').hidden=!bag;
 $('handleBlock').hidden=carton||!(bag||product?.accent);
 $('sideLabel').hidden=carton||!(bag||product);
 $('bagSide').options[0].textContent=s.mode==='tee'?'Грудь':'Лицевая';
 $('bagSide').options[1].textContent=s.mode==='tee'?'Спина':'Оборотная';
 $('cartonBlock').hidden=!carton;
 $('cartonFaceLabel').hidden=!carton||!art;
 if(carton){
  const faces=$('cartonPrintFace');
  const magnetic=s.mode==='magneticBox';
  faces.options[1].textContent=magnetic?'Магнитный клапан':'Передняя стенка';
  faces.options[2].textContent=magnetic?'Корешок':'Задняя стенка';
  faces.value=s.bagSide||'front';
 }
 $('glossyChoice').hidden=carton;
 if(carton){
  const rigid=s.mode==='rigidBox',magnetic=s.mode==='magneticBox',bookboard=rigid||magnetic;
  $('cartonTitle').textContent=product.name;
  $('carton-lidHeight-label').hidden=!rigid;
  $('corrugatedMaterial').hidden=bookboard;
  $('rigidMaterial').hidden=!bookboard;
  $('cartonCoatingLabel').textContent=magnetic?'Цвет лотка':'Цвет кашировки';
  $('carton-reset-coating').hidden=magnetic;
  $('magneticCoverColor').hidden=!magnetic;
  if(magnetic)$('carton-magnetic-cover').value=s.carton.lidColor;
  syncCartonThickness(s.carton);
  $('cartonOpeningLabel').textContent=rigid?'Подъём крышки':s.mode==='carton0201'?'Открытие клапанов':'Открытие крышки';
  $('carton-opening').max=rigid?100:110;
  if(rigid){$('carton-lidHeight').max=s.carton.height;$('carton-lidHeight').value=s.carton.lidHeight}
  for(const key of ['length','depth','height','thickness','opening','material'])$('carton-'+key).value=s.carton[key];
  $('carton-coating').value=s.carton.coating||cartonMaterials[s.carton.material].surface;
  $('carton-reset-coating').disabled=!s.carton.coating;
  $('rigidColors').hidden=!rigid;
  if(rigid){
   for(const [key,fallback] of Object.entries(rigidColorDefaults(s.carton))){
    $('carton-'+key+'-on').checked=!!s.carton[key];
    $('carton-'+key+'-label').hidden=!s.carton[key];
    $('carton-'+key).value=s.carton[key]||fallback;
   }
  }
  const canGloss=cartonAllowsGloss(s.carton);
  const finish=$('carton-finish');
  finish.value=s.glossy&&canGloss?'glossy':'matte';
  finish.options[1].disabled=!canGloss;
  finish.disabled=!canGloss;
  updateCartonOpening();
  cartonColorRows.forEach(refresh=>refresh());
  const size=cartonSize(s.carton);
  $('cartonOuter').textContent='Снаружи ≈ '+[size.width,size.depth,size.height].map(n=>+n.toFixed(2)).join(' × ')+' мм';
 }
 $('handleTitle').textContent=product?.accent||'Цвет ручек';
 if(bag||product){
  $('docname').textContent=product?product.name:s.bagFormat==='bottle'?'Пакет под бутылку':'Бумажный пакет';
  $('bagFormat').value=s.bagFormat;$('bagSide').value=s.bagSide||'front';
  if(bag||product?.accent)palette('handlePalette','handleColor',[s.mode==='tote'?'#000000':'#343434','#ffffff','#b28f61','#793344']);
 }
 $('glossy').checked=s.glossy;$('materialValue').textContent=s.glossy?'Глянцевая поверхность':'Матовая поверхность';$('stageChecks').hidden=$('studioLightControl').hidden=s.mode==='photo';syncStudioLight();syncLight(); $('tiltLabel').hidden=!curved(); $('surfaceTilt').value=Math.round(Math.atan2(Math.sin(s.body.rotation||0),Math.cos(s.body.rotation||0))*180/Math.PI);const mug=s.mode==='mug',mod=s.mode!=='photo';$('colorTitle').textContent=product?(['tote','tee'].includes(s.mode)?'Цвет ткани':'Цвет корпуса'):bag?'Цвет бумаги':mug?'Цвет кружки':'Цвет обложки';$('bothLabel').hidden=carton||!(bag||mug||product)||!art;$('bothSides').checked=!!s.bothSides;$('coverBlock').hidden=carton||!mod;$('photoBlock').hidden=mod;$('placement').hidden=$('finish').hidden=$('remove').hidden=!art;$('photoBlock').hidden=mod||!art;$('base').hidden=!mod;layerList();$('photoBlockSummary').textContent=curved()?'Цилиндр':'Перспектива';$('placementSummary').textContent=art?+(s.width*units()).toFixed(1)+(mod||s.mm?' мм':'%'):'';$('planeControls').hidden=!editPlane;$('surfaceHelp').textContent=curved()?'Совместите боковые точки с краями ободка и основания. Центральными точками настройте дугу и высоту. Потяните за бирюзовую точку над ободком, чтобы наклонить цилиндр.':'Переместите четыре точки на углы плоской поверхности.';
 $('cylinder').setAttribute('aria-pressed',String(curved()));$('cylinder').textContent=curved()&&editPlane?'Готово':'Цилиндр';$('persp').textContent=editPlane&&!curved()?'Готово':'По перспективе';$('compare').textContent=original?'Результат':'Оригинал';$('calibration').value=s.mm||'';$('modeName').textContent=mod?'3D-вид':'Фото';$('zoomVal').textContent=Math.round(s.zoom*100)+'%';$('hint').textContent=editPlane&&curved()?'Настройте границы корпуса и изгиб ободка':editPlane?'Расставьте точки по углам поверхности':mug?'Потяните за кружку для поворота или за рисунок для перемещения':mod&&!s.art?'Потяните, чтобы повернуть модель':'';$('undo').disabled=!undo.length;$('redo').disabled=!redo.length;
 $('backgroundBlock').hidden=!mod;
 if(mod){
  palette('backgroundPalette','background',['#ffffff','#e5e3df','#999b9c','#303234']);
  $('resetBackground').disabled=!s.background;

 }
 palette('coverPalette','cover',['#ffffff','#383838','#284937','#793344']);palette('inkPalette','ink',['#262626','#ffffff','#183452','#793344']);if(s.art){$('size').value=+(s.width*units()).toFixed(1);$('sizelabel').firstElementChild.textContent='Ширина, '+(mod||s.mm?'мм':'%');$('angle').value=Math.round(s.angle);$('opacity').value=s.opacity;$('intensity').value=s.intensity;$('method').value=s.method;$('finishSummary').textContent=$('method').selectedOptions?.[0]?.textContent||''}}
function set(key,value){if(key==='bothSides'&&!value)mugCopy=0;if(s[key]===value)return;remember();s[key]=value;if(['method','ink'].includes(key))recolor();sync();render();persist()}
function graphicQuad(pr,state=s,image=art,aspect=ratio){const rad=state.angle*Math.PI/180,co=Math.cos(rad),si=Math.sin(rad),h=state.width*image.height/image.width;return [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([x,y])=>pr.map(state.x+x*state.width*co-y*h*si,state.y+(x*state.width*si+y*h*co)*aspect))}
function curvedArtHit(p){
 if(!objectQuad||!art)return false;
 const body=projection(),[u,v]=body.inverse(...p);
 if(!body.contains(...p)||v<0||v>1)return false;
 const a=s.angle*Math.PI/180, dx=u-s.x,dy=(v-s.y)/body.ratio;
 return Math.abs(dx*Math.cos(a)+dy*Math.sin(a))<=s.width/2 &&
   Math.abs(-dx*Math.sin(a)+dy*Math.cos(a))<=s.width*art.height/art.width/2;
}
function curvedOutline(t,body){
 const uv=graphicQuad({map:(u,v)=>[u,v]});
 t.beginPath();
 uv.forEach((a,i)=>{
   const b=uv[(i+1)%4];
   for(let k=0;k<=24;k++){
     const f=k/24,p=body.map(a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f);
     if(!i&&!k)t.moveTo(...p);else t.lineTo(...p);
   }
 });
 t.strokeStyle='#00bbaa';t.lineWidth=1.25;t.stroke();
 for(const a of uv){const [x,y]=body.map(...a);t.fillStyle='white';t.fillRect(x-4,y-4,8,8);t.strokeRect(x-4,y-4,8,8)}
}
function trace(t,q){t.beginPath();q.forEach(([x,y],i)=>i?t.lineTo(x,y):t.moveTo(x,y));t.closePath()}
function outline(t,q){trace(t,q);t.strokeStyle='#00bbaa';t.lineWidth=1.25;t.stroke();for(const [x,y] of q){t.fillStyle='white';t.fillRect(x-4,y-4,8,8);t.strokeRect(x-4,y-4,8,8)}}
function mugOutline(t,w,h){
 const view=mugView(w,h,mugEditorState()),corners=graphicQuad({map:(u,v)=>[u+mugCopy,v]});
 const handles=[];
 t.save();t.strokeStyle='#00bbaa';t.lineWidth=1.5;t.fillStyle='white';t.beginPath();
 for(let i=0;i<4;i++){
   const a=corners[i],b=corners[(i+1)%4];let connected=false;
   for(let j=0;j<=48;j++){
     const f=j/48,p=view.map(a[0]+f*(b[0]-a[0]),a[1]+f*(b[1]-a[1]));
     if(p){t[connected?'lineTo':'moveTo'](...p);connected=true}else connected=false;
   }
   const handle=view.map(...a);if(handle)handles.push(handle);
 }
 t.stroke();
 for(const [x,y] of handles){t.fillRect(x-4,y-4,8,8);t.strokeRect(x-4,y-4,8,8)}
 t.restore();return handles;
}
const bitmapCache=new WeakMap();
function layerBitmap(layer,image,output){
 if(output)return graphicBitmap(image,layer,4096);
 const key=JSON.stringify([layer.ink,layer.method]);
 const cached=bitmapCache.get(image);
 if(cached?.key===key)return cached.canvas;
 const canvas=graphicBitmap(image,layer);bitmapCache.set(image,{key,canvas});return canvas;
}
const inkSurface=document.createElement('canvas');
function notebookInk(mark,layer,scene,pixelWidth){
 if(scene.studioLight===0||layer.method==='blind')return mark;
 const w=Math.min(mark.width,Math.max(1,Math.ceil(pixelWidth))),h=Math.max(1,Math.round(w*mark.height/mark.width));
 if(inkSurface.width!==w||inkSurface.height!==h){inkSurface.width=w;inkSurface.height=h}
 const t=inkSurface.getContext('2d');
 t.clearRect(0,0,w,h);t.drawImage(mark,0,0,w,h);
 // Project a fixed studio strip into the coordinate system of the printed layer.
 const tilt=.18,angle=layer.angle*Math.PI/180-tilt;
 const dx=Math.cos(angle),dy=-Math.sin(angle),units=w/layer.width;
 const center=.5+.55*Math.sin(2*scene.yaw+.42)+.1*Math.sin(scene.pitch);
 const offset=(center-layer.x)*Math.cos(tilt)-((layer.y-.5)*210/145)*Math.sin(tilt);
 const cx=w/2+units*offset*dx,cy=h/2+units*offset*dy,r=units*.16;
 const beam=t.createLinearGradient(cx-r*dx,cy-r*dy,cx+r*dx,cy+r*dy);
 for(const [stop,alpha] of [[0,0],[.24,.08],[.47,.38],[.56,.40],[.8,.12],[1,0]]){
  beam.addColorStop(stop,'rgba(250,251,253,'+alpha*(scene.glossy?.66:1)*(scene.studioLight??100)/100+')');
 }
 t.globalCompositeOperation='source-atop';t.fillStyle=beam;t.fillRect(0,0,w,h);
 t.globalCompositeOperation='source-over';return inkSurface;
}
function mugArtwork(items,output){
 const width=output?4096:2048,atlas=document.createElement('canvas');
 atlas.width=width;atlas.height=Math.round(width/Math.PI);
 const t=atlas.getContext('2d');t.imageSmoothingQuality='high';
 for(const layer of items){
  const image=images.get(layer.art),mark=layerBitmap(layer,image,output);
  const w=layer.width*width,h=w*image.height/image.width;
  t.globalAlpha=layer.opacity/100*(1-.07*layer.intensity/100);
  for(const copy of layer.bothSides?[0,.5]:[0]){
   const u=(layer.x+copy)%1;
   for(const offset of [-1,0,1]){
    t.save();t.translate((u+offset)*width,layer.y*atlas.height);t.rotate(layer.angle*Math.PI/180);
    t.drawImage(mark,-w/2,-h/2,w,h);t.restore();
   }
  }
 }
 return atlas;
}
function merchAtlases(faces,items,getMark,resolution){
 const result={};
 for(const [side,{width,height}] of Object.entries(faces)){
  const aspect=width/height;
  const visible=items.filter(item=>item.bothSides||(item.bagSide||'front')===side);
  if(!visible.length)continue;
  const c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(resolution*Math.min(1,aspect)));
  c.height=Math.max(1,Math.round(c.width/aspect));
  const t=c.getContext('2d');
  const ink=visible.some(layer=>layer.method==='blind')?document.createElement('canvas'):null;
  if(ink){ink.width=c.width;ink.height=c.height;result[side+'Ink']=ink}
  const inkContext=ink?.getContext('2d');
  for(const layer of visible){
   const mark=getMark(layer);if(!mark)continue;
   const width=layer.width*c.width,height=width*mark.height/mark.width;
   const draw=ctx=>{
    ctx.translate(layer.x*c.width,layer.y*c.height);ctx.rotate(layer.angle*Math.PI/180);
    ctx.globalAlpha=layer.opacity/100*(layer.method==='blind'?.38:1);
    ctx.drawImage(mark,-width/2,-height/2,width,height);
   };
   t.save();draw(t);t.restore();
   if(inkContext){
    inkContext.save();
    if(layer.method==='blind')inkContext.globalCompositeOperation='destination-out';
    draw(inkContext);inkContext.restore();
   }
  }
  result[side]=c;
 }
 return result;
}
let merchView=null,merchAtlasCache;
function paintProduct(t,w,h,items,output,transparentBackdrop){
 const spec=merch[s.mode];
 const faces=isCartonMode(s.mode)?cartonPrintFaces(s.carton):{front:spec,back:spec};
 const previewAsset=s.scenePose?.previewAsset;
 let atlas=previewAsset?.atlas;
 if(!atlas){
  const key=JSON.stringify([s.mode,faces,...items.map(l=>[l.name,l.bagSide,l.bothSides,l.x,l.y,l.angle,l.width,l.ink,l.opacity,l.method,l.intensity])]);
  const sources=items.map(l=>images.get(l.art));
  atlas=merchAtlasCache?.atlas;
  if(output||!atlas||key!==merchAtlasCache.key||sources.some((img,i)=>img!==merchAtlasCache.sources[i])){
   atlas=merchAtlases(faces,items,l=>layerBitmap(l,images.get(l.art),output),output&&!previewAsset?3508:1024);
   if(previewAsset)previewAsset.atlas=atlas;
   else if(!output)merchAtlasCache={key,sources,atlas};
  }
 }
 const tiles=drawMerch(t,w,h,{...s,transparentBackdrop},atlas);
 if(output)return;
 surface=objectQuad=frameBox=merchView=null;
 hitAreas=items.map((l,i)=>{
  const main=l.bagSide||'front',other=main==='front'?'back':'front';
  const panel=faces[main]||faces.front,aspect=panel.width/panel.height;
  const choices=[merchProjection(tiles,main),l.bothSides&&merchProjection(tiles,other)].filter(Boolean);
  const view=choices.find(v=>v.contains(v.map(l.x,l.y)))||choices[0];
  if(i===active&&view){
   merchView=view;surface=true;ratio=aspect;
   if(view.contains(view.map(l.x,l.y))||s.mode==='carton0201'&&s.carton.opening===0){
    objectQuad=graphicQuad(view,l,images.get(l.art),aspect);
    if(selected)outline(t,objectQuad);
   }
  }
  return p=>choices.some(v=>{
   if(!v.contains(p))return false;
   const [x,y]=v.inverse(...p);return withinArt(x-l.x,(y-l.y)/aspect,l);
  });
 });
}
let lastAtlas;
function paint(t,w,h,output=false,transparentBackdrop=false,matchView=false){
 const items=currentLayers(),areas=[];
 if(merch[s.mode])return paintProduct(t,w,h,items,output,transparentBackdrop);
 const z=output&&!matchView&&s.mode==='photo'?1:s.zoom;
 if(s.mode==='mug'){
  let state={...mugEditorState(output&&!matchView),transparentBackdrop},mark=bitmap;
  if(items.length>1){
   const key=items.map(layer=>[images.get(layer.art),layer.x,layer.y,layer.width,layer.angle,layer.method,layer.ink,layer.opacity,layer.intensity,layer.bothSides]);
   if(output)mark=mugArtwork(items,true);
   else{
    if(!lastAtlas||key.length!==lastAtlas.key.length||key.some((row,i)=>row.some((v,j)=>v!==lastAtlas.key[i][j])))lastAtlas={key,mark:mugArtwork(items,false)};
    mark=lastAtlas.mark;
   }
   state={...state,x:.5,y:.5,width:1,angle:0,bothSides:false,opacity:100,intensity:0};
  }else if(output&&art)mark=layerBitmap(s,art,true);
  drawMug(t,w,h,state,mark,output);
  if(!output){
   ratio=Math.PI;surface=null;frameBox=null;objectQuad=selected&&bitmap?mugOutline(t,w,h):null;
   const view=mugView(w,h,state);
   hitAreas=items.map(layer=>p=>{
    const [u,v]=view.inverse(...p);
    if(Math.abs(p[0]-view.cx)>=40*view.scale||u<=.037||u>=.963||v<0||v>1)return false;
    let dx=(u-layer.x+1.5)%1-.5;if(layer.bothSides)dx=(dx+1.25)%.5-.25;
    return withinArt(dx,(v-layer.y)/Math.PI,layer);
   });
  }
  return;
 }
 let box=null,cover=null,bagFaces=null,overlay=null;
 const options={transparentBackdrop,scenePose:s.scenePose,glossy:s.glossy,yaw:s.yaw,pitch:s.pitch,zoom:z,cover:s.cover,background:s.background,studioLight:s.studioLight};
 if(s.mode==='model')cover=model.drawNotebook(t,w,h,options);
 else if(s.mode==='bag')bagFaces=drawBag(t,w,h,{...s,zoom:z,transparentBackdrop});
 else if(photo){
  const k=Math.min(w/photo.width,h/photo.height)*z,W=photo.width*k,H=photo.height*k;
  box=[(w-W)/2,(h-H)/2,W,H];if(!transparentBackdrop){t.fillStyle='#e8e6e3';t.fillRect(0,0,w,h)}t.drawImage(photo,...box);
 }
 items.forEach((layer,i)=>{
  const primarySide=layer.bagSide||'front';
  const side=bagFaces&&layer.bothSides&&!bagFaces[primarySide]?(primarySide==='front'?'back':'front'):primarySide;
  const q=box?layer.corners.map(([u,v])=>[box[0]+u*box[2],box[1]+v*box[3]]):bagFaces?bagFaces[side]:cover;
  if(!q)return;
  const body=box&&layer.surfaceType==='cylinder'?cylinder(box,layer.body):null,pr=body||plane(q);
  if(!pr)return;
  const dist=(a,b)=>Math.hypot(q[a][0]-q[b][0],q[a][1]-q[b][1]);
  const aspect=body?body.ratio:box?(dist(0,1)+dist(3,2))/(dist(0,3)+dist(1,2)):bagFaces?units()/bagFormats[s.bagFormat].height:145/210;
  const image=images.get(layer.art),artQ=graphicQuad(pr,layer,image,aspect);
  if(!(original&&!output)){
   const baseMark=layerBitmap(layer,image,output);
   const inkResolution=output?baseMark.width:Math.max(64,Math.hypot(artQ[1][0]-artQ[0][0],artQ[1][1]-artQ[0][1])*t.getTransform().a*1.6);
   const mark=bagFaces&&layer.method!=='blind'?bagInk(baseMark,q,artQ,bagFaces.normals[side],s,inkResolution):box||bagFaces?baseMark:notebookInk(baseMark,layer,s,output?baseMark.width:Math.hypot(artQ[1][0]-artQ[0][0],artQ[1][1]-artQ[0][1])*t.getTransform().a*1.6);t.save();
   if(!body){trace(t,q);t.clip()}
   t.globalAlpha=layer.opacity/100;
   if(layer.method==='blind'){t.globalCompositeOperation='multiply';t.globalAlpha*=.18+.38*layer.intensity/100;t.shadowColor='white';t.shadowOffsetY=1.5;t.shadowBlur=1}
   else t.globalAlpha*=layer.method==='print'?1-.07*layer.intensity/100:.45+.55*layer.intensity/100;
   const draw=ctx=>body?wrapImage(ctx,mark,body,layer,w,h):stamp(ctx,mark,artQ);
   if(box&&(!compareFlat||output)){
    const light={...defaults,...layer.lighting};
    if(light.angle===null){light.angle=photoAngle(photo,pr,box);if(!output&&i===active){$('direction').value=light.angle;$('directionVal').textContent=light.angle+'°'}}
    paintLight(t,w,h,pr,light,draw);
   }else draw(t);
   t.restore();
   areas[i]=p=>{
    if(body?!body.contains(...p):!inside(p,q))return false;
    const [u,v]=pr.inverse(...p);return withinArt(u-layer.x,(v-layer.y)/aspect,layer);
   };
  }
  if(i===active)overlay={q,body,aspect,artQ};
 });
 if(bagFaces)bagFaces.hardware();
 if(s.mode==='model')model.drawNotebookForeground(t,w,h,options);
 if(!output){
  hitAreas=areas;frameBox=box;surface=overlay?.q||null;objectQuad=original?null:overlay?.artQ||null;
  if(overlay){
   ratio=overlay.aspect;
   if(editPlane){if(overlay.body)drawGuides(t,overlay.body);else outline(t,overlay.q)}
   else if(selected&&objectQuad){if(overlay.body)curvedOutline(t,overlay.body);else outline(t,objectQuad)}
  }
 }
}
function withinArt(dx,dy,layer){
 const a=layer.angle*Math.PI/180,image=images.get(layer.art);
 return Math.abs(dx*Math.cos(a)+dy*Math.sin(a))<=layer.width/2&&
 Math.abs(-dx*Math.sin(a)+dy*Math.cos(a))<=layer.width*image.height/image.width/2;
}
function mobileEditor(){return window.matchMedia('(max-width:720px)').matches}
function mugEditorState(output=false){
 return {...s,zoom:s.zoom*.8,mobileEditor:!output&&mobileEditor()};
}
function render(){syncCropFrame();cancelAnimationFrame(drawId);if(!ready)return;drawId=requestAnimationFrame(()=>{const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;const d=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);ctx.setTransform(d,0,0,d,0,0);paint(ctx,w,h)})}
new ResizeObserver(render).observe(canvas);
function projection(){if(merch[s.mode])return merchView;if(s.mode==='mug')return mugView(canvas.clientWidth,canvas.clientHeight,mugEditorState());return curved()&&frameBox?cylinder(frameBox,s.body):surface&&plane(surface)}
const point=e=>{const r=canvas.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top]};
canvas.onpointerdown=e=>{if(drag)return;const p=point(e);let type='',i=-1;
 const handle=selected&&objectQuad?.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<14);
 if(!editPlane&&!handle){
  const index=hitAreas.findLastIndex(hit=>hit?.(p));
  if(index>=0&&index!==active){activate(index);selected=false;paint(ctx,canvas.clientWidth,canvas.clientHeight)}
 }
 if(s.mode==='mug'){
 const view=projection(),[u,v]=view.inverse(...p);
 let dx=((u-s.x+1.5)%1)-.5;
 if(s.bothSides)dx=((dx+1.25)%.5)-.25;
 const dy=(v-s.y)/Math.PI,a=s.angle*Math.PI/180;
 const hit=bitmap&&Math.abs(p[0]-view.cx)<40*view.scale&&u>.037&&u<.963&&v>=0&&v<=1&&
 Math.abs(dx*Math.cos(a)+dy*Math.sin(a))<s.width/2&&Math.abs(-dx*Math.sin(a)+dy*Math.cos(a))<s.width*bitmap.height/bitmap.width/2;
 const onHandle=selected&&objectQuad?.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<14);
 type=onHandle?'resize':hit?'art':'orbit';
 if(hit&&!onHandle)mugCopy=s.bothSides&&Math.abs(((u-s.x+1.5)%1)-.5)>.25?.5:0;
 }else if(editPlane&&surface){i=(curved()?projection().handles:surface).findIndex(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<22);if(i>=0)type=curved()?'body':'corner'}else if(selected&&objectQuad&&objectQuad.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<12))type='resize';else if(merch[s.mode]?hitAreas[active]?.(p):curved()?curvedArtHit(p):inside(p,objectQuad))type='art';else if(s.mode!=='photo')type='orbit';selected=type==='art'||type==='resize';render();if(!type)return;const uv=projection()?.inverse(...p);drag={type,i,p,uv,start:structuredClone(s),id:e.pointerId,changed:false};canvas.setPointerCapture(e.pointerId)};
canvas.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;const p=point(e),d=drag,dx=p[0]-d.p[0],dy=p[1]-d.p[1];if(Math.abs(dx)+Math.abs(dy)<2&&!d.changed)return;if(!d.changed){remember();d.changed=true}
 if(d.type==='orbit'){s.yaw=d.start.yaw+dx*.009;s.pitch=clamp(d.start.pitch+dy*.007,-1.15,1.15)}
 else if(d.type==='body'){
   const [x,y,w,h]=frameBox,b={...d.start.body},shape=cylinder(frameBox,b);
   const [px,py]=shape.local(...p),u=(px-x)/w,v=(py-y)/h;
   b.baseLeft??=b.left;b.baseRight??=b.right;
   if(d.i===6){
     const bearing=q=>Math.atan2(q[1]-shape.cy,q[0]-shape.cx);
     b.rotation=shape.angle+bearing(p)-bearing(d.p);
     b.pivotX=shape.pivotX;b.pivotY=shape.pivotY;
   }
   if(d.i===4 || d.i===5){
     if(d.i===4)b.baseLeft=clamp(u,0,b.baseRight-.041);
     else b.baseRight=clamp(u,b.baseLeft+.041,1);
     b.bottom=clamp(v,b.top+.041,1-b.bend);
   }
   if(d.i<2){if(d.i===0)b.left=clamp(u,0,b.right-.041);else b.right=clamp(u,b.left+.041,1);b.top=clamp(v,0,b.bottom-.041)}
   if(d.i===2)b.bend=clamp(v-b.top,0,Math.min(.25,1-b.bottom));
   if(d.i===3)b.bottom=clamp(v-b.bend,b.top+.041,1-b.bend);
   if(validBody(b))s.body=b;
 }
 else if(d.type==='corner'){const [x,y,w,h]=frameBox,qs=s.corners.map(a=>[...a]);qs[d.i]=[clamp((p[0]-x)/w,0,1),clamp((p[1]-y)/h,0,1)];if(convex(qs))s.corners=qs}
 else if(s.mode==='mug'&&d.type==='resize'){
 const view=projection(),center=d.start.x+mugCopy;
 const distance=([u,v])=>Math.hypot(((u-center+2.5)%1)-.5,(v-d.start.y)/Math.PI);
 s.width=clamp(d.start.width*distance(view.inverse(...p))/Math.max(.0001,distance(d.uv)),.005,2);
 $('size').value=+(s.width*units()).toFixed(1);
 }
 else if(s.mode==='mug'&&d.type==='art'){
 const [u,v]=projection().inverse(...p);
 s.x=(d.start.x+u-d.uv[0]+2)%1;s.y=clamp(d.start.y+v-d.uv[1],0,1);
 }
 else if(surface){const uv=projection()?.inverse(...p);if(!uv||!d.uv)return;if(d.type==='art'){s.x=clamp(d.start.x+uv[0]-d.uv[0],0,1);s.y=clamp(d.start.y+uv[1]-d.uv[1],0,1)}else{const radius=v=>Math.hypot(v[0]-s.x,(v[1]-s.y)/ratio);s.width=clamp(d.start.width*radius(uv)/Math.max(.0001,radius(d.uv)),.005,2);$('size').value=+(s.width*units()).toFixed(1)}}render()};
canvas.onpointerup=canvas.onpointercancel=e=>{if(drag?.id===e.pointerId){drag=null;sync();persist()}};
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),10000)}
function mugDefaults(){return {...fresh('mug'),x:.75,width:.16}}
$('resetBackground').onclick=()=>set('background','');
function syncStudioLight(){
 const value=s.studioLight+'%';
 $('studioLight').value=s.studioLight;
 $('studioLight').setAttribute('aria-valuetext',value);
 $('studioLightValue').textContent=value;
 $('studioLight').style.setProperty('--fill',value);
}
let adjustingLight=false;
$('studioLight').oninput=e=>{
 if(!adjustingLight){remember();adjustingLight=true}
 s.studioLight=e.target.valueAsNumber;
 syncStudioLight();render();persist();
};
$('studioLight').onchange=()=>{adjustingLight=false;sync()};
$('glossy').onchange=e=>set('glossy',e.target.checked);
$('bothSides').onchange=e=>set('bothSides',e.target.checked);
function home(){cropDraft=cropDrag=null;syncCropFrame();if(ready){clearTimeout(persistTimer);persistSession();task(flushModel)}epoch++;ready=false;$('studio').hidden=true;$('welcome').hidden=false;for(const id of ['undo','redo','exports'])$(id).hidden=true;$('docname').textContent='Студия мокапов';window.scrollTo(0,0)}
$('home').onclick = $('change').onclick = home;
for(const key of ['length','depth','height','thickness','lidHeight','material']){
 const input=$('carton-'+key);
 input.onchange=()=>{
  if(!isCartonMode(s.mode))return;
  const value=key==='material'?input.value:input.valueAsNumber;
  const next=normalizeCarton({...s.carton,[key]:value},s.mode);
  if((key!=='material'&&!input.validity.valid)||next[key]===s.carton[key]){sync();return}
  remember();
  const previousFaces=cartonPrintFaces(s.carton),nextFaces=cartonPrintFaces(next);
  const scaleWidth=layer=>{
   const side=layer.bagSide||'front';
   return layer.width*previousFaces[side].width/nextFaces[side].width;
  };
  layers=currentLayers().map(layer=>({...layer,width:scaleWidth(layer)}));
  s.width=scaleWidth(s);s.carton=next;
  if(!cartonAllowsGloss(next))s.glossy=false;
  sync();render();persist();
 };
}
const thicknessLabel=new Intl.NumberFormat('ru-RU');
function syncCartonThickness(box){
 const picker=$('carton-thickness-preset');
 const editingCustom=picker.value==='custom';
 $('carton-thickness-title').textContent=box.material==='bookboard'?'Типовая толщина':'Профиль гофрокартона';
 const options=cartonThicknessPresets(box).map(([profile,mm])=>{
  const size=thicknessLabel.format(mm)+' мм';
  return new Option(profile?profile+' · '+size:size,mm);
 });
 picker.replaceChildren(...options,new Option('Своя толщина','custom'));
 const matchesPreset=options.some(option=>Number(option.value)===box.thickness);
 picker.value=!editingCustom&&matchesPreset?String(box.thickness):'custom';
 $('carton-thickness-label').hidden=picker.value!=='custom';
}
$('carton-thickness-preset').onchange=e=>{
 const field=$('carton-thickness');
 const custom=e.target.value==='custom';
 $('carton-thickness-label').hidden=!custom;
 if(custom){field.focus();field.select();return}
 field.value=e.target.value;
 field.onchange();
};
const cartonFaceViews={
 wallFront:[.20,-.24],wallBack:[Math.PI+.20,-.24],
 left:[Math.PI/2,-.22],right:[-Math.PI/2,-.22],bottom:[.30,.84]
};
$('cartonPrintFace').onchange=e=>{
 const side=e.target.value;
 if(!isCartonMode(s.mode)||!art||side===s.bagSide)return;
 const faces=cartonPrintFaces(s.carton),panel=faces[side];
 if(!panel)return;
 remember();
 const widthInMm=s.width*units();
 const radians=s.angle*Math.PI/180,cos=Math.abs(Math.cos(radians)),sin=Math.abs(Math.sin(radians));
 const imageRatio=art.height/art.width;
 // Keep the physical width when there is room on the destination face.
 const fit=.90*Math.min(panel.width/(cos+sin*imageRatio),panel.height/(sin+cos*imageRatio));
 s.bagSide=side;s.width=Math.min(widthInMm,fit)/panel.width;s.x=.5;s.y=.5;
 const opensOnHinge=s.mode==='carton'||s.mode==='magneticBox';
 const coverView=opensOnHinge&&s.carton.opening>=65?[Math.PI+.28,-.30]:[.42,-.65];
 [s.yaw,s.pitch]=cartonFaceViews[side]||coverView;
 selected=true;sync();render();persist();
};
const cartonColorRows=[];
bindCartonColor($('carton-coating'),'coating',()=>isCartonMode(s.mode));
bindCartonColor($('carton-magnetic-cover'),'lidColor',()=>s.mode==='magneticBox');
$('carton-reset-coating').onclick=()=>set('carton',{...s.carton,coating:''});
$('carton-finish').onchange=e=>set('glossy',cartonAllowsGloss(s.carton)&&e.target.value==='glossy');
function rigidColorDefaults(box){
 const lining=cartonMaterials[box.material].surface;
 return {lidColor:box.coating||lining,insideColor:lining};
}
for(const key of ['lidColor','insideColor']){
 const picker=$('carton-'+key);
 $('carton-'+key+'-on').onchange=e=>{
  set('carton',{...s.carton,[key]:e.target.checked?rigidColorDefaults(s.carton)[key]:''});
 };
 bindCartonColor(picker,key,()=>s.mode==='rigidBox'&&s.carton[key]);
}
function bindCartonColor(picker,key,enabled){
 let picking=false;
 function preview(){
  if(!enabled()||s.carton[key]===picker.value)return;
  if(!picking){remember();picking=true}
  s.carton={...s.carton,[key]:picker.value};
  render();
 }
 picker.oninput=preview;
 function finishPicking(){
  if(!picking)return;
  picking=false;
  rememberColor(picker.value);sync();persist();
 }
 picker.onchange=()=>{preview();finishPicking()};
 picker.onblur=finishPicking;
 const rows=document.createElement('div');rows.className='palette';
 picker.closest('label').after(rows);
 cartonColorRows.push(()=>{
  rows.replaceChildren();
  if(!enabled())return;
  colorRows(rows,s.carton[key]||picker.value,color=>{
   picker.value=color;preview();finishPicking();
  });
 });
}
function updateCartonOpening(){
 const opening=s.carton.opening;
 const value=s.mode==='carton0201'?Math.round(opening/1.1)+'%':opening+(s.mode==='rigidBox'?'%':'°');
 $('cartonAngle').textContent=value;
 $('carton-opening').setAttribute('aria-valuetext',value);
}
let adjustingCarton=false;
$('carton-opening').oninput=e=>{
 if(!isCartonMode(s.mode))return;
 if(!adjustingCarton){remember();adjustingCarton=true}
 s.carton={...s.carton,opening:+e.target.value};
 updateCartonOpening();
 render();
};
$('carton-opening').onchange=()=>{adjustingCarton=false;sync();persist()};
$('bagFormat').onchange=e=>set('bagFormat',e.target.value);
$('bagSide').onchange=e=>{
 remember();s.bagSide=e.target.value;
 if((Math.cos(s.yaw)>0)!==(s.bagSide==='front'))s.yaw+=Math.PI;
 sync();render();persist();
};
$('choosephoto').onclick = () => $('photoInput').click();
async function photoFile(f){if(!f)return;await newProject('photo',await prepare(f,false))}
function fileInput(id,fn){$(id).onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)task(()=>fn(f))}}
fileInput('photoInput',photoFile);for(const ev of ['dragenter','dragover'])$('choosephoto').addEventListener(ev,e=>{e.preventDefault();$('choosephoto').classList.add('drag')});$('choosephoto').ondragleave=()=>$('choosephoto').classList.remove('drag');$('choosephoto').ondrop=e=>{e.preventDefault();$('choosephoto').classList.remove('drag');task(()=>photoFile(e.dataTransfer.files[0]))};
$('addArt').onclick=()=>$('artInput').click();$('artInput').onchange=e=>task(async()=>{
 const files=Array.from(e.target.files),token=epoch;e.target.value='';
 const additions=[];
 for(const file of files){
  const data=await prepare(file,true);
  additions.push({layer:{...layerData(s.mode==='mug'?mugDefaults():fresh(s.mode)),art:data,name:file.name},image:await img(data)});
 }
 if(!additions.length||token!==epoch||!ready)return;
 remember();layers=currentLayers();
 for(const item of additions){images.set(item.layer.art,item.image);layers.push(item.layer)}
 active=-1;activate(layers.length-1);
});
$('remove').onclick=()=>{
 remember();layers=currentLayers();const removed=layers.splice(active,1)[0];
 if(removed&&!layers.some(layer=>layer.art===removed.art))images.delete(removed.art);
 const index=Math.max(0,Math.min(active,layers.length-1));active=-1;activate(index);
};
$('originalInk').onclick=()=>set('ink','');
for(const panel of document.querySelectorAll('aside details'))panel.addEventListener('toggle',()=>{
 if(panel.open)for(const other of document.querySelectorAll('aside details[open]'))if(other!==panel)other.open=false;
 if(!panel.open&&panel.id==='photoBlock'&&editPlane){editPlane=false;sync();render()}
});
function chooseSurface(type){
 if(type==='plane'&&!s.perspectiveSet){
  const full=JSON.stringify(s.corners)==='[[0,0],[1,0],[1,1],[0,1]]';
  if(full){
   remember();
   const [x,y,w,h]=frameBox||[0,0,1,1];
   const l=Math.max(0,-x/w),r=Math.min(1,(canvas.clientWidth-x)/w),t=Math.max(0,-y/h),b=Math.min(1,(canvas.clientHeight-y)/h);
   const dx=(r-l)*.1,dy=(b-t)*.1;
   s.corners=[[l+dx,t+dy],[r-dx,t+dy],[r-dx,b-dy],[l+dx,b-dy]];
  }
  s.perspectiveSet=true;
 }
 selected=false;const changed=s.surfaceType!==type;if(changed){remember();s.surfaceType=type}
 editPlane=changed||!editPlane;original=false;sync();render();persist();
}
$('surfaceTilt').onchange=e=>{
 const degrees=e.target.valueAsNumber;
 if(!Number.isFinite(degrees)){sync();return}
 const shape=cylinder(frameBox,s.body);
 set('body',{...s.body,rotation:clamp(degrees,-180,180)*Math.PI/180,pivotX:shape.pivotX,pivotY:shape.pivotY});
};
$('persp').onclick=()=>chooseSurface('plane');$('cylinder').onclick=()=>chooseSurface('cylinder');$('compare').onclick=()=>{original=!original;selected=false;if(original)editPlane=false;sync();render()};
$('quarterTurn').onclick=()=>{
 const next=s.angle+90;
 set('angle',next>180?next-360:next);
};
$('size').onchange=e=>set('width',clamp(+e.target.value/units(),.005,2));$('angle').onchange=e=>set('angle',clamp(+e.target.value,-180,180));$('calibration').onchange=e=>set('mm',clamp(+e.target.value,0,10000));for(const id of ['method','opacity','intensity'])$(id).onchange=e=>set(id,id==='method'?e.target.value:+e.target.value);
for(const b of document.querySelectorAll('[data-x]'))b.onclick=()=>set('x',s.mode==='mug'?({left:.62,center:.75,right:.87}[b.dataset.x]):b.dataset.x==='center'?.5:b.dataset.x==='left'?Math.min(.5,s.width/2):Math.max(.5,1-s.width/2));
$('minus').onclick=()=>set('zoom',clamp(s.zoom-.1,.4,2));$('plus').onclick=()=>set('zoom',clamp(s.zoom+.1,.4,2));$('resetview').onclick=()=>{remember();Object.assign(s,isCartonMode(s.mode)?{yaw:.42,pitch:-.55,zoom:1}:{yaw:-.26,pitch:-.2,zoom:1});sync();render();persist()};
function historyStep(from,to){if(!from.length)return;to.push(structuredClone(snapshot()));task(()=>loadState(from.pop()))}
$('undo').onclick=()=>historyStep(undo,redo);$('redo').onclick=()=>historyStep(redo,undo);
let cropDraft=null,cropDrag=null;
const cropOverlay=$('cropOverlay'),cropFrame=$('cropFrame'),cropToggle=$('cropToggle');
const cropFormats=[...$('cropFormats').querySelectorAll('button')];

function sourcePrintSize(matchView=false){
 if(!matchView&&s.mode==='photo'){
  const scale=Math.max(1,3508/Math.max(photo.width,photo.height));
  return [photo.width,photo.height].map(n=>Math.max(1,Math.round(n*scale)));
 }
 const w=canvas.clientWidth,h=!matchView&&mobileEditor()?Math.round(canvas.clientHeight/1.2):canvas.clientHeight;
 const longest=matchView&&s.mode==='photo'?Math.max(3508,photo.width,photo.height):3508;
 const scale=longest/Math.max(w,h,1);
 return [w,h].map(n=>Math.max(1,Math.round(n*scale)));
}
function printArea(crop=s.crop){
 const [width,height]=sourcePrintSize(!!crop);
 const area=crop?exportCrop(crop,canvas.clientWidth,canvas.clientHeight,width,height):{x:0,y:0,w:width,h:height};
 return {width,height,area};
}
function syncCropFrame(){
 const crop=cropDraft||s.crop;
 const w=canvas.clientWidth,h=canvas.clientHeight;
 cropOverlay.hidden=!crop||!w||!h;
 cropOverlay.classList.toggle('is-editing',!!cropDraft);
 cropOverlay.closest('.stage').classList.toggle('cropping',!!cropDraft);
 $('cropControls').hidden=!cropDraft;
 cropToggle.setAttribute('aria-pressed',String(!!cropDraft||!!s.crop));
 if(!crop||!w||!h)return;
 const box=cropPixels(crop,w,h);
 Object.assign(cropFrame.style,{left:box.x+'px',top:box.y+'px',width:box.w+'px',height:box.h+'px'});
 if(cropDraft){
  const {area}=printArea(crop);
  $('cropSize').textContent=area.w+' × '+area.h+' px';
  for(const button of cropFormats)button.setAttribute('aria-pressed',String(button.dataset.cropFormat===crop.format));
 }
}
function finishCrop(crop,commit){
 cropDraft=cropDrag=null;
 if(commit&&JSON.stringify(s.crop)!==JSON.stringify(crop))set('crop',crop);
 else render();
 cropToggle.focus({preventScroll:true});
}
cropToggle.onclick=()=>{
 if(cropDraft){finishCrop(null,false);return}
 cropDraft=s.crop||{x:.08,y:.08,w:.84,h:.84,format:'free'};
 selected=editPlane=original=false;
 render();
 cropFrame.focus({preventScroll:true});
};
for(const button of cropFormats)button.onclick=()=>{
 cropDraft=chooseCrop(cropDraft,button.dataset.cropFormat,canvas.clientWidth,canvas.clientHeight);
 syncCropFrame();
};
$('applyCrop').onclick=()=>finishCrop(cropDraft,true);
$('cancelCrop').onclick=()=>finishCrop(null,false);
$('clearCrop').onclick=()=>finishCrop(null,true);
cropFrame.onpointerdown=e=>{
 if(!cropDraft||cropDrag||e.button!==0)return;
 e.preventDefault();
 cropFrame.focus({preventScroll:true});
 cropDrag={id:e.pointerId,x:e.clientX,y:e.clientY,crop:cropDraft,handle:e.target.dataset.cropHandle||'move'};
 cropFrame.setPointerCapture(e.pointerId);
};
cropFrame.onpointermove=e=>{
 if(cropDrag?.id!==e.pointerId)return;
 cropDraft=dragCrop(cropDrag.crop,cropDrag.handle,e.clientX-cropDrag.x,e.clientY-cropDrag.y,canvas.clientWidth,canvas.clientHeight);
 syncCropFrame();
};
cropFrame.onpointerup=cropFrame.onpointercancel=cropFrame.onlostpointercapture=e=>{
 if(cropDrag?.id===e.pointerId)cropDrag=null;
};
cropFrame.onkeydown=e=>{
 const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
 if(!cropDraft||!delta)return;
 e.preventDefault();
 cropDraft=dragCrop(cropDraft,e.shiftKey?'se':'move',delta[0]*4,delta[1]*4,canvas.clientWidth,canvas.clientHeight);
 syncCropFrame();
};
cropOverlay.closest('.stage').addEventListener('keydown',e=>{
 if(!cropDraft)return;
 if(e.key==='Escape'){e.preventDefault();finishCrop(null,false)}
 if(e.key==='Enter'&&e.target===cropFrame){e.preventDefault();finishCrop(cropDraft,true)}
});

$('exports').onclick=()=>{
 const {area}=printArea();
 const dims=[area.w,area.h];
 const mm=dims.map(n=>(n*25.4/300).toLocaleString('ru-RU',{maximumFractionDigits:1}));
 $('printSize').textContent=dims.join(' × ')+' пикс. · '+mm.join(' × ')+' мм при 300 dpi';
 if(s.mode==='photo')$('printSize').textContent+=' · Исходное фото: '+photo.width+' × '+photo.height+' пикс.';
 $('exportDlg').showModal();
};for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>b.closest('dialog').close();
$('save').onclick=()=>{download(new Blob([JSON.stringify(snapshot())],{type:'application/json'}),'project.maketeka');$('exportDlg').close()};$('png').onclick=()=>task(async()=>{
 const button=$('png'),c=document.createElement('canvas');
 const frame=s.crop?document.createElement('canvas'):c;
 button.disabled=true;
 try{
   const {width,height,area}=printArea();
   frame.width=width;frame.height=height;
   const frameContext=frame.getContext('2d');
   frameContext.imageSmoothingQuality='high';
   paint(frameContext,width,height,true,$('transparentPng').checked,!!s.crop);
   if(frame!==c){
    c.width=area.w;c.height=area.h;
    c.getContext('2d').drawImage(frame,area.x,area.y,area.w,area.h,0,0,area.w,area.h);
   }
   const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
   if(!blob)throw Error('Не удалось создать PNG');
   download(await printPng(blob),'maketeka-300dpi.png');
   $('exportDlg').close();
 }finally{button.disabled=false;frame.width=frame.height=c.width=c.height=1}
});
$('open').onclick=()=>$('projectInput').click();fileInput('projectInput',async f=>{if(f.name.toLowerCase().endsWith('.zip')){await legacyProject(f);return}await loadState(JSON.parse(await f.text()),true)});
try{$('resume').hidden=!(localStorage.getItem(resumeModelKey)||localStorage.getItem(projectKey))}catch{}$('resume').onclick=()=>task(async()=>{
 const id=localStorage.getItem(resumeModelKey);
 const entry=id?(await list('models')).find(model=>model.id===id):null;
 await loadState(entry?.state??JSON.parse(localStorage.getItem(projectKey)),true,entry);
});


async function legacyProject(file){
 const frame=document.createElement('iframe');frame.title='Архив проекта';frame.className='legacyFrame';
 const close=document.createElement('button');close.textContent='Вернуться в maketeka';close.className='legacyClose';
 close.onclick=()=>{frame.remove();close.remove()};document.body.append(frame,close);
 frame.onload=()=>{const win=frame.contentWindow;let tries=0;const id=setInterval(()=>{const el=win.document.querySelector('#restore');if(!el){if(++tries>100)clearInterval(id);return}clearInterval(id);const dt=new win.DataTransfer();dt.items.add(file);el.files=dt.files;el.dispatchEvent(new win.Event('change',{bubbles:true}))},100)};
 frame.src='/Maketeka-demo/previous/index.html';
}

let demoFinish = 'print';
const preview = $('showcaseModel');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let rotating = !reducedMotion.matches;
const openingAngle = -.36, revolutionMs = 9000, switchMs = 2000, fadeMs = 240;
const showcasePose = {glossy:true, pitch:-.25, roll:.125};
// Use the existing notebook shadow as the fixed point on the studio floor.
const coverLayer = document.createElement('canvas');
coverLayer.width = preview.width;
coverLayer.height = preview.height;
const mugLayer = document.createElement('canvas');
mugLayer.width = 560;
mugLayer.height = 396;
const demoMug = {...mugDefaults(), bothSides:true, ...showcasePose, grounded:true, lift:7, zoom:.90, floorZoom:.86, whiteBackdrop:true, transparentBackdrop:true};
let elapsed = 0, previous = null, animation = 0, displayedModel;
const demoArt = new Image();
const finishes = new Map();
function drawCover(angle, method) {
  const t = coverLayer.getContext('2d'), w = coverLayer.width, h = 510;
  t.clearRect(0,0,w,coverLayer.height);
  const options = {yaw:angle,...showcasePose,zoom:.88,cover:'#ffffff',whiteBackdrop:true,transparentBackdrop:true};
  const q = model.drawNotebook(t,w,h,options);
  if (!q) return;
  if (!finishes.has(method)) { model.drawNotebookForeground(t,w,h,options); return; }
  const mark = finishes.get(method), width = .38, height = width * 145 / 210 * mark.height / mark.width;
  const [a,b,,d] = q;
  t.save();
  t.transform(b[0]-a[0],b[1]-a[1],d[0]-a[0],d[1]-a[1],a[0],a[1]);
  t.drawImage(notebookInk(mark,{x:.5,y:.5,width,angle:0,method},options,360),(1-width)/2,(1-height)/2,width,height);
  t.restore();
  model.drawNotebookForeground(t,w,h,options);
}
const catalog=[
 {name:'Упаковка',models:['carton','carton0201','rigidBox','magneticBox','bag','bottle']},
 {name:'Посуда',models:['mug','water']},
 {name:'Канцелярия',models:['model','pen']},
 {name:'Текстиль',models:['tee','tote']}
];
const catalogModels={
 model:{name:'Ежедневник',details:'145 × 210 мм'},
 mug:{name:'Кружка',details:'Керамика · 330 мл'},
 bag:{name:'Бумажный пакет',details:'250 × 320 × 100 мм'},
 bottle:{name:'Пакет под бутылку',details:'120 × 360 × 100 мм'},
 ...merch
};
const demoModels=['model','mug','bag','bottle','water','pen','tote','tee','carton','carton0201','rigidBox','magneticBox'];
const largeShowcase=matchMedia('(min-width: 1440px)');
const modelCategories=$('modelCategories'),modelCards=$('modelCards');
let selectedModel=null,category=catalog[2],catalogExpanded=true;
const lastModelByCategory=new Map();
const categoryButtons=catalog.map(group=>{
 const button=document.createElement('button');
 button.type='button';button.textContent=group.name;
 button.onclick=()=>{
  if(largeShowcase.matches&&group===category&&catalogExpanded){
   catalogExpanded=false;
   placeModelCards();
   return;
  }
  catalogExpanded=true;
  selectModel(lastModelByCategory.get(group)||group.models[0],group);
  placeModelCards();
 };
 modelCategories.append(button);
 return button;
});
function placeModelCards(){
 const wide=largeShowcase.matches;
 const activeButton=categoryButtons[catalog.indexOf(category)];
 if(wide&&activeButton.nextElementSibling!==modelCards)activeButton.after(modelCards);
 if(!wide&&modelCards.parentElement===modelCategories)modelCategories.after(modelCards);
 modelCards.hidden=wide&&!catalogExpanded;
 for(const button of categoryButtons){
  if(wide){
   button.setAttribute('aria-controls',modelCards.id);
   button.setAttribute('aria-expanded',String(button===activeButton&&catalogExpanded));
  }else{
   button.removeAttribute('aria-controls');
   button.removeAttribute('aria-expanded');
  }
 }
}
function renderModelCards(){
 categoryButtons.forEach((button,i)=>button.setAttribute('aria-pressed',String(catalog[i]===category)));
 modelCards.replaceChildren(...category.models.map(id=>{
  const button=document.createElement('button');
  button.type='button';button.textContent=catalogModels[id].name;button.dataset.model=id;
  button.onclick=()=>selectModel(id,category);
  return button;
 }));
 placeModelCards();
}
largeShowcase.addEventListener('change',()=>{
 placeModelCards();
 refreshDemo();
});
function selectModel(id,group){
 if(group!==category){category=group;renderModelCards()}
 if(id==='magneticBox'&&selectedModel!==id)elapsed=0;
 selectedModel=id;lastModelByCategory.set(group,id);
 $('modelDescription').setAttribute('aria-live','polite');
 showModelInfo(id);refreshDemo();
}
function showModelInfo(id){
 const {name,details}=catalogModels[id];
 $('demoName').textContent=name;$('demoDetails').textContent=details;
 preview.setAttribute('aria-label',name);displayedModel=id;
 for(const card of modelCards.children)card.setAttribute('aria-pressed',String(card.dataset.model===id));
}
// Reserve space for the longest model name and description at the current width.
const specFrames=document.createDocumentFragment();
for(const {name,details} of Object.values(catalogModels)){
 const frame=document.createElement('div'),title=document.createElement('b'),note=document.createElement('small');
 frame.className='modelDescription specMeasure';frame.setAttribute('aria-hidden','true');
 title.textContent=name;note.textContent=details;frame.append(title,note);specFrames.append(frame);
}
$('modelSpec').append(specFrames);
renderModelCards();
showModelInfo('model');
$('openPreview').onclick=()=>task(()=>{
 const id=selectedModel||displayedModel;
 return newProject(id==='bottle'?'bag':id,'',id==='bottle'?'bottle':'standard');
});
const merchDemoCache=new Map();
// Source center, then the horizontal, upper and lower extents of a full
// turn in the 840 × 594 source frame. The lower extent includes the shadow.
// The optional last value measures the object alone for the taller models.
const showcaseFrames={
 model:[420,240,145,201,252,200],
 mug:[420,277,241,202,226],
 bag:[415,236,133,192,238,192],
 bottle:[416,230,83,187,236,187],
 water:[415,242,95,214,267,213],
 pen:[419,336,187,86,156],
 tote:[413,256,146,223,252,222],
 tee:[420,279,224,211,248,209],
 carton:[420,297,267,178,213],
 carton0201:[420,297,247,207,237],
 rigidBox:[420,297,263,166,206],
 magneticBox:[420,297,271,186,227]
};
new ResizeObserver(([{contentRect:{width,height}}])=>{
 if(!width||!height)return;
 const pixels=Math.max(1,Math.round(preview.height*width/height));
 if(preview.width===pixels)return;
 preview.width=pixels;
 refreshDemo();
}).observe(preview);
function drawShowcase() {
  const interval = Math.floor(elapsed / switchMs);
  const angle = openingAngle + (elapsed % revolutionMs) / revolutionMs * 2 * Math.PI;
  const progress = Math.max(0,(elapsed % switchMs - (switchMs-fadeMs))/fadeMs);
  const blend = progress*progress*(3-2*progress);
  const current=selectedModel||demoModels[interval%demoModels.length];
  const next=demoModels[(interval+1)%demoModels.length];
  const visible=selectedModel||(blend<.5?current:next);
  if(visible!==displayedModel)showModelInfo(visible);
  const ctx=preview.getContext('2d');
  ctx.clearRect(0,0,preview.width,preview.height);ctx.save();
  const frames=selectedModel?[[current,1]]:[[current,1-blend],[next,blend]];
  for(const [kind,alpha] of frames){
   if(!alpha)continue;
   let layer=coverLayer;
   if(kind==='model')drawCover(angle,demoFinish);
   else if(kind==='mug'){
    layer=mugLayer;demoMug.yaw=angle;
    const t=layer.getContext('2d');t.clearRect(0,0,layer.width,layer.height);
    drawMug(t,layer.width,340,demoMug,finishes.get(demoFinish));
   }else if(merch[kind]){
    const t=layer.getContext('2d'),key=kind+demoFinish;
    t.clearRect(0,0,layer.width,layer.height);
    const state=fresh(kind),carton=isCartonMode(kind);
    if(kind==='tee')Object.assign(state,teeAppearance);
    const corrugated=carton&&state.carton.material!=='bookboard';
    if(corrugated)state.carton.material='white';
    if(kind==='magneticBox')state.carton.opening=9;
    if(!merchDemoCache.has(key)){
     const faces=carton?cartonPrintFaces(state.carton):{front:merch[kind],back:merch[kind]};
     const sample={...state,width:kind==='pen'?.16:kind==='tee'?state.width:.36,bothSides:!carton&&kind!=='tee'};
     const layers=[sample];
     if(corrugated){
      const logoWidth=faces.left.width*.48;
      for(const side of ['wallFront','wallBack','left','right']){
       layers.push({...sample,bagSide:side,width:logoWidth/faces[side].width});
      }
     }
     merchDemoCache.set(key,merchAtlases(faces,layers,()=>finishes.get(demoFinish),768));
    }
    const pose=carton?{...showcasePose,pitch:-.54,glossy:false}:kind==='tee'?{...showcasePose,pitch:-.19,roll:.01,glossy:false}:showcasePose;
    drawMerch(t,layer.width,carton||kind==='tee'?layer.height:510,{...state,...pose,yaw:kind==='magneticBox'?angle+.78:angle,transparentBackdrop:true},merchDemoCache.get(key),{fixedOrbit:kind==='magneticBox'});
   }else{
    const t=layer.getContext('2d'),bagFormat=kind==='bottle'?'bottle':'standard';
    t.clearRect(0,0,layer.width,layer.height);
    const {front,back,normals,hardware}=drawBag(t,layer.width,510,{...showcasePose,yaw:angle,zoom:.84,cover:'#ffffff',bagFormat,transparentBackdrop:true});
    const mark=finishes.get(demoFinish),fmt=bagFormats[bagFormat];
    const face=front||back,projection=face&&plane(face);
    if(projection&&mark){
     const quad=graphicQuad(projection,{x:.5,y:.5,width:.36,angle:0},mark,fmt.width/fmt.height);
     stamp(t,bagInk(mark,face,quad,front?normals.front:normals.back,showcasePose,320),quad);
    }
    hardware();
   }
   ctx.globalAlpha=alpha;ctx.globalCompositeOperation=!selectedModel&&kind===next?'lighter':'source-over';
   const [cx,cy,halfWidth,above,below,bodyBelow]=showcaseFrames[kind];
   const large=largeShowcase.matches;
   let verticalScale=large
    ? preview.height*.94/(above+below)
    : Math.min(preview.height*.45/above,preview.height*.465/below);
   let centerY=large ? cy+(below-above)/2 : cy;
   let frameY=preview.height/2;
   if(bodyBelow){
    verticalScale=preview.height*.91/(above+bodyBelow);
    centerY=cy+(bodyBelow-above)/2;
    frameY=preview.height*.49;
   }
   const scale=Math.min(preview.width*.43/halfWidth,verticalScale)*(kind==='pen'?.92:1);
   ctx.drawImage(layer,preview.width/2-cx*scale,frameY-centerY*scale,coverLayer.width*scale,coverLayer.height*scale);
  }
  ctx.restore();
}
function tick(now) {
  if (previous === null) previous = now;
  if (now - previous >= 16) {
    elapsed += now - previous;
    previous = now;
    drawShowcase();
  }
  animation=requestAnimationFrame(tick);
}
function refreshDemo() {
  cancelAnimationFrame(animation);
  previous=null;
  $('motion').textContent=rotating?'Ⅱ':'▶';
  $('motion').setAttribute('aria-label',rotating?'Приостановить вращение':'Включить вращение');
  if (document.hidden || $('welcome').hidden || !finishes.size) return;
  drawShowcase();

  if (rotating) animation=requestAnimationFrame(tick);
}
demoArt.onload=()=>{
  for(const method of ['print','gold','silver']) finishes.set(method,graphicBitmap(demoArt,{method}));
  refreshDemo();
};
demoArt.src=brandUrl;
$('motion').onclick=()=>{rotating=!rotating;refreshDemo()};
for(const control of document.querySelectorAll('[data-finish]')) {
  control.onclick=()=>{
    demoFinish=control.dataset.finish;
    for(const button of document.querySelectorAll('[data-finish]')) button.setAttribute('aria-pressed',String(button===control));
    refreshDemo();
  };
}
reducedMotion.addEventListener('change',()=>{rotating=!reducedMotion.matches;refreshDemo()});
document.addEventListener('visibilitychange',()=>{
 refreshDemo();
 if(document.hidden&&ready){
  clearTimeout(persistTimer);persistSession();task(flushModel);
 }
});
new MutationObserver(refreshDemo).observe($('welcome'),{attributes:true,attributeFilter:['hidden']});

function modelTitle(state){
 if(state.mode==='photo')return 'Своё фото';
 return catalogModels[state.mode==='bag'&&state.bagFormat==='bottle'?'bottle':state.mode].name;
}
function modelPreview(fallback=''){
 try{
  const thumb=document.createElement('canvas');
  thumb.width=300;thumb.height=200;
  paint(thumb.getContext('2d'),300,200,true,false,true);
  return thumb.toDataURL('image/webp',.78);
 }catch{return fallback}
}
function button(label,action){
 const element=document.createElement('button');
 element.type='button';element.textContent=label;element.onclick=()=>task(action);
 return element;
}
function submit(id,action){
 const form=$(id);
 form.onsubmit=event=>{
  event.preventDefault();
  const title=form.elements.title.value.trim();
  if(!title){form.elements.title.focus();return}
  const submitter=event.submitter;
  if(submitter?.disabled)return;
  if(submitter)submitter.disabled=true;
  task(async()=>{
   try{await action(title,form)}
   finally{if(submitter)submitter.disabled=false}
  });
 };
}
function newest(entries){return entries.sort((a,b)=>b.updated-a.updated)}
const selectedModels=new Set();

async function openCollection(){
 await flushModel();
 const [models,scenes]=await Promise.all([list('models'),list('scenes')]);
 const modelList=$('modelList'),sceneList=$('sceneList');
 modelList.replaceChildren();sceneList.replaceChildren();
 selectedModels.clear();$('buildScene').disabled=true;
 for(const entry of newest(models)){
  const card=document.createElement('article');
  const open=button(entry.title,async()=>{
   open.disabled=true;
   try{
    await loadState(entry.state,true,entry);
    $('collectionDialog').close();
   }finally{open.disabled=false}
  });
  if(entry.preview){
   const thumb=document.createElement('img');thumb.src=entry.preview;thumb.alt='';
   open.prepend(thumb);
  }
  card.append(open);
  if(entry.state.mode!=='photo'){
   const label=document.createElement('label'),check=document.createElement('input');
   check.type='checkbox';check.setAttribute('aria-label','Добавить в сцену: '+entry.title);
   check.onchange=()=>{
    if(check.checked)selectedModels.add(entry.id);
    else selectedModels.delete(entry.id);
    $('buildScene').disabled=selectedModels.size<2;
   };
   label.append(check,'В сцену');card.append(label);
  }
  modelList.append(card);
 }
 if(!models.length)modelList.textContent='Сохраните изделие из редактора, чтобы оно появилось здесь.';
 for(const entry of newest(scenes))sceneList.append(button(entry.title,()=>openScene(entry)));
 if(!scenes.length)sceneList.textContent='Выберите от двух моделей, чтобы собрать общий кадр.';
 if(!$('collectionDialog').open)$('collectionDialog').showModal();
 $('buildScene').onclick=()=>task(()=>openScene({
  title:'',background:'#eeece8',light:100,transparent:false,
  items:layoutModels(models.filter(entry=>selectedModels.has(entry.id)))
 }));
}

$('collection').onclick=()=>task(openCollection);
$('saveModel').onclick=()=>{
 $('modelForm').elements.title.value=savedModel?savedModel.title+' — копия':modelTitle(s);
 $('saveModelDialog').showModal();$('modelForm').elements.title.select();
};
submit('modelForm',async title=>{
 await flushModel();
 const entry={id:crypto.randomUUID(),title,state:snapshot(),preview:modelPreview(),updated:Date.now()};
 await put('models',entry);
 savedModel=entry;modelDirty=false;sync();persistSession();
 $('saveModelDialog').close();message('Модель сохранена');
});

function captureStyle(){
 const graphic=art?Object.fromEntries(['art','name','ink','method','opacity','intensity','bothSides'].map(key=>[key,s[key]])):null;
 const carton=s.carton;
 return {
  graphic,glossy:s.glossy,
  cover:carton?(carton.coating||cartonMaterials[carton.material].surface):s.mode==='photo'?'':s.cover,
  accent:s.mode==='bag'||merch[s.mode]?.accent?s.handleColor:'',
  ...(carton?{lidColor:carton.lidColor,insideColor:carton.insideColor}:{})
 };
}
async function applyStyle(style){
 const useColors=$('styleColors').checked&&s.mode!=='photo';
 const graphic=$('styleArtwork').checked?style.graphic:null;
 if(!useColors&&!graphic){message('Выберите доступные параметры стиля');return}
 const replacement=graphic?await img(graphic.art):null;
 remember();
 if(useColors){
  s.glossy=style.glossy;
  if(isCartonMode(s.mode)){
   const box={...s.carton};
   if(style.cover)box.coating=style.cover;
   if(s.mode==='rigidBox'||s.mode==='magneticBox'){
    if(style.lidColor)box.lidColor=style.lidColor;
    if(s.mode==='rigidBox'&&style.insideColor)box.insideColor=style.insideColor;
   }
   s.carton=normalizeCarton(box,s.mode);
   if(!cartonAllowsGloss(s.carton))s.glossy=false;
  }else{
   if(style.cover)s.cover=style.cover;
   if(style.accent&&(s.mode==='bag'||merch[s.mode]?.accent))s.handleColor=style.accent;
  }
 }
 if(replacement){
  const keep=!!art;
  const panel=isCartonMode(s.mode)?cartonPrintFaces(s.carton)[s.bagSide||'front']:merch[s.mode];
  const aspect=panel?panel.width/panel.height:s.mode==='mug'?Math.PI:s.mode==='bag'?units()/bagFormats[s.bagFormat].height:s.mode==='model'?145/210:ratio;
  const pose=s.mode==='mug'?mugDefaults():fresh(s.mode);
  Object.assign(s,graphic,{
   x:pose.x,y:pose.y,angle:0,
   width:Math.min(.65,.68*replacement.width/replacement.height/Math.max(.08,aspect)),
   bothSides:!!graphic.bothSides&&(!isCartonMode(s.mode)&&(s.mode==='bag'||s.mode==='mug'||!!merch[s.mode]))
  });
  images.set(s.art,replacement);art=replacement;
  if(!keep){layers=currentLayers();active=layers.length;layers.push(layerData(s))}
  selected=false;mugCopy=0;recolor();
 }
 sync();render();persist();
 $('styleDialog').close();message('Стиль применён');
}
async function showStyles(){
 const entries=newest(await list('styles')),container=$('styleList');
 container.replaceChildren();
 for(const entry of entries){
  const control=button(entry.title,async()=>{
   control.disabled=true;
   try{await applyStyle(entry.style)}finally{control.disabled=false}
  });
  container.append(control);
 }
 if(!entries.length)container.textContent='Сохраните оформление текущего изделия как стиль.';
 if(!$('styleDialog').open)$('styleDialog').showModal();
}
$('openStyles').onclick=()=>task(showStyles);
submit('styleForm',async(title,form)=>{
 await put('styles',{id:crypto.randomUUID(),title,style:captureStyle(),updated:Date.now()});
 form.reset();await showStyles();message('Стиль сохранён');
});

function sceneSpan(state){
 if(isCartonMode(state.mode)){
  const {width,depth,height}=cartonSize(state.carton);
  return Math.hypot(width,depth,height)*(state.carton.opening?1.5:1);
 }
 if(state.mode==='bag'){
  const spec=bagFormats[state.bagFormat];
  return spec.height+spec.loop;
 }
 return merch[state.mode]?.span??(state.mode==='mug'?112:220);
}
function layoutModels(models){
 return models.map(entry=>({
  sourceId:entry.id,title:entry.title,state:entry.state,
  x:0,z:0,lift:0,scale:1,yaw:Math.round(entry.state.yaw*180/Math.PI),
  tilt:entry.state.mode==='model'?90:0,roll:0
 }));
}

let scene=null,sceneAssets=new Map(),sceneFrame,sceneHits=[],sceneDrag=null,sceneSelected=null,sceneInputs={},sceneSpinValue,sceneMoveMode='object';
const scenePreview=$('scenePreview');
const sceneModel=$('sceneModel');
const sceneAdd=$('sceneAdd');
const sceneDialog=$('sceneDialog');

function populateSceneModels(models){
 const entries=newest(models).filter(entry=>entry.state.mode!=='photo');
 sceneModel.replaceChildren(...entries.map(entry=>{
  const option=document.createElement('option');
  option.value=entry.id;option.textContent=entry.title;
  return option;
 }));
 sceneModel.disabled=sceneAdd.disabled=!entries.length;
}
async function decodeSceneItem(item){
 const sources=new Set(item.state.layers.map(layer=>layer.art));
 return new Map(await Promise.all([...sources].map(async src=>[src,await img(src)])));
}
function orientationKey(item){return [item.yaw,item.tilt,item.roll].join('/')}
function geometry(item){
 const cache=sceneAssets.get(item);
 return cache.shape?.key===orientationKey(item)?cache.shape.geometry:sceneTile(item,420).geometry;
}
function fitSceneFrame(){scene.frame=fitScene(scene.items,geometry,scene.camera)}
const cameraFields={azimuth:$('sceneAzimuth'),elevation:$('sceneElevation'),zoom:$('sceneCameraZoom')};
function syncCamera(){
 for(const [key,input] of Object.entries(cameraFields)){
  input.value=scene.camera[key];
  input.setAttribute('aria-valuetext',Math.round(scene.camera[key])+(key==='zoom'?'%':'°'));
 }
}
for(const [key,input] of Object.entries(cameraFields))input.oninput=()=>{
 scene.camera[key]=input.valueAsNumber;syncCamera();queueScene();
};
function sceneMode(mode){
 sceneMoveMode=mode;
 $('sceneMoveObject').setAttribute('aria-pressed',String(mode==='object'));
 $('sceneMoveCamera').setAttribute('aria-pressed',String(mode==='camera'));
 scenePreview.style.cursor=mode==='camera'?'grab':'';
}
$('sceneMoveObject').onclick=()=>sceneMode('object');
$('sceneMoveCamera').onclick=()=>sceneMode('camera');
$('sceneResetCamera').onclick=()=>task(()=>{
 scene.camera={...defaultCamera};syncCamera();fitSceneFrame();queueScene();
});
function autoArrange(){
 arrangeScene(scene.items,geometry);
 fitSceneFrame();syncSceneInputs();queueScene();
}
async function openScene(entry){
 const draft=structuredClone(entry);
 const needsLayout=!draft.frame;
 if(needsLayout&&draft.items.some(item=>item.z===undefined)){
  draft.items=draft.items.map(item=>({...layoutModels([{id:item.sourceId,title:item.title,state:item.state}])[0],yaw:item.yaw}));
 }
 const [decoded,models]=await Promise.all([Promise.all(draft.items.map(decodeSceneItem)),list('models')]);
 sceneDrag=null;sceneHits=[];
 draft.camera={...defaultCamera,...draft.camera};
 scene=draft;sceneAssets=new Map(draft.items.map((item,i)=>[item,{images:decoded[i]}]));
 sceneSelected=draft.items[0];
 $('sceneForm').elements.title.value=draft.title;
 $('sceneBackground').value=draft.background;
 $('sceneLight').value=draft.light;
 $('sceneTransparent').checked=draft.transparent;
 populateSceneModels(models);
 if(needsLayout)autoArrange();
 else if(!draft.frame.target)fitSceneFrame();
 sceneMode('object');syncCamera();renderSceneControls();
 $('collectionDialog').close();
 if(!sceneDialog.open)sceneDialog.showModal();
 queueScene();
}
function syncSceneInputs(){
 if(!sceneSelected)return;
 for(const [key,input] of Object.entries(sceneInputs))input.value=Math.round(sceneSelected[key]*(key==='scale'?100:1));
 if(sceneSpinValue)sceneSpinValue.textContent=Math.round(sceneSelected.yaw)+'°';
}
function selectSceneItem(item){
 if(sceneSelected===item)return;
 sceneSelected=item;renderSceneControls();queueScene();
}
function canPlace(item,bounds){
 return scene.items.every(other=>other===item||!overlaps(bounds,sceneBounds(other,geometry(other)),1));
}
function updatePose(item,changes){
 const before=Object.fromEntries(Object.keys(changes).map(key=>[key,item[key]]));
 Object.assign(item,changes);
 if(!canPlace(item,sceneBounds(item,geometry(item)))){
  Object.assign(item,before);
  return false;
 }
 return true;
}
function nextFreePosition(item,where={}){
 const candidate={...item,...where};
 const shape=geometry(item),step=24;
 const initial=sceneBounds(candidate,shape);
 if(canPlace(item,initial))return {x:candidate.x,z:candidate.z,lift:candidate.lift};
 for(let ring=1;ring<=12;ring++){
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
   const x=candidate.x+dx*step*ring,z=candidate.z+dz*step*ring;
   if(canPlace(item,sceneBounds({...candidate,x,z},shape)))return {x,z,lift:candidate.lift};
  }
 }
 const right=Math.max(...scene.items.filter(other=>other!==item).map(other=>sceneBounds(other,geometry(other)).right));
 return {x:right-shape.min[0]*item.scale+16,z:candidate.z,lift:candidate.lift};
}
function seatOnSurface(item){
 const destination=nextFreePosition(item,{lift:0});
 const moved=destination.x!==item.x||destination.z!==item.z;
 Object.assign(item,destination);
 if(moved)fitSceneFrame();
 syncSceneInputs();queueScene();
 if(moved)$('sceneStatus').textContent='Изделие поставлено рядом на свободное место.';
}
function renderSceneControls(){
 const controls=$('sceneItems'),list=$('sceneObjectList');
 controls.replaceChildren();list.replaceChildren();sceneInputs={};sceneSpinValue=null;
 for(const item of scene.items){
  const select=button(item.title,()=>{selectSceneItem(item);list.querySelector('[aria-pressed="true"]').focus()});
  select.setAttribute('aria-pressed',String(item===sceneSelected));list.append(select);
 }
 const item=sceneSelected;
 if(!item)return;
 const fieldset=document.createElement('fieldset'),legend=document.createElement('legend');
 legend.textContent=item.title;fieldset.append(legend);
 const spinLabel=document.createElement('label'),spin=document.createElement('input');
 sceneSpinValue=document.createElement('output');spinLabel.className='sceneSpin';
 spin.type='range';spin.min=-180;spin.max=180;spin.step=1;
 spin.setAttribute('aria-label','Вращение вокруг своей оси');
 sceneInputs.yaw=spin;
 spin.oninput=()=>{
  const applied=updatePose(item,{yaw:spin.valueAsNumber});
  syncSceneInputs();queueScene();
  if(!applied)$('sceneStatus').textContent='Для поворота нужно больше места.';
 };
 spinLabel.append('Вращение вокруг своей оси · ',sceneSpinValue,spin);fieldset.append(spinLabel);
 const settings=[
  ['x','Вправо, мм',-100000,100000],['z','Вперёд, мм',-100000,100000],['lift','Высота над поверхностью, мм',0,2000],
  ['tilt','Наклон, °',-180,180],['roll','Крен, °',-180,180],['scale','Масштаб, %',10,300]
 ];
 for(const [key,title,min,max] of settings){
  const label=document.createElement('label'),input=document.createElement('input');
  sceneInputs[key]=input;input.type='number';input.min=min;input.max=max;
  input.onchange=()=>{
   const proposed=input.valueAsNumber;
   if(!Number.isFinite(proposed)){syncSceneInputs();return}
   const value=clamp(proposed,min,max)/(key==='scale'?100:1);
   const applied=updatePose(item,{[key]:value});
   syncSceneInputs();queueScene();
   if(!applied)$('sceneStatus').textContent='Здесь мешает соседнее изделие.';
  };
  label.append(title,input);fieldset.append(label);
 }
 const actions=document.createElement('div');actions.className='sceneTools';
 actions.append(
  button('Поставить на поверхность',()=>seatOnSurface(item)),
  button('Повернуть на 90°',()=>{
   const yaw=((item.yaw+270)%360+360)%360-180;
   const applied=updatePose(item,{yaw});
   syncSceneInputs();queueScene();
   if(!applied)$('sceneStatus').textContent='Для поворота нужно больше места.';
  })
 );
 if(item.state.mode==='model')actions.append(button('Положить',()=>{
  Object.assign(item,{tilt:90,roll:0});seatOnSurface(item);
 }));
 actions.append(button('Обновить из модели',async()=>{
  const draft=scene;
  const entry=(await list('models')).find(model=>model.id===item.sourceId);
  if(!entry)throw Error('Исходная модель недоступна');
  const decoded=await decodeSceneItem(entry);
  if(scene!==draft||!draft.items.includes(item)||!sceneDialog.open)return;
  item.state=entry.state;item.title=entry.title;
  sceneAssets.set(item,{images:decoded});
  Object.assign(item,nextFreePosition(item));fitSceneFrame();
  renderSceneControls();queueScene();
 }));
 const remove=button('Убрать из сцены',()=>{
  if(scene.items.length<2)return;
  scene.items=scene.items.filter(placed=>placed!==item);sceneAssets.delete(item);
  sceneSelected=scene.items[0];renderSceneControls();queueScene();
 });
 remove.disabled=scene.items.length<2;actions.append(remove);
 fieldset.append(actions);controls.append(fieldset);
 syncSceneInputs();
}
sceneAdd.onclick=()=>task(async()=>{
 const draft=scene,id=sceneModel.value;
 sceneAdd.disabled=true;
 try{
  const entry=(await list('models')).find(model=>model.id===id);
  if(!entry)throw Error('Модель недоступна');
  const [item]=layoutModels([entry]);
  const decoded=await decodeSceneItem(item);
  if(scene!==draft||!sceneDialog.open)return;
  sceneAssets.set(item,{images:decoded});
  Object.assign(item,nextFreePosition(item,{x:sceneSelected.x,z:sceneSelected.z,lift:0}));
  draft.items.push(item);sceneSelected=item;fitSceneFrame();
  renderSceneControls();queueScene();sceneInputs.x.focus();
 }finally{if(scene===draft)sceneAdd.disabled=!sceneModel.value}
});
$('sceneAuto').onclick=()=>task(autoArrange);
$('sceneFit').onclick=()=>task(()=>{scene.camera.zoom=100;syncCamera();fitSceneFrame();queueScene()});

function sceneTile(item,resolution){
 const cache=sceneAssets.get(item);
 const shapeKey=orientationKey(item);
 const key=[shapeKey,scene.camera.azimuth,scene.camera.elevation,scene.light,resolution].join('/');
 if(cache.key===key)return cache;
 const pose=createScenePose(item.yaw,item.tilt,item.roll,resolution,sceneSpan(item.state),scene.camera);
 const preview=resolution<=420;
 if(preview)pose.previewAsset=cache;
 if(cache.shape?.key===shapeKey)pose.record=()=>{};
 const tile=document.createElement('canvas');
 tile.width=tile.height=resolution;
 const target=tile.getContext('2d',{willReadFrequently:true});
 const old={s,layers,active,images,art,bitmap};
 try{
  layers=item.state.layers;active=item.state.active;images=cache.images;
  const layer=layers[active]||fresh(item.state.mode);
  s={...fresh(item.state.mode),...item.state,...layerData(layer),zoom:1,yaw:item.yaw*Math.PI/180,pitch:-scene.camera.elevation*Math.PI/180,roll:0,scenePose:pose,background:'',studioLight:scene.light};
  art=images.get(s.art)||null;bitmap=null;
  paint(target,resolution,resolution,true,true);
 }finally{
  ({s,layers,active,images,art,bitmap}=old);
 }
 const {data}=target.getImageData(0,0,resolution,resolution);
 let left=resolution,right=0,top=resolution,bottom=0;
 for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
  if(data[(y*resolution+x)*4+3]<8)continue;
  left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
 }
 const bounds=[Math.max(0,left-5),Math.max(0,top-5),Math.min(resolution,right+6),Math.min(resolution,bottom+6)];
 const geometry=cache.shape?.key===shapeKey?cache.shape.geometry:floorGeometry(pose.groups);
 pose.groups.length=0;delete pose.previewAsset;
 const result={key,tile,bounds,pixels:preview?data:null,geometry,pose};
 if(preview)Object.assign(cache,result,{shape:{key:shapeKey,geometry}});
 return result;
}
function paintScene(canvas,transparent,resolution,hitAreas){
 const ctx=canvas.getContext('2d'),{width,height}=canvas;
 const {view}=sceneCamera(scene.camera);
 const [targetX,targetY]=view(...scene.frame.target),zoom=width/scene.frame.width*scene.camera.zoom/100;
 const centerX=width/2-targetX*zoom,centerY=height/2-targetY*zoom;
 const project=(x,y,z)=>{
  const [px,py]=view(x,y,z);
  return [centerX+px*zoom,centerY+py*zoom];
 };
 ctx.clearRect(0,0,width,height);
 if(!transparent){
  ctx.fillStyle=scene.background;ctx.fillRect(0,0,width,height);
  const light=ctx.createLinearGradient(0,0,0,height);
  light.addColorStop(0,'rgba(255,255,255,.29)');light.addColorStop(1,'rgba(0,0,0,.07)');
  ctx.fillStyle=light;ctx.fillRect(0,0,width,height);
 }
 const placements=scene.items.map(item=>({item,render:sceneTile(item,resolution)}));
 const shadowStrength=.38*(scene.light/100);
 for(const {item,render} of placements){
  const {shadow,contact}=render.geometry;
  function drawShadow(outlines,blur,opacity,offsetX=0,offsetZ=0){
   ctx.save();ctx.beginPath();
   for(const outline of outlines){
    outline.forEach(([x,z],index)=>ctx[index?'lineTo':'moveTo'](...project(item.x+x*item.scale+offsetX,0,item.z+z*item.scale+offsetZ)));
    ctx.closePath();
   }
   ctx.filter='blur('+Math.max(.7,blur*zoom)+'px)';
   ctx.globalAlpha=opacity;ctx.fillStyle='#191811';ctx.fill();ctx.restore();
  }
  drawShadow(shadow,4+item.lift*.10,shadowStrength/ (1+item.lift/170),.33*item.lift,.20*item.lift);
  if(item.lift<4&&contact.length>=3)drawShadow([contact],1.8,.26*(1-item.lift/4));
 }
 ctx.imageSmoothingQuality='high';
 // Place the rear silhouettes before the foreground silhouettes.
 placements.sort((a,b)=>{
  const depth=({item,render})=>{
   const b=sceneBounds(item,render.geometry);
   return view((b.left+b.right)/2,-(b.bottom+b.top)/2,(b.back+b.front)/2)[2];
  };
  return depth(a)-depth(b);
 });
 for(const {item,render} of placements){
  const {tile,pose,pixels,bounds:[left,top,right,bottom]}=render;
  const w=right-left,h=bottom-top;
  if(w<=0||h<=0)continue;
  const scale=zoom*item.scale/pose.scale;
  const [baseX,baseY]=project(item.x,-(item.lift+render.geometry.max[1]*item.scale),item.z);
  const x=baseX+(left-pose.origin)*scale,y=baseY+(top-pose.origin)*scale;
  ctx.drawImage(tile,left,top,w,h,x,y,w*scale,h*scale);
  if(hitAreas)hitAreas.push({item,x,y,w,h,scale,left,top,pixels,resolution});
 }
 if(hitAreas){
  const selected=hitAreas.find(hit=>hit.item===sceneSelected);
  if(selected){
   ctx.save();ctx.strokeStyle='#00877a';ctx.lineWidth=1.5;ctx.setLineDash([5,4]);
   ctx.strokeRect(selected.x-4,selected.y-4,selected.w*selected.scale+8,selected.h*selected.scale+8);
   ctx.restore();
  }
 }
}
function queueScene(){
 $('sceneStatus').textContent='';
 cancelAnimationFrame(sceneFrame);
 sceneFrame=requestAnimationFrame(()=>{
  if(!$('sceneDialog').open)return;
  sceneHits=[];
  task(()=>paintScene(scenePreview,scene.transparent,sceneDrag&&!sceneDrag.item?280:420,sceneHits));
 });
}
function scenePoint(event){
 const rect=scenePreview.getBoundingClientRect();
 return [(event.clientX-rect.left)*scenePreview.width/rect.width,(event.clientY-rect.top)*scenePreview.height/rect.height];
}
function pickSceneItem(x,y){
 for(let i=sceneHits.length-1;i>=0;i--){
  const hit=sceneHits[i];
  const dx=(x-hit.x)/hit.scale,dy=(y-hit.y)/hit.scale;
  if(dx<0||dy<0||dx>=hit.w||dy>=hit.h)continue;
  const index=((hit.top+Math.floor(dy))*hit.resolution+hit.left+Math.floor(dx))*4+3;
  if(hit.pixels[index]>100)return hit.item;
 }
 return null;
}
scenePreview.onpointerdown=event=>{
 if(sceneDrag||event.button!==0)return;
 const [x,y]=scenePoint(event);
 if(sceneMoveMode==='camera'){
  sceneDrag={id:event.pointerId,x,y,azimuth:scene.camera.azimuth,elevation:scene.camera.elevation};
 }else{
  const item=pickSceneItem(x,y);
  if(!item)return;
  selectSceneItem(item);
  sceneDrag={item,id:event.pointerId,x,y,startX:item.x,startZ:item.z};
 }
 scenePreview.setPointerCapture(event.pointerId);scenePreview.style.cursor='grabbing';
};
scenePreview.onpointermove=event=>{
 const [x,y]=scenePoint(event);
 if(!sceneDrag){
  scenePreview.style.cursor=sceneMoveMode==='camera'||pickSceneItem(x,y)?'grab':'';
  return;
 }
 if(sceneDrag.id!==event.pointerId)return;
 const {item,startX,startZ}=sceneDrag,dx=x-sceneDrag.x,dy=y-sceneDrag.y;
 if(!item){
  const turn=sceneDrag.azimuth-dx*180/scenePreview.width;
  scene.camera.azimuth=((turn+180)%360+360)%360-180;
  scene.camera.elevation=clamp(sceneDrag.elevation+dy*90/scenePreview.height,10,80);
  syncCamera();queueScene();return;
 }
 const units=scene.frame.width/scenePreview.width*100/scene.camera.zoom;
 const [moveX,moveZ]=sceneCamera(scene.camera).surfaceDelta(dx*units,dy*units);
 const applied=updatePose(item,{x:startX+moveX,z:startZ+moveZ});
 if(!applied){
  $('sceneStatus').textContent='Здесь мешает соседнее изделие.';
  return;
 }
 syncSceneInputs();queueScene();
};
scenePreview.onlostpointercapture=()=>{
 const cameraMoved=sceneDrag&&!sceneDrag.item;
 sceneDrag=null;scenePreview.style.cursor=sceneMoveMode==='camera'?'grab':'';
 if(cameraMoved)queueScene();
};
$('sceneBackground').oninput=e=>{scene.background=e.target.value;queueScene()};
$('sceneLight').oninput=e=>{scene.light=+e.target.value;queueScene()};
$('sceneTransparent').onchange=e=>{scene.transparent=e.target.checked;queueScene()};
submit('sceneForm',async title=>{
 const draft=scene;
 const entry=structuredClone({...draft,id:draft.id||crypto.randomUUID(),title,updated:Date.now()});
 await put('scenes',entry);
 draft.id=entry.id;draft.title=title;
 if(scene===draft)$('sceneStatus').textContent='Сцена сохранена';
});
$('scenePng').onclick=()=>task(async()=>{
 const canvas=document.createElement('canvas');canvas.width=2400;canvas.height=1600;
 paintScene(canvas,scene.transparent,1200);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
 if(!blob)throw Error('Не удалось создать PNG');
 download(await printPng(blob),'maketeka-scene.png');
});
