// BODY FORM STUDIO · Anatomical mannequin geometry v0.2
// Procedural sculpted surfaces: continuous torso/bust, lofted limbs, hands, feet.
// Units are visual studio units, not medically exact anthropometric dimensions.
export function buildSculptedMannequin(THREE, state) {
  const c = state;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  root.scale.setScalar(c.height / 172);
  root.userData.body = body;

  const skin = new THREE.MeshPhysicalMaterial({
    color: 0xD5C1AA, metalness: 0.035, roughness: 0.32,
    clearcoat: 0.34, clearcoatRoughness: 0.23
  });
  const detail = new THREE.MeshStandardMaterial({ color: 0x746456, roughness: 0.65 });
  const nude = new THREE.MeshPhysicalMaterial({
    color: 0xCDB59C, metalness: 0.01, roughness: 0.54, clearcoat: 0.13
  });
  const garments = {
    burgundy: 0x81374d, charcoal: 0x252a32,
    champagne: 0xc4a58a, ivory: 0xe6ded3
  };
  const textile = new THREE.MeshStandardMaterial({
    color: garments[c.color] || garments.burgundy,
    roughness: 0.69, metalness: 0.02, side: THREE.DoubleSide
  });
  const shoulderWidth = 0.485 * Math.pow(c.shoulders / 41, 0.78);
  const hipsWidth = 0.453 * Math.pow(c.hips / 96, 0.91);
  const waistWidth = 0.314 * Math.pow(c.waist / 72, 0.91);
  const chestWidth = 0.411 * Math.pow(c.bust / 90, 0.37);
  const musculature = c.muscle / 100;
  const belly = c.belly / 100;
  const breastSize = c.breast / 100;

  function gaussian(v, center, sd) {
    const z = (v - center) / sd;
    return Math.exp(-0.5 * z * z);
  }
  function smoothInterp(profile, y, field) {
    let i = 0;
    while (i < profile.length - 2 && y > profile[i+1].y) i++;
    const p = profile[i], n = profile[i+1];
    const prev = profile[Math.max(0,i-1)], next = profile[Math.min(profile.length-1,i+2)];
    const d = Math.max(.00001,n.y-p.y);
    const t = THREE.MathUtils.clamp((y-p.y)/d,0,1), t2=t*t, t3=t2*t;
    const m0 = (n[field]-prev[field]) / Math.max(.001,n.y-prev.y) * d;
    const m1 = (next[field]-p[field]) / Math.max(.001,next.y-p.y) * d;
    return (2*t3-3*t2+1)*p[field] + (t3-2*t2+t)*m0 +
      (-2*t3+3*t2)*n[field] + (t3-t2)*m1;
  }
  function addMesh(geometry, material, parent=body) {
    const mesh = new THREE.Mesh(geometry,material);
    mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh);
    return mesh;
  }
  function loft(profile, opts={}) {
    const slices=opts.slices||105, radial=opts.radial||72;
    const y0=profile[0].y, y1=profile[profile.length-1].y;
    const positions=[],uv=[],idx=[];
    for(let i=0;i<=slices;i++){
      const y=y0+(y1-y0)*i/slices;
      const cx=smoothInterp(profile,y,'x');
      const cz=smoothInterp(profile,y,'z');
      const rx=Math.max(.001,smoothInterp(profile,y,'rx'));
      const rz=Math.max(.001,smoothInterp(profile,y,'rz'));
      for(let j=0;j<=radial;j++){
        const t=j/radial*2*Math.PI;
        const dx=Math.cos(t), dz=Math.sin(t);
        let x=cx+rx*dx, z=cz+rz*dz;
        if(opts.bust && dz>0){
          const breastX=.20*Math.pow(c.bust/90,.18);
          const bustBump=(.042+.15*breastSize)*gaussian(y,3.045,.135)*
            (gaussian(Math.abs(x),breastX,.112))*Math.pow(Math.max(dz,0),1.4);
          z+=bustBump;
          if(musculature>.64){
            z+=(musculature-.64)*.019*gaussian(y,2.65,.24)*
              gaussian(Math.abs(x),.13,.11)*dz;
          }
          if(y<2.23){
            const front = c.front==='space'?.095:c.front==='flat'?.0:.032;
            z+=front*gaussian(y,2.035,.115)*gaussian(x,0,.18)*Math.pow(dz,2);
          }
        }
        positions.push(x,y,z);
        uv.push(j/radial,i/slices);
        if(i<slices&&j<radial){
          const a=i*(radial+1)+j,b=a+radial+1;
          idx.push(a,b,a+1,b,b+1,a+1);
        }
      }
    }
    const geo=new THREE.BufferGeometry();
    geo.setIndex(idx);geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geo.computeVertexNormals();
    return addMesh(geo,opts.material||skin,opts.parent||body);
  }
  function ellipse(parent, loc, radii, material=skin, detailCount=42){
    const m=addMesh(new THREE.SphereGeometry(1,detailCount,30),material,parent);
    m.position.set(...loc);m.scale.set(...radii);return m;
  }
  function tubeCurve(coords, radius, material, parent=body){
    const curve=new THREE.CatmullRomCurve3(coords.map(x=>new THREE.Vector3(...x)));
    const geo=new THREE.TubeGeometry(curve,Math.max(18,coords.length*9),radius,7,false);
    return addMesh(geo,material,parent);
  }
  function seamRing(x,y,z,rx,rz,rotation=0){
    const coords=[];
    for(let i=0;i<=64;i++){let a=i/64*2*Math.PI;coords.push([x+Math.cos(a)*rx,y+Math.sin(a)*Math.sin(rotation)*rx,z+Math.sin(a)*rz]);}
    tubeCurve(coords,.0042,detail);
  }

  // Soft tapered torso, collarbone and integrated bust. This mesh has no
  // detached sphere breasts or sharply segmented waist.
  const torso=[
    {y:1.80,x:0,z:0,rx:.188,rz:.217},
    {y:1.91,x:0,z:0,rx:hipsWidth*.70,rz:.284},
    {y:2.075,x:0,z:0,rx:hipsWidth,rz:.356+belly*.017},
    {y:2.235,x:0,z:0,rx:hipsWidth*.985,rz:.345+belly*.032},
    {y:2.405,x:0,z:belly*.023,rx:(waistWidth+hipsWidth*.12)*.92,rz:.307+belly*.065},
    {y:2.570,x:0,z:belly*.023,rx:waistWidth,rz:.282+belly*.075},
    {y:2.710,x:0,z:0,rx:waistWidth*.98+chestWidth*.13,rz:.288},
    {y:2.895,x:0,z:0,rx:chestWidth*.95,rz:.329},
    {y:3.060,x:0,z:0,rx:chestWidth,rz:.340},
    {y:3.205,x:0,z:0,rx:shoulderWidth*.95,rz:.279},
    {y:3.295,x:0,z:0,rx:shoulderWidth,rz:.234},
    {y:3.355,x:0,z:0,rx:shoulderWidth*.64,rz:.202},
    {y:3.441,x:0,z:0,rx:.158,rz:.156}
  ];
  loft(torso,{bust:true,slices:135,radial:112});

  // Clavicle folds sculpted with elegant very faint curves.
  const clavicle = new THREE.MeshStandardMaterial({color:0xC2AB91,roughness:.5});
  for (const s of [-1,1]){
    tubeCurve([[s*.08,3.389,.169],[s*.21,3.375,.194],[s*.35,3.337,.208],[s*(shoulderWidth-.032),3.303,.15]],.007,clavicle);
  }
  // Shaped neck, with overlap into the upper torso and face.
  loft([
    {y:3.335,x:0,z:0,rx:.167,rz:.164},
    {y:3.46,x:0,z:0,rx:.150,rz:.146},
    {y:3.585,x:0,z:.005,rx:.139,rz:.138},
    {y:3.666,x:0,z:.013,rx:.147,rz:.144}
  ],{slices:36,radial:64});

  // Adult faceless oval head with softened jaw/chin, not an ellipsoid ball.
  const headGeo=new THREE.SphereGeometry(1,72,58);
  const a=headGeo.getAttribute('position');
  for(let i=0;i<a.count;i++){
    let x=a.getX(i),y=a.getY(i),z=a.getZ(i);
    const jaw=THREE.MathUtils.smoothstep(y,-.94,.53);
    const face=1+Math.max(0,z)*.10*gaussian(y,-.12,.75);
    x*=.239*(.77+.23*jaw);
    z*=.225*face;
    y*=.336;
    a.setXYZ(i,x,y,z);
  }
  headGeo.computeVertexNormals();
  const head=addMesh(headGeo,skin);
  head.position.set(0,3.845,.018);
  for(const s of [-1,1])ellipse(body,[s*.235,3.83,-.008],[.026,.066,.043],skin,24);

  // Sculpted arms with smooth taper and carefully attached shoulders.
  for(const s of [-1,1]){
    const arm=[
      {y:2.152,x:s*(shoulderWidth+.290),z:.094,rx:.068,rz:.073},
      {y:2.260,x:s*(shoulderWidth+.278),z:.085,rx:.085,rz:.091},
      {y:2.48,x:s*(shoulderWidth+.258),z:.057,rx:.125+musculature*.019,rz:.129+musculature*.016},
      {y:2.680,x:s*(shoulderWidth+.228),z:.015,rx:.100+musculature*.020,rz:.107+musculature*.015},
      {y:2.84,x:s*(shoulderWidth+.194),z:.008,rx:.135+musculature*.042,rz:.138+musculature*.033},
      {y:3.050,x:s*(shoulderWidth+.125),z:.003,rx:.154+musculature*.043,rz:.150+musculature*.030},
      {y:3.205,x:s*(shoulderWidth+.068),z:0,rx:.161+musculature*.022,rz:.148+musculature*.022},
      {y:3.319,x:s*(shoulderWidth-.015),z:0,rx:.153,rz:.139}
    ].reverse();
    // profile passed bottom-to-top
    loft(arm.slice().reverse(),{slices:94,radial:62});
    ellipse(body,[s*(shoulderWidth+.022),3.274,0],[.152+musculature*.016,.150,.148],skin,42);
    // Elbow seam is subtle, at arm rotation.
    seamRing(s*(shoulderWidth+.228),2.69,.016,.103+musculature*.020,.11,0);
    loft([
      {y:1.916,x:s*(shoulderWidth+.305),z:.102,rx:.076,rz:.060},
      {y:1.975,x:s*(shoulderWidth+.297),z:.103,rx:.084,rz:.070},
      {y:2.11,x:s*(shoulderWidth+.291),z:.095,rx:.070,rz:.071},
      {y:2.169,x:s*(shoulderWidth+.290),z:.092,rx:.070,rz:.070}
    ],{slices:31,radial:42});
    // Palm gently tapered and fully modelled individual fingers.
    const wristX=s*(shoulderWidth+.304);
    ellipse(body,[wristX,1.928,.103],[.080,.142,.065],skin,40);
    for(let finger=0;finger<4;finger++){
      const relative=(finger-1.5)*.038;
      const len=[.171,.218,.204,.150][finger];
      const x=wristX+s*relative;
      const yp=1.851-(finger===0?.013:0);
      tubeCurve([
        [x,yp,.128],
        [x+s*relative*.20,yp-len*.52,.131],
        [x+s*relative*.35,yp-len,.146]
      ],.018-(finger===3?.002:0),skin);
      ellipse(body,[x+s*relative*.35,yp-len,.146],[.018,.021,.019],skin,22);
    }
    tubeCurve([
      [wristX-s*.07,1.966,.137],
      [wristX-s*.125,1.894,.172],
      [wristX-s*.133,1.853,.179]
    ],.025,skin);
    ellipse(body,[wristX-s*.132,1.851,.178],[.022,.028,.024],skin,22);

    // Long shaped legs, natural calf and thigh volumes.
    const hx=s*(hipsWidth*.55);
    const kneeX=s*(.232*Math.pow(c.hips/96,.42));
    const ankleX=s*(.255*Math.pow(c.hips/96,.40));
    const thigh=.216*Math.pow(c.hips/96,.6)+.026*musculature;
    const calf=.135+.046*musculature;
    loft([
      {y:.235,x:ankleX,z:.015,rx:.089,rz:.093},
      {y:.35,x:ankleX,z:.016,rx:.094,rz:.097},
      {y:.61,x:kneeX,z:-.012,rx:calf,rz:calf*.96},
      {y:.76,x:kneeX,z:0,rx:calf*.97,rz:calf*.91},
      {y:.92,x:kneeX,z:.035,rx:.128+musculature*.017,rz:.132},
      {y:1.049,x:kneeX,z:.031,rx:.132+musculature*.019,rz:.14},
      {y:1.23,x:THREE.MathUtils.lerp(kneeX,hx,.38),z:0,rx:thigh*.80,rz:.181},
      {y:1.48,x:THREE.MathUtils.lerp(kneeX,hx,.76),z:0,rx:thigh*1.06,rz:.230},
      {y:1.71,x:hx,z:-.007,rx:thigh*1.14,rz:.244+belly*.012},
      {y:1.89,x:hx,z:-.004,rx:thigh*.98,rz:.232},
      {y:2.01,x:hx,z:0,rx:thigh*.80,rz:.203}
    ],{slices:120,radial:75});
    seamRing(kneeX,1.025,.036,.129+musculature*.017,.132);
    seamRing(ankleX,.266,.013,.088,.091);
    // Sculpt foot as horizontal loft with rounded heel and broad toe box.
    const footCurve=[
      {z:-.16,y:.125,rx:.080,ry:.080},
      {z:-.105,y:.114,rx:.092,ry:.083},
      {z:.01,y:.104,rx:.096,ry:.085},
      {z:.13,y:.108,rx:.112,ry:.080},
      {z:.31,y:.079,rx:.147,ry:.057},
      {z:.41,y:.067,rx:.146,ry:.047},
      {z:.495,y:.063,rx:.096,ry:.038},
      {z:.515,y:.063,rx:.018,ry:.015}
    ];
    const vertices=[],normals=[],idx=[],segs=38,lat=64;
    for(let zi=0;zi<=segs;zi++){
      const z=footCurve[0].z+(footCurve.at(-1).z-footCurve[0].z)*zi/segs;
      const pts=footCurve.map(p=>({y:p.z,x:0,z:0,rx:p.rx,rz:p.ry,orig:p.y}));
      const fy=smoothInterp(footCurve.map(p=>({y:p.z,cy:p.y,rx:p.rx,ry:p.ry})),z,'cy');
      const rx=smoothInterp(footCurve.map(p=>({y:p.z,cy:p.y,rx:p.rx,ry:p.ry})),z,'rx');
      const ry=smoothInterp(footCurve.map(p=>({y:p.z,cy:p.y,rx:p.rx,ry:p.ry})),z,'ry');
      for(let j=0;j<=lat;j++){
        const theta=2*Math.PI*j/lat;
        vertices.push(ankleX+rx*Math.cos(theta),fy+ry*Math.sin(theta),z);
        if(zi<segs&&j<lat){const ai=zi*(lat+1)+j,bi=ai+lat+1;idx.push(ai,ai+1,bi,ai+1,bi+1,bi);}
      }
    }
    const footGeo=new THREE.BufferGeometry();footGeo.setIndex(idx);footGeo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));footGeo.computeVertexNormals();addMesh(footGeo,skin);
    // five subtle separate porcelain toes, proportional to foot width
    for(let t=0;t<5;t++){
      const fx=ankleX+(t-2)*.050*s;
      const toeLength=[.071,.088,.095,.078,.063][t];
      ellipse(body,[fx,.078,.442+toeLength*.38],[.027,.026,toeLength*.63],skin,24);
    }
  }

  // Reference-inspired fine high-cut hip/brief seam and modest neutral panel.
  function hipTrim(){
    const line=[
      [-hipsWidth*.77,2.21,.251],
      [-hipsWidth*.57,2.12,.315],
      [-hipsWidth*.31,2.03,.355],
      [0,1.998,.383],
      [hipsWidth*.31,2.03,.355],
      [hipsWidth*.57,2.12,.315],
      [hipsWidth*.77,2.21,.251]
    ];
    tubeCurve(line,.0065,detail);
  }
  function brief(material){
    const profile=[
      {y:1.91,x:0,z:0,rx:hipsWidth*.66+.009,rz:.285},
      {y:1.985,x:0,z:0,rx:hipsWidth*.81+.017,rz:.325},
      {y:2.095,x:0,z:0,rx:hipsWidth+.018,rz:.369},
      {y:2.207,x:0,z:0,rx:hipsWidth*.995+.016,rz:.361}
    ];
    return loft(profile,{material,slices:44,radial:80});
  }
  switch(c.garment){
    case 'bodysuit':
      loft(torso.filter(r=>r.y>=1.91&&r.y<=3.295).map(r=>({
        ...r,rx:r.rx+.018,rz:r.rz+.024,z:r.z+.002
      })),{material:textile,bust:true,slices:105,radial:94});
      for(const s of [-1,1])tubeCurve([
        [s*.225,3.15,.314],[s*.35,3.31,.16],[s*.345,3.36,.10]
      ],.025,textile);
      break;
    case 'bra':
      loft(torso.filter(r=>r.y>=2.895&&r.y<=3.205).map(r=>({
        ...r,rx:r.rx+.019,rz:r.rz+.03
      })),{material:textile,bust:true,slices:42,radial:90});
      for(const s of [-1,1])tubeCurve([
        [s*.232,3.13,.33],[s*.30,3.34,.22],[s*.31,3.40,.13]
      ],.023,textile);
      break;
    case 'panties':
      brief(textile);break;
    case 'dress':
      loft(torso.filter(r=>r.y>=2.405&&r.y<=3.295).map(r=>({
        ...r,rx:r.rx+.025,rz:r.rz+.035
      })),{material:textile,bust:true,slices:82,radial:90});
      loft([
        {y:1.08,x:0,z:0,rx:hipsWidth*1.17,rz:.445},
        {y:1.29,x:0,z:0,rx:hipsWidth*1.19,rz:.46},
        {y:1.75,x:0,z:0,rx:hipsWidth*1.105,rz:.4},
        {y:2.09,x:0,z:0,rx:hipsWidth*1.05,rz:.375},
        {y:2.40,x:0,z:0,rx:(waistWidth+hipsWidth*.12)*.95,rz:.34}
      ],{material:textile,slices:65,radial:100});
      break;
    default:
      // Nude porcelain mannequin is anatomically neutral and non-explicit.
      // A thin fashion seam is used rather than covering the body in a solid suit.
      hipTrim();
  }
  return root;
}
