import Phaser from 'phaser';
import type { MatterModule } from './matter';

/** Matter.js, который уже входит в сборку Phaser: отдельная библиотека физики не нужна. */
export const phaserMatter = (Phaser.Physics.Matter as unknown as { Matter: MatterModule }).Matter;
