import { InfoScreenScene } from './InfoScreen';

/** Экран «выбор мира». Содержимое — в следующих этапах (M2–M4). */
export class WorldsScene extends InfoScreenScene {
  constructor() {
    super('Worlds', 'worlds.title');
  }
}
