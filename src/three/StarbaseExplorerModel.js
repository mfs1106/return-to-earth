import * as THREE from 'three';
import { canvasTexture, makeGridFinTexture } from './utils.js';

/**
 * Procedural, hierarchy-first Starbase facility model for the structure
 * explorer. Every selectable part has:
 *
 *   - a stable slash-separated ID (`facility/tower/arm-left/contact`)
 *   - its own THREE.Group / pivot and base local matrix
 *   - an explosion stage (1..3) and a local explosion offset
 *   - metadata used by the tree, search and detail panel
 *
 * The dimensions are deliberately approximate and tuned for readability.
 * They are not SpaceX engineering dimensions.
 */

export const SB = {
  mountTop: 5.5,
  boosterHeight: 73,
  shipHeight: 52,
  towerX: -22,
  towerHalf: 6.5,
  towerHeight: 145,
  armY: 104,
  armOpenZ: 12.5,
  armClosedZ: 5.4,
  stackOffset: 73,
  captureLift: 25.5,
  towerBaseY: 0,
};

const FACT = {
  official: { label: '公开资料', tone: 'official' },
  estimate: { label: '比例估算', tone: 'estimate' },
  illustration: { label: '教学示意', tone: 'illustration' },
};

export const FACT_LABELS = FACT;

