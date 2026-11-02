import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mulberry32 } from '../simulation/math.js';
import { canvasTexture, makeRadialSpriteTexture } from './utils.js';

/**
 * A neutral procedural reflection environment makes stainless steel and engine
 * metal read correctly without any external HDRI asset.
 */
export function addEnvironment(scene, renderer, intensity = 0.62) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const target = pmrem.fromScene(room, 0.04);
  scene.environment = target.texture;
  scene.environmentIntensity = intensity;
  pmrem.dispose();
  return target;
}

export function createSky(scene) {
  const geometry = new THREE.SphereGeometry(120_000, 48, 32);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x01030a) },
      uHorizon: { value: new THREE.Color(0x0a2133) },
      uBottom: { value: new THREE.Color(0x02070b) },
      uSunDir: { value: new THREE.Vector3(0.45, 0.22, 0.85).normalize() },
      uSunColor: { value: new THREE.Color(0xffba72) },
      uAtmosphere: { value: 1 },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPos;
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uBottom;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uAtmosphere;
      void main() {
        vec3 dir = normalize(vPos);
        float h = dir.y;
        float horizonMix = smoothstep(-0.06, 0.28, h);
        vec3 col = mix(uHorizon * uAtmosphere, uTop, horizonMix);
        col = mix(uBottom, col, smoothstep(-0.35, 0.02, h));
        float sunDot = max(dot(dir, uSunDir), 0.0);
        col += uSunColor * pow(sunDot, 220.0) * 1.7;
        col += uSunColor * pow(sunDot, 10.0) * 0.06;
        float horizonGlow = exp(-abs(h) * 18.0) * 0.14;
        col += vec3(0.09, 0.28, 0.42) * horizonGlow * uAtmosphere;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -20;
  scene.add(mesh);

  const sunTexture = makeRadialSpriteTexture('rgba(255,224,176,0.9)', 'rgba(255,167,84,0)');
  const sunMaterial = new THREE.SpriteMaterial({
    map: sunTexture,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sunSprite = new THREE.Sprite(sunMaterial);
  sunSprite.position.set(56_000, 30_000, 88_000);
  sunSprite.scale.set(15_000, 15_000, 1);
  scene.add(sunSprite);

  return { mesh, material, sunSprite };
}

export function createStars(scene, count = 1800) {
  const random = mulberry32(1337);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < count; i += 1) {
    const radius = 80_000 + random() * 20_000;
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(1 - random() * 1.8);
    positions[i * 3] = Math.cos(theta) * Math.sin(phi) * radius;
    positions[i * 3 + 1] = Math.cos(phi) * radius + 10_000;
    positions[i * 3 + 2] = Math.sin(theta) * Math.sin(phi) * radius;
    color.setHSL(0.53 + random() * 0.12, 0.24 + random() * 0.5, 0.65 + random() * 0.3);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 1.45,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.15,
    vertexColors: true,
    depthWrite: false,
    fog: false,
  });
  const points = new THREE.Points(geometry, material);
  points.renderOrder = -10;
  scene.add(points);
  return {
    points,
    material,
    update(altitudeMeters) {
      material.opacity = THREE.MathUtils.clamp(0.05 + altitudeMeters / 75_000, 0.05, 0.92);
    },
  };
}

function makeGroundTexture(sea = false) {
  return canvasTexture(
    1024,
    1024,
    (ctx, w, h) => {
      const random = mulberry32(sea ? 47 : 91);
      if (sea) {
        const gradient = ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, '#06131d');
        gradient.addColorStop(0.5, '#071a26');
        gradient.addColorStop(1, '#040f17');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 1300; i += 1) {
          const x = random() * w;
          const y = random() * h;
          ctx.strokeStyle = `rgba(62,128,150,${0.025 + random() * 0.06})`;
          ctx.lineWidth = 1 + random() * 2;
          ctx.beginPath();
          ctx.arc(x, y, 8 + random() * 40, 0.1, Math.PI * (0.5 + random() * 0.4));
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#081411';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 3500; i += 1) {
          const v = random();
          ctx.fillStyle = v > 0.55 ? `rgba(25,45,38,${0.15 + random() * 0.2})` : `rgba(5,12,11,${0.2 + random() * 0.3})`;
          ctx.fillRect(random() * w, random() * h, 1 + random() * 9, 1 + random() * 9);
        }
        ctx.strokeStyle = 'rgba(52,108,105,0.14)';
        ctx.lineWidth = 2;
        for (let x = 0; x < w; x += 128) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        for (let y = 0; y < h; y += 128) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
      }
    },
    { repeat: [140, 140] },
  );
}

