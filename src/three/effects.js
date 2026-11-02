import * as THREE from 'three';
import { makeRadialSpriteTexture, makeSprite } from './utils.js';
import { mulberry32, clamp } from '../simulation/math.js';

/** GPU point-sprite smoke / vapour particle pool. */
export class SmokeSystem {
  constructor(scene, { maxParticles = 900, seed = 1 } = {}) {
    this.scene = scene;
    this.max = maxParticles;
    this.random = mulberry32(seed);
    this.cursor = 0;
    const texture = makeRadialSpriteTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
    const positions = new Float32Array(this.max * 3);
    const sizes = new Float32Array(this.max);
    const alphas = new Float32Array(this.max);
    const colors = new Float32Array(this.max * 3);
    this.positions = positions;
    this.sizes = sizes;
    this.alphas = alphas;
    this.velocities = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.maxLife = new Float32Array(this.max);
    this.growth = new Float32Array(this.max);
    this.baseSizes = new Float32Array(this.max);
    this.colors = colors;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 500, 0), 50000);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: texture },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aColor;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * (340.0 / max(1.0, -mv.z)), 1.0, 180.0);
          gl_Position = projectionMatrix * mv;
          vAlpha = aAlpha;
          vColor = aColor;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vec4 texel = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vColor, texel.a * vAlpha);
          if (gl_FragColor.a < 0.006) discard;
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
  }

  spawn(position, velocity, { size = 8, life = 3, color = [0.72, 0.78, 0.82], growth = 12 } = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const p = i * 3;
    this.positions[p] = position.x;
    this.positions[p + 1] = position.y;
    this.positions[p + 2] = position.z;
    this.velocities[p] = velocity.x;
    this.velocities[p + 1] = velocity.y;
    this.velocities[p + 2] = velocity.z;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.baseSizes[i] = size;
    this.sizes[i] = size;
    this.alphas[i] = 0.5;
    this.growth[i] = growth;
    this.colors[p] = color[0];
    this.colors[p + 1] = color[1];
    this.colors[p + 2] = color[2];
  }

  update(dt) {
    for (let i = 0; i < this.max; i += 1) {
      if (this.life[i] <= 0) {
        this.alphas[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      const p = i * 3;
      this.positions[p] += this.velocities[p] * dt;
      this.positions[p + 1] += this.velocities[p + 1] * dt;
      this.positions[p + 2] += this.velocities[p + 2] * dt;
      this.velocities[p] *= 1 - dt * 0.42;
      this.velocities[p + 1] += dt * 2.2;
      this.velocities[p + 2] *= 1 - dt * 0.42;
      this.sizes[i] = this.baseSizes[i] + this.growth[i] * t;
      this.alphas[i] = Math.sin(Math.PI * clamp(t, 0, 1)) * 0.34;
      if (this.life[i] <= 0) this.alphas[i] = 0;
    }
    const geometry = this.points.geometry;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aSize.needsUpdate = true;
    geometry.attributes.aAlpha.needsUpdate = true;
    geometry.attributes.aColor.needsUpdate = true;
  }

  reset() {
    this.life.fill(0);
    this.alphas.fill(0);
    this.points.geometry.attributes.aAlpha.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.points.material.uniforms.uMap.value.dispose();
    this.points.material.dispose();
    this.scene.remove(this.points);
  }
}

/** Two-layer trajectory line with a bright "travelled" segment. */
export class TrailLine {
  constructor(scene, points, color, { start, end, opacity = 0.55 } = {}) {
    this.scene = scene;
    this.start = start;
    this.end = end;
    const visiblePoints = points.filter((p) => p.t >= start && p.t <= end);
    const last = visiblePoints.at(-1);
    const next = points.find((p) => p.t > end);
    if (last && next && last.t < end) {
      const alpha = (end - last.t) / (next.t - last.t);
      visiblePoints.push({
        t: end,
        x: last.x + (next.x - last.x) * alpha,
        y: last.y + (next.y - last.y) * alpha,
        z: last.z + (next.z - last.z) * alpha,
      });
    }
    this.times = visiblePoints.map((p) => p.t);
    const vertices = new Float32Array(visiblePoints.length * 3);
    visiblePoints.forEach((p, i) => {
      vertices[i * 3] = p.x;
      vertices[i * 3 + 1] = p.y;
      vertices[i * 3 + 2] = p.z;
    });
    const makeGeometry = (extraPoint = false) => {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(vertices.length + (extraPoint ? 3 : 0));
      positions.set(vertices);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      return geometry;
    };
    this.full = new THREE.Line(
      makeGeometry(),
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
      }),
    );
    this.active = new THREE.Line(
      makeGeometry(true),
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
      }),
    );
    this.full.renderOrder = 2;
    this.active.renderOrder = 3;
    this.active.geometry.setDrawRange(0, 0);
    scene.add(this.full, this.active);
    this.count = visiblePoints.length;
  }

  setTime(t, head) {
    if (t < this.start) {
      this.active.geometry.setDrawRange(0, 0);
      return;
    }
    let lo = 0;
    let hi = this.times.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.times[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    let count = lo;
    if (head && t < this.end && count < this.count) {
      const attribute = this.active.geometry.getAttribute('position');
      attribute.setXYZ(count, head.x, head.y, head.z);
      attribute.needsUpdate = true;
      count += 1;
    }
    this.active.geometry.setDrawRange(0, count);
  }

  dispose() {
    this.full.geometry.dispose();
    this.active.geometry.dispose();
    this.full.material.dispose();
    this.active.material.dispose();
    this.scene.remove(this.full, this.active);
  }
}

