// BODY FORM STUDIO / premium base mesh loader v0.3
// License: external female base mesh by Innerscene / MakeHuman CC0.
// The original body mesh is not bundled until it can be imported into GitHub.
// This module is optional: the in-repository procedural model remains a fallback.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';

export const PREMIUM_MODEL_URL =
  'https://raw.githubusercontent.com/nirholas/three.ws/main/public/avatars/parametric-base.glb';

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
  // This CC0 MakeHuman base supplies curated actual morph targets.
  // Those change topology while preserving the integrated 52-bone skin.
  const setMap=new Map();
  const setter=(name,amount)=>setMap.set(name,Math.max(0,Math.min(1,amount)));
  const ratio=(value,neutral,range)=>Math.max(0,Math.min(1,Math.abs(value-neutral)/range));
  setter('bodyFeminine',.80);
  setter('bodyMuscular',Math.max(0,(state.muscle-27)/70));
  setter('bodySofter',Math.max(0,(30-state.muscle)/70));
  setter('bodyHeavier',Math.max(0,((state.waist-72)/75+(state.hips-96)/70)/2));
  setter('bodyThinner',Math.max(0,((72-state.waist)/37+(96-state.hips)/40)/2));
  setter('shouldersWider',Math.max(0,(state.shoulders-41)/20));
  setter('shouldersNarrower',Math.max(0,(41-state.shoulders)/11));
  setter('chestWider',Math.max(0,(state.bust-90)/62)*.35);
  setter('waistWider',Math.max(0,(state.waist-72)/70));
  setter('waistNarrower',Math.max(0,(72-state.waist)/28));
  setter('bustBigger',Math.max(0,(state.bust-90)/60)*.8);
  setter('bustSmaller',Math.max(0,(90-state.bust)/31)*.6);
  setter('hipsWider',Math.max(0,(state.hips-96)/65));
  setter('hipsNarrower',Math.max(0,(96-state.hips)/28)*.75);
  setter('bellyBigger',Math.max(0,(state.belly-15)/85)*.65);
  setter('bellyToned',Math.max(0,(state.muscle-48)/52)*.7);
  setter('armsMuscular',Math.max(0,(state.muscle-40)/60)*.87);
  setter('thighsMuscular',Math.max(0,(state.muscle-40)/60)*.7);
  setter('calvesMuscular',Math.max(0,(state.muscle-40)/60)*.6);
  setter('armsThicker',Math.max(0,(state.waist-83)/62)*.3);
  setter('thighsThicker',Math.max(0,(state.hips-103)/54)*.4);
  setter('heightTaller',Math.max(0,(state.height-172)/33)*.35);
  setter('heightShorter',Math.max(0,(172-state.height)/27)*.35);
  obj.traverse(node=>{
    if(!(node.isMesh||node.isSkinnedMesh))return;
    node.material=new THREE.MeshPhysicalMaterial({
      color:0xe4d0ba,metalness:.035,roughness:.32,
      clearcoat:.54,clearcoatRoughness:.23,
      side:THREE.DoubleSide
    });
    node.castShadow=true;node.receiveShadow=true;node.frustumCulled=false;
    if(node.morphTargetInfluences&&node.morphTargetDictionary){
      for(const [name,val] of setMap){
        const index=node.morphTargetDictionary[name];
        if(Number.isInteger(index))node.morphTargetInfluences[index]=val;
      }
    }
  });
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
  root.userData.source='CC0 MakeHuman parametric GLB';
  root.userData.disposeOnRemove=true;
  root.userData.boneCount=0;
  source.traverse(o=>{if(o.isBone)root.userData.boneCount++;});
  return root;
}
