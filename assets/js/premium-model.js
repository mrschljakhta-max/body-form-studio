// BODY FORM STUDIO / premium parametric base mesh loader v0.7
// License: CC0 MakeHuman / MPFB2 base, baked as parametric GLB by nirholas/three.ws.
// Remote URL points to the CC0 parametric-base in upstream GitHub; the
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

// Move the rig from its imported A/T pose into a subtle fashion-showroom stance.
// Align each upper arm by its true joint world coordinates; never assume Blender
// bone local axes or a particular left/right quaternion sign.
function poseFashionArms(THREE, object){
  const bones={};
  object.traverse(node=>{
    if(!node.isBone)return;
    const n=node.name.replace(/^.*:/,'').replace(/^mixamorig/i,'');
    bones[n]=node;
  });
  const vector=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3();
  const parentQ=new THREE.Quaternion(),delta=new THREE.Quaternion();
  const inverse=new THREE.Quaternion(),localDelta=new THREE.Quaternion();
  let adjusted=0;
  for(const side of ['Left','Right']){
    const upper=bones[side+'Arm'],fore=bones[side+'ForeArm'];
    if(!upper||!fore)continue;
    object.updateMatrixWorld(true);
    upper.getWorldPosition(a);fore.getWorldPosition(b);
    vector.subVectors(b,a);
    if(vector.length()<.02)continue;
    const sign=Math.sign(vector.x)|| (side==='Left'?1:-1);
    // Portrait mannequin: elbow ~18° outward, forearm drops naturally.
    const desired=new THREE.Vector3(sign*.31,-.944,.035).normalize();
    delta.setFromUnitVectors(vector.normalize(),desired);
    upper.parent.getWorldQuaternion(parentQ);
    inverse.copy(parentQ).invert();
    localDelta.copy(inverse).multiply(delta).multiply(parentQ);
    upper.quaternion.premultiply(localDelta).normalize();
    upper.updateMatrixWorld(true);
    adjusted++;
  }
  // Subtle hand rotation follows forearms; original fully articulated fingers
  // and wrists stay available for garment fitting.
  return adjusted;
}

// Sculpt an original, organic fashion-display face shell rather than hiding a
// realistic face inside an oversized sphere. The neck and jaw converge subtly.
function createFacelessHead(THREE,skin){
  const geom=new THREE.SphereGeometry(1,96,80);
  const positions=geom.getAttribute('position');
  for(let i=0;i<positions.count;i++){
    const ox=positions.getX(i),oy=positions.getY(i),oz=positions.getZ(i);
    const jaw=THREE.MathUtils.smoothstep(oy,-.9,.12);
    const crown=1-.11*THREE.MathUtils.smoothstep(oy,.45,.98);
    const chin=1-.30*(1-jaw);
    const width=(.218*chin*crown);
    const cheek=1+.05*Math.exp(-Math.pow((oy+.17)/.33,2));
    let x=ox*width*cheek;
    const y=oy*.327;
    let z=oz*(.223*(.91+.09*jaw));
    // Soft planar face, restrained nose-bridge hint, no eyes or mouth.
    if(oz>.18){
      const mask=(Math.max(0,oz))**2;
      const bridge=Math.exp(-Math.pow(x/.056,2))*Math.exp(-Math.pow(oy/.44,2));
      const cheeks=Math.exp(-Math.pow((Math.abs(x)-.11)/.085,2))*Math.exp(-Math.pow((oy+.04)/.25,2));
      z+=mask*(.023*bridge+.006*cheeks);
      z-=mask*.012*Math.exp(-Math.pow(x/.10,2))*Math.exp(-Math.pow((oy+.73)/.2,2));
    }
    positions.setXYZ(i,x,y,z);
  }
  positions.needsUpdate=true;geom.computeVertexNormals();
  const head=new THREE.Mesh(geom,skin);
  head.castShadow=true;head.receiveShadow=true;
  return head;
}

