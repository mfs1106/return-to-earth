import * as THREE from 'three';
import { canvasTexture, makeFlameTexture, makeGridFinTexture } from './utils.js';

export const SHIP_HEIGHT = 52;
export const TOWER_HEIGHT = 145;
export const TOWER_ARM_HEIGHT = 106;

function makeStainlessTexture(seed = 3) {
  return canvasTexture(
    1024,
    2048,
    (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#8d969b');
      grad.addColorStop(0.18, '#c6ced1');
      grad.addColorStop(0.38, '#aab3b7');
      grad.addColorStop(0.58, '#d7dde0');
      grad.addColorStop(0.78, '#9aa4a9');
      grad.addColorStop(1, '#808a8f');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      let s = seed;
      const random = () => {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
      };
      for (let i = 0; i < 800; i += 1) {
        ctx.fillStyle = `rgba(255,255,255,${random() * 0.06})`;
        ctx.fillRect(random() * w, 0, 1 + random() * 2, h);
      }
      ctx.strokeStyle = 'rgba(50,58,62,0.28)';
      ctx.lineWidth = 3;
      for (let y = 0; y < h; y += 156) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(40,48,52,0.16)';
      for (let x = 0; x < w; x += 128) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(30,37,41,0.48)';
      ctx.font = '700 40px "Arial Narrow", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('STARSHIP', w / 2, h * 0.46);
      ctx.font = '500 23px "Cascadia Code", monospace';
      ctx.fillText('SPACEX', w / 2, h * 0.49);
    },
    { repeat: [1, 1] },
  );
}

function makeHeatShieldTexture() {
  return canvasTexture(
    512,
    1024,
    (ctx, w, h) => {
      ctx.fillStyle = '#131719';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(76,82,84,0.45)';
      ctx.lineWidth = 2;
      const size = 22;
      for (let y = 0; y < h; y += size) {
        for (let x = (Math.floor(y / size) % 2) * (size / 2); x < w; x += size) {
          ctx.strokeRect(x, y, size, size);
        }
      }
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fillRect(0, 0, w, h);
    },
    { repeat: [2, 3] },
  );
}

function makePlume(scale, texture) {
  const group = new THREE.Group();
  const outerMat = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xff7a2a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const innerMat = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xfff0cd,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.75 * scale, 9 * scale, 12, 1, true), outerMat);
  outer.rotation.x = Math.PI;
  outer.position.y = -4.5 * scale;
  outer.raycast = () => {};
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.34 * scale, 5 * scale, 10, 1, true), innerMat);
  inner.rotation.x = Math.PI;
  inner.position.y = -2.5 * scale;
  inner.raycast = () => {};
  group.add(outer, inner);
  const light = new THREE.PointLight(0xffa050, 0, 90 * scale, 2);
  light.position.y = -2;
  group.add(light);
  group.userData = { outer, inner, outerMat, innerMat, light };
  return group;
}

