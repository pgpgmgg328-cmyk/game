import Phaser from 'phaser';

/** Первая сцена: запускает постоянный фон и экран загрузки. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.scene.launch('Background');
    this.scene.start('Preload');
  }
}