/** Billboards that appear around the vehicle near maximum dynamic pressure. */
export class CondensationCloud {
  constructor(scene, seed = 5) {
    const random = mulberry32(seed);
    this.scene = scene;
    this.group = new THREE.Group();
    const texture = makeRadialSpriteTexture('rgba(215,236,244,0.34)', 'rgba(215,236,244,0)');
    this.material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.sprites = [];
    for (let i = 0; i < 24; i += 1) {
      const sprite = new THREE.Sprite(this.material.clone());
      const angle = random() * Math.PI * 2;
      const radius = 7 + random() * 22;
      sprite.position.set(
        Math.cos(angle) * radius,
        -8 + random() * 62,
        Math.sin(angle) * radius,
      );
      const scale = 7 + random() * 17;
      sprite.scale.set(scale, scale * (0.35 + random() * 0.45), 1);
      this.sprites.push(sprite);
      this.group.add(sprite);
    }
    this.group.visible = false;
    scene.add(this.group);
  }

  update(stageCenter, intensity) {
    this.group.visible = intensity > 0.01;
    this.group.position.copy(stageCenter);
    const opacity = intensity * 0.32;
    this.sprites.forEach((sprite, i) => {
      sprite.material.opacity = opacity * (0.55 + 0.45 * Math.sin(i * 1.7));
      sprite.material.rotation = Math.sin(i + intensity) * 0.12;
    });
  }

  dispose() {
    this.sprites.forEach((sprite) => {
      sprite.material.map?.dispose();
      sprite.material.dispose();
    });
    this.scene.remove(this.group);
  }
}

/** Additive re-entry plasma attached to the first stage. */
export class HeatAura {
  constructor(stageGroup) {
    this.group = new THREE.Group();
    this.group.position.y = 8;
    this.group.visible = false;
    const texture = makeRadialSpriteTexture('rgba(255,225,170,0.9)', 'rgba(255,70,15,0)');
    this.material = new THREE.SpriteMaterial({
      map: texture,
      color: 0xff8235,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.sprites = [];
    for (let i = 0; i < 3; i += 1) {
      const sprite = new THREE.Sprite(this.material.clone());
      const scale = 7 + i * 5;
      sprite.scale.set(scale, scale * 1.35, 1);
      sprite.position.set(0, i * 5 - 2, 0);
      this.sprites.push(sprite);
      this.group.add(sprite);
    }
    this.light = new THREE.PointLight(0xff6b25, 0, 120, 2);
    this.light.position.y = 6;
    this.group.add(this.light);
    stageGroup.add(this.group);
    this.texture = texture;
  }

  update(intensity, time) {
    this.group.visible = intensity > 0.015;
    if (!this.group.visible) return;
    this.sprites.forEach((sprite, i) => {
      const pulse = 0.76 + Math.sin(time * 14 + i * 2.1) * 0.24;
      sprite.material.opacity = intensity * (0.06 + i * 0.03) * pulse;
      const s = (7 + i * 5) * (0.8 + intensity * 0.45);
      sprite.scale.set(s, s * 1.35, 1);
    });
    this.light.intensity = intensity * 11;
  }
}

/** Expanding dust / water shockwave at the landing point, derived from mission time. */
export class LandingShockwave {
  constructor(scene, position) {
    this.scene = scene;
    this.position = position;
    const geometry = new THREE.RingGeometry(1, 1.15, 64);
    this.material = new THREE.MeshBasicMaterial({
      color: 0xb7c3c8,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.copy(position);
    this.mesh.position.y += 0.6;
    this.mesh.visible = false;
    scene.add(this.mesh);
    const texture = makeRadialSpriteTexture('rgba(206,216,219,0.55)', 'rgba(206,216,219,0)');
    this.dustMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.dust = new THREE.Sprite(this.dustMaterial);
    this.dust.position.copy(position);
    this.dust.position.y += 14;
    this.dust.visible = false;
    scene.add(this.dust);
  }

  update(t, touchdown) {
    const age = t - touchdown;
    const visible = age >= 0 && age < 6;
    this.mesh.visible = visible;
    this.dust.visible = visible;
    if (!visible) return;
    const p = clamp(age / 6, 0, 1);
    const scale = 4 + p * 95;
    this.mesh.scale.set(scale, scale, 1);
    this.material.opacity = (1 - p) * 0.45;
    const dustScale = 28 + p * 90;
    this.dust.scale.set(dustScale, dustScale * 0.55, 1);
    this.dustMaterial.opacity = (1 - p) * 0.4;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.dustMaterial.map?.dispose();
    this.dustMaterial.dispose();
    this.scene.remove(this.mesh, this.dust);
  }
}

/** A little floating label in 3D for the landing target (optional visual aid). */
export function makeLocationMarker(text) {
  const sprite = makeSprite(text, {
    color: '#8fe8ff',
    bg: 'rgba(3,14,20,0.7)',
    border: 'rgba(80,209,255,0.55)',
    font: '600 26px "Cascadia Code", monospace',
  });
  sprite.scale.multiplyScalar(1.1);
  return sprite;
}