function createFootprintPad() {
  const group = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({ color: 0x3c4649, roughness: 0.95, metalness: 0.05 });
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(44, 48, 2, 64), concrete);
  pad.position.y = -1;
  pad.receiveShadow = true;
  group.add(pad);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(28, 29, 64),
    new THREE.MeshBasicMaterial({ color: 0xb9d8de, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  group.add(ring);
  const mount = new THREE.Mesh(
    new THREE.CylinderGeometry(8.5, 9.2, 4, 40),
    new THREE.MeshStandardMaterial({ color: 0x5c676c, metalness: 0.85, roughness: 0.35 }),
  );
  mount.position.y = 0.5;
  group.add(mount);
  return group;
}

/** Procedural stainless-steel tower and catch arms. No landing legs anywhere. */
function createCatchTower() {
  const group = new THREE.Group();
  group.position.set(-22, 0, 0);
  const steel = new THREE.MeshStandardMaterial({ color: 0x6b757a, metalness: 0.85, roughness: 0.42 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x30383c, metalness: 0.7, roughness: 0.5 });
  const half = 6.5;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const column = new THREE.Mesh(new THREE.BoxGeometry(1.2, TOWER_HEIGHT, 1.2), steel);
      column.position.set(sx * half, TOWER_HEIGHT / 2, sz * half);
      group.add(column);
    }
  }
  for (let y = 10; y < TOWER_HEIGHT; y += 10) {
    for (const sz of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 1, 0.36, 0.36), steel);
      beam.position.set(0, y, sz * half);
      group.add(beam);
    }
    for (const sx of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, half * 2 + 1), steel);
      beam.position.set(sx * half, y, 0);
      group.add(beam);
    }
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 15), dark);
    brace.position.set(half, y + 5, 0);
    brace.rotation.x = Math.PI / 4;
    const brace2 = brace.clone();
    brace2.position.x = -half;
    brace2.rotation.x = -Math.PI / 4;
    group.add(brace, brace2);
  }
  const topDeck = new THREE.Mesh(new THREE.BoxGeometry(18, 2.2, 18), dark);
  topDeck.position.y = TOWER_HEIGHT;
  group.add(topDeck);
  const crane = new THREE.Mesh(new THREE.BoxGeometry(42, 1.4, 2), steel);
  crane.position.set(10, TOWER_HEIGHT + 4, 0);
  group.add(crane);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.45, 26, 8), steel);
  mast.position.set(-18, TOWER_HEIGHT + 14, 0);
  group.add(mast);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff6f48 }),
  );
  beacon.position.set(-18, TOWER_HEIGHT + 27, 0);
  group.add(beacon);
  for (let i = 0; i < 8; i += 1) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x86e3ff }),
    );
    lamp.position.set(half + 0.7, 12 + i * 16, half + 0.7);
    group.add(lamp);
  }

  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(-half + 0.6, TOWER_ARM_HEIGHT, side * 8.4);
    const main = new THREE.Mesh(new THREE.BoxGeometry(29.5, 2.7, 4.2), steel);
    main.position.x = 14.4;
    arm.add(main);
    const secondary = new THREE.Mesh(new THREE.BoxGeometry(27.5, 1.2, 2.0), dark);
    secondary.position.set(14, -3.1, 0);
    arm.add(secondary);
    for (let i = 0; i < 5; i += 1) {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.55, 6.2, 0.55), dark);
      cross.position.set(2 + i * 6.2, -1.4, 0);
      cross.rotation.z = 0.55;
      arm.add(cross);
    }
    const clampJaw = new THREE.Mesh(
      new THREE.BoxGeometry(8.4, 4.6, 6.8),
      new THREE.MeshStandardMaterial({ color: 0xa5afb3, metalness: 0.7, roughness: 0.36 }),
    );
    clampJaw.position.set(28.4, 0, 0);
    arm.add(clampJaw);
    const warningStripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 4.9, 7.0),
      new THREE.MeshBasicMaterial({ color: 0xff6a35 }),
    );
    warningStripe.position.set(23.8, 0, 0);
    arm.add(warningStripe);
    for (const zOffset of [-3.1, 3.1]) {
      const clampFinger = new THREE.Mesh(
        new THREE.BoxGeometry(5.6, 1.8, 1.0),
        new THREE.MeshBasicMaterial({ color: 0xffc27a }),
      );
      clampFinger.position.set(30.8, -1.7, zOffset);
      arm.add(clampFinger);
    }
    group.add(arm);
    arms.push({ group: arm, side, baseZ: side * 8.4 });
  }
  const warning = new THREE.Mesh(
    new THREE.BoxGeometry(6, 0.6, 2.6),
    new THREE.MeshBasicMaterial({ color: 0xff5d37, transparent: true, opacity: 0.8 }),
  );
  warning.position.set(8, TOWER_ARM_HEIGHT - 4, 0);
  group.add(warning);
  return { group, arms };
}

export class StarshipModel {
  constructor({ quality = 'high' } = {}) {
    this.quality = quality;
    this.flameTexture = makeFlameTexture();
    this.gridTexture = makeGridFinTexture();
    this.booster = new THREE.Group();
    this.ship = new THREE.Group();
    this.booster.name = 'SuperHeavy';
    this.ship.name = 'Starship';
    this.boosterPlumes = [];
    this.shipPlumes = [];
    this.gridFins = [];
    this._buildMaterials();
    this._buildBooster();
    this._buildShip();
    this.tower = createCatchTower();
  }

