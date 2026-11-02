import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Falcon9Model, FALCON_PART_INFO, FALCON_MODEL_STACK_OFFSET } from './Falcon9Model.js';
import { FalconSimulator } from '../simulation/FlightSimulator.js';
import { VIS_SCALE } from '../simulation/missions.js';
import { clamp, smoothstep, rocketCenter } from '../simulation/math.js';
import { CameraRig } from './CameraRig.js';
import {
  createSky,
  createStars,
  createGround,
  createCloudDeck,
  addLighting,
  addEnvironment,
} from './environment.js';
import {
  SmokeSystem,
  TrailLine,
  CondensationCloud,
  HeatAura,
  LandingShockwave,
} from './effects.js';
import { makeLocationMarker } from './effects.js';

function makeTower({ height = 86, x = -16, z = 12 } = {}) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const steel = new THREE.MeshStandardMaterial({ color: 0x536570, metalness: 0.7, roughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x27343c, metalness: 0.6, roughness: 0.55 });
  const half = 5.2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const column = new THREE.Mesh(new THREE.BoxGeometry(0.9, height, 0.9), steel);
      column.position.set(sx * half, height / 2, sz * half);
      group.add(column);
    }
  }
  for (let y = 8; y < height; y += 8) {
    for (const sz of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.8, 0.32, 0.32), steel);
      beam.position.set(0, y, sz * half);
      group.add(beam);
    }
    for (const sx of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, half * 2 + 0.8), steel);
      beam.position.set(sx * half, y, 0);
      group.add(beam);
    }
    if (y < height - 8) {
      const braceA = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 11.8), dark);
      braceA.position.set(half, y + 4, 0);
      braceA.rotation.x = Math.PI / 4;
      const braceB = braceA.clone();
      braceB.position.x = -half;
      braceB.rotation.x = -Math.PI / 4;
      group.add(braceA, braceB);
    }
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 4, 1.2, half * 2 + 4), dark);
  top.position.y = height;
  group.add(top);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 22, 8), steel);
  mast.position.y = height + 11;
  group.add(mast);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff7a4d }),
  );
  beacon.position.y = height + 22;
  group.add(beacon);
  // Service arms reaching toward the rocket at x=0.
  for (const [y, len] of [
    [34, 12],
    [55, 12],
    [70, 10],
  ]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(len, 0.6, 1.2), steel);
    arm.position.set(7.5, y, 0.4);
    arm.rotation.z = -0.08;
    group.add(arm);
    const whiteRoom = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.2, 4.2), new THREE.MeshStandardMaterial({ color: 0xb6c3c7, metalness: 0.2, roughness: 0.6 }));
    whiteRoom.position.set(12.2, y - 1.4, 0.4);
    group.add(whiteRoom);
  }
  for (let i = 0; i < 7; i += 1) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xe9fbff }),
    );
    lamp.position.set(half + 0.5, 8 + i * 11, half + 0.5);
    group.add(lamp);
  }
  return group;
}

function makePad() {
  const group = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({ color: 0x4c585a, metalness: 0.05, roughness: 0.93 });
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(39, 42, 1.4, 64), concrete);
  pad.position.y = -0.7;
  pad.receiveShadow = true;
  group.add(pad);
  const trench = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.25, 52),
    new THREE.MeshStandardMaterial({ color: 0x151d20, metalness: 0.3, roughness: 0.8 }),
  );
  trench.position.set(0, 0.09, 15);
  group.add(trench);
  const mount = new THREE.Mesh(
    new THREE.TorusGeometry(6.8, 0.7, 12, 40),
    new THREE.MeshStandardMaterial({ color: 0x7b858b, metalness: 0.9, roughness: 0.3 }),
  );
  mount.rotation.x = Math.PI / 2;
  mount.position.y = 1.0;
  group.add(mount);
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const clamp = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 2.2, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x8d979c, metalness: 0.9, roughness: 0.3 }),
    );
    clamp.position.set(Math.cos(angle) * 7.1, 1.6, Math.sin(angle) * 7.1);
    clamp.rotation.y = -angle;
    group.add(clamp);
  }
  const tower = makeTower();
  group.add(tower);
  // Perimeter lights.
  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * Math.PI * 2;
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x73dbff }),
    );
    light.position.set(Math.cos(angle) * 38, 0.35, Math.sin(angle) * 38);
    group.add(light);
  }
  // Lightning protection masts.
  for (const [x, z] of [
    [-58, 55],
    [62, 48],
  ]) {
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.7, 86, 8),
      new THREE.MeshStandardMaterial({ color: 0x69777f, metalness: 0.7, roughness: 0.45 }),
    );
    mast.position.set(x, 43, z);
    group.add(mast);
  }
  const signTexture = makeLocationMarker('LC-39A · 发射台');
  signTexture.position.set(22, 8, 28);
  signTexture.scale.multiplyScalar(0.75);
  group.add(signTexture);
  return { group, tower };
}

