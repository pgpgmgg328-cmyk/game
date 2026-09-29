import Phaser from 'phaser';
import type { KeyArt } from '../art/textures';
import { Keycap } from './Keycap';

const COUNT = 32;

/**
 * Пасхалка «тайное слово»: с неба сыплется дождь из маленьких клавиш и пропадает внизу.
 * area — видимая область в координатах колонки.
 */
export function keycapRain(
  scene: Phaser.Scene,
  arts: readonly KeyArt[],
  area: { x: number; y: number; width: number; height: number },
): void {
  const layer = scene.add.container(0, 0);
  let alive = COUNT;
  for (let i = 0; i < COUNT; i += 1) {
    const art = arts[Math.floor(Math.random() * arts.length)]!;
    const key = new Keycap(scene, art, { idle: false, random: Math.random });
    key.baseScale = 0.55 + Math.random() * 0.5;
    key.tick(0, 0);
    const x = area.x + Math.random() * area.width;
    key.setPosition(x, area.y - 80 - Math.random() * 300);
    key.setRotation(Math.random() * Math.PI);
    layer.add(key);
    scene.tweens.add({
      targets: key,
      y: area.y + area.height + 120,
      x: x + (Math.random() - 0.5) * 160,
      rotation: key.rotation + (Math.random() - 0.5) * 6,
      duration: 1500 + Math.random() * 1300,
      delay: Math.random() * 500,
      ease: 'Quad.easeIn',
      onComplete: () => {
        key.destroy();
        alive -= 1;
        if (alive === 0) layer.destroy();
      },
    });
  }
}
