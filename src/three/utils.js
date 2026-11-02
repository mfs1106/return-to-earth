import * as THREE from 'three';

/** Generate a canvas texture without loading any external asset. */
export function canvasTexture(width, height, draw, options = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = options.wrapS ?? THREE.RepeatWrapping;
  texture.wrapT = options.wrapT ?? THREE.ClampToEdgeWrapping;
  texture.anisotropy = options.anisotropy ?? 4;
  if (options.repeat) texture.repeat.set(options.repeat[0], options.repeat[1]);
  texture.needsUpdate = true;
  return texture;
}

export function noiseTexture(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = 120 + Math.random() * 135;
    image.data[i] = v;
    image.data[i + 1] = v;
    image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function makeRadialSpriteTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  return canvasTexture(
    128,
    128,
    (ctx, w, h) => {
      const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gradient.addColorStop(0, inner);
      gradient.addColorStop(0.35, inner);
      gradient.addColorStop(1, outer);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    },
    { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping },
  );
}

export function makeFlameTexture() {
  return canvasTexture(
    64,
    256,
    (ctx, w, h) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, 'rgba(255,255,255,0)');
      gradient.addColorStop(0.1, 'rgba(255,241,205,0.9)');
      gradient.addColorStop(0.35, 'rgba(255,180,82,0.75)');
      gradient.addColorStop(0.7, 'rgba(255,98,35,0.28)');
      gradient.addColorStop(1, 'rgba(255,50,10,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    },
    { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping },
  );
}

export function makeGridFinTexture() {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(196,205,214,0.98)';
      ctx.lineWidth = 9;
      ctx.strokeRect(5, 5, w - 10, h - 10);
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(160,173,186,0.9)';
      const step = 32;
      for (let i = step; i < w; i += step) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, h);
        ctx.stroke();
      }
      for (let j = step; j < h; j += step) {
        ctx.beginPath();
        ctx.moveTo(0, j);
        ctx.lineTo(w, j);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(230,238,245,0.9)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(8, h * 0.16);
      ctx.lineTo(w - 8, h * 0.16);
      ctx.stroke();
    },
    { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping },
  );
}

export function makeSprite(text, { color = '#dffaff', bg = 'rgba(2,10,15,0.72)', border = 'rgba(88,214,255,0.5)', font = '600 30px "Cascadia Code", monospace', padding = 18 } = {}) {
  const scale = 2;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  const width = Math.ceil(ctx.measureText(text).width) + padding * 2;
  const height = 64;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext('2d');
  context.scale(scale, scale);
  context.fillStyle = bg;
  context.strokeStyle = border;
  context.lineWidth = 2;
  roundRect(context, 2, 2, width - 4, height - 4, 10);
  context.fill();
  context.stroke();
  context.font = font;
  context.fillStyle = color;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, width / 2, height / 2 + 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  const ratio = width / height;
  sprite.scale.set(ratio * 7, 7, 1);
  return sprite;
}

export function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export function disposeObject(root) {
  root.traverse((child) => {
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

export function setShadow(root, cast = true, receive = true) {
  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = cast;
      child.receiveShadow = receive;
    }
  });
}

export function createGlowLight(color, intensity, distance) {
  const light = new THREE.PointLight(color, intensity, distance, 2);
  light.castShadow = false;
  return light;
}