function makeLandingSite(mission) {
  const group = new THREE.Group();
  const target = new THREE.Vector3(mission.targetDownrange * VIS_SCALE, 0, 0);
  group.position.copy(target);
  if (mission.recovery === 'land') {
    const concrete = new THREE.MeshStandardMaterial({ color: 0x4b5254, roughness: 0.93 });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(35, 35, 0.8, 64), concrete);
    pad.position.y = 0.1;
    pad.receiveShadow = true;
    group.add(pad);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xbfe6df, transparent: true, opacity: 0.45 });
    for (const radius of [32, 25, 15]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.3, radius + 0.3, 64), ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.56;
      group.add(ring);
    }
    const xMat = new THREE.MeshBasicMaterial({ color: 0xc5d7d1, transparent: true, opacity: 0.6 });
    for (const rotation of [Math.PI / 4, -Math.PI / 4]) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(52, 1.5), xMat);
      bar.rotation.x = -Math.PI / 2;
      bar.rotation.z = rotation;
      bar.position.y = 0.57;
      group.add(bar);
    }
    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2;
      const light = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0x9ec9ff }),
      );
      light.position.set(Math.cos(angle) * 34, 0.66, Math.sin(angle) * 34);
      group.add(light);
    }
    const marker = makeLocationMarker('LZ-1 · 陆地着陆区');
    marker.position.set(-58, 12, 0);
    marker.scale.multiplyScalar(0.58);
    group.add(marker);
  } else {
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x28343a, metalness: 0.6, roughness: 0.52 });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x3b494d, metalness: 0.3, roughness: 0.72 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(92, 10, 42), hullMat);
    hull.position.y = -6.2;
    group.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(104, 3.8, 50), deckMat);
    deck.position.y = -1.9;
    deck.receiveShadow = true;
    group.add(deck);
    // A thin, darker sheer line and side fenders make the landing target read
    // as a ship rather than a floating rectangle, including from low angles.
    const sheer = new THREE.Mesh(
      new THREE.BoxGeometry(100, 1.2, 46),
      new THREE.MeshStandardMaterial({ color: 0x1b2b33, metalness: 0.5, roughness: 0.65 }),
    );
    sheer.position.y = -4.2;
    group.add(sheer);
    const fenderMaterial = new THREE.MeshStandardMaterial({ color: 0x151f24, roughness: 0.83 });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 9; i += 1) {
        const fender = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 4.2, 10), fenderMaterial);
        fender.rotation.x = Math.PI / 2;
        fender.position.set(-43 + i * 10.7, -4.8, side * 24.6);
        group.add(fender);
      }
    }
    const borderMat = new THREE.MeshStandardMaterial({ color: 0xc9d3d1, metalness: 0.15, roughness: 0.6 });
    for (const [x, z, w, d] of [
      [0, 24, 104, 1.2],
      [0, -24, 104, 1.2],
      [51.5, 0, 1.2, 50],
      [-51.5, 0, 1.2, 50],
    ]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.32, d), borderMat);
      rail.position.set(x, 0.3, z);
      group.add(rail);
    }
    const xMat = new THREE.MeshBasicMaterial({ color: 0xe2ebe6, transparent: true, opacity: 0.74 });
    for (const rotation of [Math.PI / 4, -Math.PI / 4]) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(56, 2.1), xMat);
      bar.rotation.x = -Math.PI / 2;
      bar.rotation.z = rotation;
      bar.position.y = 0.08;
      group.add(bar);
    }
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(27.5, 29, 64),
      new THREE.MeshBasicMaterial({ color: 0xd8e7e4, transparent: true, opacity: 0.5 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    group.add(ring);
    // Containers and equipment.
    for (let i = 0; i < 5; i += 1) {
      const container = new THREE.Mesh(
        new THREE.BoxGeometry(11, 5.5, 8),
        new THREE.MeshStandardMaterial({ color: [0x5a6b70, 0x8a6a4a, 0x3e565d][i % 3], metalness: 0.2, roughness: 0.7 }),
      );
      container.position.set(-37 + (i % 2) * 12, 2.8, -17 + Math.floor(i / 2) * 12);
      group.add(container);
    }
    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(13, 7, 12),
      new THREE.MeshStandardMaterial({ color: 0x657b82, metalness: 0.35, roughness: 0.65 }),
    );
    bridge.position.set(-42, 6.5, 13);
    group.add(bridge);
    const windowMaterial = new THREE.MeshBasicMaterial({ color: 0x8bcee1 });
    for (const z of [8.5, 11.5, 14.5, 17.5]) {
      const window = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 1.7), windowMaterial);
      window.position.set(-35.43, 8.2, z);
      group.add(window);
    }
    const crane = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 22, 1.4),
      new THREE.MeshStandardMaterial({ color: 0xa6b0ae, metalness: 0.8, roughness: 0.35 }),
    );
    crane.position.set(39, 11, -18);
    crane.rotation.z = 0.28;
    group.add(crane);
    for (let i = 0; i < 4; i += 1) {
      const thruster = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.2, 3, 16),
        new THREE.MeshStandardMaterial({ color: 0x192024, metalness: 0.6, roughness: 0.6 }),
      );
      thruster.rotation.z = Math.PI / 2;
      thruster.position.set(i < 2 ? -43 : 43, -8, i % 2 ? -17 : 17);
      group.add(thruster);
    }
    const marker = makeLocationMarker('ASDS · 海上无人船');
    marker.position.set(-64, 13, 0);
    marker.scale.multiplyScalar(0.58);
    group.add(marker);
  }
  return { group, target };
}

