// BODY FORM STUDIO / premium base mesh loader v0.3
// License: external female base mesh by Innerscene / MakeHuman CC0.
// The original body mesh is not bundled until it can be imported into GitHub.
// This module is optional: the in-repository procedural model remains a fallback.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';

export const PREMIUM_MODEL_URL =
  'https://www.innerscene.com/api/library/female-base-mesh-3d-person-rigged-a-pose-dba97ed5/download';

let cachedPromise;
const near=(x,c,s)=>Math.exp(-.5*((x-c)/s)**2);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const applyRatio=(value,base,factor)=>1+clamp(value/base-1,-.52,.90)*factor;

export function loadPremiumSource(){
  if(!cachedPromise){
    const loader=new GLTFLoader();
    cachedPromise=loader.loadAsync(PREMIUM_MODEL_URL).catch(e=>{
      cachedPromise=null; throw e;
    });
  }
  return cachedPromise;
}

function applyShape(THREE, obj, state){
  const parts=[];
  obj.traverse(node=>{
    if(!(node.isMesh||node.isSkinnedMesh))return;
    // Replacing original textures with a single neutral porcelain material
    // makes the render a mannequin, not a photorealistic person.
    node.material=new THREE.MeshPhysicalMaterial({
      color:0xe2d0bc,metalness:0.055,roughness:0.27,
      clearcoat:0.55,clearcoatRoughness:0.20,
      side:THREE.DoubleSide
    });
    node.castShadow=true;
    node.receiveShadow=true;
    node.frustumCulled=false;
    if(!node.geometry||!node.geometry.attributes.position)return;
    node.geometry=node.geometry.clone();
    const geom=node.geometry, pos=geom.attributes.position;
    geom.computeBoundingBox();
    const box=geom.boundingBox;
    if(box.max.y-box.min.y < 0.85)return;
    parts.push({node,geom,pos,box});
  });
  if(!parts.length)return;
  const globalMin=Math.min(...parts.map(p=>p.box.min.y));
  const globalMax=Math.max(...parts.map(p=>p.box.max.y));
  const h=globalMax-globalMin || 1;
  for(const p of parts){
    const pos=p.pos;
    // Some glTF rigs use local mesh coordinates; for those, preserve shape
    // rather than displacing vertices using assumptions about bone space.
    if(h<1.0 || h>2.6)continue;
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i), y=pos.getY(i), z=pos.getZ(i);
      const t=(y-globalMin)/h;
      // Targeted width changes: different zones remain independent.
      const shoulder=near(t,.78,.10)*.78;
      const bust=near(t,.72,.08)*.67;
      const waist=near(t,.61,.09)*.79;
      const hips=near(t,.51,.10)*.72;
      const muscle=near(t,.77,.17)*.23+near(t,.31,.20)*.18;
      const ratio =
        1+(state.shoulders/41-1)*shoulder+
        (state.bust/90-1)*bust+
        (state.waist/72-1)*waist+
        (state.hips/96-1)*hips+
        ((state.muscle||30)/100-.30)*muscle;
      const torsoCenter=1-near(t,.60,.40)*.20;
      pos.setX(i,x*clamp(ratio,0.65,1.70));
      const belly=(state.belly||15)/100;
      const breast=(state.breast||45)/100;
      const frontMorph=z>0?((belly-.15)*.065*near(t,.62,.075)*near(x,0,.20)+
       (breast-.45)*.071*near(t,.72,.08)*near(Math.abs(x),.11,.10)):0;
      pos.setZ(i,z+frontMorph);
    }
    pos.needsUpdate=true;
    p.geom.computeVertexNormals();
    p.geom.computeBoundingSphere();
  }
}

export async function createPremiumMannequin(THREE,state){
  const gltf=await loadPremiumSource();
  const source=cloneRig(gltf.scene);
  applyShape(THREE,source,state);
  source.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(source);
  const extent=new THREE.Vector3();
  const center=new THREE.Vector3();
  bounds.getSize(extent);bounds.getCenter(center);
  if(!Number.isFinite(extent.y)||extent.y<.1)throw Error('Invalid mannequin bounding box');
  const factor=4.16/extent.y;
  const root=new THREE.Group();
  root.add(source);
  source.scale.setScalar(factor);
  // Align model to platform using world bounds before resizing.
  source.position.set(-center.x*factor,-bounds.min.y*factor,-center.z*factor);
  root.scale.setScalar(state.height/172);
  root.userData.body=source;
  root.userData.source='CC0 GLB';
  root.userData.disposeOnRemove=true;
  root.userData.boneCount=0;
  source.traverse(o=>{if(o.isBone)root.userData.boneCount++;});
  return root;
}
