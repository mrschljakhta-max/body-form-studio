import { createPremiumMannequin } from './premium-model.js?v=0.3.0';
import { buildSculptedMannequin } from './mannequin.js?v=0.2.2';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const PRESETS = {
  balanced: { height:172, bust:90, waist:72, hips:96, shoulders:41, muscle:30, belly:15, breast:45 },
  curvy: { height:168, bust:116, waist:96, hips:126, shoulders:45, muscle:24, belly:60, breast:66 },
  slim: { height:172, bust:75, waist:56, hips:78, shoulders:37, muscle:13, belly:4, breast:22 },
  athletic: { height:174, bust:101, waist:70, hips:103, shoulders:52, muscle:93, belly:7, breast:48 }
};
const TITLES = { balanced:'BALANCED 01', curvy:'CURVY 02', slim:'SLIM 03', athletic:'ATHLETIC 04', custom:'CUSTOM / ТВОЯ ФОРМА' };
const GARMENTS = {mannequin:'MANNEQUIN',bodysuit:'BODYSUIT',bra:'BRA',panties:'UNDERWEAR',dress:'DRESS'};
const COLORS = { burgundy:0x81374d, charcoal:0x252a32, champagne:0xc4a58a, ivory:0xe6ded3 };
const $ = (s,scope=document) => scope.querySelector(s);
const $$ = (s,scope=document) => [...scope.querySelectorAll(s)];
const clamp = (x,min,max) => Math.min(max,Math.max(min,x));
const stored = (() => {try{return JSON.parse(localStorage.getItem('bodyform-profile-v1')||'null');}catch{return null;}})();
const state = {
  ...PRESETS.balanced, ...((stored&&typeof stored==='object')?Object.fromEntries(Object.entries(stored).filter(([k,v])=>k in PRESETS.balanced&&typeof v==='number')):{}),
  preset:(stored&&stored.preset)||'balanced',
  front:(stored&&['neutral','space','flat'].includes(stored.front))?stored.front:'neutral',
  garment:(stored&&GARMENTS[stored.garment])?stored.garment:'mannequin',
  color:(stored&&COLORS[stored.color])?stored.color:'burgundy'
};
let renderer, scene, camera, orbit, model, frameID, previewMaterial, currentView='front', autoRotate=false, targetCamera=null, sceneReady=false, geometryTimer=null;
let modelBuildVersion=0, premiumUnavailable=false, premiumSuccessful=false;
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
  $('#outfitCaption').textContent=state.garment==='mannequin'?'IVORY PORCELAIN / 3D':GARMENTS[state.garment]+' / '+state.color.toUpperCase();$('#heightRuler').textContent=state.height+' см';
}
function chooseTab(tab){
  $$('.rail-btn[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  $$('.panel').forEach(p=>{const show=p.dataset.panel===tab;p.hidden=!show;p.classList.toggle('active',show);});
  $('#panelTitle').textContent=({body:'Параметри тіла',anatomy:'Анатомічний профіль',wardrobe:'Гардероб',fit:'Посадка білизни'})[tab];
}
function show3DModel(next){
  const previous=model;
  if(previous){
    next.userData.body.rotation.y=previous.userData.body.rotation.y;
    scene.remove(previous);
  } else {
    next.userData.body.rotation.y=.075;
  }
  scene.add(next);
  model=next;
  if(previous){
    previous.traverse(o=>{
      if(o.geometry)o.geometry.dispose();
      if(o.material){
        const materials=Array.isArray(o.material)?o.material:[o.material];
        for(const m of materials)m.dispose();
      }
    });
  }
}
function buildModel(){
  if(!sceneReady)return;
  const generation=++modelBuildVersion;
  if(!premiumSuccessful){
    show3DModel(buildSculptedMannequin(THREE,state));
    if(premiumUnavailable)return;
  }
  if(premiumUnavailable)return;
  createPremiumMannequin(THREE,state).then(next=>{
    if(generation!==modelBuildVersion){
      next.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});
      return;
    }
    premiumSuccessful=true;
    show3DModel(next);
    $('#renderStatus').textContent='ПРЕМІАЛЬНА GLB-МОДЕЛЬ';
    $('.viewport-caption.left-top small').textContent='Rigged CC0 · Porcelain';
  }).catch(error=>{
    if(!premiumUnavailable)console.warn('Premium GLB unavailable; procedural fallback remains:',error);
    premiumUnavailable=true;
    $('#renderStatus').textContent='3D СЦЕНА АКТИВНА · РЕЗЕРВ';
    $('.viewport-caption.left-top small').textContent='Скульптурна поверхня · 3D';
  });
}
function createStage(){
  const platform=new THREE.Group();scene.add(platform);
  const floorMat=new THREE.MeshStandardMaterial({color:0x101216,metalness:.52,roughness:.43});
  const disk=new THREE.Mesh(new THREE.CylinderGeometry(1.74,1.81,.18,128),floorMat);disk.position.y=-.1;disk.receiveShadow=true;platform.add(disk);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(1.61,.013,10,160),new THREE.MeshBasicMaterial({color:0xd6b185}));rim.position.y=.005;rim.rotation.x=Math.PI/2;platform.add(rim);
  const rim2=new THREE.Mesh(new THREE.TorusGeometry(1.82,.012,10,160),new THREE.MeshBasicMaterial({color:0x4d4338}));rim2.position.y=-.18;rim2.rotation.x=Math.PI/2;platform.add(rim2);
  const inset=new THREE.Mesh(new THREE.TorusGeometry(1.1,.005,5,128),new THREE.MeshBasicMaterial({color:0x3c3e42}));inset.rotation.x=Math.PI/2;inset.position.y=.005;platform.add(inset);
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(1.55,96),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.2}));shadow.position.y=.02;shadow.rotation.x=-Math.PI/2;platform.add(shadow);
}
function initScene(){
  scene=new THREE.Scene();
  const bounds=sceneEl.getBoundingClientRect();
  camera=new THREE.PerspectiveCamera(35,bounds.width/Math.max(bounds.height,1),.1,150);
  camera.position.set(0,2.25,7.45);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.setSize(bounds.width,bounds.height);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.18;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  sceneEl.innerHTML='';sceneEl.appendChild(renderer.domElement);
  orbit=new OrbitControls(camera,renderer.domElement);
  orbit.enablePan=false;orbit.enableDamping=true;orbit.dampingFactor=.065;
  orbit.target.set(0,2.06,0);orbit.minDistance=5.1;orbit.maxDistance=12;
  orbit.minPolarAngle=.85;orbit.maxPolarAngle=2.08;
  orbit.addEventListener('start',()=>{autoRotate=false;$('#rotateBtn').classList.remove('active');$('#rotateBtn').setAttribute('aria-pressed','false');targetCamera=null;});
  const ambient=new THREE.HemisphereLight(0xf1e4d5,0x252e40,1.75);scene.add(ambient);
  const key=new THREE.DirectionalLight(0xffe3c8,4.1);key.position.set(-3,7,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.bias=-.0002;key.shadow.camera.left=-5;key.shadow.camera.right=5;key.shadow.camera.top=8;key.shadow.camera.bottom=-5;scene.add(key);
  const rim=new THREE.DirectionalLight(0xffc48b,3.4);rim.position.set(3,4,-4);scene.add(rim);
  const fill=new THREE.PointLight(0xb7d9ee,28,11);fill.position.set(-3,2,-3);scene.add(fill);
  createStage();sceneReady=true;buildModel();
  const resize=()=>{const rect=sceneEl.getBoundingClientRect();if(!rect.width||!rect.height)return;camera.aspect=rect.width/rect.height;camera.fov=rect.width<500?39:35;camera.updateProjectionMatrix();renderer.setSize(rect.width,rect.height,false);};
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
  const distance=7.45;
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
$('#resetBtn').addEventListener('click',()=>{Object.assign(state,PRESETS.balanced,{preset:'balanced',front:'neutral',garment:'mannequin',color:'burgundy'});updateUI();updateModelSoon();selectView('front');toast('Налаштування скинуто');});
updateUI();
try{initScene();}catch(err){console.error('3D error',err);$('#renderStatus').textContent='ПОМИЛКА 3D';sceneEl.innerHTML='<div class="scene-loading">Не вдалося створити 3D-сцену. Перевір WebGL у браузері.</div>';}