  _buildMaterials() {
    const stainless = makeStainlessTexture(7);
    const shield = makeHeatShieldTexture();
    this.materials = {
      steel: new THREE.MeshStandardMaterial({
        map: stainless,
        color: 0xc6cdd0,
        metalness: 0.82,
        roughness: 0.34,
      }),
      steelDark: new THREE.MeshStandardMaterial({
        color: 0x9aa4a8,
        metalness: 0.9,
        roughness: 0.38,
      }),
      shield: new THREE.MeshStandardMaterial({
        map: shield,
        color: 0xffffff,
        metalness: 0.35,
        roughness: 0.72,
        side: THREE.DoubleSide,
      }),
      engine: new THREE.MeshStandardMaterial({
        color: 0x373d41,
        metalness: 0.95,
        roughness: 0.3,
        side: THREE.DoubleSide,
      }),
      engineHot: new THREE.MeshStandardMaterial({
        color: 0x635a4b,
        metalness: 0.78,
        roughness: 0.42,
        side: THREE.DoubleSide,
      }),
      dark: new THREE.MeshStandardMaterial({ color: 0x252c30, metalness: 0.7, roughness: 0.5 }),
      fin: new THREE.MeshStandardMaterial({
        map: this.gridTexture,
        transparent: true,
        alphaTest: 0.2,
        side: THREE.DoubleSide,
        color: 0xbfc8ce,
        metalness: 0.85,
        roughness: 0.32,
      }),
      flap: new THREE.MeshStandardMaterial({
        color: 0x737d82,
        metalness: 0.6,
        roughness: 0.48,
        side: THREE.DoubleSide,
      }),
      vent: new THREE.MeshBasicMaterial({
        color: 0x9fe9ff,
        transparent: true,
        opacity: 0.1,
      }),
    };
  }

