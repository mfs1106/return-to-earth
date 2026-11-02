import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { StarshipModel, TOWER_ARM_HEIGHT } from './StarshipModel.js';
import { StarshipSimulator, starshipAltitudeToScene } from '../simulation/StarshipSimulator.js';
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
  HeatAura,
  LandingShockwave,
} from './effects.js';
import { clamp, smoothstep, rocketCenter } from '../simulation/math.js';

function makeStarbase() {
  const group = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({ color: 0x485255, roughness: 0.94, metalness: 0.05 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x68777d, metalness: 0.75, roughness: 0.4 });
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(54, 58, 1.8, 64), concrete);
  pad.position.y = -0.9;
  pad.receiveShadow = true;
  group.add(pad);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(37, 38, 64),
    new THREE.MeshBasicMaterial({ color: 0x9bd8e5, transparent: true, opacity: 0.3, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  group.add(ring);
  // Tank farm.
  for (let i = 0; i < 6; i += 1) {
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(7.5, 7.5, 24, 24),
      new THREE.MeshStandardMaterial({ color: 0x8d9a9e, metalness: 0.45, roughness: 0.58 }),
    );
    tank.position.set(-100 + (i % 3) * 24, 12, -76 - Math.floor(i / 3) * 32);
    group.add(tank);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(7.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x7f8c90, metalness: 0.5, roughness: 0.5 }),
    );
    dome.position.set(tank.position.x, 24, tank.position.z);
    group.add(dome);
  }
  // High-bay silhouette in the distance.
  const hangar = new THREE.Mesh(
    new THREE.BoxGeometry(95, 80, 110),
    new THREE.MeshStandardMaterial({ color: 0x2b353a, metalness: 0.4, roughness: 0.7 }),
  );
  hangar.position.set(-280, 40, -250);
  group.add(hangar);
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(42, 62, 1),
    new THREE.MeshStandardMaterial({
      color: 0x172026,
      metalness: 0.5,
      roughness: 0.5,
      emissive: 0x0e2730,
      emissiveIntensity: 0.4,
    }),
  );
  door.position.set(-280, 31, -194);
  group.add(door);
  // Floodlights.
  for (const [x, z] of [
    [90, 90],
    [-110, 100],
    [110, -95],
  ]) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.1, 55, 8), steel);
    mast.position.set(x, 27, z);
    group.add(mast);
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(10, 2.4, 2.4),
      new THREE.MeshBasicMaterial({ color: 0xe6fbff }),
    );
    light.position.set(x, 55, z);
    group.add(light);
  }
  return group;
}

function makeCatchMechEffecter() {
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xffc27a,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2, 2.5, 48), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, TOWER_ARM_HEIGHT, 0);
  ring.visible = false;
  return { ring, ringMaterial };
}

