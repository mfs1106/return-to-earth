import * as THREE from 'three';
import { VIS_SCALE } from '../simulation/missions.js';
import { mulberry32 } from '../simulation/math.js';
import {
  canvasTexture,
  makeFlameTexture,
  makeGridFinTexture,
  makeRadialSpriteTexture,
} from './utils.js';

const STACK_OFFSET = 41.8;
const S1_BODY_BOTTOM = 3.15;
const S1_BODY_TOP = 41.3;
const S1_INTERSTAGE_TOP = 47.6;
const S2_TANK_BOTTOM = 4.35;
const S2_TANK_TOP = 16.2;

export const FALCON_PART_INFO = {
  'stage1-body': {
    name: '一级箭体 / 贮箱',
    category: '一级 · 结构',
    functionText:
      'Falcon 9 一级贮存液氧与 RP-1 煤油，承受起飞阶段的推力与气动载荷。9 台 Merlin 发动机安装在底部 Octaweb 结构上。',
    reality: '构型为官方资料；内部贮箱分区为简化剖面示意。',
  },
  'stage1-engines': {
    name: 'Merlin 发动机组 × 9',
    category: '一级 · 推进',
    functionText:
      '9 台 Merlin 1D 发动机提供一级推力。返航、再入和着陆阶段只点燃其中一部分，以控制推力与推进剂消耗。',
    reality: '发动机数量为官方事实；节流和点火时序为简化模拟。',
  },
  interstage: {
    name: '级间段',
    category: '一级 · 分离系统',
    functionText:
      '连接一级与二级的黑色结构，内部容纳二级发动机喷管，并通过气动推杆帮助两级分离。分离后级间段留在一级上。',
    reality: '构型为官方资料；分离动作是可视化。',
  },
  'grid-fins': {
    name: '栅格翼 × 4',
    category: '一级 · 气动控制',
    functionText:
      '一级再入时展开，利用气动阻力调整姿态与落点。四片栅格翼帮助一级在下降段保持稳定并对准着陆区。',
    reality: '数量为官方事实；控制律、偏转角度为教学示意。',
  },
  'landing-legs': {
    name: '着陆腿 × 4',
    category: '一级 · 着陆',
    functionText:
      '着陆前展开，为一级提供垂直着陆支撑。Falcon 9 使用着陆腿和着陆平台回收；这与 Starship Super Heavy 的发射塔机械臂捕获不同。',
    reality: '数量为官方事实；展开时刻为估算值。',
  },
  'stage2-tank': {
    name: '二级箭体',
    category: '二级 · 结构',
    functionText:
      '二级在分离后独立飞行，携带载荷继续加速。分离后它不与一级一起返回，而是沿自己的轨迹继续上升。',
    reality: '两级构型为官方事实；轨迹为简化模拟。',
  },
  mvac: {
    name: 'Merlin Vacuum',
    category: '二级 · 推进',
    functionText:
      '二级使用大喷管 Merlin Vacuum 发动机，在接近真空的环境中工作。它只在级间分离后点火，不参与一级回收。',
    reality: '发动机与用途为官方资料；点火时序为任务锚点。',
  },
  payload: {
    name: '载荷 / 整流罩',
    category: '载荷',
    functionText:
      'Crew-12 的载荷是 Crew Dragon 载人飞船；Starlink 任务使用整流罩保护卫星。演示中载荷保持在二级上方，未展示入轨释放。',
    reality: '任务配置按参考任务区分；载荷释放不在演示范围。',
  },
  'stage1-tanks': {
    name: '推进剂贮箱（剖面）',
    category: '一级 · 内部',
    functionText:
      '简化剖面展示液氧与 RP-1 贮箱的相对位置。实际贮箱、增压系统与管路远比示意复杂。',
    reality: '教学剖面示意，并非工程图纸。',
  },
};

