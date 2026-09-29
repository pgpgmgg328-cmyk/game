import type Phaser from 'phaser';
import { UNIT } from '../../config/balance';
import type { Lang } from '../../i18n';
import { labelText, type FormData, type ThemeData } from '../../themes';
import { heartPath, roundRectPath, starPath } from './canvas';
import { FACE_FRAMES, drawFace, faceLayout, type FaceLayout } from './faceArt';
import {
  GOLD,
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
  /** Золотая версия: золотой корпус, рамка и искорки. */
  golden: boolean;
}

export const FX = {
  star: 'fx:star',
  heart: 'fx:heart',
  dot: 'fx:dot',
  sparkle: 'fx:sparkle',
} as const;

/** Значки интерфейса: монетка «клац», медаль достижений и рука-подсказка обучения. */
export const UI_ART = {
  coin: 'ui:coin',
  medal: 'ui:medal',
  hand: 'ui:hand',
} as const;

/** Размер текстуры руки и где кончик пальца (в долях), чтобы указывать им точно в цель. */
export const HAND_ART = { width: 192, height: 256, tipX: 78 / 192, tipY: 10 / 256 } as const;

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

/** Колпачок формы: обычный или золотой. Рисуется, только если такой текстуры ещё нет. */
function ensureKeyTexture(
  scene: Phaser.Scene,
  key: string,
  form: FormData,
  lang: Lang,
  golden: boolean,
): void {
  if (scene.textures.exists(key)) return;
  const width = form.size.w * UNIT;
  const height = form.size.h * UNIT;
  const canvas = createCanvas(
    scene,
    key,
    (width + PAD * 2) * TEXTURE_SCALE,
    (height + PAD * 2) * TEXTURE_SCALE,
  );
  if (!canvas) return;
  canvas.ctx.setTransform(
    TEXTURE_SCALE,
    0,
    0,
    TEXTURE_SCALE,
    PAD * TEXTURE_SCALE,
    PAD * TEXTURE_SCALE,
  );
  drawKeycap(canvas.ctx, keycapGeometry(width, height), form.paint, keyLabel(form, lang), golden);
  canvas.texture.refresh();
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
      golden: false,
    };

    ensureKeyTexture(scene, art.key, form, lang, false);

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

/**
 * Золотая версия клавиши. Золотые клавиши редкие, поэтому их текстуры рисуются лениво —
 * при первой золотой клавише этого тира. Лицо у золотой клавиши то же.
 */
