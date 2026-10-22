import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const PRESETS = {
  balanced: { height:172, bust:90, waist:72, hips:96, shoulders:41, muscle:30, belly:15, breast:45 },
  curvy: { height:168, bust:116, waist:96, hips:126, shoulders:45, muscle:24, belly:60, breast:66 },
  slim: { height:172, bust:75, waist:56, hips:78, shoulders:37, muscle:13, belly:4, breast:22 },
  athletic: { height:174, bust:101, waist:70, hips:103, shoulders:52, muscle:93, belly:7, breast:48 }
};
const TITLES = { balanced:'BALANCED 01', curvy:'CURVY 02', slim:'SLIM 03', athletic:'ATHLETIC 04', custom:'CUSTOM / ТВОЯ ФОРМА' };
const GARMENTS = {bodysuit:'BODYSUIT',bra:'BRA',panties:'UNDERWEAR',dress:'DRESS'};
const COLORS = { burgundy:0x81374d, charcoal:0x252a32, champagne:0xc4a58a, ivory:0xe6ded3 };
const $ = (s,scope=document) => scope.querySelector(s);
const $$ = (s,scope=document) => [...scope.querySelectorAll(s)];
const clamp = (x,min,max) => Math.min(max,Math.max(min,x));
const stored = (() => {try{return JSON.parse(localStorage.getItem('bodyform-profile-v1')||'null');}catch{return null;}})();
const state = {
  ...PRESETS.balanced, ...((stored&&typeof stored==='object')?Object.fromEntries(Object.entries(stored).filter(([k,v])=>k in PRESETS.balanced&&typeof v==='number')):{}),
  preset:(stored&&stored.preset)||'balanced',
  front:(stored&&['neutral','space','flat'].includes(stored.front))?stored.front:'neutral',
  garment:(stored&&GARMENTS[stored.garment])?stored.garment:'bodysuit',
  color:(stored&&COLORS[stored.color])?stored.color:'burgundy'
};
let renderer, scene, camera, orbit, model, frameID, previewMaterial, currentView='front', autoRotate=false, targetCamera=null, sceneReady=false, geometryTimer=null;
const sceneEl = $('#scene');
const toastEl = $('#toast');
let toastTimer;

