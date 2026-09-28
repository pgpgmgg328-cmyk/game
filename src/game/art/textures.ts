import type Phaser from 'phaser';
import { UNIT } from '../../config/balance';
import type { Lang } from '../../i18n';
import { labelText, type FormData, type ThemeData } from '../../themes';
import { heartPath, starPath } from './canvas';
import { FACE_FRAMES, drawFace, faceLayout, type FaceLayout } from './faceArt';
import {
  drawKeycap,
  keyColors,
  keycapGeometry,
  labelBox,
  type KeyColors,
  type LabelArt,
} from './keycapArt';

/** Пикселей текстуры на единицу физики: клавиши остаются чёткими даже на планшете. */
export const TEXTURE_SCALE = 2;
/** Поля вокруг клавиши в текстуре под обводку. */
const PAD = 4;

export interface KeyArt {
  tier: number;
  /** Текстура колпачка с надписью. */
  key: string;
  /** Текстура лица с кадрами FaceFrame. */
  face: string;
  width: number;
  height: number;
  faceLayout: FaceLayout;
  colors: KeyColors;
}

export const FX = {
  star: 'fx:star',
  heart: 'fx:heart',
  dot: 'fx:dot',
  sparkle: 'fx:sparkle',
} as const;

function createCanvas(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
): { texture: Phaser.Textures.CanvasTexture; ctx: CanvasRenderingContext2D } | null {
  const texture = scene.textures.createCanvas(key, Math.ceil(width), Math.ceil(height));
  if (!texture) return null;
  return { texture, ctx: texture.getContext() };
}

let measureCanvas: CanvasRenderingContext2D | null = null;

/** Отдельный маленький canvas, чтобы измерять надписи, даже когда текстура уже нарисована. */
function measureContext(): CanvasRenderingContext2D {
  if (!measureCanvas) {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) throw new Error('Canvas 2D недоступен');
    measureCanvas = ctx;
  }
  return measureCanvas;
}

function keyLabel(form: FormData, lang: Lang): LabelArt {
  const text = labelText(form.label, lang);
  if (text !== null) return { text };
  return { glyph: form.label.kind === 'glyph' ? form.label.glyph : 'crown' };
}

/**
 * Текстуры клавиш мира: рисуются кодом один раз на тир и язык (диздок, раздел 15),
 * повторный вызов ничего не перерисовывает.
 */
export function ensureThemeArt(scene: Phaser.Scene, theme: ThemeData, lang: Lang): KeyArt[] {
  return theme.forms.map((form) => {
    const width = form.size.w * UNIT;
    const height = form.size.h * UNIT;
    const geometry = keycapGeometry(width, height);
    const label = keyLabel(form, lang);
    const layout = faceLayout(geometry, form.face, labelBox(measureContext(), geometry, label));
    const art: KeyArt = {
      tier: form.tier,
      key: `key:${theme.id}:${form.tier}:${lang}`,
      face: `face:${theme.id}:${form.tier}:${lang}`,
      width,
      height,
      faceLayout: layout,
      colors: keyColors(form.paint),
    };

    if (!scene.textures.exists(art.key)) {
      const canvas = createCanvas(
        scene,
        art.key,
        (width + PAD * 2) * TEXTURE_SCALE,
        (height + PAD * 2) * TEXTURE_SCALE,
      );
      if (canvas) {
        canvas.ctx.setTransform(
          TEXTURE_SCALE,
          0,
          0,
          TEXTURE_SCALE,
          PAD * TEXTURE_SCALE,
          PAD * TEXTURE_SCALE,
        );
        drawKeycap(canvas.ctx, geometry, form.paint, label);
        canvas.texture.refresh();
      }
    }

    if (!scene.textures.exists(art.face)) {
      const frameWidth = layout.frameWidth * TEXTURE_SCALE;
      const frameHeight = layout.frameHeight * TEXTURE_SCALE;
      const canvas = createCanvas(scene, art.face, frameWidth * FACE_FRAMES.length, frameHeight);
      if (canvas) {
        FACE_FRAMES.forEach((frame, index) => {
          canvas.ctx.setTransform(
            TEXTURE_SCALE,
            0,
            0,
            TEXTURE_SCALE,
            index * frameWidth + frameWidth / 2,
            frameHeight / 2,
          );
          drawFace(canvas.ctx, form.face, frame, layout.size, theme.palette.face);
          canvas.texture.add(frame, 0, index * frameWidth, 0, frameWidth, frameHeight);
        });
        canvas.texture.refresh();
      }
    }
    return art;
  });
}

/** Белые текстуры частиц: окрашиваются tint под цвет клавиши. */
export function ensureFxArt(scene: Phaser.Scene): void {
  const size = 48;
  const draw = (key: string, paint: (ctx: CanvasRenderingContext2D) => void): void => {
    if (scene.textures.exists(key)) return;
    const canvas = createCanvas(scene, key, size, size);
    if (!canvas) return;
    canvas.ctx.fillStyle = '#ffffff';
    paint(canvas.ctx);
    canvas.texture.refresh();
  };
  draw(FX.star, (ctx) => {
    starPath(ctx, size / 2, size / 2 + 1, size * 0.46, 5, 0.48);
    ctx.fill();
  });
  draw(FX.heart, (ctx) => {
    heartPath(ctx, size / 2, size / 2 + 2, size * 0.86);
    ctx.fill();
  });
  draw(FX.dot, (ctx) => {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
    ctx.fill();
  });
  draw(FX.sparkle, (ctx) => {
    starPath(ctx, size / 2, size / 2, size * 0.48, 4, 0.3);
    ctx.fill();
  });
}

/** Размер текстуры колпачка с полями, в единицах физики. */
export function keyTextureSize(art: KeyArt): { width: number; height: number } {
  return { width: art.width + PAD * 2, height: art.height + PAD * 2 };
}
