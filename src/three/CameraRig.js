import * as THREE from 'three';
import { clamp } from '../simulation/math.js';

/**
 * Lightweight camera rig. Cinematic modes supply a focus point, distance,
 * yaw and pitch. Users can orbit with mouse / touch and zoom with wheel /
 * pinch in every orbital mode; ground and landing cameras use fixed mounts.
 * No external controls are required.
 */
export class CameraRig {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.userYaw = 0;
    this.userPitch = 0;
    this.zoom = 1;
    this.smoothFocus = new THREE.Vector3(0, 20, 0);
    this.lookTarget = new THREE.Vector3(0, 20, 0);
    this.initialised = false;
    this.pointers = new Map();
    this.dragState = null;
    this.pinchDistance = 0;
    this.pinchZoom = 1;
    this.lastMoved = 0;
    this._bind();
  }

  _bind() {
    const el = this.domElement;
    el.style.touchAction = 'none';
    this._onPointerDown = (event) => {
      if (event.button !== undefined && event.button !== 0 && event.pointerType === 'mouse') return;
      el.setPointerCapture?.(event.pointerId);
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size === 1) {
        this.lastMoved = 0;
        this.dragState = {
          id: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          x: event.clientX,
          y: event.clientY,
          moved: 0,
        };
      } else if (this.pointers.size === 2) {
        const pts = [...this.pointers.values()];
        this.pinchDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        this.pinchZoom = this.zoom;
        this.dragState = null;
      }
    };
    this._onPointerMove = (event) => {
      if (!this.pointers.has(event.pointerId)) return;
      const previous = this.pointers.get(event.pointerId);
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size === 2) {
        const pts = [...this.pointers.values()];
        const distance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (this.pinchDistance > 0) {
          this.zoom = clamp(this.pinchZoom * (this.pinchDistance / Math.max(distance, 1)), 0.35, 3.4);
        }
        return;
      }
      const drag = this.dragState;
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      this.userYaw -= dx * 0.005;
      this.userPitch = clamp(this.userPitch + dy * 0.004, -0.5, 1.15);
    };
    this._onPointerUp = (event) => {
      this.pointers.delete(event.pointerId);
      if (this.pointers.size < 2) {
        this.pinchDistance = 0;
      }
      if (this.dragState && this.dragState.id === event.pointerId) {
        this.lastMoved = this.dragState.moved;
        this.dragState = null;
      }
    };
    this._onWheel = (event) => {
      event.preventDefault();
      this.zoom = clamp(this.zoom * Math.exp(event.deltaY * 0.0011), 0.35, 3.4);
    };
    this._onDblClick = () => {
      this.resetOffsets();
    };
    el.addEventListener('pointerdown', this._onPointerDown);
    el.addEventListener('pointermove', this._onPointerMove);
    el.addEventListener('pointerup', this._onPointerUp);
    el.addEventListener('pointercancel', this._onPointerUp);
    el.addEventListener('wheel', this._onWheel, { passive: false });
    el.addEventListener('dblclick', this._onDblClick);
  }

  resetOffsets() {
    this.userYaw = 0;
    this.userPitch = 0;
    this.zoom = 1;
  }

  didDrag() {
    return this.lastMoved > 6;
  }

  /**
   * @param {number} dt
   * @param {{focus: THREE.Vector3, distance: number, yaw: number, pitch: number, fixedPosition?: THREE.Vector3, snap?: boolean, shake?: number, shakeTime?: number}} desired
   */
  update(dt, desired) {
    const { focus, distance, yaw, pitch, fixedPosition, snap = false, shake = 0, shakeTime = 0 } = desired;
    if (!this.initialised || snap) {
      this.smoothFocus.copy(focus);
      this.lookTarget.copy(focus);
      this.initialised = true;
    }
    const focusAlpha = 1 - Math.exp(-dt * 3.8);
    this.smoothFocus.lerp(focus, focusAlpha);
    this.lookTarget.lerp(focus, 1 - Math.exp(-dt * 5.2));
    const targetZoomDistance = distance * this.zoom;
    const actualYaw = yaw + this.userYaw;
    const actualPitch = clamp(pitch + this.userPitch, -0.08, 1.45);

    let px;
    let py;
    let pz;
    if (fixedPosition) {
      px = fixedPosition.x;
      py = fixedPosition.y;
      pz = fixedPosition.z;
    } else {
      const horizontal = Math.cos(actualPitch) * targetZoomDistance;
      px = this.smoothFocus.x + Math.sin(actualYaw) * horizontal;
      py = this.smoothFocus.y + Math.sin(actualPitch) * targetZoomDistance;
      pz = this.smoothFocus.z + Math.cos(actualYaw) * horizontal;
    }
    const shakeX = Math.sin(shakeTime * 43.1) * shake;
    const shakeY = Math.cos(shakeTime * 37.7) * shake * 0.65;
    const desiredPos = new THREE.Vector3(px + shakeX, Math.max(2.2, py + shakeY), pz);
    const posAlpha = snap ? 1 : 1 - Math.exp(-dt * (fixedPosition ? 3.2 : 4.4));
    this.camera.position.lerp(desiredPos, posAlpha);
    this.camera.lookAt(this.lookTarget);
  }

  dispose() {
    const el = this.domElement;
    el.removeEventListener('pointerdown', this._onPointerDown);
    el.removeEventListener('pointermove', this._onPointerMove);
    el.removeEventListener('pointerup', this._onPointerUp);
    el.removeEventListener('pointercancel', this._onPointerUp);
    el.removeEventListener('wheel', this._onWheel);
    el.removeEventListener('dblclick', this._onDblClick);
  }
}