function makeSelectionBox() {
  const box = new THREE.Box3();
  const helper = new THREE.Box3Helper(box, 0x6cf2ff);
  helper.material.transparent = true;
  helper.material.opacity = 0.95;
  helper.material.depthTest = false;
  helper.visible = false;
  helper.renderOrder = 30;
  return { box, helper };
}

export class FalconScene {
  constructor(renderer, mission, { quality = 'high' } = {}) {
    this.renderer = renderer;
    this.mission = mission;
    this.quality = quality;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02070b);
    this.scene.fog = new THREE.FogExp2(0x04101a, 0.000032);
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.35, 260_000);
    this.camera.position.set(140, 100, 240);
    this.rig = new CameraRig(this.camera, renderer.domElement);
    this.simulator = new FalconSimulator(mission);
    this.cameraMode = 'overview';
    this.inspection = null;
    this.forceSnap = true;
    this.lastT = mission.start;
    this.accumulator = 0;
    this.elapsed = 0;
    this.spawnScale = 1;
    this.selectedPart = null;
    this.useBloom = true;
    this.isDisposed = false;

    const payloadType = mission.recovery === 'land' ? 'crew' : 'starlink';
    this.model = new Falcon9Model({ payloadType, quality });
    this.scene.add(this.model.stage1, this.model.stage2);
    this.model.resetTransforms();

    this.envTarget = addEnvironment(this.scene, renderer, 0.55);
    this.sky = createSky(this.scene);
    this.stars = createStars(this.scene, quality === 'low' ? 800 : 1800);
    this.cloudDeck = createCloudDeck(this.scene);
    this.ground = createGround(this.scene, { sea: mission.recovery === 'sea' });
    this.lights = addLighting(this.scene, { shadows: quality !== 'low' });
    const pad = makePad();
    this.pad = pad.group;
    this.padTower = pad.tower;
    this.scene.add(this.pad);
    this.inspectionPlatform = new THREE.Group();
    const platformDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(40, 44, 1.2, 64),
      new THREE.MeshStandardMaterial({ color: 0x2d393c, metalness: 0.45, roughness: 0.74 }),
    );
    platformDisc.position.y = -0.65;
    platformDisc.receiveShadow = true;
    const platformRing = new THREE.Mesh(
      new THREE.RingGeometry(35, 36, 64),
      new THREE.MeshBasicMaterial({
        color: 0x69ddff,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
      }),
    );
    platformRing.rotation.x = -Math.PI / 2;
    platformRing.position.y = 0.02;
    this.inspectionPlatform.add(platformDisc, platformRing);
    this.inspectionPlatform.visible = false;
    this.scene.add(this.inspectionPlatform);
    const site = makeLandingSite(mission);
    this.landingGroup = site.group;
    this.landingTarget = site.target;
    this.scene.add(this.landingGroup);

    this.trail1 = new TrailLine(
      this.scene,
      this.simulator.trailSamples('s1', 1),
      0x5ed7ff,
      { start: mission.start, end: mission.touchdown, opacity: 0.55 },
    );
    this.trail2 = new TrailLine(
      this.scene,
      this.simulator.trailSamples('s2', 1),
      0xffb464,
      { start: mission.start, end: mission.duration, opacity: 0.42 },
    );
    this.smoke = new SmokeSystem(this.scene, {
      maxParticles: quality === 'high' ? 900 : quality === 'medium' ? 560 : 280,
      seed: mission.recovery === 'sea' ? 27 : 13,
    });
    this.condensation = new CondensationCloud(this.scene, 7);
    this.heatAura = new HeatAura(this.model.stage1);
    this.shockwave = new LandingShockwave(this.scene, site.target);
    this.landingFlash = new THREE.PointLight(0xffc58c, 0, 380, 2);
    this.landingFlash.position.copy(site.target).add(new THREE.Vector3(0, 10, 0));
    this.scene.add(this.landingFlash);
    this.selection = makeSelectionBox();
    this.scene.add(this.selection.helper);

    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1200, 800), 0.52, 0.55, 0.78);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.outputPass);

    this.camera.position.set(130, 85, 230);
    this.applyQuality(quality);
    this.resize(renderer.domElement.clientWidth || 1200, renderer.domElement.clientHeight || 800);
    this.tmpVec = new THREE.Vector3();
    this.tmpVec2 = new THREE.Vector3();
  }

  applyQuality(quality) {
    this.quality = quality;
    const dpr = window.devicePixelRatio || 1;
    const ratio = quality === 'high' ? Math.min(dpr, 1.85) : quality === 'medium' ? Math.min(dpr, 1.3) : 1;
    this.renderer.setPixelRatio(ratio);
    this.useBloom = quality !== 'low';
    this.spawnScale = quality === 'high' ? 1 : quality === 'medium' ? 0.6 : 0.3;
    this.model.setQuality(quality);
    if (this.lights?.sun) this.lights.sun.castShadow = quality !== 'low';
    if (this.renderer.shadowMap) this.renderer.shadowMap.enabled = quality !== 'low';
    if (this.smoke) this.smoke.points.visible = true;
    this.resize(this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight);
  }

  resize(width, height) {
    const w = Math.max(2, width);
    const h = Math.max(2, height);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
  }

  setCameraMode(mode) {
    if (this.cameraMode === mode) return;
    this.cameraMode = mode;
    this.rig.resetOffsets();
  }

  setInspectionMode(mode) {
    this.inspection = mode;
    if (mode) {
      this.forceSnap = true;
      this.rig.resetOffsets();
      this.model.setInspectionMode(mode);
    } else {
      this.model.setInspectionMode('stack');
      this.forceSnap = true;
    }
  }

  setSelectedPart(partId) {
    this.selectedPart = partId;
    this.model.setSelection(partId);
    this.selection.helper.visible = !!partId;
  }

  notifySeek() {
    this.forceSnap = true;
    this.smoke?.reset();
    this.lastT = null;
  }

  pickPart(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.camera);
    const intersects = raycaster.intersectObjects([this.model.stage1, this.model.stage2], true);
    for (const hit of intersects) {
      let obj = hit.object;
      while (obj && !obj.userData?.partId) obj = obj.parent;
      if (obj?.userData?.partId) return obj.userData.partId;
    }
    return null;
  }

  getPartInfo(partId) {
    return FALCON_PART_INFO[partId] ?? null;
  }

  getPartAnchors() {
    const anchors = [];
    if (!this.inspection) return anchors;
    this.camera.updateMatrixWorld();
    const width = this.renderer.domElement.clientWidth;
    const height = this.renderer.domElement.clientHeight;
    const ids = [
      'stage1-body',
      'stage1-engines',
      'interstage',
      'grid-fins',
      'landing-legs',
      'stage2-tank',
      'mvac',
      'payload',
    ];
    for (const id of ids) {
      const group = this.model.partGroups.get(id);
      if (!group) continue;
      const box = new THREE.Box3().setFromObject(group);
      if (box.isEmpty()) continue;
      const center = box.getCenter(new THREE.Vector3());
      const projected = center.clone().project(this.camera);
      if (projected.z > 1 || projected.z < -1) continue;
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      if (x < -50 || x > width + 50 || y < -20 || y > height + 20) continue;
      anchors.push({ id, x, y, info: FALCON_PART_INFO[id] });
    }
    return anchors;
  }

  _stageFocus(stage, centerY) {
    const center = rocketCenter(stage.pos, stage.pitch, centerY);
    return new THREE.Vector3(center.x, center.y, center.z);
  }

  _cameraDesired(sample) {
    const s1 = this._stageFocus(sample.stage1, 24);
    const s2 = this._stageFocus(sample.stage2, 11);
    const landingFocus = s1;
    let focus = s1;
    let distance = 300;
    let yaw = 0.72;
    let pitch = 0.13;
    let fixedPosition = null;
    const altScene = sample.stage1.pos.y;
    const t = sample.t;
    switch (this.cameraMode) {
      case 'overview':
        focus = s1.clone().lerp(
          new THREE.Vector3(this.landingTarget.x, 24, this.landingTarget.z),
          smoothstep(this.mission.entry[1], this.mission.touchdown, t) * 0.78,
        );
        distance = 225 + Math.min(altScene * 0.13, 300);
        yaw = 0.55 + Math.sin(t * 0.012) * 0.55;
        pitch = 0.11 + Math.sin(t * 0.02) * 0.04;
        break;
      case 'ground':
        focus = s1;
        fixedPosition = new THREE.Vector3(68, 15, 108);
        break;
      case 'stack':
        focus = sample.separated ? s2 : new THREE.Vector3(s1.x, s1.y + 10, s1.z);
        distance = 190 + Math.min(altScene * 0.08, 150);
        yaw = 0.72;
        pitch = 0.1;
        break;
      case 'stage1':
        focus = s1;
        distance = 148 + Math.min(altScene * 0.015, 42);
        yaw = 0.82;
        pitch = 0.08;
        break;
      case 'stage2':
        focus = s2;
        distance = 138 + Math.min(sample.stage2.altitude * VIS_SCALE * 0.015, 60);
        yaw = 0.92;
        pitch = 0.07;
        break;
      case 'landing':
        focus = new THREE.Vector3(
          this.landingTarget.x,
          Math.max(8, Math.min(60, sample.stage1.pos.y * 0.48) + 6),
          this.landingTarget.z,
        );
        fixedPosition = new THREE.Vector3(
          this.landingTarget.x + 108,
          34,
          this.landingTarget.z + 168,
        );
        break;
      case 'free':
      default:
        focus = sample.separated ? s1 : new THREE.Vector3(s1.x, s1.y + 10, s1.z);
        distance = 175;
        yaw = 0.78;
        pitch = 0.1;
        break;
    }
    if (this.inspection) {
      focus = new THREE.Vector3(0, this.inspection === 'exploded' ? 54 : 30, 0);
      distance = this.inspection === 'exploded' ? 212 : 158;
      yaw = 0.7 + Math.sin(this.elapsed * 0.18) * 0.2;
      pitch = 0.09;
      fixedPosition = null;
    }
    const shakeBase =
      (t >= 0 && t < 9 ? 0.6 : 0) +
      (sample.isLandingBurn ? 0.18 : 0) +
      (sample.isEntry ? 0.1 : 0);
    return {
      focus,
      distance,
      yaw,
      pitch,
      fixedPosition,
      snap: this.forceSnap,
      shake: shakeBase * (this.quality === 'low' ? 0.4 : 1),
      shakeTime: this.elapsed,
    };
  }

  _spawnSmoke(dt, sample) {
    const m = this.mission;
    const worldRate =
      (sample.stage1.engineCount > 0 && sample.stage1.throttle > 0.05 ? 1 : 0) *
      (this.quality === 'low' ? 28 : 52) *
      this.spawnScale;
    const rate = worldRate * (sample.stage1.engineCount === 9 ? 1.35 : sample.stage1.engineCount > 0 ? 0.9 : 0);
    this.accumulator += rate * Math.max(dt, 0);
    let count = Math.min(16, Math.floor(this.accumulator));
    this.accumulator -= count;
    if (count <= 0) return;
    const random = () => Math.random();
    const sea = m.recovery === 'sea';
    const base = sample.stage1.pos;
    const engineOn = sample.stage1.engineCount > 0;
    if (!engineOn) return;
    const nearGround = sample.stage1.altitude < 140;
    const lowAlt = sample.stage1.altitude < 3500;
    for (let i = 0; i < count; i += 1) {
      if (nearGround) {
        const angle = random() * Math.PI * 2;
        const radius = 2 + random() * 28;
        const pos = new THREE.Vector3(
          base.x + Math.cos(angle) * radius,
          0.8 + random() * 5,
          base.z + Math.sin(angle) * radius,
        );
        this.smoke.spawn(
          pos,
          new THREE.Vector3(
            Math.cos(angle) * (5 + random() * 19),
            1.5 + random() * 7,
            Math.sin(angle) * (5 + random() * 19),
          ),
          {
            size: 9 + random() * 16,
            life: 2.5 + random() * 3.5,
            growth: 18 + random() * 20,
            color: sea ? [0.7, 0.82, 0.88] : [0.44, 0.46, 0.44],
          },
        );
      } else if (lowAlt) {
        const pos = new THREE.Vector3(
          base.x + (random() - 0.5) * 9,
          base.y + 1.5 + random() * 5,
          base.z + (random() - 0.5) * 9,
        );
        this.smoke.spawn(
          pos,
          new THREE.Vector3((random() - 0.5) * 14, -8 - random() * 18, (random() - 0.5) * 14),
          {
            size: 5 + random() * 11,
            life: 1.3 + random() * 1.7,
            growth: 12 + random() * 13,
            color: [0.62, 0.66, 0.67],
          },
        );
      }
    }
  }

  update(dt, sample, { playing = true } = {}) {
    this.elapsed += dt;
    this.ground.userData.update(this.elapsed);
    const t = sample.t;
    if (this.lastT === null || Math.abs(t - this.lastT) > 2.5) {
      this.smoke.reset();
    }
    this.lastT = t;
    this.stars.update(sample.stage1.altitude);
    this.sky.material.uniforms.uAtmosphere.value = clamp(
      1 - sample.stage1.altitude / 150_000,
      0.22,
      1,
    );

    if (this.inspection) {
      this._hidePlumes();
      this.pad.visible = false;
      this.inspectionPlatform.visible = true;
      this.trail1.active.visible = false;
      this.trail1.full.visible = false;
      this.trail2.active.visible = false;
      this.trail2.full.visible = false;
      const explode = this.model.inspectionMode === 'exploded' ? 1 : 0;
      const stage2Y = FALCON_MODEL_STACK_OFFSET + explode * 28;
      this.model.setInspectionPose(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, stage2Y, 0),
        this.inspection,
        playing ? dt : 0.016,
      );
      this.model.stage1.updateMatrixWorld(true);
      this.model.stage2.updateMatrixWorld(true);
      this.condensation.update(new THREE.Vector3(0, 0, 0), 0);
      this.heatAura.update(0, t);
      this.shockwave.update(-100, -200);
      this.selection.helper.visible = !!this.selectedPart;
    } else {
      this.pad.visible = true;
      this.inspectionPlatform.visible = false;
      this.trail1.active.visible = true;
      this.trail1.full.visible = true;
      this.trail2.active.visible = true;
      this.trail2.full.visible = true;
      this.model.setFlightState(sample, t);
      if (sample.landed) {
        const outcome = sample.challengeOutcome;
        if (outcome.grade === 'hard' || outcome.grade === 'destroyed') {
          const lean = smoothstep(this.mission.touchdown, this.mission.touchdown + 3, t);
          this.model.stage1.rotation.z += lean * (outcome.grade === 'destroyed' ? 0.65 : 0.22);
        }
      }
      this.model.stage1.updateMatrixWorld(true);
      this.model.stage2.updateMatrixWorld(true);
      this.trail1.setTime(t, rocketCenter(sample.stage1.pos, sample.stage1.pitch, 23.8));
      this.trail2.setTime(t, rocketCenter(sample.stage2.pos, sample.stage2.pitch, 11));
      const condIntensity =
        smoothstep(48, 54, t) * (1 - smoothstep(67, 78, t)) * (sample.stage1.altitude > 5000 ? 1 : 0);
      this.condensation.update(
        new THREE.Vector3(sample.stage1.pos.x, sample.stage1.pos.y + 18, sample.stage1.pos.z),
        condIntensity,
      );
      this.heatAura.update(sample.heat, t);
      this.shockwave.update(t, this.mission.touchdown);
      const flashAge = t - this.mission.touchdown;
      this.landingFlash.intensity =
        flashAge >= 0 && flashAge < 1.8 ? (1 - flashAge / 1.8) * 85 : 0;
      if (playing) {
        this._spawnSmoke(dt, sample);
        this.smoke.update(dt);
      }
      this.selection.helper.visible = !!this.selectedPart;
    }

    if (this.selectedPart) {
      const group = this.model.partGroups.get(this.selectedPart);
      if (group) {
        this.selection.box.setFromObject(group);
        this.selection.helper.visible = true;
      }
    }
    this.cloudDeck.update(this.camera.position.y);
    this.rig.update(dt, this._cameraDesired(sample));
    this.forceSnap = false;
    this.scene.updateMatrixWorld();
  }

  _hidePlumes() {
    this.model.enginePlumes.forEach((plume) => {
      plume.visible = false;
      plume.userData.light.intensity = 0;
    });
    if (this.model.stage2Plume) {
      this.model.stage2Plume.visible = false;
      this.model.stage2Plume.userData.light.intensity = 0;
    }
  }

  render() {
    if (this.useBloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.rig.dispose();
    this.smoke.dispose();
    this.condensation.dispose();
    this.shockwave.dispose();
    this.trail1.dispose();
    this.trail2.dispose();
    this.cloudDeck.dispose();
    this.model.dispose();
    this.envTarget?.dispose?.();
    this.selection.helper.geometry.dispose();
    this.selection.helper.material.dispose();
    this.composer?.dispose?.();
    this.scene.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat) => {
        if (!mat) return;
        Object.values(mat).forEach((value) => {
          if (value && value.isTexture) value.dispose();
        });
        mat.dispose();
      });
    });
    this.scene.clear();
  }
}