export function goldenArt(scene: Phaser.Scene, theme: ThemeData, lang: Lang, art: KeyArt): KeyArt {
  const form = theme.forms[art.tier - 1];
  if (!form) return art;
  const key = `${art.key}:gold`;
  ensureKeyTexture(scene, key, form, lang, true);
  return { ...art, key, colors: keyColors(form.paint, true), golden: true };
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

/** Значки интерфейса (монетка, медаль): рисуются один раз. */
export function ensureUiArt(scene: Phaser.Scene): void {
  const size = 64;
  const draw = (key: string, paint: (ctx: CanvasRenderingContext2D) => void): void => {
    if (scene.textures.exists(key)) return;
    const canvas = createCanvas(scene, key, size, size);
    if (!canvas) return;
    paint(canvas.ctx);
    canvas.texture.refresh();
  };
  draw(UI_ART.coin, (ctx) => drawCoin(ctx, size / 2, size / 2, size * 0.46));
  draw(UI_ART.medal, (ctx) => drawMedal(ctx, size));
  if (!scene.textures.exists(UI_ART.hand)) {
    const canvas = createCanvas(scene, UI_ART.hand, HAND_ART.width, HAND_ART.height);
    if (canvas) {
      drawHand(canvas.ctx);
      canvas.texture.refresh();
    }
  }
}

/**
 * Рука-подсказка: мультяшная белая перчатка с указательным пальцем вверх (без цвета кожи).
 * Рисуется в 2× для чёткости; кончик пальца — в HAND_ART.tipX/tipY.
 */
function drawHand(ctx: CanvasRenderingContext2D): void {
  const s = 2;
  const outline = '#3a2e6e';
  const glove = '#ffffff';
  const shade = '#e6e2f5';
  const part = (x: number, y: number, w: number, h: number, r: number, fill = glove): void => {
    roundRectPath(ctx, x * s, y * s, w * s, h * s, r * s);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  };
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = outline;
  // Согнутые пальцы за ладонью.
  part(46, 40, 18, 28, 9);
  part(60, 46, 16, 26, 8);
  part(72, 54, 13, 22, 6.5);
  // Ладонь и указательный палец.
  part(20, 52, 62, 50, 18);
  part(28, 4, 22, 62, 11);
  // Палец переходит в ладонь без линии.
  ctx.fillStyle = glove;
  ctx.fillRect(30.5 * s, 50 * s, 17 * s, 14 * s);
  // Складка на ладони и тень справа — перчатка объёмная.
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.ellipse(70 * s, 84 * s, 7 * s, 12 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(52 * s, 70 * s);
  ctx.quadraticCurveTo(58 * s, 76 * s, 64 * s, 70 * s);
  ctx.stroke();
  // Большой палец.
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(21 * s, 76 * s, 9 * s, 17 * s, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = glove;
  ctx.fill();
  ctx.stroke();
  // Манжета.
  part(26, 98, 52, 22, 8, '#8fd3ff');
  // Блик на пальце.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath();
  ctx.ellipse(34 * s, 18 * s, 3 * s, 7 * s, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Монетка «клац»: золотой кружок с выпуклой клавишей в середине. */
function drawCoin(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const gradient = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  gradient.addColorStop(0, GOLD.light);
  gradient.addColorStop(0.45, GOLD.base);
  gradient.addColorStop(1, GOLD.deep);
  ctx.beginPath();
  ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = GOLD.outline;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.stroke();
  // Маленькая клавиша-колпачок: корпус и светлая верхняя грань.
  const k = r * 0.78;
  roundRectPath(ctx, cx - k / 2, cy - k / 2, k, k, k * 0.25);
  ctx.fillStyle = GOLD.deep;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = GOLD.outline;
  ctx.stroke();
  roundRectPath(ctx, cx - k * 0.38, cy - k * 0.44, k * 0.76, k * 0.62, k * 0.18);
  ctx.fillStyle = GOLD.light;
  ctx.fill();
  // Блик слева сверху.
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.42, cy - r * 0.42, r * 0.16, r * 0.1, -Math.PI / 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.fill();
}

/** Медаль достижения: две ленточки и золотой кружок со звездой. */
function drawMedal(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size / 2;
  const ribbon = (x: number, color: string, tilt: number): void => {
    ctx.beginPath();
    ctx.moveTo(x - 7, 2);
    ctx.lineTo(x + 7, 2);
    ctx.lineTo(x + 7 + tilt, 30);
    ctx.lineTo(x - 7 + tilt, 30);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  ribbon(cx - 9, '#ff8fb8', 6);
  ribbon(cx + 9, '#8fd3ff', -6);
  drawCoinBody(ctx, cx, size * 0.62, size * 0.33);
  starPath(ctx, cx, size * 0.63, size * 0.18, 5, 0.48);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = GOLD.outline;
  ctx.stroke();
}

function drawCoinBody(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const gradient = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  gradient.addColorStop(0, GOLD.light);
  gradient.addColorStop(0.5, GOLD.base);
  gradient.addColorStop(1, GOLD.deep);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = GOLD.outline;
  ctx.stroke();
}

/** Размер текстуры колпачка с полями, в единицах физики. */
export function keyTextureSize(art: KeyArt): { width: number; height: number } {
  return { width: art.width + PAD * 2, height: art.height + PAD * 2 };
}
