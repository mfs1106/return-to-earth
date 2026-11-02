import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { StarbaseExplorerModel } from './StarbaseExplorerModel.js';
import {
  addEnvironment,
  addLighting,
  createGround,
  createSky,
  createStars,
} from './environment.js';

function makeBoxHelper(color) {
  const box = new THREE.Box3();
  const helper = new THREE.Box3Helper(box, color);
  helper.material.depthTest = false;
  helper.material.transparent = true;
  helper.material.opacity = 0.92;
  helper.renderOrder = 20;
  helper.visible = false;
  return { box, helper };
}

export class StarbaseExplorerScene {
  constructor(canvas, { quality = 'high' } = {}) {
    this.canvas = canvas;
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: false,
    });
    this.renderer.setClearColor(0x02070b, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.24;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02070b);
    this.scene.fog = new THREE.FogExp2(0x041018, 0.000085);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 5000);
    this.camera.position.set(102, 94, 184);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(-6, 64, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.rotateSpeed = 0.65;
    this.controls.zoomSpeed = 0.9;
    this.controls.panSpeed = 0.75;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 14;
    this.controls.maxDistance = 520;
    this.controls.minPolarAngle = 0.04;
    this.controls.maxPolarAngle = Math.PI * 0.96;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };

    this.homeTarget = new THREE.Vector3(-6, 64, 0);
    this.homePosition = new THREE.Vector3(102, 94, 184);
    this.envTarget = addEnvironment(this.scene, this.renderer, 0.95);
    this.sky = createSky(this.scene);
    this.stars = createStars(this.scene, quality === 'low' ? 700 : 1500);
    this.ground = createGround(this.scene, { sea: false });
    this.ground.position.y = 0;

    this.lights = addLighting(this.scene, { shadows: quality !== 'low' });
    this.lights.sun.position.set(150, 250, 185);
    this.lights.sun.shadow.camera.left = -180;
    this.lights.sun.shadow.camera.right = 180;
    this.lights.sun.shadow.camera.top = 260;
    this.lights.sun.shadow.camera.bottom = -80;
    this.lights.sun.shadow.camera.near = 1;
    this.lights.sun.shadow.camera.far = 700;
    this.lights.sun.shadow.mapSize.set(2048, 2048);
    this.lights.hemisphere.intensity = 1.35;

    this.fill = new THREE.DirectionalLight(0x9fd8ed, 1.25);
    this.fill.position.set(190, 120, 230);
    this.scene.add(this.fill);
    this.warmFill = new THREE.PointLight(0xffc48b, 40, 220, 2);
    this.warmFill.position.set(55, 24, 35);
    this.scene.add(this.warmFill);
    this.coolFill = new THREE.PointLight(0x65c9ff, 34, 230, 2);
    this.coolFill.position.set(-60, 30, 10);
    this.scene.add(this.coolFill);

    this.model = new StarbaseExplorerModel({ quality });
    this.scene.add(this.model.root);

    this.selectedBox = makeBoxHelper(0x6cf2ff);
    this.hoverBox = makeBoxHelper(0xffb166);
    this.hoverBox.helper.material.opacity = 0.55;
    this.scene.add(this.selectedBox.helper, this.hoverBox.helper);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.cameraTween = null;
    this.lastInteraction = performance.now();

    this.controls.addEventListener('start', () => {
      this.cameraTween = null;
      this.lastInteraction = performance.now();
    });
    this.controls.update();
    this.resize(canvas.clientWidth || 1200, canvas.clientHeight || 700);
    this.setQuality(quality);
    this._measureHome();
  }

  _measureHome() {
    // Frame the tower + stack, not the whole tank farm: the model must read
    // large immediately, while the tank farm remains available by orbiting.
    const tower = this.model.getNode('facility/tower')?.object;
    const stack = this.model.getNode('vehicle/stack')?.object;
    const box = new THREE.Box3();
    if (tower) box.expandByObject(tower);
    if (stack) box.expandByObject(stack);
    if (box.isEmpty()) box.setFromObject(this.model.root);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const direction = new THREE.Vector3(0.48, 0.32, 0.82).normalize();
    const fov = (this.camera.fov * Math.PI) / 180;
    const distance = Math.max(170, (size.y / (2 * Math.tan(fov / 2))) * 1.12);
    this.homeTarget.set(center.x - 3, center.y + 2, center.z);
    this.homePosition.copy(this.homeTarget).add(direction.multiplyScalar(distance));
    this.camera.position.copy(this.homePosition);
    this.controls.target.copy(this.homeTarget);
    this.controls.update();
  }

  getVisibleBox() {
    const box = new THREE.Box3();
    const includeMesh = (mesh) => {
      let object = mesh;
      while (object) {
        if (object.visible === false) return false;
        object = object.parent;
      }
      return true;
    };
    this.model.root.updateMatrixWorld(true);
    this.model.root.traverse((child) => {
      if (child.isMesh && includeMesh(child)) {
        box.expandByObject(child);
      }
    });
    return box;
  }

  getNodeBox(id) {
    const node = this.model.getNode(id);
    if (!node || !node.object.visible) return null;
    const box = new THREE.Box3().setFromObject(node.object);
    return box.isEmpty() ? null : box;
  }

  setQuality(quality) {
    this.quality = quality;
    const dpr = window.devicePixelRatio || 1;
    const ratio = quality === 'high' ? Math.min(dpr, 1.85) : quality === 'medium' ? Math.min(dpr, 1.25) : 1;
    this.renderer.setPixelRatio(ratio);
    const shadows = quality !== 'low';
    this.renderer.shadowMap.enabled = shadows;
    if (this.lights?.sun) this.lights.sun.castShadow = shadows;
    if (this.stars) this.stars.points.visible = quality !== 'low';
    this.resize(this.canvas.clientWidth, this.canvas.clientHeight);
  }

  resize(width, height) {
    const w = Math.max(2, width);
    const h = Math.max(2, height);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  setHover(id) {
    const box = id ? this.getNodeBox(id) : null;
    if (!box) {
      this.hoverBox.helper.visible = false;
      this.canvas.style.cursor = '';
      return;
    }
    this.hoverBox.box.copy(box);
    this.hoverBox.helper.visible = true;
    this.canvas.style.cursor = 'pointer';
  }

  setSelection(id) {
    const box = id ? this.getNodeBox(id) : null;
    if (!box) {
      this.selectedBox.helper.visible = false;
      return;
    }
    this.selectedBox.box.copy(box);
    this.selectedBox.helper.visible = true;
  }

  focusNode(id, { duration = 0.7, padding = 1.55, direction = null } = {}) {
    const box = id ? this.getNodeBox(id) : null;
    if (!box) return false;
    this.focusBox(box, { duration, padding, direction });
    return true;
  }

  focusBox(box, { duration = 0.7, padding = 1.4, direction = null } = {}) {
    if (!box || box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const center = box.getCenter(new THREE.Vector3());
    const fov = (this.camera.fov * Math.PI) / 180;
    const distance = Math.max(27, (sphere.radius / Math.sin(fov / 2)) * padding);
    const dir = direction
      ? new THREE.Vector3(direction.x, direction.y, direction.z)
      : this.camera.position.clone().sub(this.controls.target);
    if (dir.lengthSq() < 0.001) dir.set(0.6, 0.36, 1);
    dir.normalize();
    const position = center.clone().add(dir.multiplyScalar(distance));
    this.startCameraTween(position, center, duration);
  }

  getCoreBox() {
    const box = new THREE.Box3();
    for (const id of [
      'facility/tower',
      'facility/launch-mount',
      'vehicle',
    ]) {
      const node = this.model.getNode(id);
      if (node?.object) box.expandByObject(node.object);
    }
    return box;
  }

  fitAll({ duration = 0.75, padding = 1.24 } = {}) {
    const box = this.getVisibleBox();
    if (!box || box.isEmpty()) return;
    this.focusBox(box, { duration, padding });
  }

  fitCore({ duration = 0.7, padding = 1.16 } = {}) {
    const box = this.getCoreBox();
    if (!box || box.isEmpty()) return;
    this.focusBox(box, { duration, padding });
  }

  resetView({ duration = 0.7 } = {}) {
    this.startCameraTween(this.homePosition.clone(), this.homeTarget.clone(), duration);
  }

  startCameraTween(position, target, duration = 0.7) {
    this.cameraTween = {
      elapsed: 0,
      duration: Math.max(0.05, duration),
      fromPos: this.camera.position.clone(),
      toPos: position.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: target.clone(),
    };
    this.controls.enabled = false;
  }

  pick(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.model.interactiveMeshes, false);
    for (const hit of hits) {
      let object = hit.object;
      while (object) {
        if (object.userData?.partId) {
          const node = this.model.getNode(object.userData.partId);
          if (!node) continue;
          let visible = true;
          let parent = node.object;
          while (parent) {
            if (!parent.visible) {
              visible = false;
              break;
            }
            parent = parent.parent;
          }
          if (visible) return { id: node.id, point: hit.point };
        }
        object = object.parent;
      }
    }
    return null;
  }

  getProjectedCenter(id) {
    const node = this.model.getNode(id);
    if (!node) return null;
    const box = new THREE.Box3().setFromObject(node.object);
    if (box.isEmpty()) return null;
    const center = box.getCenter(new THREE.Vector3());
    this.camera.updateMatrixWorld();
    const projected = center.clone().project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (projected.x * 0.5 + 0.5) * rect.width,
      y: (-projected.y * 0.5 + 0.5) * rect.height,
      visible: projected.z > -1 && projected.z < 1,
    };
  }

  update(dt) {
    this.stars.update(40_000);
    if (this.cameraTween) {
      const tween = this.cameraTween;
      tween.elapsed += dt;
      const raw = Math.min(1, tween.elapsed / tween.duration);
      const t = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;
      this.camera.position.lerpVectors(tween.fromPos, tween.toPos, t);
      this.controls.target.lerpVectors(tween.fromTarget, tween.toTarget, t);
      if (raw >= 1) {
        this.cameraTween = null;
        this.controls.enabled = true;
      }
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.controls.dispose();
    this.model.dispose();
    this.envTarget?.dispose?.();
    this.ground.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.scene.traverse((child) => {
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
    this.selectedBox.helper.geometry.dispose();
    this.selectedBox.helper.material.dispose();
    this.hoverBox.helper.geometry.dispose();
    this.hoverBox.helper.material.dispose();
    this.scene.clear();
    this.renderer.dispose();
  }
}