export class StarshipScene {
  constructor(renderer, { quality = 'high' } = {}) {
    this.renderer = renderer;
    this.quality = quality;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02070c);
    this.scene.fog = new THREE.FogExp2(0x061018, 0.00005);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.4, 260_000);
    this.rig = new CameraRig(this.camera, renderer.domElement);
    this.simulator = new StarshipSimulator();
    this.cameraMode = 'overview';
    this.forceSnap = true;
    this.lastT = -10;
    this.elapsed = 0;
    this.accumulator = 0;
    this.spawnScale = 1;

    this.model = new StarshipModel({ quality });
    this.scene.add(this.model.booster, this.model.ship, this.model.tower.group);
    this.pad = makeStarbase();
    this.scene.add(this.pad);

    this.envTarget = addEnvironment(this.scene, renderer, 0.82);
    this.sky = createSky(this.scene);
    this.stars = createStars(this.scene, quality === 'low' ? 800 : 1800);
    this.cloudDeck = createCloudDeck(this.scene);
    this.ground = createGround(this.scene, { sea: false });
    this.lights = addLighting(this.scene, { shadows: quality !== 'low' });
    this.frontFill = new THREE.DirectionalLight(0x9ed8e8, 1.0);
    this.frontFill.position.set(220, 140, 260);
    this.scene.add(this.frontFill);

    this.trailBooster = new TrailLine(
      this.scene,
      this.simulator.trailSamples('booster', 1.2),
      0x64ddff,
      { start: -10, end: 420, opacity: 0.5 },
    );
    this.trailShip = new TrailLine(
      this.scene,
      this.simulator.trailSamples('ship', 1.5),
      0xffb262,
      { start: -10, end: 470, opacity: 0.42 },
    );
    this.smoke = new SmokeSystem(this.scene, {
      maxParticles: quality === 'high' ? 900 : quality === 'medium' ? 500 : 250,
      seed: 44,
    });
    const boosterHeat = new HeatAura(this.model.booster);
    boosterHeat.group.position.y = 14;
    this.heatAura = boosterHeat;

    this.towerFocus = new THREE.Vector3(-10, 94, 0);
    this.catchMech = makeCatchMechEffecter();
    this.scene.add(this.catchMech.ring);
    this.catchFlash = new THREE.PointLight(0xffc18a, 0, 400, 2);
    this.catchFlash.position.set(0, TOWER_ARM_HEIGHT, 0);
    this.scene.add(this.catchFlash);

    this.hotFlash = new THREE.PointLight(0xffc283, 0, 260, 2);
    this.hotFlash.position.set(0, 0, 0);
    this.scene.add(this.hotFlash);

    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1200, 800), 0.5, 0.55, 0.78);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.outputPass);

    this.camera.position.set(240, 150, 340);
    this.applyQuality(quality);
    this.resize(renderer.domElement.clientWidth || 1200, renderer.domElement.clientHeight || 800);
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

  notifySeek() {
    this.forceSnap = true;
    this.smoke?.reset();
    this.lastT = null;
  }

  _cameraDesired(sample) {
    const b = sample.booster.pos;
    const s = sample.ship.pos;
    const boosterPoint = rocketCenter(b, sample.booster.pitch, 35.5);
    const shipPoint = rocketCenter(s, sample.ship.pitch, 26);
    const boosterCenter = new THREE.Vector3(boosterPoint.x, boosterPoint.y, boosterPoint.z);
    const shipCenter = new THREE.Vector3(shipPoint.x, shipPoint.y, shipPoint.z);
    const tower = this.towerFocus;
    let focus = boosterCenter;
    let distance = 430;
    let yaw = 1.14;
    let pitch = 0.12;
    let fixedPosition = null;
    switch (this.cameraMode) {
      case 'overview': {
        const recovery = smoothstep(320, 420, sample.t);
        focus = boosterCenter.clone().lerp(tower, recovery * 0.9);
        distance = 410 + Math.min(sample.booster.altitude / 3500, 80) - recovery * 110;
        yaw = 0.98 - recovery * 0.55;
        break;
      }
      case 'tower':
        focus = tower;
        distance = 245;
        yaw = 1.34;
        pitch = 0.12;
        break;
      case 'booster':
        focus = boosterCenter;
        distance = 255 + Math.min(sample.booster.altitude / 3000, 90);
        yaw = 1.02;
        pitch = 0.08;
        break;
      case 'ship':
        focus = shipCenter;
        distance = 245 + Math.min(sample.ship.altitude / 5000, 70);
        yaw = 1.12;
        pitch = 0.07;
        break;
      case 'catch':
        focus = sample.t > 380 ? new THREE.Vector3(0, 92, 0) : boosterCenter;
        distance = sample.t > 380 ? 285 : 300;
        yaw = sample.t > 380 ? 0.28 : 0.98;
        pitch = sample.t > 380 ? 0.045 : 0.08;
        break;
      case 'ground':
        focus = boosterCenter;
        fixedPosition = new THREE.Vector3(118, 22, 185);
        break;
      case 'free':
      default:
        focus = sample.separated ? shipCenter : boosterCenter;
        distance = 310;
        yaw = 1.1;
        pitch = 0.1;
        break;
    }
    const shake =
      (sample.t >= 0 && sample.t < 10 ? 0.7 : 0) +
      (sample.t > 408 && sample.t < 425 ? 0.25 : 0) +
      (sample.heat > 0.4 ? 0.12 : 0);
    return {
      focus,
      distance,
      yaw,
      pitch,
      fixedPosition,
      snap: this.forceSnap,
      shake: shake * (this.quality === 'low' ? 0.35 : 1),
      shakeTime: this.elapsed,
    };
  }

  _spawnSmoke(dt, sample) {
    const engines = sample.booster.engineCount;
    const t = sample.t;
    if (engines <= 0) return;
    const rate = (this.quality === 'low' ? 26 : 48) * this.spawnScale;
    this.accumulator += rate * dt;
    let count = Math.min(18, Math.floor(this.accumulator));
    this.accumulator -= count;
    if (count <= 0) return;
    const random = () => Math.random();
    const boosterBase = sample.booster.pos;
    for (let i = 0; i < count; i += 1) {
      if (t < 16 && boosterBase.y < 30) {
        const angle = random() * Math.PI * 2;
        const radius = 3 + random() * 36;
        this.smoke.spawn(
          new THREE.Vector3(Math.cos(angle) * radius, 1 + random() * 5, Math.sin(angle) * radius),
          new THREE.Vector3(
            Math.cos(angle) * (6 + random() * 22),
            2 + random() * 9,
            Math.sin(angle) * (6 + random() * 22),
          ),
          {
            size: 12 + random() * 22,
            life: 3 + random() * 4,
            growth: 20 + random() * 24,
            color: [0.42, 0.46, 0.46],
          },
        );
      } else if (t > 405 && boosterBase.y < 300) {
        const angle = random() * Math.PI * 2;
        const radius = 4 + random() * 24;
        this.smoke.spawn(
          new THREE.Vector3(
            boosterBase.x + Math.cos(angle) * radius,
            Math.max(1, boosterBase.y - 8 - random() * 25),
            boosterBase.z + Math.sin(angle) * radius,
          ),
          new THREE.Vector3(
            Math.cos(angle) * (8 + random() * 20),
            1 + random() * 5,
            Math.sin(angle) * (8 + random() * 20),
          ),
          {
            size: 7 + random() * 13,
            life: 2 + random() * 2.5,
            growth: 14 + random() * 18,
            color: [0.68, 0.66, 0.6],
          },
        );
      } else {
        this.smoke.spawn(
          new THREE.Vector3(
            boosterBase.x + (random() - 0.5) * 12,
            boosterBase.y + 4,
            boosterBase.z + (random() - 0.5) * 12,
          ),
          new THREE.Vector3((random() - 0.5) * 15, -12 - random() * 22, (random() - 0.5) * 15),
          {
            size: 5 + random() * 10,
            life: 1.3 + random() * 1.8,
            growth: 12 + random() * 14,
            color: [0.65, 0.68, 0.68],
          },
        );
      }
    }
  }

  update(dt, sample, { playing = true } = {}) {
    this.elapsed += dt;
    if (this.lastT === null || Math.abs(sample.t - this.lastT) > 2.5) {
      this.smoke.reset();
    }
    this.lastT = sample.t;
    this.model.setFlightState(sample, sample.t);
    this.model.booster.updateMatrixWorld(true);
    this.model.ship.updateMatrixWorld(true);
    this.trailBooster.setTime(
      sample.t,
      rocketCenter(sample.booster.pos, sample.booster.pitch, 35.5),
    );
    this.trailShip.setTime(
      sample.t,
      rocketCenter(sample.ship.pos, sample.ship.pitch, 26),
    );
    this.stars.update(sample.booster.altitude);
    this.sky.material.uniforms.uAtmosphere.value = clamp(
      1 - Math.max(sample.booster.altitude, sample.ship.altitude) / 180_000,
      0.22,
      1,
    );
    this.heatAura.update(sample.heat, sample.t);
    const catchAge = sample.t - 420;
    this.catchMech.ring.visible = catchAge >= 0 && catchAge < 5;
    if (this.catchMech.ring.visible) {
      const p = clamp(catchAge / 5, 0, 1);
      const s = 4 + p * 55;
      this.catchMech.ring.scale.set(s, s, 1);
      this.catchMech.ringMaterial.opacity = (1 - p) * 0.55;
    }
    this.catchFlash.intensity =
      catchAge >= 0 && catchAge < 2.2 ? (1 - catchAge / 2.2) * 120 : 0;
    const hotAge = sample.t - 160;
    this.hotFlash.position.set(sample.ship.pos.x, sample.ship.pos.y + 3, sample.ship.pos.z);
    this.hotFlash.intensity =
      hotAge >= 0 && hotAge < 8 ? (1 - hotAge / 8) * sample.hotStage * 70 : 0;
    if (playing) {
      this._spawnSmoke(dt, sample);
      this.smoke.update(dt);
    }
    this.cloudDeck.update(this.camera.position.y);
    this.rig.update(dt, this._cameraDesired(sample));
    this.forceSnap = false;
    this.scene.updateMatrixWorld();
  }

  render() {
    if (this.useBloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.rig.dispose();
    this.smoke.dispose();
    this.trailBooster.dispose();
    this.trailShip.dispose();
    this.cloudDeck.dispose();
    this.model.dispose();
    this.envTarget?.dispose?.();
    this.composer?.dispose?.();
    this.catchMech.ring.geometry.dispose();
    this.catchMech.ringMaterial.dispose();
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