function makeBodyTexture(label = 'SPACEX', seed = 1) {
  return canvasTexture(
    1024,
    2048,
    (ctx, w, h) => {
      const random = mulberry32(seed);
      ctx.fillStyle = '#e9edef';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 500; i += 1) {
        const alpha = random() * 0.055;
        ctx.fillStyle = `rgba(70,82,92,${alpha})`;
        ctx.fillRect(random() * w, random() * h, random() * 3 + 1, random() * 70 + 4);
      }
      ctx.strokeStyle = 'rgba(92,104,115,0.28)';
      ctx.lineWidth = 3;
      for (let x = 0; x <= w; x += 128) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += 256) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(63,72,82,0.74)';
      ctx.font = '800 92px "Arial Narrow", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, w * 0.5, h * 0.69);
      ctx.font = '600 32px "Cascadia Code", monospace';
      ctx.fillStyle = 'rgba(72,82,92,0.58)';
      ctx.fillText('FALCON 9', w * 0.5, h * 0.735);
      ctx.fillStyle = '#c8ced3';
      ctx.fillRect(w * 0.72, h * 0.12, 96, 58);
      ctx.fillStyle = '#b21f35';
      ctx.fillRect(w * 0.72, h * 0.12, 96, 18);
      ctx.fillStyle = '#1e376b';
      ctx.fillRect(w * 0.72, h * 0.12 + 18, 96, 18);
      ctx.fillStyle = '#e9edef';
      ctx.fillRect(w * 0.72, h * 0.12 + 36, 96, 22);
      ctx.fillStyle = 'rgba(40,50,60,0.68)';
      ctx.font = '700 25px "Cascadia Code", monospace';
      ctx.fillText('UNITED STATES', w * 0.72 + 48, h * 0.14 + 90);
    },
    { repeat: [1, 1] },
  );
}

function makeInterstageTexture() {
  return canvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#11161b';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(110,124,137,0.22)';
      ctx.lineWidth = 2;
      for (let x = 0; x <= w; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += 96) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(195,205,214,0.16)';
      ctx.fillRect(0, 60, w, 12);
      ctx.fillRect(0, h - 54, w, 10);
      ctx.fillStyle = 'rgba(195,205,214,0.28)';
      ctx.font = '600 20px "Cascadia Code", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('INTERSTAGE', w / 2, h * 0.47);
    },
    { repeat: [2, 1] },
  );
}

function makeFairingTexture() {
  return canvasTexture(
    512,
    1024,
    (ctx, w, h) => {
      ctx.fillStyle = '#eef2f4';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(105,116,125,0.25)';
      ctx.lineWidth = 3;
      for (let x = 0; x <= w; x += 128) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(65,74,83,0.55)';
      ctx.font = '700 46px "Arial Narrow", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('STARLINK', w / 2, h * 0.43);
      ctx.font = '500 20px "Cascadia Code", monospace';
      ctx.fillText('SPACEX', w / 2, h * 0.48);
    },
    { repeat: [1, 1] },
  );
}

function makeNozzleGlowTexture() {
  return makeRadialSpriteTexture('rgba(255,238,192,0.95)', 'rgba(255,120,35,0)');
}

function makePlume(scale = 1, flameTexture) {
  const group = new THREE.Group();
  const outerMaterial = new THREE.MeshBasicMaterial({
    map: flameTexture,
    color: 0xff7f31,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const innerMaterial = new THREE.MeshBasicMaterial({
    map: flameTexture,
    color: 0xfff2ce,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.56 * scale, 7.4 * scale, 14, 1, true), outerMaterial);
  outer.rotation.x = Math.PI;
  outer.position.y = -3.75 * scale;
  outer.raycast = () => {};
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.25 * scale, 4.7 * scale, 12, 1, true), innerMaterial);
  inner.rotation.x = Math.PI;
  inner.position.y = -2.45 * scale;
  inner.raycast = () => {};
  group.add(outer, inner);
  const glowTexture = makeNozzleGlowTexture();
  const glowMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xffb15d,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glow = new THREE.Sprite(glowMaterial);
  glow.scale.set(3.3 * scale, 3.3 * scale, 1);
  glow.position.y = -0.8;
  glow.raycast = () => {};
  group.add(glow);
  const light = new THREE.PointLight(0xff9a45, 0, 38 * scale, 2);
  light.position.y = -2.2;
  group.add(light);
  group.userData = { outer, inner, glow, light, outerMaterial, innerMaterial, glowMaterial };
  return group;
}

function makeFoot() {
  const group = new THREE.Group();
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 0.95, 0.2, 16),
    new THREE.MeshStandardMaterial({ color: 0x2c333a, metalness: 0.65, roughness: 0.45 }),
  );
  pad.position.y = -16.15;
  const footCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.42, 0.55, 10),
    new THREE.MeshStandardMaterial({ color: 0x7e8a95, metalness: 0.85, roughness: 0.32 }),
  );
  footCore.position.y = -15.8;
  group.add(pad, footCore);
  return group;
}

/**
 * Procedural, independently moving Falcon 9 model.
 * stage1 and stage2 are separate THREE.Group objects placed by the scene.
 */