export function createGround(scene, { sea = false } = {}) {
  const group = new THREE.Group();
  const material = sea
    ? new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: `
          varying vec2 vSeaPosition;
          void main() {
            vSeaPosition = position.xy;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          varying vec2 vSeaPosition;
          void main() {
            vec2 p = vSeaPosition;
            float broad = sin(p.x * 0.026 + p.y * 0.011 + uTime * 0.36);
            float cross = sin(p.x * -0.018 + p.y * 0.041 - uTime * 0.29);
            float ripples = sin(p.x * 0.19 + sin(p.y * 0.08) * 2.0 + uTime * 1.15);
            float glint = pow(max(0.0, broad * 0.45 + cross * 0.35 + ripples * 0.2), 5.0);
            float foam = smoothstep(0.75, 0.96, broad * 0.55 + cross * 0.45);
            vec3 deep = vec3(0.018, 0.078, 0.115);
            vec3 swell = vec3(0.032, 0.135, 0.172);
            vec3 color = mix(deep, swell, clamp(0.5 + broad * 0.24 + cross * 0.18, 0.0, 1.0));
            color += vec3(0.075, 0.16, 0.18) * glint;
            color += vec3(0.025, 0.05, 0.06) * foam;
            gl_FragColor = vec4(color, 1.0);
          }
        `,
      })
    : new THREE.MeshStandardMaterial({
        map: makeGroundTexture(false),
        color: 0x647a6d,
        roughness: 0.95,
        metalness: 0.05,
      });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(320_000, 320_000), material);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = sea ? -1.2 : -0.2;
  plane.receiveShadow = true;
  group.add(plane);

  if (!sea) {
    const grid = new THREE.GridHelper(12_000, 120, 0x1f4d4f, 0x112b2d);
    grid.position.y = 0.04;
    grid.material.transparent = true;
    grid.material.opacity = 0.32;
    grid.material.depthWrite = false;
    group.add(grid);
  }
  group.userData.update = sea ? (time) => { material.uniforms.uTime.value = time; } : () => {};
  scene.add(group);
  return group;
}

export function createCloudDeck(scene) {
  const random = mulberry32(812);
  const texture = makeRadialSpriteTexture('rgba(219,238,246,0.42)', 'rgba(219,238,246,0)');
  const group = new THREE.Group();
  for (let i = 0; i < 46; i += 1) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.035 + random() * 0.055,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    const radius = 900 + random() * 5000;
    const angle = random() * Math.PI * 2;
    sprite.position.set(
      Math.cos(angle) * radius,
      140 + random() * 380,
      Math.sin(angle) * radius,
    );
    const scale = 180 + random() * 520;
    sprite.scale.set(scale, scale * (0.18 + random() * 0.2), 1);
    group.add(sprite);
  }
  scene.add(group);
  return {
    group,
    update(cameraAltitudeScene) {
      group.visible = cameraAltitudeScene < 900;
    },
    dispose() {
      group.children.forEach((sprite) => {
        sprite.material.dispose();
      });
      texture.dispose();
    },
  };
}

export function addLighting(scene, { shadows = true } = {}) {
  const hemisphere = new THREE.HemisphereLight(0x7daec7, 0x0b1617, 1.25);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xffe4c4, 2.4);
  sun.position.set(-230, 340, 180);
  sun.castShadow = shadows;
  if (shadows) {
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -180;
    sun.shadow.camera.right = 180;
    sun.shadow.camera.top = 220;
    sun.shadow.camera.bottom = -70;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 900;
    sun.shadow.bias = -0.0005;
  }
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x48a5c8, 1.1);
  rim.position.set(260, 100, -220);
  scene.add(rim);
  const fill = new THREE.PointLight(0x5ac7e2, 12, 380, 2);
  fill.position.set(0, 24, 80);
  scene.add(fill);
  return { hemisphere, sun, rim, fill };
}
