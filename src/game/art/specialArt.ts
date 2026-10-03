import type Phaser from 'phaser';
import type { FaceData } from '../../themes';
import { roundRectPath, starPath } from './canvas';
import { css, darken, lighten } from './color';
import { FACE_FRAMES, drawFace } from './faceArt';
import { keycapGeometry } from './keycapArt';
import { TEXTURE_SCALE, keyTextureSize, type KeyArt } from './textures';

/** Особые клавиши миров (диздок, раздел 5): «Метеорчик» и карамельная глазурь «Карамельки». */
export const SPECIAL_ART = {
  meteor: 'special:meteor',
  meteorFace: 'special:meteor-face',
  meteorTail: 'special:meteor-tail',
} as const;

/** «Метеорчик» — весёлый камушек, а не страшный огненный шар: игра 0+. */
const METEOR_FACE: FaceData = { eyes: 'happy', brows: 'none', mouth: 'grin', blush: true };
const METEOR_COLORS = { body: '#c9b6ff', rim: '#fff2a8', crater: '#9d86e8', face: '#2b2160' };
const CARAMEL = '#f0a43c';

/**
 * Текстуры «Метеорчика» на диаметр size (единицы физики): тело с кратерами, лицо с кадрами,
 * как у клавиш, и мягкий хвост из искорок. Рисуются один раз.
 */
export function ensureMeteorArt(scene: Phaser.Scene, size: number): void {
  const s = TEXTURE_SCALE;
  const pad = 6;
  const full = Math.ceil((size + pad * 2) * s);
  if (!scene.textures.exists(SPECIAL_ART.meteor)) {
    const texture = scene.textures.createCanvas(SPECIAL_ART.meteor, full, full);
    if (texture) {
      const ctx = texture.getContext();
      ctx.setTransform(s, 0, 0, s, full / 2, full / 2);
      const r = size / 2;
      // Мягкое свечение вокруг.
      const glow = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r + pad);
      glow.addColorStop(0, 'rgba(255, 242, 168, 0.55)');
      glow.addColorStop(1, 'rgba(255, 242, 168, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, r + pad, 0, Math.PI * 2);
      ctx.fill();
      const body = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
      body.addColorStop(0, css(lighten(METEOR_COLORS.body, 0.45)));
      body.addColorStop(1, METEOR_COLORS.body);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = css(darken(METEOR_COLORS.body, 0.45));
      ctx.stroke();
      for (const [cx, cy, cr] of [
        [0.48, -0.35, 0.16],
        [-0.5, 0.42, 0.13],
        [0.42, 0.5, 0.1],
      ] as const) {
        ctx.fillStyle = css(darken(METEOR_COLORS.crater, 0.1), 0.55);
        ctx.beginPath();
        ctx.arc(cx * r, cy * r, cr * r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.4, -r * 0.45, r * 0.18, r * 0.1, -0.6, 0, Math.PI * 2);
      ctx.fill();
      texture.refresh();
    }
  }
  if (!scene.textures.exists(SPECIAL_ART.meteorFace)) {
    const faceSize = size * 0.62;
    const frameWidth = Math.ceil(faceSize * 1.7 * s);
    const frameHeight = Math.ceil(faceSize * 1.25 * s);
    const texture = scene.textures.createCanvas(
      SPECIAL_ART.meteorFace,
      frameWidth * FACE_FRAMES.length,
      frameHeight,
    );
    if (texture) {
      const ctx = texture.getContext();
      FACE_FRAMES.forEach((frame, index) => {
        ctx.setTransform(s, 0, 0, s, index * frameWidth + frameWidth / 2, frameHeight / 2);
        drawFace(ctx, METEOR_FACE, frame, faceSize, METEOR_COLORS.face);
        texture.add(frame, 0, index * frameWidth, 0, frameWidth, frameHeight);
      });
      texture.refresh();
    }
  }
  if (!scene.textures.exists(SPECIAL_ART.meteorTail)) {
    // Хвост: мягкая полоса света вверх от «Метеорчика» и пара звёздочек в ней.
    const width = Math.ceil(size * 0.9 * s);
    const height = Math.ceil(size * 2.2 * s);
    const texture = scene.textures.createCanvas(SPECIAL_ART.meteorTail, width, height);
    if (texture) {
      const ctx = texture.getContext();
      const gradient = ctx.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, 'rgba(255, 242, 168, 0.85)');
      gradient.addColorStop(1, 'rgba(201, 182, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(width * 0.1, height);
      ctx.quadraticCurveTo(width * 0.15, height * 0.3, width / 2, 0);
      ctx.quadraticCurveTo(width * 0.85, height * 0.3, width * 0.9, height);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      starPath(ctx, width * 0.38, height * 0.55, width * 0.1, 4, 0.38);
      ctx.fill();
      starPath(ctx, width * 0.62, height * 0.3, width * 0.07, 4, 0.38);
      ctx.fill();
      texture.refresh();
    }
  }
}

/**
 * Карамельная глазурь «Карамельки» под размер клавиши: полупрозрачная карамель на верхней
 * грани с капельками и бликом. Лицо рисуется поверх и остаётся видно.
 */
export function caramelTexture(scene: Phaser.Scene, art: KeyArt): string {
  const key = `${art.key}:caramel`;
  if (scene.textures.exists(key)) return key;
  const { width, height } = keyTextureSize(art);
  const texture = scene.textures.createCanvas(
    key,
    Math.ceil(width * TEXTURE_SCALE),
    Math.ceil(height * TEXTURE_SCALE),
  );
  if (!texture) return art.key;
  const pad = (width - art.width) / 2;
  const ctx = texture.getContext();
  ctx.setTransform(TEXTURE_SCALE, 0, 0, TEXTURE_SCALE, pad * TEXTURE_SCALE, pad * TEXTURE_SCALE);
  const { body, top } = keycapGeometry(art.width, art.height);
  // Карамель только на верхней половине клавиши и стекает каплями.
  ctx.save();
  roundRectPath(ctx, body.x, body.y, body.w, body.h, body.r);
  ctx.clip();
  const depth = top.y + top.h * 0.42;
  const drops = Math.max(2, Math.round(body.w / 34));
  const step = body.w / drops;
  ctx.beginPath();
  ctx.moveTo(body.x, body.y);
  ctx.lineTo(body.x + body.w, body.y);
  ctx.lineTo(body.x + body.w, depth);
  for (let i = drops - 1; i >= 0; i -= 1) {
    const x = body.x + i * step;
    const long = depth + top.h * (i % 2 === 0 ? 0.22 : 0.12);
    ctx.quadraticCurveTo(x + step * 0.8, depth, x + step * 0.5, long);
    ctx.quadraticCurveTo(x + step * 0.2, depth, x, depth);
  }
  ctx.closePath();
  ctx.fillStyle = css(lighten(CARAMEL, 0.1), 0.62);
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = css(darken(CARAMEL, 0.25), 0.7);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath();
  ctx.ellipse(
    top.x + top.w * 0.72,
    top.y + top.h * 0.14,
    top.w * 0.12,
    Math.max(2, top.h * 0.05),
    -0.2,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();
  texture.refresh();
  return key;
}