export class Falcon9Model {
  constructor({ payloadType = 'dragon', quality = 'high' } = {}) {
    this.payloadType = payloadType;
    this.quality = quality;
    this.flameTexture = makeFlameTexture();
    this.gridTexture = makeGridFinTexture();
    this.stage1 = new THREE.Group();
    this.stage2 = new THREE.Group();
    this.stage1.name = 'Falcon9Stage1';
    this.stage2.name = 'Falcon9Stage2';
    this.partGroups = new Map();
    this.enginePlumes = [];
    this.stage1PlumePriority = [0, 1, 4, 2, 6, 3, 5, 7, 8];
    this.inspectionMode = 'stack';
    this.explodeProgress = 0;
    this.bodyShells = [];
    this.internals = [];
    this.legSwings = [];
    this.finHinges = [];
    this.shellRestore = [];
    this.selectedPart = null;
    this._buildMaterials();
    this._buildStage1();
    this._buildStage2();
    this.payload = null;
    this.setPayload(payloadType);
  }

  _buildMaterials() {
    const bodyTexture = makeBodyTexture('SPACEX', 12);
    const interstageTexture = makeInterstageTexture();
    const fairingTexture = makeFairingTexture();
    this.materials = {
      body: new THREE.MeshStandardMaterial({
        map: bodyTexture,
        color: 0xffffff,
        metalness: 0.24,
        roughness: 0.42,
      }),
      body2: new THREE.MeshStandardMaterial({
        map: makeBodyTexture('SPACEX', 21),
        color: 0xffffff,
        metalness: 0.24,
        roughness: 0.46,
      }),
      interstage: new THREE.MeshStandardMaterial({
        map: interstageTexture,
        color: 0xffffff,
        metalness: 0.52,
        roughness: 0.48,
      }),
      black: new THREE.MeshStandardMaterial({ color: 0x10151a, metalness: 0.55, roughness: 0.5 }),
      carbon: new THREE.MeshStandardMaterial({ color: 0x1b2026, metalness: 0.45, roughness: 0.54 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x9ca8b3, metalness: 0.9, roughness: 0.28 }),
      darkMetal: new THREE.MeshStandardMaterial({ color: 0x333b43, metalness: 0.9, roughness: 0.38 }),
      engine: new THREE.MeshStandardMaterial({
        color: 0x3b4148,
        metalness: 0.94,
        roughness: 0.32,
        side: THREE.DoubleSide,
      }),
      engineHot: new THREE.MeshStandardMaterial({
        color: 0x61594c,
        metalness: 0.8,
        roughness: 0.42,
        side: THREE.DoubleSide,
      }),
      tank: new THREE.MeshStandardMaterial({
        color: 0x9aa4ae,
        metalness: 0.84,
        roughness: 0.35,
      }),
      lox: new THREE.MeshStandardMaterial({
        color: 0x6e9fbe,
        metalness: 0.35,
        roughness: 0.45,
        transparent: true,
        opacity: 0.62,
      }),
      fuel: new THREE.MeshStandardMaterial({
        color: 0xb07a52,
        metalness: 0.2,
        roughness: 0.6,
        transparent: true,
        opacity: 0.6,
      }),
      fairing: new THREE.MeshStandardMaterial({
        map: fairingTexture,
        color: 0xffffff,
        metalness: 0.18,
        roughness: 0.44,
        side: THREE.DoubleSide,
      }),
      dragonWhite: new THREE.MeshStandardMaterial({ color: 0xdde4e9, metalness: 0.15, roughness: 0.48 }),
      dragonBlack: new THREE.MeshStandardMaterial({ color: 0x12181e, metalness: 0.35, roughness: 0.5 }),
      solar: new THREE.MeshStandardMaterial({ color: 0x1a2d46, metalness: 0.6, roughness: 0.3 }),
      window: new THREE.MeshStandardMaterial({
        color: 0x0b1a27,
        metalness: 0.7,
        roughness: 0.16,
        emissive: 0x0b2c44,
        emissiveIntensity: 0.4,
      }),
      gridFin: new THREE.MeshStandardMaterial({
        map: this.gridTexture,
        transparent: true,
        alphaTest: 0.2,
        side: THREE.DoubleSide,
        color: 0xbfc8d0,
        metalness: 0.82,
        roughness: 0.35,
      }),
      decal: new THREE.MeshBasicMaterial({ color: 0x151a1e }),
    };
    this.shellMaterials = [
      this.materials.body,
      this.materials.body2,
      this.materials.interstage,
      this.materials.fairing,
      this.materials.dragonWhite,
      this.materials.dragonBlack,
    ];
    this.shellMaterials.forEach((mat) => {
      mat.userData.baseTransparent = mat.transparent;
      mat.userData.baseOpacity = mat.opacity;
      mat.userData.baseDepthWrite = mat.depthWrite;
    });
  }

