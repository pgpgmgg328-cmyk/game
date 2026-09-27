import './style.css';
import Phaser from 'phaser';
import { BootScene } from './game/scenes/Boot';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#bfe6ff',
  banner: false,
  // Звук синтезируем сами через WebAudio после первого жеста игрока, встроенный звук Phaser не нужен.
  audio: { noAudio: true },
  scale: { mode: Phaser.Scale.RESIZE },
  scene: [BootScene],
});