  _buildBooster() {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(4.5, 4.5, 66, 64, 1),
      this.materials.steel,
    );
    body.position.y = 36;
    this.booster.add(body);
    const seam = new THREE.MeshStandardMaterial({ color: 0x899498, metalness: 0.88, roughness: 0.43 });
    for (const y of [13, 23, 33, 43, 53, 63]) {
      const weld = new THREE.Mesh(new THREE.TorusGeometry(4.51, 0.028, 5, 64), seam);
      weld.rotation.x = Math.PI / 2;
      weld.position.y = y;
      this.booster.add(weld);
    }
    for (const angle of [-0.3, 2.8]) {
      const raceway = new THREE.Mesh(new THREE.BoxGeometry(0.22, 49, 0.32), this.materials.steelDark);
      raceway.position.set(Math.cos(angle) * 4.45, 33, Math.sin(angle) * 4.45);
      raceway.rotation.y = -angle;
      this.booster.add(raceway);
    }
    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(4.54, 4.6, 5, 64, 1, true),
      this.materials.dark,
    );
    skirt.position.y = 3.4;
    this.booster.add(skirt);
    const topRing = new THREE.Mesh(
      new THREE.TorusGeometry(4.5, 0.14, 8, 64),
      this.materials.steelDark,
    );
    topRing.rotation.x = Math.PI / 2;
    topRing.position.y = 69.2;
    this.booster.add(topRing);

    // Hot-stage vent ring at the top of Super Heavy.
    const hotRing = new THREE.Mesh(
      new THREE.CylinderGeometry(4.55, 4.7, 2.4, 64, 1, true),
      this.materials.dark,
    );
    hotRing.position.y = 70.2;
    this.booster.add(hotRing);
    for (let i = 0; i < 24; i += 1) {
      const angle = (i / 24) * Math.PI * 2;
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.2, 0.6), this.materials.vent);
      vent.position.set(Math.cos(angle) * 4.66, 70.2, Math.sin(angle) * 4.66);
      vent.rotation.y = -angle;
      this.booster.add(vent);
    }

    // 33 engine bells: 3 + 10 + 20 layout (stylised but representative).
    const bells = [];
    bells.push({ x: 0, z: 0, r: 1.2 });
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * Math.PI * 2;
      bells.push({ x: Math.cos(a) * 1.75, z: Math.sin(a) * 1.75, r: 0.8 });
    }
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * Math.PI * 2;
      bells.push({ x: Math.cos(a) * 3.0, z: Math.sin(a) * 3.0, r: 0.62 });
    }
    for (let i = 0; i < 20; i += 1) {
      const a = (i / 20) * Math.PI * 2;
      bells.push({ x: Math.cos(a) * 3.95, z: Math.sin(a) * 3.95, r: 0.5 });
    }
    bells.forEach((b, index) => {
      const bell = new THREE.Mesh(
        new THREE.CylinderGeometry(b.r * 0.55, b.r, 1.8, 12, 1, true),
        index < 3 ? this.materials.engineHot : this.materials.engine,
      );
      bell.position.set(b.x, 1.2, b.z);
      this.booster.add(bell);
    });
    // A small number of large plume meshes (not 33 separate lights).
    const plumePositions = [
      [0, 0],
      [2.1, 0],
      [-2.1, 0],
      [0, 2.1],
      [0, -2.1],
      [3.1, 1.4],
      [-3.1, 1.4],
      [3.1, -1.4],
      [-3.1, -1.4],
      [1.2, 3.4],
      [-1.2, 3.4],
      [1.2, -3.4],
      [-1.2, -3.4],
    ];
    plumePositions.forEach(([x, z], index) => {
      const plume = makePlume(index === 0 ? 1.35 : 1.0, this.flameTexture);
      plume.position.set(x, 0.35, z);
      plume.visible = false;
      plume.userData.light.visible = index === 0;
      this.booster.add(plume);
      this.boosterPlumes.push(plume);
    });

    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2;
      const hinge = new THREE.Group();
      hinge.position.set(Math.cos(angle) * 4.55, 63.5, Math.sin(angle) * 4.55);
      hinge.rotation.y = -angle;
      const fin = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.1), this.materials.fin);
      fin.rotation.y = Math.PI / 2;
      hinge.add(fin);
      this.booster.add(hinge);
      this.gridFins.push(hinge);
    }

  }

  _buildShip() {
    // Main tank / hull.
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(4.5, 4.5, 36, 64, 1),
      this.materials.steel,
    );
    body.position.y = 20;
    this.ship.add(body);
    // Ogive nose.
    const profile = [];
    for (let i = 0; i <= 24; i += 1) {
      const t = i / 24;
      const radius = 4.5 * Math.cos(t * Math.PI * 0.5) ** 0.72;
      profile.push(new THREE.Vector2(Math.max(0.01, radius), t * 16));
    }
    const nose = new THREE.Mesh(new THREE.LatheGeometry(profile, 64), this.materials.steel);
    nose.position.y = 38;
    this.ship.add(nose);
    const engineSkirt = new THREE.Mesh(
      new THREE.CylinderGeometry(4.5, 4.55, 4, 64, 1, true),
      this.materials.dark,
    );
    engineSkirt.position.y = 1.8;
    this.ship.add(engineSkirt);

    // Tiled heat-shield side. It is deliberately one-sided.
    const shield = new THREE.Mesh(
      new THREE.CylinderGeometry(4.53, 4.53, 35.5, 48, 1, true, -Math.PI / 2, Math.PI),
      this.materials.shield,
    );
    shield.position.y = 20;
    this.ship.add(shield);
    const noseShield = new THREE.Mesh(new THREE.LatheGeometry(profile, 48, -Math.PI / 2, Math.PI), this.materials.shield);
    noseShield.position.y = 38;
    this.ship.add(noseShield);

    // 6 engines.
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2;
      const ring = i % 2 === 0 ? 2.2 : 3.2;
      const bell = new THREE.Mesh(
        new THREE.CylinderGeometry(0.48, 0.8, 2.6, 14, 1, true),
        i < 3 ? this.materials.engineHot : this.materials.engine,
      );
      bell.position.set(Math.cos(angle) * ring, 1.2, Math.sin(angle) * ring);
      this.ship.add(bell);
      const plume = makePlume(0.8, this.flameTexture);
      plume.position.set(Math.cos(angle) * ring, 0.25, Math.sin(angle) * ring);
      plume.visible = false;
      plume.userData.light.visible = i === 0;
      this.ship.add(plume);
      this.shipPlumes.push(plume);
    }

    // Flaps: two forward, two aft. The silhouettes are intentionally simple.
    const makeFlap = (w, h, x, y, z, rotZ, rotY) => {
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, -h / 2);
      shape.lineTo(w / 2, -h * 0.35);
      shape.lineTo(w * 0.34, h / 2);
      shape.lineTo(-w * 0.42, h * 0.32);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false });
      const mesh = new THREE.Mesh(geo, this.materials.flap);
      mesh.position.set(x, y, z);
      mesh.rotation.z = rotZ;
      mesh.rotation.y = rotY;
      this.ship.add(mesh);
    };
    makeFlap(9.5, 12, 4.4, 13, 0, 0.1, 0.25);
    makeFlap(9.5, 12, -4.4, 13, 0, -0.1, -0.25);
    makeFlap(8, 8.5, 4.2, 41, 0, 0.25, 0.55);
    makeFlap(8, 8.5, -4.2, 41, 0, -0.25, -0.55);

  }

  setFlightState(sample, time) {
    const b = sample.booster.pos;
    const s = sample.ship.pos;
    this.booster.position.set(b.x, b.y, b.z);
    this.booster.rotation.set(0, 0, -(sample.booster.pitch * Math.PI) / 180);
    this.ship.position.set(s.x, s.y, s.z);
    this.ship.rotation.set(0, 0, -(sample.ship.pitch * Math.PI) / 180);

    this.gridFins.forEach((hinge, i) => {
      const sign = i % 2 === 0 ? 1 : -1;
      hinge.rotation.y = sign * (Math.PI / 2.2) * sample.booster.gridFins;
      hinge.rotation.z = Math.sin(time * 1.5 + i) * 0.06 * sample.booster.gridFins;
    });
    this.tower.arms.forEach(({ group, side, baseZ }) => {
      const close = sample.armsClose;
      group.position.z = side * (baseZ - (baseZ - 5.2) * close);
      group.position.y = TOWER_ARM_HEIGHT - close * 2.4;
      group.rotation.y = side * (0.04 - close * 0.04);
    });
    this._updatePlumes(sample, time);
    this._updateVent(sample, time);
  }

  _updatePlumes(sample, time) {
    const bPlumes = this.boosterPlumes;
    const bCount = Math.ceil((sample.booster.engineCount / 33) * bPlumes.length);
    bPlumes.forEach((plume, i) => {
      const active = i < bCount && sample.booster.throttle > 0.03 && sample.booster.engineMode !== 'off';
      plume.visible = active;
      if (active) {
        const flicker = 0.88 + Math.sin(time * 31 + i * 1.4) * 0.12;
        const throttle = sample.booster.throttle;
        plume.scale.set(1, (0.35 + throttle * 1.15) * flicker, 1);
        plume.userData.outerMat.opacity = 0.28 + throttle * 0.32;
        plume.userData.innerMat.opacity = 0.5 + throttle * 0.35;
        if (i === 0) plume.userData.light.intensity = 24 * throttle * flicker;
      } else if (i === 0) {
        plume.userData.light.intensity = 0;
      }
    });
    const sPlumes = this.shipPlumes;
    const sActive = sample.ship.engineCount > 0 && sample.ship.throttle > 0.03;
    sPlumes.forEach((plume, i) => {
      plume.visible = sActive;
      if (sActive) {
        const flicker = 0.9 + Math.sin(time * 27 + i) * 0.1;
        plume.scale.set(0.8, (0.4 + sample.ship.throttle * 0.9) * flicker, 0.8);
        plume.userData.outerMat.opacity = 0.36;
        plume.userData.innerMat.opacity = 0.7;
        if (i === 0) plume.userData.light.intensity = 16;
      } else if (i === 0) {
        plume.userData.light.intensity = 0;
      }
    });
  }

  _updateVent(sample, time) {
    const intensity = sample.hotStage;
    this.materials.vent.opacity =
      0.06 + intensity * (0.25 + Math.sin(time * 17) * 0.1);
  }

  setQuality(quality) {
    this.quality = quality;
    this.boosterPlumes.forEach((plume) => {
      plume.userData.light.visible = quality !== 'low' && plume === this.boosterPlumes[0];
    });
  }

  dispose() {
    const root = new THREE.Group();
    root.add(this.booster, this.ship, this.tower.group);
    root.traverse((child) => {
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
  }
}