  _tagPart(group, partId) {
    group.userData.partId = partId;
    group.traverse((child) => {
      if (child.isMesh) child.userData.partId = partId;
    });
    this.partGroups.set(partId, group);
    return group;
  }

  _buildStage1() {
    const stage = this.stage1;
    const bodyGroup = this._tagPart(new THREE.Group(), 'stage1-body');
    const engineGroup = this._tagPart(new THREE.Group(), 'stage1-engines');
    const interstageGroup = this._tagPart(new THREE.Group(), 'interstage');
    const finsGroup = this._tagPart(new THREE.Group(), 'grid-fins');
    const legsGroup = this._tagPart(new THREE.Group(), 'landing-legs');
    const tankGroup = new THREE.Group();
    tankGroup.visible = false;
    this._tagPart(tankGroup, 'stage1-tanks');
    stage.add(bodyGroup, engineGroup, interstageGroup, finsGroup, legsGroup, tankGroup);

    const bodyHeight = S1_BODY_TOP - S1_BODY_BOTTOM;
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(1.83, 1.86, bodyHeight, 48, 1, true),
      this.materials.body,
    );
    body.position.y = (S1_BODY_TOP + S1_BODY_BOTTOM) / 2;
    bodyGroup.add(body);
    this.bodyShells.push(body);

    const baseRing = new THREE.Mesh(
      new THREE.CylinderGeometry(1.87, 1.9, 0.55, 48, 1, true),
      this.materials.carbon,
    );
    baseRing.position.y = S1_BODY_BOTTOM + 0.15;
    bodyGroup.add(baseRing);

    const upperRing = new THREE.Mesh(
      new THREE.CylinderGeometry(1.84, 1.84, 0.35, 48, 1, true),
      this.materials.metal,
    );
    upperRing.position.y = S1_BODY_TOP;
    bodyGroup.add(upperRing);