function applyShape(THREE, obj, state){
  // This CC0 MakeHuman base supplies curated actual morph targets.
  // Those change topology while preserving the integrated 52-bone skin.
  const setMap=new Map();
  const setter=(name,amount)=>setMap.set(name,Math.max(0,Math.min(1,amount)));
  const ratio=(value,neutral,range)=>Math.max(0,Math.min(1,Math.abs(value-neutral)/range));
  setter('bodyFeminine',.94);
  setter('bodyMuscular',Math.max(0,(state.muscle-27)/70));
  setter('bodySofter',Math.max(0,(30-state.muscle)/70));
  setter('bodyHeavier',Math.max(0,((state.waist-72)/75+(state.hips-96)/70)/2));
  setter('bodyThinner',Math.max(0,((72-state.waist)/37+(96-state.hips)/40)/2));
  setter('shouldersWider',Math.max(0,(state.shoulders-41)/20));
  setter('shouldersNarrower',Math.max(0,(41-state.shoulders)/11));
  setter('chestWider',Math.max(0,(state.bust-90)/62)*.43);
  setter('waistWider',Math.max(0,(state.waist-72)/70));
  setter('waistNarrower',Math.max(0,(72-state.waist)/28));
  setter('bustBigger',clamp(.31+(state.breast-45)/145+(state.bust-90)/135,0,.88));
  setter('bustSmaller',Math.max(0,(83-state.bust)/55)*.45);
  setter('hipsWider',Math.max(0,(state.hips-96)/65));
  setter('hipsNarrower',Math.max(0,(96-state.hips)/28)*.75);
  setter('bellyBigger',Math.max(0,(state.belly-15)/85)*.65);
  setter('bellyToned',Math.max(0,(state.muscle-48)/52)*.7);
  setter('armsMuscular',Math.max(0,(state.muscle-35)/65)*.90);
  setter('thighsMuscular',Math.max(0,(state.muscle-35)/65)*.86);
  setter('calvesMuscular',Math.max(0,(state.muscle-35)/65)*.69);
  setter('armsThicker',Math.max(0,(state.waist-83)/62)*.3);
  setter('thighsThicker',Math.max(0,(state.hips-103)/54)*.4);
  setter('heightTaller',Math.max(0,(state.height-172)/33)*.35);
  setter('heightShorter',Math.max(0,(172-state.height)/27)*.35);
  setter('gluteusBigger',clamp(.17+(state.hips-96)/160,0,.50));
  obj.traverse(node=>{
    if(!(node.isMesh||node.isSkinnedMesh))return;
    // SkeletonUtils.clone shares source geometry by default: own a copy so
    // replacing a preset and disposing its meshes cannot harm the GLB cache.
    if(node.geometry)node.geometry=node.geometry.clone();
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
  const posedArms=poseFashionArms(THREE,source);
  source.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(source);
  const extent=new THREE.Vector3();
  const center=new THREE.Vector3();
  bounds.getSize(extent);bounds.getCenter(center);
  if(!Number.isFinite(extent.y)||extent.y<.1)throw Error('Invalid mannequin bounding box');
  const factor=4.16/extent.y;
  const root=new THREE.Group();
  const display=new THREE.Group();
  root.add(display);
  display.add(source);
  source.scale.setScalar(factor);
  // The original GLB remains fully morphable; positioning is only for display.
  source.position.set(-center.x*factor,-bounds.min.y*factor,-center.z*factor);
  // Blended porcelain face sculpture. Its jaw is narrower than its temples;
  // attach to the display shell, not to the imported neutral body geometry.
  const faceMaterial=new THREE.MeshPhysicalMaterial({
    color:0xe4d0ba,metalness:.035,roughness:.305,
    clearcoat:.51,clearcoatRoughness:.23
  });
  const headMask=createFacelessHead(THREE,faceMaterial);
  // Normalized model dimension is 4.16 units from foot to crown.
  // Lower than the old egg-shaped overlay to meet the neck naturally.
  headMask.position.set(0,3.824,.060);
  display.add(headMask);
  root.scale.setScalar(state.height/172);
  root.userData.body=display;
  root.userData.source='CC0 MakeHuman parametric GLB';
  root.userData.disposeOnRemove=true;
  root.userData.boneCount=0;
  root.userData.posedArms=posedArms;
  root.userData.headSculpture='organic-faceless-v1';
  source.traverse(o=>{if(o.isBone)root.userData.boneCount++;});
  return root;
}
