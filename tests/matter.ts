import { createRequire } from 'node:module';
import type { MatterModule } from '../src/game/run/matter';

const require = createRequire(import.meta.url);

/** Настоящий Matter.js из сборки Phaser — тот же код, что в игре, но без браузера. */
export const matter = require('phaser/src/physics/matter-js/CustomMain.js') as MatterModule;