    // Subtle welded barrel seams and service hardware give the long white
    // cylinder a readable scale without turning the model into a cutaway.
    const seamMaterial = new THREE.MeshStandardMaterial({
      color: 0xb7c2c9,
      metalness: 0.6,
      roughness: 0.54,
    });
    for (const y of [8.5, 15.8, 23.1, 30.4, 37.7]) {
      const seam = new THREE.Mesh(new THREE.TorusGeometry(1.855, 0.018, 5, 48), seamMaterial);
      seam.rotation.x = Math.PI / 2;
      seam.position.y = y;
      bodyGroup.add(seam);
    }
    const serviceLine = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 32, 0.12),
      this.materials.metal,
    );
    serviceLine.position.set(1.82, 23.3, -0.31);
    bodyGroup.add(serviceLine);
    for (const y of [10.8, 20.5, 31.8]) {
      const accessPanel = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 0.72, 0.5),
        this.materials.darkMetal,
      );
      accessPanel.position.set(1.85, y, -0.16);
      bodyGroup.add(accessPanel);
    }

    const raceway = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 37.5, 0.5),
      this.materials.carbon,
    );
    raceway.position.set(1.64, 22.4, 0.58);
    raceway.rotation.y = 0.34;
    bodyGroup.add(raceway);

    for (let i = 0; i < 3; i += 1) {
      const rcs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.45), this.materials.darkMetal);
      const angle = (i / 3) * Math.PI * 2 + 0.4;
      rcs.position.set(Math.cos(angle) * 1.78, 39.8, Math.sin(angle) * 1.78);
      rcs.rotation.y = -angle;
      bodyGroup.add(rcs);
    }

    // Octaweb and Merlin engine bells.
    const octaweb = new THREE.Mesh(
      new THREE.CylinderGeometry(1.78, 1.62, 0.8, 9),
      this.materials.darkMetal,
    );
    octaweb.position.y = 2.9;
    engineGroup.add(octaweb);
    const enginePositions = [{ x: 0, z: 0 }];
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      enginePositions.push({ x: Math.cos(angle) * 1.16, z: Math.sin(angle) * 1.16 });
    }
    enginePositions.forEach((pos, index) => {
      const bell = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.54, 2.0, 16, 1, true),
        index === 0 ? this.materials.engineHot : this.materials.engine,
      );
      bell.position.set(pos.x, 1.4, pos.z);
      engineGroup.add(bell);
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.53, 0.045, 8, 20),
        this.materials.metal,
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.set(pos.x, 0.41, pos.z);
      engineGroup.add(rim);
      const plume = makePlume(1, this.flameTexture);
      plume.position.set(pos.x, 0.4, pos.z);
      plume.visible = false;
      // One shared engine light is enough; per-engine point lights would be expensive.
      plume.userData.light.visible = index === 0;
      engineGroup.add(plume);
      this.enginePlumes.push(plume);
    });

    // Four stowed landing legs.
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const pivot = new THREE.Group();
      pivot.position.set(Math.cos(angle) * 1.76, 16.2, Math.sin(angle) * 1.76);
      pivot.rotation.y = -angle;
      const swing = new THREE.Group();
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 15.8, 0.38),
        this.materials.carbon,
      );
      leg.position.set(0.12, -7.9, 0.35);
      const strut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.11, 12.5, 8),
        this.materials.metal,
      );
      strut.position.set(-0.42, -7.1, 0.62);
      swing.add(leg, strut, makeFoot());
      pivot.add(swing);
      legsGroup.add(pivot);
      this.legSwings.push(swing);
    }

    // Interstage, black composite section.
    const interstage = new THREE.Mesh(
      new THREE.CylinderGeometry(1.845, 1.86, S1_INTERSTAGE_TOP - S1_BODY_TOP, 48, 1, true),
      this.materials.interstage,
    );
    interstage.position.y = (S1_INTERSTAGE_TOP + S1_BODY_TOP) / 2;
    interstageGroup.add(interstage);
    this.bodyShells.push(interstage);
    const interstageTop = new THREE.Mesh(
      new THREE.TorusGeometry(1.84, 0.09, 8, 48),
      this.materials.metal,
    );
    interstageTop.rotation.x = Math.PI / 2;
    interstageTop.position.y = S1_INTERSTAGE_TOP;
    interstageGroup.add(interstageTop);
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2;
      const pusher = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.12, 1.7, 8),
        this.materials.metal,
      );
      pusher.position.set(Math.cos(angle) * 1.6, 42.1, Math.sin(angle) * 1.6);
      pusher.rotation.z = 0.35;
      interstageGroup.add(pusher);
    }

    // Grid fins: stowed tangent, rotating out after separation.
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2;
      const hinge = new THREE.Group();
      hinge.position.set(Math.cos(angle) * 1.9, 44.6, Math.sin(angle) * 1.9);
      hinge.rotation.y = -angle;
      const fin = new THREE.Mesh(new THREE.PlaneGeometry(2.65, 2.0), this.materials.gridFin);
      fin.rotation.y = Math.PI / 2;
      fin.position.x = 0.1;
      fin.castShadow = true;
      hinge.add(fin);
      finsGroup.add(hinge);
      this.finHinges.push(hinge);
    }

    // Simplified transparent cutaway internals.
    const loxTank = new THREE.Mesh(
      new THREE.CylinderGeometry(1.56, 1.56, 18.2, 32, 1, true),
      this.materials.lox,
    );
    loxTank.position.y = 13.2;
    const fuelTank = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 11.8, 32, 1, true),
      this.materials.fuel,
    );
    fuelTank.position.y = 29.2;
    const bulkhead = new THREE.Mesh(
      new THREE.SphereGeometry(1.55, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      this.materials.tank,
    );
    bulkhead.position.y = 22.4;
    bulkhead.scale.y = -0.45;
    const downcomer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 34, 8),
      this.materials.tank,
    );
    downcomer.position.set(0.35, 21, 0.1);
    tankGroup.add(loxTank, fuelTank, bulkhead, downcomer);
    this.internals.push(tankGroup);
    stage.userData = { type: 'stage1' };
  }

  _buildStage2() {
    const stage = this.stage2;
    const tankGroup = this._tagPart(new THREE.Group(), 'stage2-tank');
    const mvacGroup = this._tagPart(new THREE.Group(), 'mvac');
    const payloadGroup = this._tagPart(new THREE.Group(), 'payload');
    stage.add(tankGroup, mvacGroup, payloadGroup);
    this.payloadGroup = payloadGroup;

    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.52, 1.52, 4.15, 40, 1, true),
      this.materials.engine,
    );
    nozzle.position.y = 2.1;
    mvacGroup.add(nozzle);
    const nozzleRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.08, 8, 40),
      this.materials.metal,
    );
    nozzleRing.rotation.x = Math.PI / 2;
    nozzleRing.position.y = 0.04;
    mvacGroup.add(nozzleRing);
    const vacuumPlume = makePlume(1.3, this.flameTexture);
    vacuumPlume.position.y = 0.05;
    vacuumPlume.visible = false;
    mvacGroup.add(vacuumPlume);
    this.stage2Plume = vacuumPlume;

    const tankHeight = S2_TANK_TOP - S2_TANK_BOTTOM;
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(1.83, 1.83, tankHeight, 48, 1, true),
      this.materials.body2,
    );
    tank.position.y = (S2_TANK_TOP + S2_TANK_BOTTOM) / 2;
    tankGroup.add(tank);
    this.bodyShells.push(tank);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.84, 0.07, 8, 48),
      this.materials.metal,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = S2_TANK_TOP;
    tankGroup.add(ring);
    const adapter = new THREE.Mesh(
      new THREE.CylinderGeometry(1.78, 1.83, 0.7, 32),
      this.materials.darkMetal,
    );
    adapter.position.y = S2_TANK_TOP + 0.25;
    tankGroup.add(adapter);

    const s2Lox = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 1.45, 6.2, 24, 1, true),
      this.materials.lox,
    );
    s2Lox.position.y = 8.0;
    const s2Fuel = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 4.5, 24, 1, true),
      this.materials.fuel,
    );
    s2Fuel.position.y = 13.2;
    const s2Internals = new THREE.Group();
    s2Internals.add(s2Lox, s2Fuel);
    s2Internals.visible = false;
    tankGroup.add(s2Internals);
    this.internals.push(s2Internals);
    stage.userData = { type: 'stage2' };
  }

  setPayload(type = 'dragon') {
    const previous = this.payload;
    if (previous) {
      this.payloadGroup.remove(previous);
      this._disposeTransient(previous);
    }
    this.payloadType = type;
    this.fairingHalves = null;
    const payload = new THREE.Group();
    payload.position.y = S2_TANK_TOP + 0.55;
    if (type === 'crew') {
      this._buildDragon(payload);
    } else {
      this._buildStarlinkFairing(payload);
    }
    this.payloadGroup.add(payload);
    this.payload = payload;
    this.partGroups.set('payload', this.payloadGroup);
  }

  _buildDragon(root) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(1.78, 1.8, 3.3, 32),
      this.materials.dragonWhite,
    );
    trunk.position.y = 1.65;
    root.add(trunk);
    const trunkBand = new THREE.Mesh(
      new THREE.CylinderGeometry(1.81, 1.81, 0.35, 32),
      this.materials.dragonBlack,
    );
    trunkBand.position.y = 3.2;
    root.add(trunkBand);
    for (let i = 0; i < 4; i += 1) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 1.05), this.materials.solar);
      const angle = (i / 4) * Math.PI * 2 + 0.4;
      panel.position.set(Math.cos(angle) * 1.66, 1.55, Math.sin(angle) * 1.66);
      panel.rotation.y = -angle;
      root.add(panel);
    }
    const heatShield = new THREE.Mesh(
      new THREE.CylinderGeometry(1.62, 1.82, 0.3, 32),
      this.materials.dragonBlack,
    );
    heatShield.position.y = 3.45;
    root.add(heatShield);

    const profile = [
      new THREE.Vector2(0.01, 0),
      new THREE.Vector2(1.55, 0),
      new THREE.Vector2(1.72, 0.55),
      new THREE.Vector2(1.62, 1.65),
      new THREE.Vector2(1.3, 2.55),
      new THREE.Vector2(0.82, 3.5),
      new THREE.Vector2(0.4, 4.25),
      new THREE.Vector2(0.01, 4.55),
    ];
    const capsule = new THREE.Mesh(new THREE.LatheGeometry(profile, 36), this.materials.dragonWhite);
    capsule.position.y = 3.55;
    root.add(capsule);
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const windowMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.21, 12, 8),
        this.materials.window,
      );
      windowMesh.position.set(Math.cos(angle) * 0.98, 7.3, Math.sin(angle) * 0.98);
      windowMesh.scale.set(1, 1.35, 0.45);
      windowMesh.rotation.y = -angle;
      root.add(windowMesh);
    }
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 1.2, 24),
      this.materials.dragonWhite,
    );
    nose.position.y = 8.7;
    root.add(nose);
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(1.48, 1.48, 0.18, 32, 1, true),
      this.materials.dragonBlack,
    );
    stripe.position.y = 5.0;
    root.add(stripe);
    this.payloadHeight = 9.4;
  }

  _buildStarlinkFairing(root) {
    const halfGroups = [];
    for (let half = 0; half < 2; half += 1) {
      const g = new THREE.Group();
      const cylinder = new THREE.Mesh(
        new THREE.CylinderGeometry(
          1.84,
          1.84,
          5.8,
          32,
          1,
          true,
          half * Math.PI,
          Math.PI,
        ),
        this.materials.fairing,
      );
      cylinder.position.y = 2.9;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(1.84, 7.0, 32, 1, true, half * Math.PI, Math.PI),
        this.materials.fairing,
      );
      cone.position.y = 9.3;
      g.add(cylinder, cone);
      root.add(g);
      halfGroups.push(g);
      this.bodyShells.push(cylinder, cone);
    }
    const seam = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 11.4, 0.08),
      this.materials.dragonBlack,
    );
    seam.position.set(0, 5.7, 1.85);
    root.add(seam);
    const stack = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.3, 2.3, 20),
      this.materials.darkMetal,
    );
    stack.position.y = 1.2;
    root.add(stack);
    this.fairingHalves = halfGroups;
    this.payloadHeight = 12.8;
  }

  _disposeTransient(root) {
    root.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat) => {
        // Shared materials are retained; unique fairing textures are not created here.
        if (mat && mat.userData?.transient) mat.dispose();
      });
    });
  }

  resetTransforms() {
    this.stage1.position.set(0, 0, 0);
    this.stage2.position.set(0, STACK_OFFSET, 0);
    this.stage1.rotation.set(0, 0, 0);
    this.stage2.rotation.set(0, 0, 0);
  }

  setStagePose(s1Pos, s1Pitch, s2Pos, s2Pitch) {
    this.stage1.position.set(s1Pos.x, s1Pos.y, s1Pos.z);
    this.stage1.rotation.set(0, 0, -(s1Pitch * Math.PI) / 180);
    this.stage2.position.set(s2Pos.x, s2Pos.y, s2Pos.z);
    this.stage2.rotation.set(0, 0, -(s2Pitch * Math.PI) / 180);
  }

  setInspectionPose(stage1Pos, stage2Pos, mode, dt) {
    this.inspectionMode = mode;
    this.stage1.position.copy(stage1Pos);
    this.stage2.position.copy(stage2Pos);
    this.stage1.rotation.set(0, 0, 0);
    this.stage2.rotation.set(0, 0, 0);
    const target = mode === 'exploded' ? 1 : 0;
    this.explodeProgress += (target - this.explodeProgress) * Math.min(1, dt * 6);
    this._applyExplosion(this.explodeProgress);
  }

  _applyExplosion(p) {
    const byId = this.partGroups;
    if (byId.has('stage1-engines')) byId.get('stage1-engines').position.set(0, -23 * p, 0);
    if (byId.has('interstage')) byId.get('interstage').position.set(0, 18 * p, 0);
    if (byId.has('grid-fins')) byId.get('grid-fins').position.set(0, 25 * p, 0);
    if (byId.has('landing-legs')) byId.get('landing-legs').position.set(0, 2 * p, 0);
    if (byId.has('mvac')) byId.get('mvac').position.set(0, -8 * p, 0);
    if (byId.has('stage1-body')) byId.get('stage1-body').position.set(0, 0, 0);
    if (byId.has('stage2-tank')) byId.get('stage2-tank').position.set(0, 2 * p, 0);
    if (this.payloadGroup) {
      this.payloadGroup.position.set(0, 9 * p, 0);
      if (this.fairingHalves) {
        this.fairingHalves[0].position.x = -2.5 * p;
        this.fairingHalves[1].position.x = 2.5 * p;
      }
    }
    this.legSwings.forEach((swing, i) => {
      swing.rotation.z = 0.28 * (0.5 + 0.5 * p) + (this._legDeploy ?? 0) * 0.28;
      swing.rotation.x = i * 0.01;
    });
    this.finHinges.forEach((hinge, i) => {
      hinge.rotation.y = (i < 2 ? 1 : -1) * 0.08 + (this._finDeploy ?? 0) * (Math.PI / 2);
      hinge.rotation.z = (i % 2 ? -1 : 1) * 0.05 * p;
    });
    this._applyShellMode(this.inspectionMode, p);
  }

  _applyShellMode(mode, explode = this.explodeProgress) {
    const transparent = mode === 'cutaway' || mode === 'exploded';
    const opacity = mode === 'cutaway' ? 0.16 : mode === 'exploded' ? 0.26 : 1;
    this.shellMaterials.forEach((mat) => {
      mat.transparent = transparent ? true : mat.userData.baseTransparent;
      mat.opacity = transparent ? opacity : mat.userData.baseOpacity;
      mat.depthWrite = transparent ? false : mat.userData.baseDepthWrite;
      mat.needsUpdate = true;
    });
    this.internals.forEach((group) => {
      group.visible = transparent;
    });
    if (mode === 'exploded') {
      this.payloadGroup.visible = true;
    }
  }

  setInspectionMode(mode) {
    this.inspectionMode = mode;
    this._applyShellMode(mode);
  }

  setFlightState(sample, time) {
    this.inspectionMode = 'stack';
    this._applyShellMode('stack');
    this.setStagePose(sample.stage1.pos, sample.stage1.pitch, sample.stage2.pos, sample.stage2.pitch);
    const legs = sample.stage1.legs;
    this._legDeploy = legs;
    this._finDeploy = sample.stage1.gridFins;
    this.legSwings.forEach((swing) => {
      swing.rotation.z = 0.28 * legs;
    });
    this.finHinges.forEach((hinge, i) => {
      const sign = i % 2 === 0 ? 1 : -1;
      hinge.rotation.y = sign * (Math.PI / 2) * sample.stage1.gridFins;
      hinge.rotation.z = Math.sin(time * 1.7 + i) * 0.05 * sample.stage1.gridFins;
    });
    this._updatePlumes(sample, time);
  }

  _updatePlumes(sample, time) {
    const activePriority = this.stage1PlumePriority;
    this.enginePlumes.forEach((plume, index) => {
      const activeIndex = activePriority.indexOf(index);
      const visible = activeIndex < sample.stage1.engineCount;
      const throttle = sample.stage1.throttle || 0;
      const flicker = 0.88 + Math.sin(time * 28 + index * 1.7) * 0.12;
      plume.visible = visible && throttle > 0.02;
      if (plume.visible) {
        const scaleY = (0.5 + throttle * 0.95) * flicker;
        plume.scale.set(0.9 + throttle * 0.2, scaleY, 0.9 + throttle * 0.2);
        const data = plume.userData;
        data.outerMaterial.opacity = 0.28 + throttle * 0.36;
        data.innerMaterial.opacity = 0.55 + throttle * 0.35;
        data.glowMaterial.opacity = 0.3 + throttle * 0.45;
        data.light.intensity = (sample.stage1.engineCount === 9 ? 14 : 6) * throttle * flicker;
        data.light.distance = sample.stage1.engineCount === 9 ? 90 : 55;
      } else {
        plume.userData.light.intensity = 0;
      }
    });
    const s2Plume = this.stage2Plume;
    const s2Throttle = sample.stage2.throttle || 0;
    const s2Visible = sample.stage2.engineCount > 0 && s2Throttle > 0.02;
    s2Plume.visible = s2Visible;
    if (s2Visible) {
      const flicker = 0.9 + Math.sin(time * 24) * 0.1;
      s2Plume.scale.set(1, (0.65 + s2Throttle * 0.8) * flicker, 1);
      s2Plume.userData.outerMaterial.opacity = 0.42;
      s2Plume.userData.innerMaterial.opacity = 0.78;
      s2Plume.userData.glowMaterial.opacity = 0.55;
      s2Plume.userData.light.intensity = 9 * s2Throttle;
    } else {
      s2Plume.userData.light.intensity = 0;
    }
  }

  setSelection(partId) {
    this.selectedPart = partId;
  }

  getPartWorldPosition(partId) {
    const group = this.partGroups.get(partId);
    if (!group) return null;
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return null;
    return box.getCenter(new THREE.Vector3());
  }

  getPartDefinitions() {
    return FALCON_PART_INFO;
  }

  setQuality(quality) {
    this.quality = quality;
    this.enginePlumes.forEach((plume) => {
      plume.userData.glow.visible = quality !== 'low';
    });
    if (this.stage2Plume) this.stage2Plume.userData.glow.visible = quality !== 'low';
  }

  dispose() {
    const sceneRoot = new THREE.Group();
    sceneRoot.add(this.stage1, this.stage2);
    sceneRoot.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (!material) return;
        Object.values(material).forEach((value) => {
          if (value && value.isTexture) value.dispose();
        });
        material.dispose();
      });
    });
  }
}

export { STACK_OFFSET as FALCON_MODEL_STACK_OFFSET };