function toast(msg){toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),3200);}
function setActive(selector,attr,value) { $$(selector).forEach(el=>{const active=el.dataset[attr]===value;el.classList.toggle('active',active);if(el.matches('.choice,.view-btn')) el.setAttribute('aria-pressed',String(active));});}
function rangeSync(){ $$('[data-field]').forEach(input=>{ const key=input.dataset.field;input.value=state[key];const out=$('[data-output="'+key+'"]');if(out)out.textContent=state[key]+(['muscle','belly','breast'].includes(key)?'%':' см');const pct=(Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min))*100;input.style.setProperty('--fill',pct+'%'); });}
function updateUI(){
  rangeSync();setActive('[data-preset]','preset',state.preset);
  setActive('[data-garment]','garment',state.garment);setActive('[data-color]','color',state.color);setActive('[data-front]','front',state.front);
  $$('[data-measure]').forEach(el=>el.textContent=state[el.dataset.measure]);
  $('#statsType').textContent=state.preset.toUpperCase();$('#presetCaption').textContent=TITLES[state.preset]||TITLES.custom;
  $('#outfitCaption').textContent=GARMENTS[state.garment]+' / '+state.color.toUpperCase();$('#heightRuler').textContent=state.height+' см';
}
function chooseTab(tab){
  $$('.rail-btn[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  $$('.panel').forEach(p=>{const show=p.dataset.panel===tab;p.hidden=!show;p.classList.toggle('active',show);});
  $('#panelTitle').textContent=({body:'Параметри тіла',anatomy:'Анатомічний профіль',wardrobe:'Гардероб',fit:'Посадка білизни'})[tab];
}
function circlePiece(parent,radius,y,height,material){
  const obj=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,height,56),material);
  obj.position.y=y;obj.castShadow=true;obj.receiveShadow=true;parent.add(obj);return obj;
}
function ball(parent,pos,scale,mat){
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,28,20),mat);mesh.position.set(...pos);
  mesh.scale.set(...scale);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function segment(parent,a,b,r1,r2,mat){
  const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),vector=new THREE.Vector3().subVectors(vb,va),length=vector.length();
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r2,r1,length,30,4),mat);
  mesh.position.copy(va).add(vb).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),vector.normalize());
  mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function tubular(parent,rings,material){
  const seg=48,vertices=[],uv=[],indices=[];
  rings.forEach((r,i)=>{
    for(let j=0;j<=seg;j++){
      const t=2*Math.PI*j/seg;
      vertices.push(Math.cos(t)*r.rx,r.y,Math.sin(t)*r.rz+(r.z||0));
      uv.push(j/seg,i/(rings.length-1));
    }
  });
  for(let i=0;i<rings.length-1;i++){
    for(let j=0;j<seg;j++){
      const a=i*(seg+1)+j,b=a+seg+1;
      indices.push(a,b,a+1,b,b+1,a+1);
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(indices);geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,material);
  mesh.castShadow=true;mesh.receiveShadow=true;mesh.material.side=THREE.DoubleSide;parent.add(mesh);return mesh;
}
function makeTorsoRings(c,plus=0){
  const hips=.45*c.hips/96,waist=.325*c.waist/72,bust=.44*c.bust/90,shoulders=.48*c.shoulders/41;
  const belly=.015+c.belly/100*.10,depthChest=.285+.045*c.bust/100;
  return [
    {y:1.83,rx:hips*.43+plus,rz:.22+plus},
    {y:1.94,rx:hips*.73+plus,rz:.32+plus},
    {y:2.09,rx:hips+plus,rz:.35+plus},
    {y:2.24,rx:hips*.96+plus,rz:.34+plus},
    {y:2.40,rx:(waist+hips*.18)*.89+plus,rz:.295+belly*.4+plus,z:belly*.3},
    {y:2.56,rx:waist+plus,rz:.282+belly+plus,z:belly*.3},
    {y:2.73,rx:waist*.95+bust*.13+plus,rz:.30+plus},
    {y:2.88,rx:bust*.91+plus,rz:depthChest+plus},
    {y:3.08,rx:bust+plus,rz:depthChest+plus},
    {y:3.22,rx:shoulders+plus,rz:.255+plus},
    {y:3.33,rx:shoulders*.66+plus,rz:.23+plus},
    {y:3.44,rx:.158+plus,rz:.155+plus}
  ];
}
function bodyMaterial(){
  return new THREE.MeshPhysicalMaterial({color:0xc5ab94,metalness:.07,roughness:.28,clearcoat:.46,clearcoatRoughness:.24});
}
function fabricMaterial(){
  return new THREE.MeshPhysicalMaterial({color:COLORS[state.color],metalness:.015,roughness:.5,clearcoat:.14,clearcoatRoughness:.38,side:THREE.DoubleSide});
}
function buildModel(){
  if(!sceneReady)return;
  if(model){scene.remove(model);model.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material&&o.material!==previewMaterial&&o.material.dispose)o.material.dispose();});}
  const c=state,skin=bodyMaterial(),fabric=fabricMaterial(),dark=new THREE.MeshStandardMaterial({color:0x594a3d,metalness:.35,roughness:.35});
  const root=new THREE.Group(),body=new THREE.Group();model=root;root.add(body);scene.add(root);
  root.scale.setScalar(c.height/172);
  const hp=c.hips/96,wp=c.waist/72,bp=c.bust/90,sp=c.shoulders/41,mp=c.muscle/100;
  const hipX=.45*hp,shoulderX=.49*sp,upperArmX=shoulderX+.13,elbowX=shoulderX+.24,wristX=shoulderX+.29;
  tubular(body,makeTorsoRings(c),skin);
  ball(body,[0,3.49,0],[.155,.23,.155],skin);
  ball(body,[0,3.86,.015],[.273,.35,.235],skin);
  ball(body,[0,3.57,0],[.15,.1,.16],skin);
  for(const s of [-1,1]){
    const upperR=.13+mp*.045+(sp-1)*.025;
    ball(body,[s*shoulderX,3.24,0],[upperR*1.25,.15,.18],skin);
    segment(body,[s*upperArmX,3.21,0],[s*elbowX,2.67,.015],upperR*.95,upperR*.72,skin);
    ball(body,[s*elbowX,2.66,.015],[upperR*.78,.115,.105],skin);
    segment(body,[s*elbowX,2.61,.015],[s*wristX,2.11,.095],upperR*.77,.067+mp*.019,skin);
    ball(body,[s*wristX,2.08,.09],[.067,.08,.067],skin);
    ball(body,[s*(wristX+.012),1.89,.115],[.094,.19,.067],skin);
    const centerX=s*(.215*hp);
    const kneeX=s*(.22*hp+.02),ankleX=s*(.235*hp+.005);
    const thighR=.225*hp+.02*mp;
    ball(body,[centerX,1.76,0],[thighR*1.13,.30,.26*hp],skin);
    segment(body,[centerX,1.82,.01],[kneeX,1.02,.05],thighR,.13+mp*.033,skin);
    ball(body,[kneeX,1.04,.055],[.143+mp*.019,.155,.145],skin);
    segment(body,[kneeX,1.0,.05],[ankleX,.27,.04],.143+mp*.027,.078+mp*.018,skin);
    ball(body,[ankleX,.25,.04],[.082,.105,.083],skin);
    ball(body,[ankleX,.115,.165],[.112,.11,.235],skin);
    ball(body,[ankleX,.083,.308],[.11,.065,.13],skin);
    if(mp>.75){
      ball(body,[s*upperArmX,2.98,.03],[upperR*.99,.19,.125],skin);
      ball(body,[centerX,1.39,.025],[thighR*.93,.31,.235],skin);
    }
  }
  const breastC=c.breast/100,breastBase=.15+breastC*.093;
  for(const s of [-1,1]){
    ball(body,[s*(.195*bp),3.015,.27],[breastBase,.13+breastC*.13,.13+breastC*.15],skin);
  }
  // Tailored clothing is illustrative, without simulated pattern geometry or medical claims.
  if(c.garment==='bodysuit'||c.garment==='dress'){
    const t=makeTorsoRings(c,.024);
    let garmentRings=t.filter(r=>r.y>=2.02&&r.y<=3.22);
    if(c.garment==='bodysuit')garmentRings=[{y:1.9,rx:hipX*.54,rz:.22},...garmentRings];
    tubular(body,garmentRings,fabric);
    if(c.garment==='bodysuit'){
      segment(body,[-.3*bp,3.13,.07],[-.35*sp,3.41,.05],.025,.023,fabric);
      segment(body,[.3*bp,3.13,.07],[.35*sp,3.41,.05],.025,.023,fabric);
      ball(body,[0,1.97,.32],[.17*hp,.25,.055],fabric);
    } else {
      tubular(body,[{y:1.34,rx:hipX*1.55,rz:.54,z:.03},{y:1.53,rx:hipX*1.46,rz:.52,z:.03},{y:1.83,rx:hipX*1.16,rz:.42},{y:2.12,rx:hipX*1.04,rz:.37}],fabric);
    }
  } else if(c.garment==='bra'){
    tubular(body,makeTorsoRings(c,.03).filter(r=>r.y>=2.88&&r.y<=3.22),fabric);
    for(const s of [-1,1]){ball(body,[s*.195*bp,3.03,.40],[breastBase*1.04,.10+breastC*.13,.09+breastC*.15],fabric);
      segment(body,[s*.24*bp,3.15,.35],[s*.3*sp,3.39,.06],.021,.018,fabric);}
  } else if(c.garment==='panties'){
    const under=[
      {y:1.87,rx:hipX*.48,rz:.21},
      {y:1.96,rx:hipX*.74,rz:.32},
      {y:2.09,rx:hipX*1.03,rz:.38},
      {y:2.26,rx:hipX*1.02,rz:.37}
    ];tubular(body,under,fabric);
  }
  if(c.garment==='panties'||c.garment==='bodysuit'){
    const frontSize=c.front==='space'?.15:c.front==='flat'?.018:.07;
    ball(body,[0,2.015,.355+(frontSize*.35)],[.13+frontSize*.42,.13+frontSize*.25,.028+frontSize],fabric);
  }
  // Decorative joint seams create the mannequin look.
  for(const s of [-1,1]){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.109,.004,6,34),dark);ring.position.set(s*elbowX,2.66,.018);ring.rotation.x=Math.PI/2;body.add(ring);
    const knee=new THREE.Mesh(new THREE.TorusGeometry(.117,.004,6,34),dark);knee.position.set(s*(.22*hp+.02),1.03,.17);body.add(knee);
  }
  body.rotation.y=.14;
  model.userData.body=body;
  previewMaterial=skin;
}
function createStage(){
  const platform=new THREE.Group();scene.add(platform);
  const floorMat=new THREE.MeshStandardMaterial({color:0x101216,metalness:.52,roughness:.43});
  const disk=new THREE.Mesh(new THREE.CylinderGeometry(1.7,1.76,.18,96),floorMat);disk.position.y=-.1;disk.receiveShadow=true;platform.add(disk);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(1.59,.018,9,128),new THREE.MeshBasicMaterial({color:0xd6b185}));rim.position.y=.005;rim.rotation.x=Math.PI/2;platform.add(rim);
  const rim2=new THREE.Mesh(new THREE.TorusGeometry(1.84,.015,8,128),new THREE.MeshBasicMaterial({color:0x4d4338}));rim2.position.y=-.18;rim2.rotation.x=Math.PI/2;platform.add(rim2);
  const inset=new THREE.Mesh(new THREE.TorusGeometry(1.1,.005,5,128),new THREE.MeshBasicMaterial({color:0x3c3e42}));inset.rotation.x=Math.PI/2;inset.position.y=.005;platform.add(inset);
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(1.55,96),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.2}));shadow.position.y=.02;shadow.rotation.x=-Math.PI/2;platform.add(shadow);
}
function initScene(){
  scene=new THREE.Scene();
  const bounds=sceneEl.getBoundingClientRect();
  camera=new THREE.PerspectiveCamera(37,bounds.width/Math.max(bounds.height,1),.1,150);
  camera.position.set(0,2.25,7.9);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.setSize(bounds.width,bounds.height);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.36;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  sceneEl.innerHTML='';sceneEl.appendChild(renderer.domElement);
  orbit=new OrbitControls(camera,renderer.domElement);
  orbit.enablePan=false;orbit.enableDamping=true;orbit.dampingFactor=.065;
  orbit.target.set(0,2.05,0);orbit.minDistance=5.4;orbit.maxDistance=12;
  orbit.minPolarAngle=.85;orbit.maxPolarAngle=2.08;
  orbit.addEventListener('start',()=>{autoRotate=false;$('#rotateBtn').classList.remove('active');$('#rotateBtn').setAttribute('aria-pressed','false');targetCamera=null;});
  const ambient=new THREE.HemisphereLight(0xf9eee2,0x3b4050,2.2);scene.add(ambient);
  const key=new THREE.DirectionalLight(0xffeedb,4.7);key.position.set(-3,7,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.bias=-.0002;key.shadow.camera.left=-5;key.shadow.camera.right=5;key.shadow.camera.top=8;key.shadow.camera.bottom=-5;scene.add(key);
  const rim=new THREE.DirectionalLight(0xffd2a5,3.6);rim.position.set(3,4,-4);scene.add(rim);
  const fill=new THREE.PointLight(0xb1c6db,36,10);fill.position.set(-3,2,-3);scene.add(fill);
  createStage();sceneReady=true;buildModel();
  const resize=()=>{const rect=sceneEl.getBoundingClientRect();if(!rect.width||!rect.height)return;camera.aspect=rect.width/rect.height;camera.fov=rect.width<500?46:37;camera.updateProjectionMatrix();renderer.setSize(rect.width,rect.height,false);};
  window.addEventListener('resize',resize);new ResizeObserver(resize).observe(sceneEl);resize();
  $('#renderStatus').textContent='3D СЦЕНА АКТИВНА';
  const clock=new THREE.Clock();
  const frame=()=>{
    frameID=requestAnimationFrame(frame);
    const delta=Math.min(clock.getDelta(),.06);
    if(autoRotate&&model){model.userData.body.rotation.y+=delta*.38;}
    if(targetCamera){
      camera.position.lerp(targetCamera,.082);
      if(camera.position.distanceTo(targetCamera)<.015)targetCamera=null;
    }
    orbit.update();renderer.render(scene,camera);
  };frame();
}
function updateModelSoon(){
  clearTimeout(geometryTimer);
  geometryTimer=setTimeout(()=>{buildModel();},15);
}
function switchPreset(preset){
  if(!PRESETS[preset])return;
  Object.assign(state,PRESETS[preset]);state.preset=preset;
  updateUI();updateModelSoon();toast('Обрано тип тіла: '+TITLES[preset]);
}
function selectView(view){
  currentView=view;
  setActive('[data-view]','view',view);
  autoRotate=false;$('#rotateBtn').classList.remove('active');
  const distance=camera.position.distanceTo(orbit.target);
  const v=view==='side'?new THREE.Vector3(distance,2.25,0):view==='back'?new THREE.Vector3(0,2.25,-distance):new THREE.Vector3(0,2.25,distance);
  targetCamera=v;
  if(model)model.userData.body.rotation.y=0;
}
$$('.rail-btn[data-tab]').forEach(b=>b.addEventListener('click',()=>chooseTab(b.dataset.tab)));
$$('[data-preset]').forEach(b=>b.addEventListener('click',()=>switchPreset(b.dataset.preset)));
$$('[data-field]').forEach(el=>el.addEventListener('input',()=>{state[el.dataset.field]=+el.value;state.preset='custom';updateUI();updateModelSoon();}));
$$('[data-front]').forEach(b=>b.addEventListener('click',()=>{state.front=b.dataset.front;updateUI();updateModelSoon();}));
$$('[data-garment]').forEach(b=>b.addEventListener('click',()=>{state.garment=b.dataset.garment;updateUI();updateModelSoon();}));
$$('[data-color]').forEach(b=>b.addEventListener('click',()=>{state.color=b.dataset.color;updateUI();updateModelSoon();}));
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>selectView(b.dataset.view)));
$('#rotateBtn').addEventListener('click',()=>{autoRotate=!autoRotate;targetCamera=null;$('#rotateBtn').classList.toggle('active',autoRotate);$('#rotateBtn').setAttribute('aria-pressed',String(autoRotate));});
$('#applyBtn').addEventListener('click',()=>{updateModelSoon();toast('3D-модель оновлено');document.querySelector('.viewport').scrollIntoView({behavior:'smooth',block:'nearest'});});
$('#saveBtn').addEventListener('click',()=>{try{localStorage.setItem('bodyform-profile-v1',JSON.stringify(state));toast('Профіль збережено тільки в цьому браузері');}catch{toast('Браузер забороняє локальне збереження');}});
$('#resetBtn').addEventListener('click',()=>{Object.assign(state,PRESETS.balanced,{preset:'balanced',front:'neutral',garment:'bodysuit',color:'burgundy'});updateUI();updateModelSoon();selectView('front');toast('Налаштування скинуто');});
updateUI();
try{initScene();}catch(err){console.error('3D error',err);$('#renderStatus').textContent='ПОМИЛКА 3D';sceneEl.innerHTML='<div class="scene-loading">Не вдалося створити 3D-сцену. Перевір WebGL у браузері.</div>';}