function makeStainlessTexture() {
  return canvasTexture(
    1024,
    2048,
    (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#8f999e');
      grad.addColorStop(0.2, '#d2d9dc');
      grad.addColorStop(0.38, '#aab4b8');
      grad.addColorStop(0.6, '#e0e6e8');
      grad.addColorStop(0.8, '#99a4a9');
      grad.addColorStop(1, '#7d888d');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 500; i += 1) {
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.045})`;
        ctx.fillRect(Math.random() * w, 0, 1 + Math.random() * 2, h);
      }
      ctx.strokeStyle = 'rgba(46,54,58,0.25)';
      ctx.lineWidth = 3;
      for (let y = 0; y < h; y += 150) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      for (let x = 0; x < w; x += 120) {
        ctx.strokeStyle = 'rgba(42,50,54,0.075)';
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(28,36,40,0.34)';
      ctx.font = '700 34px "Arial Narrow", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('STARSHIP', w / 2, h * 0.42);
    },
    { repeat: [1, 1] },
  );
}

function makeTileTexture() {
  return canvasTexture(
    512,
    1024,
    (ctx, w, h) => {
      ctx.fillStyle = '#14191b';
      ctx.fillRect(0, 0, w, h);
      const size = 24;
      ctx.strokeStyle = 'rgba(92,99,101,0.48)';
      ctx.lineWidth = 1.5;
      for (let y = 0; y < h; y += size) {
        for (let x = (Math.floor(y / size) % 2) * (size / 2); x < w; x += size) {
          ctx.strokeRect(x, y, size, size);
        }
      }
      ctx.fillStyle = 'rgba(255,255,255,0.018)';
      ctx.fillRect(0, 0, w, h);
    },
    { repeat: [2, 3] },
  );
}

function makeStripedTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#2a3236';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 4);
    for (let x = -w * 1.5; x < w * 1.5; x += 48) {
      ctx.fillStyle = '#d18b3e';
      ctx.fillRect(x, -h, 24, h * 2);
    }
    ctx.restore();
  });
}

export class StarbaseExplorerModel {
  constructor({ quality = 'high' } = {}) {
    this.quality = quality;
    this.root = new THREE.Group();
    this.root.name = 'StarbaseFacility';
    this.nodes = new Map();
    this.order = [];
    this.palette = {};
    this.textures = [];
    this.interactiveMeshes = [];
    this.poseBlend = 0;
    this.poseTarget = 0;
    this._buildMaterials();
    this._build();
    this._finalize();
    this.root.updateMatrixWorld(true);
  }

  _buildMaterials() {
    const steelMap = makeStainlessTexture();
    const tileMap = makeTileTexture();
    const stripeMap = makeStripedTexture();
    const gridMap = makeGridFinTexture();
    this.textures.push(steelMap, tileMap, stripeMap, gridMap);
    const std = (options) => new THREE.MeshStandardMaterial(options);
    this.palette = {
      steel: std({ map: steelMap, color: 0xc8d0d3, metalness: 0.84, roughness: 0.33 }),
      steelDark: std({ color: 0x586468, metalness: 0.8, roughness: 0.42 }),
      structure: std({ color: 0x66747a, metalness: 0.75, roughness: 0.42 }),
      structureDark: std({ color: 0x3e4a4f, metalness: 0.7, roughness: 0.5 }),
      painted: std({ color: 0x7f8f95, metalness: 0.35, roughness: 0.62 }),
      concrete: std({ color: 0x626f70, metalness: 0.02, roughness: 0.95 }),
      concreteDark: std({ color: 0x3e494b, metalness: 0.02, roughness: 0.98 }),
      engine: std({ color: 0x41494e, metalness: 0.94, roughness: 0.3, side: THREE.DoubleSide }),
      engineHot: std({ color: 0x70675a, metalness: 0.85, roughness: 0.36, side: THREE.DoubleSide }),
      tile: std({ map: tileMap, color: 0xaeb7b9, metalness: 0.25, roughness: 0.78, side: THREE.DoubleSide }),
      grid: std({
        map: gridMap,
        color: 0xc1cbd0,
        metalness: 0.8,
        roughness: 0.34,
        transparent: true,
        alphaTest: 0.22,
        side: THREE.DoubleSide,
      }),
      hazard: std({ map: stripeMap, color: 0xffffff, metalness: 0.3, roughness: 0.6 }),
      orange: std({ color: 0xd68a39, metalness: 0.25, roughness: 0.65 }),
      pipe: std({ color: 0x8b989d, metalness: 0.8, roughness: 0.4 }),
      pipeDark: std({ color: 0x505b5f, metalness: 0.65, roughness: 0.55 }),
      glass: std({
        color: 0x89d9ee,
        metalness: 0.3,
        roughness: 0.22,
        transparent: true,
        opacity: 0.55,
        emissive: 0x1a5363,
        emissiveIntensity: 0.22,
      }),
      lamp: new THREE.MeshBasicMaterial({ color: 0xe5fbff }),
      amberLamp: new THREE.MeshBasicMaterial({ color: 0xff9f58 }),
      lox: std({ color: 0x55798b, metalness: 0.45, roughness: 0.48 }),
      methane: std({ color: 0x8d6a4b, metalness: 0.34, roughness: 0.58 }),
      composite: std({ color: 0x252d31, metalness: 0.35, roughness: 0.68 }),
      contact: std({
        color: 0xffa34e,
        metalness: 0.3,
        roughness: 0.45,
        emissive: 0x5f2a07,
        emissiveIntensity: 0.32,
      }),
    };
  }

  _createNode(config) {
    const {
      id,
      parent = null,
      name,
      category,
      kind = 'part',
      description,
      facts = ['estimate'],
      source = '',
      stage = 0,
      offset = [0, 0, 0],
      explodeRotation = null,
      shell = false,
      internal = false,
      position = [0, 0, 0],
      rotation = [0, 0, 0],
      scale = [1, 1, 1],
      visible = true,
    } = config;
    if (!id) throw new Error('Part node needs an id');
    const parentNode = parent ? this.nodes.get(parent) : null;
    if (parent && !parentNode) throw new Error(`Unknown parent ${parent} for ${id}`);
    const group = new THREE.Group();
    group.name = id;
    group.userData.partId = id;
    (parentNode ? parentNode.object : this.root).add(group);
    group.position.set(...position);
    group.rotation.set(...rotation);
    group.scale.set(...scale);
    const node = {
      id,
      name,
      category,
      kind,
      description,
      facts,
      source,
      stage,
      explodeOffset: new THREE.Vector3(...offset),
      explodeRotation: explodeRotation ? new THREE.Euler(...explodeRotation) : null,
      shell,
      internal,
      object: group,
      parent,
      children: [],
      directMeshes: [],
      materials: [],
      basePosition: group.position.clone(),
      baseQuaternion: group.quaternion.clone(),
      baseScale: group.scale.clone(),
      manualOffset: new THREE.Vector3(),
      manualRotation: new THREE.Euler(),
      hidden: false,
      ghost: false,
      baseVisible: visible,
      explodedFactor: 0,
    };
    this.nodes.set(id, node);
    this.order.push(node);
    if (parentNode) parentNode.children.push(id);
    return node;
  }

  _mesh(node, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.scale.set(...scale);
    mesh.userData.partId = node.id;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    node.object.add(mesh);
    node.directMeshes.push(mesh);
    return mesh;
  }

  _box(node, w, h, d, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
    return this._mesh(node, new THREE.BoxGeometry(w, h, d), material, position, rotation);
  }

  _cyl(node, radiusTop, radiusBottom, height, material, position = [0, 0, 0], rotation = [0, 0, 0], segments = 16, open = false) {
    return this._mesh(
      node,
      new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, open),
      material,
      position,
      rotation,
    );
  }

  _torus(node, radius, tube, material, position = [0, 0, 0], rotation = [Math.PI / 2, 0, 0], segments = 32) {
    return this._mesh(node, new THREE.TorusGeometry(radius, tube, 8, segments), material, position, rotation);
  }

  _beamBetween(node, from, to, width, depth, material) {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    const length = direction.length();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, length, depth), material);
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    mesh.userData.partId = node.id;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    node.object.add(mesh);
    node.directMeshes.push(mesh);
    return mesh;
  }

  /* --------------------------------------------------------------- facility */
  _build() {
    this._createNode({
      id: 'starbase',
      name: 'Starbase 全设施',
      category: '整体系',
      kind: 'assembly',
      description: '发射塔、机械臂、发射平台、推进剂区与两级飞行器的教学结构总览。',
      facts: ['illustration'],
    });
    this._buildFacility();
    this._buildVehicle();
  }

  _buildFacility() {
    const facility = this._createNode({
      id: 'facility',
      parent: 'starbase',
      name: '地面设施总成',
      category: '设施',
      kind: 'assembly',
      description: '地面侧的发射塔、抓取机械臂、发射平台、推进剂区与辅助设备。',
      facts: ['illustration'],
    });

    const tower = this._createNode({
      id: 'facility/tower',
      parent: facility.id,
      name: '发射塔 / Starbase Tower',
      category: '发射塔',
      kind: 'assembly',
      description: '用于整合、测试、发射并捕获返回 Super Heavy 的发射塔。塔上机械臂既可协助堆叠 Starship，也可捕获返回的助推器。',
      facts: ['official', 'estimate'],
      source: 'SpaceX Starbase Overview',
      stage: 1,
      offset: [-10, 0, 0],
      position: [SB.towerX, 0, 0],
    });

    this._buildTower(tower);
    this._buildArms(tower);
    this._buildLaunchMount(facility);
    this._buildTankFarm(facility);
    this._buildGroundSupport(facility);
  }

  _buildTower(tower) {
    const m = this.palette;
    const legPositions = [
      ['leg-nw', -1, -1],
      ['leg-ne', 1, -1],
      ['leg-sw', -1, 1],
      ['leg-se', 1, 1],
    ];
    legPositions.forEach(([key, sx, sz], index) => {
      const node = this._createNode({
        id: `facility/tower/${key}`,
        parent: tower.id,
        name: `主承重柱 ${String(index + 1).padStart(2, '0')} / ${key.replace('leg-', '').toUpperCase()}`,
        category: '发射塔',
        kind: 'structure',
        description: '塔架四角的主承重柱之一。真实塔架为大型钢结构，网页中的截面、尺寸和连接细节为比例估算。',
        facts: ['official', 'estimate'],
        stage: 2,
        offset: [sx * 9, 0, sz * 9],
        position: [sx * SB.towerHalf, 0, sz * SB.towerHalf],
      });
      this._box(node, 1.15, SB.towerHeight, 1.15, m.structure, [0, SB.towerHeight / 2, 0]);
      for (let y = 8; y < SB.towerHeight; y += 18) {
        this._box(node, 1.4, 0.35, 1.4, m.structureDark, [0, y, 0]);
      }
    });

    const braceRanges = [
      ['lower', 10, 48],
      ['mid', 50, 92],
      ['upper', 94, 142],
    ];
    braceRanges.forEach(([key, start, end], index) => {
      const node = this._createNode({
        id: `facility/tower/braces-${key}`,
        parent: tower.id,
        name: `格构斜撑 · ${key === 'lower' ? '下部' : key === 'mid' ? '中部' : '上部'}`,
        category: '发射塔',
        kind: 'structure',
        description: '连接主承重柱的水平梁和斜撑，提供塔架刚度。具体截面与节点板构造未公开，采用教学示意。',
        facts: ['official', 'illustration'],
        stage: 2,
        offset: [index === 0 ? -3 : index === 2 ? 3 : 0, 0, index === 1 ? 6 : 0],
      });
      const half = SB.towerHalf;
      for (let y = start; y <= end; y += 10) {
        for (const [a, b] of [
          [[-half, y, -half], [half, y, -half]],
          [[-half, y, half], [half, y, half]],
          [[-half, y, -half], [-half, y, half]],
          [[half, y, -half], [half, y, half]],
        ]) {
          this._beamBetween(node, a, b, 0.3, 0.3, m.structureDark);
        }
        for (const sx of [-1, 1]) {
          this._beamBetween(
            node,
            [sx * half, y, -half],
            [sx * half, y + 10, half],
            0.26,
            0.26,
            m.structureDark,
          );
          this._beamBetween(
            node,
            [-half, y, sx * half],
            [half, y + 10, sx * half],
            0.26,
            0.26,
            m.structureDark,
          );
        }
      }
    });

    for (let i = 0; i < 4; i += 1) {
      const y = 24 + i * 31;
      const node = this._createNode({
        id: `facility/tower/platform-${i + 1}`,
        parent: tower.id,
        name: `塔架平台 ${String(i + 1).padStart(2, '0')}`,
        category: '发射塔',
        kind: 'structure',
        description: '检修、管线与提升机构检修平台。平台的具体分层与走道布置为可视化估算。',
        facts: ['official', 'estimate'],
        stage: 2,
        offset: [i % 2 === 0 ? 8 : -8, (i - 1.5) * 1.5, i % 2 === 0 ? -4 : 4],
        position: [0, y, 0],
      });
      this._box(node, 15.5, 0.55, 15.5, m.structureDark, [0, 0, 0]);
      for (const [x, z, w, d] of [
        [0, -7.6, 15.5, 0.28],
        [0, 7.6, 15.5, 0.28],
        [-7.6, 0, 0.28, 15.5],
        [7.6, 0, 0.28, 15.5],
      ]) {
        this._box(node, w, 1.25, d, m.structure, [x, 0.85, z]);
      }
    }

    const rails = this._createNode({
      id: 'facility/tower/guide-rails',
      parent: tower.id,
      name: '垂直导轨 / 提升导向',
      category: '发射塔',
      kind: 'structure',
      description: '沿塔架布置的垂直导轨与导向结构，用于部件提升与定位。塔内机构未公开，此处为教学示意。',
      facts: ['illustration'],
      stage: 2,
      offset: [4, 0, -7],
    });
    for (const z of [-2.8, 2.8]) {
      this._box(rails, 0.35, 114, 0.35, m.structure, [7.0, 72, z]);
    }
    for (let y = 20; y < 128; y += 16) {
      this._box(rails, 0.22, 0.22, 6.0, m.structureDark, [7.0, y, 0]);
    }

    const hoist = this._createNode({
      id: 'facility/tower/hoist',
      parent: tower.id,
      name: '提升装置外壳',
      category: '发射塔',
      kind: 'mechanism',
      description: '塔架提升系统的可见外壳、卷扬与吊钩。Wolfram/传动细节没有公开工程图，本模型只表达位置关系。',
      facts: ['illustration'],
      stage: 2,
      offset: [-3, 5, 4],
      position: [0, 124, 0],
    });
    this._box(hoist, 4.2, 4.2, 4.2, m.composite, [0, 0, 0]);
    this._box(hoist, 4.8, 0.45, 5.2, m.structure, [0, 1.6, 0]);
    this._cyl(hoist, 0.62, 0.62, 4.8, m.pipe, [0, 2.4, 0], [0, 0, Math.PI / 2], 16);
    const cableMat = new THREE.MeshBasicMaterial({ color: 0x9ba8ab });
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 39, 6), cableMat);
    cable.position.set(1.2, -17.5, 0);
    nodeAddMesh(hoist, cable);
    this._box(hoist, 1.25, 1.25, 0.8, m.orange, [1.2, -36.2, 0]);

    const top = this._createNode({
      id: 'facility/tower/top',
      parent: tower.id,
      name: '塔顶 / 起重与避雷结构',
      category: '发射塔',
      kind: 'structure',
      description: '塔顶平台、顶部起重臂和避雷/照明桅杆。塔顶设备的数量与外形为公开影像基础上的比例重建。',
      facts: ['official', 'estimate'],
      stage: 2,
      offset: [0, 9, 0],
      position: [0, SB.towerHeight, 0],
    });
    this._box(top, 16, 1.4, 16, m.structureDark, [0, 0, 0]);
    this._box(top, 38, 1.1, 2.2, m.structure, [8, 4.2, 0]);
    this._box(top, 4.4, 2.8, 5.0, m.structureDark, [-4.5, 2.4, 0]);
    this._cyl(top, 0.2, 0.55, 20, m.structure, [-9, 12, 0], [0, 0, 0], 8);
    this._cyl(top, 0.08, 0.18, 16, m.structure, [-9, 27.5, 0], [0, 0, 0], 8);
    this._mesh(top, new THREE.SphereGeometry(0.55, 10, 8), m.amberLamp, [-9, 35.8, 0]);

    const lights = this._createNode({
      id: 'facility/tower/lighting',
      parent: tower.id,
      name: '塔架照明',
      category: '发射塔',
      kind: 'fixture',
      description: '塔架工作平台与结构边缘的可见照明灯具，便于夜间作业。灯具数量和位置示意。',
      facts: ['illustration'],
      stage: 2,
      offset: [0, 0, -5],
    });
    for (let i = 0; i < 9; i += 1) {
      this._mesh(lights, new THREE.SphereGeometry(0.25, 8, 6), m.lamp, [SB.towerHalf + 0.8, 12 + i * 14, SB.towerHalf + 0.8]);
    }
    for (let i = 0; i < 5; i += 1) {
      this._mesh(lights, new THREE.SphereGeometry(0.23, 8, 6), m.lamp, [-SB.towerHalf - 0.8, 22 + i * 22, -SB.towerHalf - 0.8]);
    }

    const pipes = this._createNode({
      id: 'facility/tower/pipes',
      parent: tower.id,
      name: '可见管线与电缆桥架',
      category: '发射塔',
      kind: 'fixture',
      description: '沿塔架外侧可见的电缆桥架、工艺管线和检修立管。具体走向、介质与数量没有公开，此处为教学示意。',
      facts: ['illustration'],
      stage: 2,
      offset: [0, 0, 4],
    });
    for (let i = 0; i < 4; i += 1) {
      const x = -SB.towerHalf - 1.1 - i * 0.5;
      this._cyl(pipes, 0.16, 0.16, 112, i < 2 ? m.pipe : m.pipeDark, [x, 72, 5.1], [0, 0, 0], 8);
      for (let y = 18; y < 126; y += 20) {
        this._box(pipes, 0.22, 0.22, 0.22, m.structureDark, [x, y, 4.7]);
      }
    }
  }

  _buildArms(tower) {
    const m = this.palette;
    const arms = this._createNode({
      id: 'facility/tower/arms',
      parent: tower.id,
      name: '抓取机械臂总成 / Chopsticks',
      category: '机械臂',
      kind: 'assembly',
      description: '用于堆叠 Starship 和捕获返回 Super Heavy 的两根大型机械臂总成。此总成包含主梁、铰点、滑移支座、末端接触件与可见液压结构。',
      facts: ['official', 'illustration'],
      source: 'SpaceX Starbase Overview',
    });

    for (const [side, label, z] of [
      [-1, '左', -SB.armOpenZ],
      [1, '右', SB.armOpenZ],
    ]) {
      const arm = this._createNode({
        id: `facility/tower/arms/arm-${side < 0 ? 'left' : 'right'}`,
        parent: arms.id,
        name: `${label}机械臂`,
        category: '机械臂',
        kind: 'assembly',
        description: `${label}侧抓取机械臂。两根机械臂在捕获时向助推器合拢，在堆叠操作中可托住 Starship。真实传动与载荷路径未公开。`,
        facts: ['official', 'illustration'],
        stage: 1,
        offset: [0, 8, side * 20],
        position: [5, SB.armY, z],
      });
      this._buildArm(arm, side);
    }
  }

  _buildArm(arm, side) {
    const m = this.palette;
    const main = this._createNode({
      id: `${arm.id}/main-beam`,
      parent: arm.id,
      name: '机械臂主梁',
      category: '机械臂',
      kind: 'structure',
      description: '机械臂的主要箱形梁/桁架梁，负责把夹持载荷传回塔架支座。真实截面、内部加强件和材料未公开。',
      facts: ['official', 'illustration'],
      stage: 3,
      offset: [0, 4, 0],
    });
    this._box(main, 18.5, 2.8, 3.6, m.structure, [9.25, 0, 0]);
    this._box(main, 17.0, 0.8, 4.4, m.structureDark, [9.5, 1.7, 0]);
    for (let i = 0; i < 6; i += 1) {
      this._box(main, 0.32, 2.0, 3.1, m.structureDark, [1.5 + i * 3, -1.2, 0]);
    }

    const joint = this._createNode({
      id: `${arm.id}/joint`,
      parent: arm.id,
      name: '铰点 / 枢轴支座',
      category: '机械臂',
      kind: 'mechanism',
      description: '机械臂与塔架连接的回转铰点/滑移支座，是机械臂开合运动的枢轴。内部轴承与驱动未公开。',
      facts: ['illustration'],
      stage: 3,
      offset: [-2, 0, side * 4],
      position: [0, 0, 0],
    });
    this._cyl(joint, 1.4, 1.4, 3.4, m.structureDark, [0, 0, 0], [Math.PI / 2, 0, 0], 20);
    this._torus(joint, 1.42, 0.12, m.contact, [0, 0, 0], [Math.PI / 2, 0, 0], 24);
    this._box(joint, 3.2, 3.6, 2.4, m.structure, [-1.1, -1.4, 0]);

    const carriage = this._createNode({
      id: `${arm.id}/carriage`,
      parent: arm.id,
      name: '滑移支座 / 小车',
      category: '机械臂',
      kind: 'mechanism',
      description: '机械臂根部的滑移/承载支座，用于在塔架导轨上定位。真实滑移机构和驱动装置未公开。',
      facts: ['illustration'],
      stage: 3,
      offset: [0, -5, -side * 6],
      position: [2.2, -3.3, 0],
    });
    this._box(carriage, 3.0, 2.2, 4.8, m.structureDark, [0, 0, 0]);
    this._box(carriage, 4.6, 0.5, 1.2, m.structure, [0.6, 1.2, 0]);
    this._mesh(carriage, new THREE.SphereGeometry(0.42, 10, 8), m.contact, [0.5, 0.3, 0]);

    const hydraulics = this._createNode({
      id: `${arm.id}/hydraulics`,
      parent: arm.id,
      name: '可见液压 / 支撑结构',
      category: '机械臂',
      kind: 'mechanism',
      description: '机械臂根部附近的可见液压缸与支撑杆。真实驱动方案、压力和冗余设计未公开，此处仅为结构示意。',
      facts: ['illustration'],
      stage: 3,
      offset: [2, -2, side * 8],
      position: [2.5, -2.6, 0],
    });
    for (const z of [-1.8, 1.8]) {
      this._cyl(hydraulics, 0.38, 0.38, 7.5, m.pipe, [0, 0, z], [0, 0, 0.75], 12);
      this._cyl(hydraulics, 0.16, 0.16, 8.2, m.structureDark, [0.5, 0, z], [0, 0, 0.75], 10);
    }

    const contact = this._createNode({
      id: `${arm.id}/contact`,
      parent: arm.id,
      name: '末端接触 / 夹持部件',
      category: '机械臂',
      kind: 'mechanism',
      description: '机械臂末端的夹持/接触区域，捕获时与 Super Heavy 上部的接触点相互作用。接触面的具体结构与载荷路径未公开，为教学示意。',
      facts: ['illustration'],
      stage: 3,
      offset: [8, 0, side * 3],
      position: [18.7, 0, 0],
    });
    this._box(contact, 3.6, 4.2, 5.4, m.structureDark, [0, 0, 0]);
    this._box(contact, 1.2, 4.8, 5.8, m.hazard, [-1.7, 0, 0]);
    for (const z of [-3.3, 3.3]) {
      this._box(contact, 3.0, 1.6, 0.9, m.contact, [0.7, -1.4, z]);
    }
  }

  _buildLaunchMount(facility) {
    const m = this.palette;
    const mount = this._createNode({
      id: 'facility/launch-mount',
      parent: facility.id,
      name: '发射平台 / Launch Mount',
      category: '发射平台',
      kind: 'assembly',
      description: '发射台基础、承载平台、轨道发射支座、固定区域和导流结构。真实 Starbase 发射台的内部结构与管线没有完整公开图纸。',
      facts: ['official', 'illustration'],
      stage: 1,
      offset: [0, 0, -20],
    });

    const base = this._createNode({
      id: 'facility/launch-mount/pad-base',
      parent: mount.id,
      name: '基础 / 混凝土台',
      category: '发射平台',
      kind: 'structure',
      description: '发射区的混凝土基础与承载地面。几何尺寸为比例估算，不对应官方施工图。',
      facts: ['official', 'estimate'],
      stage: 2,
      offset: [0, -3, 0],
    });
    this._cyl(base, 38, 41, 2.4, m.concrete, [0, -0.2, 0], [0, 0, 0], 64);
    this._cyl(base, 29, 30, 0.55, m.concreteDark, [0, 1.05, 0], [0, 0, 0], 64);

    const deck = this._createNode({
      id: 'facility/launch-mount/pad-deck',
      parent: mount.id,
      name: '发射平台面层',
      category: '发射平台',
      kind: 'structure',
      description: '发射平台上层钢结构与可见操作面。平台上的设备、开孔和防护细节为教学重建。',
      facts: ['illustration'],
      stage: 2,
      offset: [0, 4, 0],
    });
    this._cyl(deck, 25, 26, 1.6, m.concreteDark, [0, 1.6, 0], [0, 0, 0], 64);
    this._torus(deck, 25.4, 0.22, m.orange, [0, 2.45, 0], [Math.PI / 2, 0, 0], 64);

    const table = this._createNode({
      id: 'facility/launch-mount/launch-table',
      parent: mount.id,
      name: '轨道发射支座',
      category: '发射平台',
      kind: 'mechanism',
      description: '托住 Super Heavy 的发射支座/环形支撑结构。真实支撑方式与释放机构未公开，此处为教学示意。',
      facts: ['official', 'illustration'],
      stage: 2,
      offset: [0, 8, 0],
    });
    this._cyl(table, 9.5, 12, 3.6, m.structureDark, [0, 3.1, 0], [0, 0, 0], 32);
    this._torus(table, 7.4, 0.4, m.contact, [0, 5.0, 0], [Math.PI / 2, 0, 0], 48);
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2;
      this._box(table, 2.4, 1.2, 1.4, m.structure, [Math.cos(angle) * 10.2, 4.5, Math.sin(angle) * 10.2], [0, -angle, 0]);
    }

    const clamps = this._createNode({
      id: 'facility/launch-mount/hold-downs',
      parent: mount.id,
      name: '固定 / 夹持区域',
      category: '发射平台',
      kind: 'mechanism',
      description: '一级底部的固定与夹持区域。真实夹持机构可能包含液压与释放系统，内部结构未公开。',
      facts: ['illustration'],
      stage: 2,
      offset: [0, 6, 0],
    });
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const x = Math.cos(angle) * 8.8;
      const z = Math.sin(angle) * 8.8;
      this._box(clamps, 2.0, 2.0, 1.2, m.structure, [x, 6.4, z], [0, -angle, 0]);
      this._box(clamps, 1.0, 1.0, 1.8, m.contact, [x * 0.82, 7.2, z * 0.82], [0, -angle, 0]);
    }

    const deflector = this._createNode({
      id: 'facility/launch-mount/flame-deflector',
      parent: mount.id,
      name: '导流 / 防护结构',
      category: '发射平台',
      kind: 'structure',
      description: '发射台下方的导流与热防护结构。真实导流槽、喷水降噪和热环境设计未在模型中精确表达。',
      facts: ['illustration'],
      stage: 2,
      offset: [0, -5, -8],
      position: [0, -0.5, 0],
    });
    this._box(deflector, 28, 2.2, 8.0, m.concreteDark, [0, 0, 0], [0.16, 0, 0]);
    this._box(deflector, 18, 0.32, 6.2, m.structureDark, [0, 1.3, 0], [0.16, 0, 0]);

    const stairs = this._createNode({
      id: 'facility/launch-mount/service-structures',
      parent: mount.id,
      name: '检修结构与邻接设备',
      category: '发射平台',
      kind: 'structure',
      description: '平台边缘的检修梯、防护栏和邻接设备。用于表达空间关系，不是官方设备布置图。',
      facts: ['illustration'],
      stage: 2,
      offset: [20, 2, 0],
    });
    for (let i = 0; i < 6; i += 1) {
      this._box(stairs, 5.2, 0.32, 2.0, m.structure, [25.5, 0.5 + i * 0.8, -8 + i * 0.6]);
    }
    for (const z of [-7, 7]) {
      this._box(stairs, 0.18, 1.2, 16, m.structure, [27.5, 3.0, z]);
    }
  }

  _buildTankFarm(facility) {
    const m = this.palette;
    const farm = this._createNode({
      id: 'facility/tank-farm',
      parent: facility.id,
      name: '推进剂区 / 储罐与地面管线',
      category: '地面设施',
      kind: 'assembly',
      description: '发射场区的液氧、液态甲烷储罐与地面管线。储罐数量、方位和管线走向为低精度场景层，不对应官方布置图。',
      facts: ['illustration'],
      stage: 2,
      offset: [-24, 0, 0],
      position: [-94, 0, -62],
    });
    for (const [type, count, color, label] of [
      ['lox', 3, m.lox, '液氧'],
      ['ch4', 3, m.methane, '液态甲烷'],
    ]) {
      for (let i = 0; i < count; i += 1) {
        const tank = this._createNode({
          id: `facility/tank-farm/${type}-tank-${i + 1}`,
          parent: farm.id,
          name: `${label}储罐 ${i + 1}`,
          category: '地面设施',
          kind: 'structure',
          description: `${label}储罐的低精度教学模型。真实容量、绝热结构、阀门与安全系统未公开，不能视为工程数据。`,
          facts: ['illustration'],
          stage: 3,
          offset: [type === 'lox' ? -8 : 8, 0, i * 8 - 8],
          position: [type === 'lox' ? -16 : 16, 0, i * 14 - 14],
        });
        this._cyl(tank, 6.2, 6.5, 20, color, [0, 10, 0], [0, 0, 0], 28);
        this._mesh(tank, new THREE.SphereGeometry(6.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), color, [0, 20, 0]);
        this._torus(tank, 6.23, 0.1, m.structureDark, [0, 1.4, 0], [Math.PI / 2, 0, 0], 28);
      }
    }
    const pipes = this._createNode({
      id: 'facility/tank-farm/pipes',
      parent: farm.id,
      name: '地面管线 / 管廊',
      category: '地面设施',
      kind: 'fixture',
      description: '连接储罐与发射区的示意管线。介质、直径、阀门和走向均为教学示意。',
      facts: ['illustration'],
      stage: 3,
      offset: [0, 0, -12],
    });
    for (let i = 0; i < 5; i += 1) {
      this._cyl(pipes, 0.18, 0.18, 33, i < 2 ? m.pipe : m.pipeDark, [-12 + i * 2.2, 0.7, 4], [Math.PI / 2, 0, 0], 8);
    }
    for (let i = 0; i < 8; i += 1) {
      this._box(pipes, 0.28, 1.8, 0.28, m.structureDark, [-12 + i * 3.1, 0.9, 5.5]);
    }
  }

  _buildGroundSupport(facility) {
    const m = this.palette;
    const support = this._createNode({
      id: 'facility/ground-support',
      parent: facility.id,
      name: '地面辅助设备 / 照明',
      category: '地面设施',
      kind: 'assembly',
      description: '发射区周边的照明、供电与辅助设备。只作为环境层表达，不代表完整的地面支持系统。',
      facts: ['illustration'],
      stage: 2,
      offset: [0, 0, 18],
    });
    for (let i = 0; i < 3; i += 1) {
      const mast = this._createNode({
        id: `facility/ground-support/floodlight-${i + 1}`,
        parent: support.id,
        name: `泛光灯 ${i + 1}`,
        category: '地面设施',
        kind: 'fixture',
        description: '发射区周围的照明灯柱。数量和位置为视觉场景布置。',
        facts: ['illustration'],
        stage: 3,
        offset: [i * 8 - 8, 0, i * 4],
        position: [i === 0 ? 68 : i === 1 ? -72 : 58, 0, i === 0 ? 54 : i === 1 ? 50 : -64],
      });
      this._box(mast, 1.0, 26, 1.0, m.structure, [0, 13, 0]);
      this._box(mast, 5.2, 1.5, 1.2, m.structureDark, [0, 26.2, 0]);
      this._box(mast, 4.5, 0.6, 0.8, m.lamp, [0, 25.3, 0.5]);
    }
  }

  /* --------------------------------------------------------------- vehicle */
  _buildVehicle() {
    const m = this.palette;
    const vehicle = this._createNode({
      id: 'vehicle',
      parent: 'starbase',
      name: '飞行器总成',
      category: '飞行器',
      kind: 'assembly',
      description: 'Starship 与 Super Heavy 两级飞行器的教学结构总览。飞行硬件会随版本迭代，本页为概念构型。',
      facts: ['official', 'estimate'],
    });
    const stack = this._createNode({
      id: 'vehicle/stack',
      parent: vehicle.id,
      name: '整箭堆叠 / Stack',
      category: '飞行器',
      kind: 'assembly',
      description: 'Starship 堆叠在 Super Heavy 上方的整装状态。热分离界面位于两者之间。',
      facts: ['official', 'estimate'],
      stage: 1,
      offset: [0, 18, 22],
      position: [0, SB.mountTop, 0],
    });
    this._buildBooster(stack);
    this._buildStackConnection(stack);
    this._buildShip(stack);
  }

  _buildBooster(stack) {
    const m = this.palette;
    const booster = this._createNode({
      id: 'vehicle/stack/booster',
      parent: stack.id,
      name: 'Super Heavy 助推器',
      category: 'Super Heavy',
      kind: 'assembly',
      description: 'Starship 系统的一级。公开资料显示其为可重复使用助推器，由发射塔机械臂捕获，不使用着陆腿。',
      facts: ['official'],
      source: 'SpaceX Starship design',
    });

    const shell = this._createNode({
      id: 'vehicle/stack/booster/shell',
      parent: booster.id,
      name: 'Super Heavy 箭体外壳',
      category: 'Super Heavy',
      kind: 'shell',
      description: '不锈钢箭体外壳。环焊缝、纵向缝与箭体比例参考公开影像，尺寸与分段为可视化估算。',
      facts: ['official', 'estimate'],
      stage: 3,
      offset: [0, 0, 0],
      position: [0, 8.5, 0],
      shell: true,
    });
    this._cyl(shell, 4.5, 4.5, 60.5, m.steel, [0, 30.25, 0], [0, 0, 0], 64);
    this._torus(shell, 4.51, 0.06, m.steelDark, [0, 59.5, 0], [Math.PI / 2, 0, 0], 64);

    const welds = this._createNode({
      id: 'vehicle/stack/booster/weld-rings',
      parent: booster.id,
      name: '可见环焊缝',
      category: 'Super Heavy',
      kind: 'detail',
      description: '不锈钢箭体分段处的环向焊缝。仅表达可见分段的视觉结构，不代表真实分段数量。',
      facts: ['estimate', 'illustration'],
      stage: 3,
      offset: [0, 0, 0],
    });
    for (const y of [12, 22, 32, 42, 52, 62]) {
      this._torus(welds, 4.51, 0.035, m.steelDark, [0, y, 0], [Math.PI / 2, 0, 0], 64);
    }

    const raceways = this._createNode({
      id: 'vehicle/stack/booster/raceways',
      parent: booster.id,
      name: '可见管线 / 电缆整流罩',
      category: 'Super Heavy',
      kind: 'detail',
      description: '箭体外侧的电缆桥架/管线整流罩。真实走向与数量未公开，此处为视觉重建。',
      facts: ['illustration'],
      stage: 3,
      offset: [0, 0, 2],
    });
    for (const angle of [-0.32, 2.75]) {
      this._box(raceways, 0.28, 51, 0.38, m.structureDark, [Math.cos(angle) * 4.47, 36, Math.sin(angle) * 4.47], [0, -angle, 0]);
    }

    const skirt = this._createNode({
      id: 'vehicle/stack/booster/aft-skirt',
      parent: booster.id,
      name: '发动机舱外罩 / 尾段',
      category: 'Super Heavy',
      kind: 'shell',
      description: '一级底部发动机舱的可见外罩。内部结构、隔热和载荷路径为教学示意。',
      facts: ['official', 'illustration'],
      stage: 3,
      offset: [0, 0, 0],
      position: [0, 3.0, 0],
      shell: true,
    });
    this._cyl(skirt, 4.55, 4.65, 5.6, m.structureDark, [0, 3.2, 0], [0, 0, 0], 64, true);
    this._torus(skirt, 4.6, 0.12, m.steelDark, [0, 0.4, 0], [Math.PI / 2, 0, 0], 64);

    const engineBay = this._createNode({
      id: 'vehicle/stack/booster/engine-bay',
      parent: booster.id,
      name: '发动机舱 / 33 台发动机',
      category: 'Super Heavy',
      kind: 'assembly',
      description: 'Super Heavy 的发动机舱与 33 台 Raptor 发动机安装区域。发动机数量和用途来自公开资料；喷管外形、布局细节为教学示意。',
      facts: ['official', 'illustration'],
      stage: 2,
      offset: [0, -19, 0],
      shell: true,
    });
    this._cyl(engineBay, 4.45, 4.45, 8.0, m.structureDark, [0, 4.0, 0], [0, 0, 0], 48);
    this._cyl(engineBay, 4.55, 4.55, 1.2, m.steelDark, [0, 8.0, 0], [0, 0, 0], 48);
    this._torus(engineBay, 4.0, 0.22, m.structure, [0, 1.0, 0], [Math.PI / 2, 0, 0], 48);
    this._buildBoosterEngines(engineBay);

    const gridFins = this._createNode({
      id: 'vehicle/stack/booster/grid-fins',
      parent: booster.id,
      name: '栅格翼组 × 4',
      category: 'Super Heavy',
      kind: 'assembly',
      description: '一级上部的四片栅格翼，用于气动控制。四片数量与位置为公开资料；具体翼面尺寸和控制律为示意。',
      facts: ['official', 'illustration'],
      stage: 2,
      offset: [0, 6, 0],
    });
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const fin = this._createNode({
        id: `vehicle/stack/booster/grid-fins/fin-${i + 1}`,
        parent: gridFins.id,
        name: `栅格翼 ${i + 1}`,
        category: 'Super Heavy',
        kind: 'part',
        description: `第 ${i + 1} 片栅格翼。真实构型尺寸、作动机构和展开角度未公开，此处为结构示意。`,
        facts: ['official', 'illustration'],
        stage: 3,
        offset: [Math.cos(angle) * 12, 0, Math.sin(angle) * 12],
        explodeRotation: [0, 0, 0],
        position: [Math.cos(angle) * 4.55, 63.5, Math.sin(angle) * 4.55],
        rotation: [0, -angle, 0],
      });
      this._mesh(fin, new THREE.PlaneGeometry(4.4, 4.0), m.grid, [0, 0, 0], [0, Math.PI / 2, 0], [1, 1, 1]);
      this._box(fin, 0.3, 4.2, 0.3, m.structureDark, [-2.0, 0, 0]);
      this._box(fin, 0.3, 0.3, 4.1, m.structureDark, [0, 0, 0]);
    }

    const hot = this._createNode({
      id: 'vehicle/stack/booster/hot-stage',
      parent: booster.id,
      name: '热分离区域 / 通风环',
      category: 'Super Heavy',
      kind: 'shell',
      description: 'Super Heavy 顶部的热分离结构区域。热分离具体硬件与通气细节未公开，此处为教学示意。',
      facts: ['official', 'illustration'],
      stage: 2,
      offset: [0, 9, 0],
      position: [0, 69, 0],
      shell: true,
    });
    this._cyl(hot, 4.55, 4.7, 3.8, m.structureDark, [0, 2, 0], [0, 0, 0], 64, true);
    for (let i = 0; i < 24; i += 1) {
      const angle = (i / 24) * Math.PI * 2;
      this._box(hot, 0.42, 1.2, 0.58, m.amberLamp, [Math.cos(angle) * 4.66, 2, Math.sin(angle) * 4.66], [0, -angle, 0]);
    }

    const tanks = this._createNode({
      id: 'vehicle/stack/booster/tanks',
      parent: booster.id,
      name: '示意贮箱 / 液氧与甲烷',
      category: 'Super Heavy',
      kind: 'internal',
      description: '一级推进剂贮箱的教学剖面示意。仅表达液氧/液态甲烷贮箱的相对位置，不代表真实内部结构、隔板或管路。',
      facts: ['illustration'],
      internal: true,
      visible: false,
    });
    this._cyl(tanks, 3.95, 3.95, 25, m.lox, [0, 24, 0], [0, 0, 0], 40);
    this._cyl(tanks, 3.7, 3.7, 27, m.methane, [0, 52, 0], [0, 0, 0], 40);
    this._mesh(tanks, new THREE.SphereGeometry(3.95, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.lox, [0, 36.5, 0], [0, 0, 0], [1, -0.32, 1]);
    this._mesh(tanks, new THREE.SphereGeometry(3.7, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.methane, [0, 65.5, 0], [0, 0, 0], [1, 0.36, 1]);
    this._cyl(tanks, 0.32, 0.32, 57, m.pipe, [0.8, 35, 0], [0, 0, 0], 10);
  }

  _buildBoosterEngines(engineBay) {
    const m = this.palette;
    const engines = this._createNode({
      id: 'vehicle/stack/booster/engine-bay/engines',
      parent: engineBay.id,
      name: 'Raptor 发动机群',
      category: 'Super Heavy',
      kind: 'assembly',
      description: '33 台 Raptor 发动机的教学分组。可以先整组拆出，再逐台查看喷管。发动机数量和用途为公开资料；内部结构与真实布局为示意。',
      facts: ['official', 'illustration'],
    });
    const layout = [{ x: 0, z: 0, r: 1.15, ring: '中心' }];
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * Math.PI * 2;
      layout.push({ x: Math.cos(a) * 1.75, z: Math.sin(a) * 1.75, r: 0.82, ring: '内环' });
    }
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * Math.PI * 2 + 0.2;
      layout.push({ x: Math.cos(a) * 3.0, z: Math.sin(a) * 3.0, r: 0.64, ring: '中环' });
    }
    for (let i = 0; i < 20; i += 1) {
      const a = (i / 20) * Math.PI * 2;
      layout.push({ x: Math.cos(a) * 3.95, z: Math.sin(a) * 3.95, r: 0.52, ring: '外环' });
    }
    layout.forEach((engine, index) => {
      const node = this._createNode({
        id: `vehicle/stack/booster/engine-bay/engines/engine-${String(index + 1).padStart(2, '0')}`,
        parent: engines.id,
        name: `Raptor 发动机 ${String(index + 1).padStart(2, '0')} · ${engine.ring}`,
        category: 'Super Heavy',
        kind: 'engine',
        description: `Super Heavy 的 ${engine.ring} Raptor 发动机之一。发动机数量与推进用途为公开资料；单台发动机的外形、喷管和安装细节为教学示意。`,
        facts: ['official', 'illustration'],
        stage: 3,
        // Spread sideways and keep the nozzles above the pad when the bay is
        // detached; moving them further down would put them under the ground.
        offset: [engine.x * 5.2, 4.5, engine.z * 5.2],
        position: [engine.x, 0, engine.z],
      });
      this._cyl(node, engine.r * 0.58, engine.r, 2.3, index < 3 ? m.engineHot : m.engine, [0, 1.3, 0], [0, 0, 0], 14, true);
      this._torus(node, engine.r * 0.95, 0.045, m.pipe, [0, 0.2, 0], [Math.PI / 2, 0, 0], 14);
      this._cyl(node, engine.r * 0.4, engine.r * 0.4, 0.65, m.engine, [0, 2.7, 0], [0, 0, 0], 12);
      this._mesh(node, new THREE.SphereGeometry(engine.r * 0.34, 10, 8), m.structureDark, [0, 3.15, 0]);
    });
  }

  _buildStackConnection(stack) {
    const m = this.palette;
    const connection = this._createNode({
      id: 'vehicle/stack/connection',
      parent: stack.id,
      name: '两级连接 / 热分离界面',
      category: '整箭连接',
      kind: 'assembly',
      description: 'Super Heavy 与 Starship 之间的堆叠、热分离和级间接口区域。真实接口结构、锁定机构与通气路径未公开。',
      facts: ['official', 'illustration'],
      stage: 2,
      offset: [0, 8, 0],
      position: [0, SB.stackOffset, 0],
    });
    this._torus(connection, 4.52, 0.16, m.contact, [0, 0, 0], [Math.PI / 2, 0, 0], 64);
    this._cyl(connection, 4.55, 4.55, 1.2, m.structureDark, [0, 0.5, 0], [0, 0, 0], 48, true);
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      this._box(connection, 0.32, 0.5, 0.4, m.structure, [Math.cos(a) * 4.4, 0.6, Math.sin(a) * 4.4], [0, -a, 0]);
    }

    const separation = this._createNode({
      id: 'vehicle/stack/connection/separation-ring',
      parent: connection.id,
      name: '热分离环 / 级间结构',
      category: '整箭连接',
      kind: 'structure',
      description: '热分离区域的结构环。Starship 的热分离硬件随版本变化，本模型只表达空间关系，不代表官方工程结构。',
      facts: ['official', 'illustration'],
      stage: 3,
      offset: [0, 5, 0],
    });
    this._torus(separation, 4.54, 0.22, m.steelDark, [0, 0, 0], [Math.PI / 2, 0, 0], 64);
    this._cyl(separation, 4.5, 4.5, 2.6, m.structureDark, [0, 1.3, 0], [0, 0, 0], 48, true);

    const launchInterface = this._createNode({
      id: 'vehicle/stack/connection/launch-interface',
      parent: connection.id,
      name: '发射支座接触区域',
      category: '整箭连接',
      kind: 'interface',
      description: '助推器与发射支座/夹持区域的接触位置。这里用示意环表示，真实固定点数量和结构未公开。',
      facts: ['illustration'],
      stage: 3,
      offset: [0, -10, 0],
    });
    this._torus(launchInterface, 4.5, 0.1, m.contact, [0, -SB.stackOffset, 0], [Math.PI / 2, 0, 0], 64);
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      this._mesh(launchInterface, new THREE.SphereGeometry(0.22, 8, 6), m.contact, [Math.cos(a) * 4.55, -SB.stackOffset, Math.sin(a) * 4.55]);
    }
  }

  _buildShip(stack) {
    const m = this.palette;
    const ship = this._createNode({
      id: 'vehicle/stack/ship',
      parent: stack.id,
      name: 'Starship 飞船',
      category: 'Starship',
      kind: 'assembly',
      description: 'Starship 二级飞船。公开资料描述其为可重复使用的不锈钢飞船，具备襟翼与热防护系统；具体构型随版本变化。',
      facts: ['official', 'estimate'],
      stage: 2,
      offset: [0, 30, 0],
      position: [0, SB.stackOffset, 0],
    });

    const body = this._createNode({
      id: 'vehicle/stack/ship/body',
      parent: ship.id,
      name: 'Starship 箭体',
      category: 'Starship',
      kind: 'shell',
      description: '飞船主箭体与贮箱外壳。不锈钢材料、直径和比例来自公开影像；具体分段与厚度为估算。',
      facts: ['official', 'estimate'],
      stage: 3,
      offset: [0, 0, 0],
      position: [0, 5.5, 0],
      shell: true,
    });
    this._cyl(body, 4.5, 4.5, 32.5, m.steel, [0, 16.25, 0], [0, 0, 0], 64);
    this._torus(body, 4.51, 0.06, m.steelDark, [0, 31.7, 0], [Math.PI / 2, 0, 0], 64);

    const nose = this._createNode({
      id: 'vehicle/stack/ship/nose',
      parent: ship.id,
      name: '鼻锥',
      category: 'Starship',
      kind: 'shell',
      description: 'Starship 的渐变鼻锥。外形比例按公开照片重建，具体几何不是官方模型。',
      facts: ['official', 'estimate'],
      stage: 3,
      offset: [0, 17, 0],
      position: [0, 38, 0],
      shell: true,
    });
    const profile = [];
    for (let i = 0; i <= 24; i += 1) {
      const t = i / 24;
      profile.push(new THREE.Vector2(Math.max(0.01, 4.5 * Math.cos(t * Math.PI * 0.5) ** 0.72), t * 14));
    }
    this._mesh(nose, new THREE.LatheGeometry(profile, 64), m.steel, [0, 0, 0]);
    this._torus(nose, 4.45, 0.08, m.steelDark, [0, 0.3, 0], [Math.PI / 2, 0, 0], 64);

    const shield = this._createNode({
      id: 'vehicle/stack/ship/heat-shield',
      parent: ship.id,
      name: '热防护瓦区域',
      category: 'Starship',
      kind: 'shell',
      description: '飞船一侧的黑色热防护瓦区域。瓦片排列、覆盖范围与具体隔热材料为教学示意；真实材料与固定方式未公开。',
      facts: ['official', 'illustration'],
      stage: 3,
      offset: [10, 0, -3],
      position: [0, 5.5, 0],
      rotation: [0, Math.PI, 0],
      shell: true,
    });
    this._mesh(
      shield,
      new THREE.CylinderGeometry(4.53, 4.53, 32.0, 48, 1, true, -Math.PI / 2, Math.PI),
      m.tile,
      [0, 16.0, 0],
    );
    this._mesh(
      shield,
      new THREE.LatheGeometry(
        profile.map((p) => new THREE.Vector2(p.x + 0.03, p.y)),
        32,
        -Math.PI / 2,
        Math.PI,
      ),
      m.tile,
      [0, 32.5, 0],
    );
    for (let i = 0; i < 6; i += 1) {
      const a = -Math.PI / 2 + (i / 5) * Math.PI;
      this._box(shield, 0.04, 25, 0.4, m.structureDark, [Math.cos(a) * 4.55, 16, Math.sin(a) * 4.55], [0, -a, 0]);
    }

    const forwardFlaps = this._createNode({
      id: 'vehicle/stack/ship/forward-flaps',
      parent: ship.id,
      name: '前襟翼组',
      category: 'Starship',
      kind: 'assembly',
      description: '飞船前部控制襟翼组。数量与位置来自公开资料；尺寸、作动机构和热结构为教学示意。',
      facts: ['official', 'illustration'],
      stage: 2,
      offset: [0, 8, 0],
    });
    const aftFlaps = this._createNode({
      id: 'vehicle/stack/ship/aft-flaps',
      parent: ship.id,
      name: '后襟翼组',
      category: 'Starship',
      kind: 'assembly',
      description: '飞船后部控制襟翼组。数量与位置来自公开资料；真实尺寸与作动机构未公开。',
      facts: ['official', 'illustration'],
      stage: 2,
      offset: [0, -4, 0],
    });
    for (const [group, prefix, y, size, x] of [
      [forwardFlaps, '前襟翼', 41, 8.0, 4.3],
      [aftFlaps, '后襟翼', 10, 9.2, 4.35],
    ]) {
      for (const side of [-1, 1]) {
        const node = this._createNode({
          id: `${group.id}/${prefix === '前襟翼' ? 'forward' : 'aft'}-flap-${side < 0 ? 'left' : 'right'}`,
          parent: group.id,
          name: `${prefix} · ${side < 0 ? '左' : '右'}`,
          category: 'Starship',
          kind: 'part',
          description: `${prefix}${side < 0 ? '左' : '右'}侧控制面。真实外形、铰链位置与作动系统未公开，此处为轮廓示意。`,
          facts: ['official', 'illustration'],
          stage: 3,
          offset: [side * 11, side * 3, side * 5],
          explodeRotation: [0.15 * side, 0.55 * side, 0],
          position: [side * x, y, 0],
          rotation: [0.1, side * 0.25, 0],
        });
        const flapShape = new THREE.Shape();
        flapShape.moveTo(-size / 2, -size * 0.48);
        flapShape.lineTo(size * 0.45, -size * 0.35);
        flapShape.lineTo(size * 0.34, size * 0.5);
        flapShape.lineTo(-size * 0.42, size * 0.31);
        flapShape.closePath();
        this._mesh(
          node,
          new THREE.ExtrudeGeometry(flapShape, { depth: 0.35, bevelEnabled: false }),
          m.tile,
          [0, 0, 0],
          [0, Math.PI / 2, 0],
        );
      }
    }

    const engineBay = this._createNode({
      id: 'vehicle/stack/ship/engine-bay',
      parent: ship.id,
      name: 'Starship 发动机舱',
      category: 'Starship',
      kind: 'assembly',
      description: '飞船底部的发动机舱，包含 Raptor 与 Raptor Vacuum 喷管。发动机数量与用途为公开资料；布局与喷管细节为示意。',
      facts: ['official', 'illustration'],
      stage: 3,
      offset: [0, -12, 0],
      shell: true,
    });
    this._cyl(engineBay, 4.48, 4.55, 4.2, m.structureDark, [0, 2.1, 0], [0, 0, 0], 48, true);
    this._torus(engineBay, 4.1, 0.18, m.structure, [0, 0.4, 0], [Math.PI / 2, 0, 0], 48);
    const shipEngines = this._createNode({
      id: 'vehicle/stack/ship/engine-bay/engines',
      parent: engineBay.id,
      name: 'Raptor / Raptor Vacuum 发动机群',
      category: 'Starship',
      kind: 'assembly',
      description: '飞船的 6 台发动机教学分组：靠近中心的 Raptor 与外侧的 Raptor Vacuum 喷管。数量和用途为公开资料，内部细节为示意。',
      facts: ['official', 'illustration'],
    });
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const radius = i < 3 ? 2.1 : 3.1;
      const isVac = i >= 3;
      const node = this._createNode({
        id: `vehicle/stack/ship/engine-bay/engines/ship-engine-${String(i + 1).padStart(2, '0')}`,
        parent: shipEngines.id,
        name: `${isVac ? 'Raptor Vacuum' : 'Raptor'} ${i + 1}`,
        category: 'Starship',
        kind: 'engine',
        description: `${isVac ? '真空版 Raptor' : '海平面版 Raptor'} 发动机之一。喷管面积比与安装细节为教学示意，不代表真实硬件。`,
        facts: ['official', 'illustration'],
        stage: 3,
        offset: [Math.cos(angle) * 8, -10, Math.sin(angle) * 8],
        position: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius],
      });
      this._cyl(node, isVac ? 0.42 : 0.5, isVac ? 0.85 : 0.72, isVac ? 3.6 : 2.5, isVac ? m.engine : m.engineHot, [0, isVac ? 1.8 : 1.2, 0], [0, 0, 0], 14, true);
      this._torus(node, isVac ? 0.84 : 0.71, 0.05, m.pipe, [0, 0.1, 0], [Math.PI / 2, 0, 0], 14);
    }

    const tanks = this._createNode({
      id: 'vehicle/stack/ship/tanks',
      parent: ship.id,
      name: '示意贮箱 / 液氧与甲烷',
      category: 'Starship',
      kind: 'internal',
      description: 'Starship 推进剂贮箱的教学剖面示意。内部隔板、增压系统、输送管路与真实结构未公开。',
      facts: ['illustration'],
      internal: true,
      visible: false,
    });
    this._cyl(tanks, 3.9, 3.9, 14, m.lox, [0, 15, 0], [0, 0, 0], 40);
    this._cyl(tanks, 3.7, 3.7, 12, m.methane, [0, 29, 0], [0, 0, 0], 40);
    this._mesh(tanks, new THREE.SphereGeometry(3.7, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.methane, [0, 35, 0], [0, 0, 0], [1, 0.35, 1]);
    this._cyl(tanks, 0.24, 0.24, 27, m.pipe, [0.6, 22, 0], [0, 0, 0], 10);
  }

  /* ------------------------------------------------------------- finalize */
  _finalize() {
    this.order.forEach((node) => {
      // Clone materials per node so selection, X-Ray, ghosting and clipping
      // can affect one part without changing its neighbours.
      const materialMap = new Map();
      for (const mesh of node.directMeshes) {
        if (!materialMap.has(mesh.material)) {
          const cloned = mesh.material.clone();
          cloned.userData.baseOpacity = cloned.opacity;
          cloned.userData.baseTransparent = cloned.transparent;
          cloned.userData.baseDepthWrite = cloned.depthWrite;
          cloned.userData.baseSide = cloned.side;
          cloned.userData.baseClipping = false;
          materialMap.set(mesh.material, cloned);
        }
        mesh.material = materialMap.get(mesh.material);
        mesh.userData.nodeId = node.id;
        if (node.internal) mesh.raycast = () => {};
        this.interactiveMeshes.push(mesh);
      }
      node.materials = [...materialMap.values()];
      node.basePosition.copy(node.object.position);
      node.baseQuaternion.copy(node.object.quaternion);
      node.baseScale.copy(node.object.scale);
      node.object.visible = node.baseVisible && !node.internal;
    });
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    this.updateBounding();
  }

  updateBounding() {
    this.bounds = new THREE.Box3().setFromObject(this.root);
    this.center = this.bounds.getCenter(new THREE.Vector3());
    this.size = this.bounds.getSize(new THREE.Vector3());
  }

  getNode(id) {
    return this.nodes.get(id) || null;
  }

  getRootCategories() {
    return ['facility', 'vehicle'];
  }

  isDescendantOf(nodeId, ancestorId) {
    if (!ancestorId) return true;
    if (nodeId === ancestorId) return true;
    let node = this.nodes.get(nodeId);
    while (node?.parent) {
      if (node.parent === ancestorId) return true;
      node = this.nodes.get(node.parent);
    }
    return false;
  }

  ancestorsOf(nodeId) {
    const result = [];
    let node = this.nodes.get(nodeId);
    while (node?.parent) {
      result.push(node.parent);
      node = this.nodes.get(node.parent);
    }
    return result;
  }

  topAssemblyOf(nodeId) {
    if (!nodeId) return null;
    const parts = nodeId.split('/');
    if (parts[0] === 'facility' && parts[1]) return `facility/${parts[1]}`;
    if (parts[0] === 'vehicle') return 'vehicle';
    return parts.slice(0, 2).join('/');
  }

  setPose(pose) {
    this.poseTarget = pose === 'catch' ? 1 : 0;
  }

  snapPose() {
    this.poseBlend = this.poseTarget;
  }

  getNodeMaterials(id) {
    return this.nodes.get(id)?.materials ?? [];
  }

  /** Apply all static-explorer transforms at once. Pure function of the UI state. */
  applyState({
    progress = 0,
    poseBlend = this.poseBlend,
    displayMode = 'solid',
    disassemblyScope = 'all',
    sectionScope = 'all',
    selectedId = null,
    hiddenIds = new Set(),
    ghostIds = new Set(),
    autoFade = true,
    mutedAssemblies = new Set(),
  } = {}) {
    const stageWindows = {
      1: [0.02, 0.3],
      2: [0.3, 0.66],
      3: [0.66, 1],
    };
    const factorFor = (stage) => {
      if (!stage) return 0;
      const [a, b] = stageWindows[stage];
      const x = Math.min(1, Math.max(0, (progress - a) / (b - a)));
      return x * x * (3 - 2 * x);
    };
    const scopeMatches = (id, scope) => {
      if (!scope || scope === 'all') return true;
      const scopeMap = {
        booster: 'vehicle/stack/booster',
        ship: 'vehicle/stack/ship',
        tower: 'facility/tower',
        platform: 'facility/launch-mount',
        connection: 'vehicle/stack/connection',
      };
      const prefix = scopeMap[scope] || scope;
      return id === prefix || id.startsWith(`${prefix}/`);
    };
    const selectedTop = selectedId ? this.topAssemblyOf(selectedId) : null;
    const related = (node) => {
      if (!selectedId) return true;
      if (node.id === selectedId) return true;
      if (this.isDescendantOf(node.id, selectedId)) return true;
      if (this.ancestorsOf(selectedId).includes(node.id)) return true;
      return false;
    };
    const muted = (node) => {
      for (const id of mutedAssemblies) {
        if (node.id === id || node.id.startsWith(`${id}/`)) return true;
      }
      return false;
    };

    this.poseBlend = poseBlend;
    this.root.updateMatrixWorld(true);
    const poseStack = this.poseBlend * SB.captureLift;
    const armPose = this.poseBlend * (SB.armOpenZ - SB.armClosedZ);

    this.order.forEach((node) => {
      const stageFactor = muted(node) ? 0 : factorFor(node.stage);
      const stageOffset = node.explodeOffset.clone().multiplyScalar(stageFactor);
      const poseOffset = new THREE.Vector3();
      if (node.id === 'vehicle/stack') {
        poseOffset.y += poseStack;
      }
      if (node.id === 'facility/tower/arms/arm-left') {
        poseOffset.z += armPose;
      }
      if (node.id === 'facility/tower/arms/arm-right') {
        poseOffset.z -= armPose;
      }
      const inDisassemblyScope = scopeMatches(node.id, disassemblyScope);
      const inSectionScope = scopeMatches(node.id, sectionScope);
      const progressOffset = inDisassemblyScope ? stageOffset : new THREE.Vector3();
      node.explodedFactor = inDisassemblyScope ? stageFactor : 0;
      node.object.position
        .copy(node.basePosition)
        .add(poseOffset)
        .add(progressOffset)
        .add(node.manualOffset);
      const q = node.baseQuaternion.clone();
      if (inDisassemblyScope && node.explodeRotation) {
        const er = node.explodeRotation.clone();
        er.x *= stageFactor;
        er.y *= stageFactor;
        er.z *= stageFactor;
        q.multiply(new THREE.Quaternion().setFromEuler(er));
      }
      if (node.manualRotation.x || node.manualRotation.y || node.manualRotation.z) {
        q.multiply(new THREE.Quaternion().setFromEuler(node.manualRotation));
      }
      node.object.quaternion.copy(q);
      node.object.scale.copy(node.baseScale);

      let visible = node.baseVisible;
      if (node.internal) {
        const selectedReveals =
          selectedId === node.id ||
          this.isDescendantOf(node.id, selectedId) ||
          (selectedId ? this.isDescendantOf(selectedId, node.id) : false);
        visible = selectedReveals || (displayMode !== 'solid' && inSectionScope);
      }
      if (hiddenIds.has(node.id)) visible = false;
      for (const id of hiddenIds) {
        if (node.id.startsWith(`${id}/`)) visible = false;
      }
      // In the capture state, Starship is moved out of the teaching photo.
      // The visibility threshold is based on the *current* blend so returning
      // to the launch pose restores the ship during the transition.
      if (this.poseBlend > 0.45) {
        if (node.id === 'vehicle/stack/ship' || node.id.startsWith('vehicle/stack/ship/')) visible = false;
        if (node.id === 'vehicle/stack/connection' || node.id.startsWith('vehicle/stack/connection/')) visible = false;
      }
      node.object.visible = visible;

      const selectedNode = selectedId ? this.nodes.get(selectedId) : null;
      const isSelectedBranch = selectedId && (node.id === selectedId || this.isDescendantOf(node.id, selectedId) || this.isDescendantOf(selectedId, node.id));
      const isGhost = ghostIds.has(node.id) || [...ghostIds].some((id) => node.id.startsWith(`${id}/`));
      const isFaded = autoFade && selectedId && !related(node);

      node.materials.forEach((material) => {
        const beforeTransparent = material.transparent;
        const beforeDepthWrite = material.depthWrite;
        const beforeSide = material.side;
        let opacity = material.userData.baseOpacity ?? 1;
        let transparent = material.userData.baseTransparent ?? false;
        let depthWrite = material.userData.baseDepthWrite ?? true;
        let side = material.userData.baseSide ?? THREE.FrontSide;
        let clipping = false;
        if (node.shell && displayMode === 'xray' && inSectionScope) {
          opacity = Math.min(opacity, isSelectedBranch ? 0.34 : 0.13);
          transparent = true;
          depthWrite = false;
          side = THREE.DoubleSide;
        }
        if (displayMode === 'section' && inSectionScope && !node.internal) {
          clipping = true;
          opacity = isSelectedBranch ? 1 : opacity;
          transparent = false;
          depthWrite = true;
          // Make the far inside wall of a cut shell visible instead of
          // letting back-face culling erase the whole pressure vessel.
          if (node.shell) {
            side = THREE.DoubleSide;
            opacity = Math.min(opacity, 0.42);
            transparent = true;
            depthWrite = false;
          }
        }
        if (isGhost) {
          opacity = Math.min(opacity, 0.16);
          transparent = true;
          depthWrite = false;
        } else if (isFaded) {
          opacity = Math.min(opacity, 0.28);
          transparent = true;
          depthWrite = false;
        }
        if (node.internal && displayMode === 'section') {
          clipping = false;
        }
        material.transparent = transparent;
        material.opacity = opacity;
        material.depthWrite = depthWrite;
        material.side = side;
        if (
          beforeTransparent !== material.transparent ||
          beforeDepthWrite !== material.depthWrite ||
          beforeSide !== material.side
        ) {
          material.needsUpdate = true;
        }
        const shouldClip = clipping;
        if (material.userData.baseClipping !== shouldClip) {
          material.clippingPlanes = shouldClip ? [this.clipPlane] : null;
          material.clipShadows = shouldClip;
          material.userData.baseClipping = shouldClip;
          material.needsUpdate = true;
        }
      });
      node.directMeshes.forEach((mesh) => {
        if (
          node.shell &&
          (displayMode === 'xray' || displayMode === 'section') &&
          inSectionScope
        ) {
          // Transparent or cut-away shells must not swallow interior picks.
          mesh.raycast = () => {};
        } else {
          mesh.raycast = THREE.Mesh.prototype.raycast;
        }
      });
    });

    // Keep selected/ghost boxes accurate after transforms.
    this.root.updateMatrixWorld(true);
  }

  setManualOffset(id, offset) {
    const node = this.nodes.get(id);
    if (!node) return;
    node.manualOffset.copy(offset);
  }

  setManualRotation(id, rotation) {
    const node = this.nodes.get(id);
    if (!node) return;
    node.manualRotation.set(rotation.x, rotation.y, rotation.z);
  }

  clearManual(id) {
    const node = this.nodes.get(id);
    if (!node) return;
    node.manualOffset.set(0, 0, 0);
    node.manualRotation.set(0, 0, 0);
  }

  clearAllManual() {
    this.order.forEach((node) => {
      node.manualOffset.set(0, 0, 0);
      node.manualRotation.set(0, 0, 0);
    });
  }

  getVisibleBox(id) {
    const node = this.nodes.get(id);
    if (!node) return null;
    const box = new THREE.Box3().setFromObject(node.object);
    return box.isEmpty() ? null : box;
  }

  dispose() {
    const scene = new THREE.Group();
    scene.add(this.root);
    scene.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((material) => {
        if (!material) return;
        Object.values(material).forEach((value) => {
          if (value && value.isTexture) value.dispose();
        });
        material.dispose();
      });
    });
    this.nodes.clear();
    this.order = [];
  }
}

function nodeAddMesh(node, mesh) {
  mesh.userData.partId = node.id;
  node.object.add(mesh);
  node.directMeshes.push(mesh);
}
